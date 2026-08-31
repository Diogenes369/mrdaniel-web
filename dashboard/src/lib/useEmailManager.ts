import { useCallback, useEffect, useMemo, useState } from 'react';
import { onValue, ref, set, update, remove, query as dbQuery, limitToLast } from 'firebase/database';
import { db } from '../firebase';
import { SITE_ORIGIN } from './useDashboardRefresh';

const ADMIN_SECRET = import.meta.env.VITE_ADMIN_API_SECRET as string | undefined;
const API = `${SITE_ORIGIN}/api/leads`;

function authHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json', ...(ADMIN_SECRET ? { 'x-admin-secret': ADMIN_SECRET } : {}) };
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

const DEFAULT_CONFIG: EmailConfig = { autoWelcome: false, welcomeTemplateId: '', fromName: 'דניאל בן ברוך' };

function sanitizeKey(s: string): string {
  return s.replace(/[.#$/[\]\s]/g, '_').slice(0, 60) || `tpl_${Date.now()}`;
}

export function useEmailManager() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [config, setConfig] = useState<EmailConfig>(DEFAULT_CONFIG);
  const [campaigns, setCampaigns] = useState<CampaignRun[]>([]);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [leadCount, setLeadCount] = useState(0);
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
      onValue(ref(db, 'newsletter_signups'), (snap) => setSubscriberCount(snap.size)),
      onValue(ref(db, 'leads'), (snap) => setLeadCount(snap.size)),
    ];
    return () => offs.forEach((o) => o());
  }, []);

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
    (to: string, subject: string, html: string) => post({ action: 'send-test', to, subject, html }),
    [post]
  );
  const sendCampaign = useCallback(
    (subject: string, html: string, audience: 'newsletter' | 'leads' | 'all', extraRecipients: string[] = []) =>
      post({ action: 'send-campaign', subject, html, audience, extraRecipients }),
    [post]
  );

  const audienceSize = useMemo(
    () => ({ newsletter: subscriberCount, leads: leadCount, all: subscriberCount + leadCount }),
    [subscriberCount, leadCount]
  );

  return {
    templates,
    config,
    campaigns,
    subscriberCount,
    leadCount,
    audienceSize,
    loaded,
    saveTemplate,
    deleteTemplate,
    saveConfig,
    sendTest,
    sendCampaign,
  };
}
