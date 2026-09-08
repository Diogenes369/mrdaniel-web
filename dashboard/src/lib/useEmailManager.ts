import { useCallback, useEffect, useMemo, useState } from 'react';
import { onValue, ref, set, update, remove, query as dbQuery, limitToLast } from 'firebase/database';
import { db } from '../firebase';
import { SITE_ORIGIN } from './useDashboardRefresh';
import { getAdminSecret, reportAuthFailure } from './adminSecret';


const API = `${SITE_ORIGIN}/api/leads`;
const AGENT_API = `${SITE_ORIGIN}/api/agent-generate`;

function authHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json', ...(getAdminSecret() ? { 'x-admin-secret': getAdminSecret() } : {}) };
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html: string;
  updatedAt: number;
}

export interface EmailConfig {
  autoWelcome: boolean;
  welcomeTemplateId: string;
  fromName: string;
}

export interface CampaignRun {
  id: string;
  subject: string;
  audience: string;
  total: number;
  sent: number;
  failed: number;
  status: string;
  ts: number;
}

export interface Contact {
  id: string;
  email: string;
  name: string;
  kind: 'lead' | 'newsletter';
  ts: number;
}

const DEFAULT_CONFIG: EmailConfig = { autoWelcome: false, welcomeTemplateId: '', fromName: 'דניאל בן ברוך' };

function sanitizeKey(s: string): string {
  return s.replace(/[.#$/[\]\s]/g, '_').slice(0, 60) || `tpl_${Date.now()}`;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function toContacts(raw: unknown, kind: Contact['kind']): Contact[] {
  if (!raw || typeof raw !== 'object') return [];
  return Object.entries(raw as Record<string, any>)
    .map(([id, v]) => ({
      id,
      email: String(v?.email ?? '').trim().toLowerCase(),
      name: String(v?.name ?? '').trim(),
      kind,
      ts: Number(v?.ts ?? v?.createdAt ?? 0),
    }))
    .filter((c) => EMAIL_RE.test(c.email));
}

export function useEmailManager() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [config, setConfig] = useState<EmailConfig>(DEFAULT_CONFIG);
  const [campaigns, setCampaigns] = useState<CampaignRun[]>([]);
  const [newsletterContacts, setNewsletterContacts] = useState<Contact[]>([]);
  const [leadContacts, setLeadContacts] = useState<Contact[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!db) {
      setLoaded(true);
      return;
    }
    const offs = [
      onValue(ref(db, 'email_templates'), (snap) => {
        const val = (snap.val() ?? {}) as Record<string, Omit<EmailTemplate, 'id'>>;
        setTemplates(
          Object.entries(val)
            .map(([id, t]) => ({ id, name: t.name ?? id, subject: t.subject ?? '', html: t.html ?? '', updatedAt: t.updatedAt ?? 0 }))
            .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        );
        setLoaded(true);
      }),
      onValue(ref(db, 'email_config'), (snap) => setConfig({ ...DEFAULT_CONFIG, ...(snap.val() ?? {}) })),
      onValue(dbQuery(ref(db, 'email_campaigns'), limitToLast(40)), (snap) => {
        const val = (snap.val() ?? {}) as Record<string, Omit<CampaignRun, 'id'>>;
        setCampaigns(Object.entries(val).map(([id, c]) => ({ id, ...c })).sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0)));
      }),
      onValue(dbQuery(ref(db, 'newsletter_signups'), limitToLast(1000)), (snap) => setNewsletterContacts(toContacts(snap.val(), 'newsletter'))),
      onValue(dbQuery(ref(db, 'leads'), limitToLast(1000)), (snap) => setLeadContacts(toContacts(snap.val(), 'lead'))),
    ];
    return () => offs.forEach((o) => o());
  }, []);

  /** De-duplicated by email — a newsletter subscriber who is also a lead appears once (as lead). */
  const contacts = useMemo<Contact[]>(() => {
    const byEmail = new Map<string, Contact>();
    for (const c of newsletterContacts) byEmail.set(c.email, c);
    for (const c of leadContacts) byEmail.set(c.email, c); // lead wins the label
    return [...byEmail.values()].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
  }, [newsletterContacts, leadContacts]);

  const subscriberCount = newsletterContacts.length;
  const leadCount = leadContacts.length;

  const saveTemplate = useCallback((tpl: { id?: string; name: string; subject: string; html: string }) => {
    if (!db) return '';
    const id = tpl.id || sanitizeKey(tpl.name);
    set(ref(db, `email_templates/${id}`), { name: tpl.name, subject: tpl.subject, html: tpl.html, updatedAt: Date.now() }).catch((e) =>
      console.error('[email] save template failed:', e)
    );
    return id;
  }, []);

  const deleteTemplate = useCallback((id: string) => {
    if (!db) return;
    remove(ref(db, `email_templates/${id}`)).catch((e) => console.error('[email] delete template failed:', e));
  }, []);

  const saveConfig = useCallback((patch: Partial<EmailConfig>) => {
    if (!db) return;
    update(ref(db, 'email_config'), patch).catch((e) => console.error('[email] save config failed:', e));
  }, []);

  const post = useCallback(async (payload: Record<string, unknown>) => {
    try {
      const res = await fetch(API, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
      return await res.json();
    } catch {
      return { ok: false, error: 'network' };
    }
  }, []);

  const sendTest = useCallback(
    (to: string, subject: string, html: string, extraSections = '', preheader = '') =>
      post({ action: 'send-test', to, subject, html, extraSections, preheader }),
    [post]
  );
  /** `recipients` is the exact, already-resolved address list from the picker. */
  const sendCampaign = useCallback(
    (subject: string, html: string, recipients: string[], extraSections = '', preheader = '') =>
      post({ action: 'send-campaign', subject, html, audience: 'selection', recipients, extraSections, preheader }),
    [post]
  );

  /** AI email copywriter (Gemini via /api/agent-generate). Returns the full structured result. */
  const generateEmail = useCallback(
    async (input: { goal: string; tone?: string; notes?: string; preset?: string }): Promise<{
      ok: boolean;
      error?: string;
      subjectOptions?: string[];
      preheader?: string;
      bodyHtml?: string;
      includeNews?: boolean;
      includeServices?: boolean;
      retryAfterSeconds?: number;
    }> => {
      try {
        const res = await fetch(AGENT_API, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action: 'email-generate', ...input }) });
        if (res.status === 429) {
          const j = await res.json();
          return { ok: false, error: j.message ?? 'rate limited', retryAfterSeconds: j.retryAfterSeconds };
        }
        if (res.status === 401) {
          reportAuthFailure('agent-generate');
          return { ok: false, error: 'אימות מול /api/agent-generate נכשל (401)' };
        }
        return await res.json();
      } catch {
        return { ok: false, error: 'network' };
      }
    },
    []
  );

  return {
    templates,
    config,
    campaigns,
    contacts,
    subscriberCount,
    leadCount,
    loaded,
    saveTemplate,
    deleteTemplate,
    saveConfig,
    sendTest,
    sendCampaign,
    generateEmail,
  };
}
