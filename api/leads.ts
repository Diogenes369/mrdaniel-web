import { createHash, timingSafeEqual } from 'crypto';
import nodemailer from 'nodemailer';
import {
  pushNewsletterSignup,
  readNewsletterEmails,
  readLeadEmails,
  readEmailConfig,
  readEmailTemplate,
  recordEmailCampaign,
  upsertManychatLead,
  pushSiteLead,
} from '../src/agent/firebaseServer.js';
import { sendOne, sendCampaign, welcomeEmailHtml, wrapBrandedEmail, isEmailConfigured } from '../src/server/emailEngine.js';
import { findStaticGuide } from '../src/server/leadMagnets.js';

// Vercel Serverless Function — the site's lead endpoint AND the email engine (folded in here
// rather than a new `/api/send-email` because Vercel Hobby caps a deployment at 12 functions).
//
//   • POST (no `action`)                 → a site lead: store it in `leads`, then email the owner.
//   • POST { action: 'qualification' }    → the agent quiz result: store it in `leads`, no email.
//   • POST { action: 'manychat-lead' }    → ManyChat External Request: save a Comment-to-DM lead.
//
// The site no longer writes `leads` from the browser, and the pending rules lock (PROJECT_STATE.md
// §6) closes it to browsers, so this endpoint is the only way a visitor's lead reaches it. Every
// site-lead field is typed and capped here before it is stored.
//   • POST { action: 'newsletter-signup' } → write to `newsletter_signups`, optional auto-welcome.
//   • POST { action: 'send-test' }        → admin: send one branded email.
//   • POST { action: 'send-welcome' }     → admin: send the welcome template to one address.
//   • POST { action: 'send-campaign' }    → admin: blast subscribers / leads / a custom list.

const LEAD_EMAIL_TO = process.env.LEAD_EMAIL_TO || 'danihell3039@gmail.com';

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
}

function isAdminAuthorized(req: any): boolean {
  const configured = process.env.ADMIN_API_SECRET;
  if (!configured) return true;
  return req.headers?.['x-admin-secret'] === configured;
}

const isEmail = (s: unknown): s is string => typeof s === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());

/** A site-form field as a trimmed, capped string; '' when absent or not a string. */
function formText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

interface SiteLead {
  name: string;
  email: string;
  phone?: string;
  project?: string;
  notes?: string;
  sourceSection?: string;
  selectedProduct?: string;
  productCategory?: string;
  userCompanySize?: string;
  price?: number;
}

/**
 * The only lead fields a site form may store, each typed and capped. Anything else in the body is
 * dropped: the dashboard and the email engine both read `leads`, so a browser must not be able to
 * plant arbitrary keys or oversized values there. Absent fields are left out rather than written
 * as undefined, which RTDB rejects.
 */
function siteLeadFields(body: Record<string, unknown>): SiteLead {
  const price =
    typeof body.price === 'number' && Number.isFinite(body.price) && body.price >= 0 && body.price <= 10_000_000
      ? body.price
      : undefined;
  const lead: SiteLead = {
    name: formText(body.name, 120),
    email: formText(body.email, 200).toLowerCase(),
    phone: formText(body.phone, 40).replace(/[^\d+\-() ]/g, '').trim() || undefined,
    project: formText(body.project, 200) || undefined,
    notes: formText(body.notes, 10_000) || undefined,
    sourceSection: formText(body.sourceSection, 80) || undefined,
    selectedProduct: formText(body.selectedProduct, 120) || undefined,
    productCategory: formText(body.productCategory, 60) || undefined,
    userCompanySize: formText(body.userCompanySize, 80) || undefined,
    price,
  };
  return Object.fromEntries(Object.entries(lead).filter(([, v]) => v !== undefined)) as SiteLead;
}

function getLeadTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST || 'smtp.improvmx.com',
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT || 587) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  const body = (typeof req.body === 'object' && req.body) || {};
  const action = body.action as string | undefined;

  // ---- ManyChat Comment-to-DM lead (server-to-server, secret-gated) -------------------------
  if (action === 'manychat-lead') {
    await handleManychatLead(req, res, body);
    return;
  }

  // ---- Newsletter signup (open) --------------------------------------------------------------
  if (action === 'newsletter-signup') {
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!isEmail(email)) {
      res.status(400).json({ ok: false, error: 'invalid email' });
      return;
    }
    await pushNewsletterSignup({
      email,
      name: typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '',
      source: typeof body.source === 'string' ? body.source.slice(0, 80) : 'site',
      ts: Date.now(),
    });

    const cfg = await readEmailConfig();
    if (cfg.autoWelcome && isEmailConfigured()) {
      let subject: string;
      let html: string;
      const tpl = cfg.welcomeTemplateId ? await readEmailTemplate(cfg.welcomeTemplateId) : null;
      if (tpl?.subject && tpl?.html) {
        subject = tpl.subject;
        html = tpl.html;
      } else {
        const w = welcomeEmailHtml(typeof body.name === 'string' ? body.name : undefined);
        subject = w.subject;
        html = w.html;
      }
      await sendOne({ to: email, subject, html });
    }
    res.status(200).json({ ok: true });
    return;
  }

  // ---- Agent-quiz result (open; it carries no contact details, so nothing is emailed) --------
  if (action === 'qualification') {
    const leadId = await pushSiteLead({
      ...siteLeadFields(body),
      name: 'לא נמסר (שאלון התאמה → WhatsApp)',
      email: 'לא נמסר',
      productCategory: 'ai-agent',
      sourceSection: 'Agent Qualification Modal',
      ts: Date.now(),
    });
    res.status(leadId ? 200 : 500).json({ ok: Boolean(leadId) });
    return;
  }

  // ---- Admin email actions -----------------------------------------------------------------
  if (action === 'send-test' || action === 'send-welcome' || action === 'send-campaign') {
    if (!isAdminAuthorized(req)) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }
    if (!isEmailConfigured()) {
      res.status(200).json({ ok: false, error: 'smtp-not-configured' });
      return;
    }

    if (action === 'send-welcome') {
      const to = String(body.to ?? '');
      if (!isEmail(to)) {
        res.status(400).json({ ok: false, error: 'invalid to' });
        return;
      }
      const w = welcomeEmailHtml(typeof body.name === 'string' ? body.name : undefined);
      res.status(200).json(await sendOne({ to, subject: w.subject, html: w.html }));
      return;
    }

    if (action === 'send-test') {
      const to = String(body.to ?? '');
      const subject = String(body.subject ?? '').trim();
      const rawHtml = String(body.html ?? '');
      const extraSections = typeof body.extraSections === 'string' ? body.extraSections : '';
      if (!isEmail(to) || !subject || !rawHtml) {
        res.status(400).json({ ok: false, error: 'need valid to / subject / html' });
        return;
      }
      const html = body.wrap === false ? rawHtml : wrapBrandedEmail(rawHtml, { title: subject, preheader: (typeof body.preheader === 'string' && body.preheader.trim()) || subject, extraSections });
      res.status(200).json(await sendOne({ to, subject: `[בדיקה] ${subject}`, html }));
      return;
    }

    // send-campaign
    const subject = String(body.subject ?? '').trim();
    const rawHtml = String(body.html ?? '');
    if (!subject || !rawHtml) {
      res.status(400).json({ ok: false, error: 'need subject / html' });
      return;
    }
    const audience = String(body.audience ?? 'newsletter'); // newsletter | leads | all | selection
    const explicit = Array.isArray(body.recipients)
      ? (body.recipients as unknown[]).filter(isEmail)
      : Array.isArray(body.extraRecipients)
        ? (body.extraRecipients as unknown[]).filter(isEmail)
        : [];

    let recipients: string[];
    if (audience === 'selection') {
      // The dashboard's recipient picker already resolved the exact address list.
      recipients = [...new Set(explicit)];
    } else {
      const [nl, ld] = await Promise.all([
        audience === 'leads' ? Promise.resolve<string[]>([]) : readNewsletterEmails(),
        audience === 'newsletter' ? Promise.resolve<string[]>([]) : readLeadEmails(),
      ]);
      recipients = [...new Set([...nl, ...ld, ...explicit])];
    }
    const extraSections = typeof body.extraSections === 'string' ? body.extraSections : '';
    const html = body.wrap === false ? rawHtml : wrapBrandedEmail(rawHtml, { title: subject, preheader: (typeof body.preheader === 'string' && body.preheader.trim()) || subject, extraSections });
    const result = await sendCampaign({ subject, html, recipients });
    await recordEmailCampaign({
      subject,
      audience,
      total: result.total,
      sent: result.sent,
      failed: result.failed,
      status: result.ok ? 'sent' : result.sent > 0 ? 'partial' : 'failed',
      ts: Date.now(),
    });
    res.status(200).json(result);
    return;
  }

  // ---- Site lead: store it for the dashboard, then email the owner --------------------------
  const lead = siteLeadFields(body);
  const { name, email, phone, project, notes, sourceSection, selectedProduct, productCategory, price, userCompanySize } = lead;
  if (!name || !isEmail(email)) {
    res.status(400).json({ ok: false, error: 'missing name/email' });
    return;
  }

  // Stored before the email is tried, and whatever happens to it, so a lead still reaches the
  // dashboard when SMTP has a bad day. The browser used to write this copy itself.
  const leadId = await pushSiteLead({ ...lead, ts: Date.now() });

  const transporter = getLeadTransporter();
  if (!transporter) {
    if (leadId) {
      console.error('[api/leads] SMTP not configured — lead stored but not emailed:', leadId);
      res.status(200).json({ ok: true, emailed: false });
    } else {
      console.error('[api/leads] SMTP not configured and the lead was not stored:', { name, email, phone, project, sourceSection });
      res.status(503).json({ ok: false, error: 'lead not delivered' });
    }
    return;
  }

  const productLines = selectedProduct
    ? `\nמוצר/סוכן נבחר: ${selectedProduct}${productCategory ? ` (${productCategory})` : ''}\nמחיר: ${price ? `₪${price}` : '-'}\nגודל ארגון: ${userCompanySize || '-'}\n`
    : '';
  const subjectPrefix = selectedProduct ? `ליד חדש · ${selectedProduct}` : 'ליד חדש מהאתר';

  try {
    await transporter.sendMail({
      from: `"אתר דניאל בן ברוך" <${process.env.SMTP_USER}>`,
      to: LEAD_EMAIL_TO,
      replyTo: email,
      subject: `${subjectPrefix}: ${name}`,
      text: `שם: ${name}\nאימייל: ${email}\nטלפון: ${phone || '-'}\nמקור הפנייה: ${sourceSection || '-'}\nפרויקט: ${project || '-'}${productLines}\nהערות:\n${notes || '-'}`,
    });

    // Auto-welcome the lead too, if enabled.
    try {
      const cfg = await readEmailConfig();
      if (cfg.autoWelcome && isEmail(email) && isEmailConfigured()) {
        const w = welcomeEmailHtml(name);
        await sendOne({ to: email, subject: w.subject, html: w.html });
      }
    } catch (err) {
      // Best-effort by design — the lead is already saved and the owner already notified, so this
      // must not fail the request. Logged rather than discarded: a welcome email that silently
      // stops going out otherwise looks exactly like one that was never enabled.
      console.warn('[api/leads] auto-welcome email failed:', err);
    }

    if (!leadId) console.error('[api/leads] lead emailed but not stored in Firebase:', sourceSection);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[api/leads] failed to send lead email:', err);
    // A stored lead is not lost — the owner sees it in the dashboard — so the visitor is not told
    // to try again.
    if (leadId) res.status(200).json({ ok: true, emailed: false });
    else res.status(500).json({ ok: false, error: 'send failed' });
  }
}

// ---- ManyChat -------------------------------------------------------------------------------

const SITE_ORIGIN = (process.env.PUBLIC_SITE_ORIGIN || 'https://mrdaniel.co.il').replace(/\/$/, '');

/** Constant-time secret check. Hashing both sides first gives equal-length buffers, so the compare
 *  leaks neither the secret nor its length. */
function secretMatches(supplied: string, configured: string): boolean {
  const a = createHash('sha256').update(supplied).digest();
  const b = createHash('sha256').update(configured).digest();
  return timingSafeEqual(a, b);
}

/** The secret from `x-manychat-secret`, or from `Authorization: Bearer …` — a ManyChat External
 *  Request can set either header. */
function manychatSecret(req: any): string {
  const direct = req.headers?.['x-manychat-secret'];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const auth = String(req.headers?.authorization ?? '');
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

/**
 * A ManyChat field as a bounded string. Contact ids arrive as numbers; an unfilled field arrives as
 * '' — or, when a placeholder was typed by hand instead of inserted, as the literal `{{…}}` text,
 * which is dropped rather than stored as someone's name or email.
 */
function mcField(v: unknown, max: number): string {
  const s = typeof v === 'number' && Number.isFinite(v) ? String(v) : typeof v === 'string' ? v.trim() : '';
  return /^\{\{.*\}\}$/.test(s) ? '' : s.slice(0, max);
}

/** The guide a lead asked for: a static slug (with its title) or a bridge guideId. */
function resolveGuide(id: string): { guideId: string; ref: string; title: string; url: string } | null {
  if (!id) return null;
  const staticGuide = findStaticGuide(id);
  if (staticGuide) {
    return { guideId: staticGuide.slug, ref: staticGuide.slug, title: staticGuide.title, url: `${SITE_ORIGIN}/g/${staticGuide.slug}` };
  }
  // A bridge guideId IS the download capability, so only its first 8 hex are stored on the lead
  // (`ref`) — enough to tell guides apart, useless for fetching one.
  if (/^[a-f0-9]{32}$/.test(id)) return { guideId: id, ref: id.slice(0, 8), title: '', url: `${SITE_ORIGIN}/g/${id}` };
  return null;
}

/**
 * `POST { action: 'manychat-lead', subscriberId, igUsername, name, email, phone, keyword, guideId }`
 * — called by a ManyChat External Request after a Comment-to-DM.
 *
 * Fails CLOSED, unlike the admin actions above: without MANYCHAT_WEBHOOK_SECRET it answers 503 and
 * stores nothing. It writes to the `leads` list that email campaigns read, so an open instance
 * would let anyone fill that list.
 *
 * Idempotent per (subscriber, guide): ManyChat re-runs the flow when someone comments twice, and a
 * retried request repeats too, so a repeat updates the existing lead instead of adding a row.
 * Answers `{ ok, leadId, deduped, guideFound, guideUrl, guideTitle }` — a flow can map `guideUrl`
 * into a custom field and put it on the DM button.
 */
async function handleManychatLead(req: any, res: any, body: Record<string, unknown>) {
  const configured = process.env.MANYCHAT_WEBHOOK_SECRET || '';
  if (!configured) {
    console.error('[api/leads] manychat-lead refused: MANYCHAT_WEBHOOK_SECRET is not set');
    res.status(503).json({ ok: false, error: 'manychat webhook not configured' });
    return;
  }
  if (!secretMatches(manychatSecret(req), configured)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const subscriberId = mcField(body.subscriberId, 64);
  const igUsername = mcField(body.igUsername, 64).replace(/^@+/, '');
  if (!subscriberId && !igUsername) {
    res.status(400).json({ ok: false, error: 'need subscriberId or igUsername' });
    return;
  }
  const email = mcField(body.email, 200).toLowerCase();
  const keyword = mcField(body.keyword, 40);
  const requested = mcField(body.guideId, 64).toLowerCase();
  const guide = resolveGuide(requested);
  const campaign = keyword ? `ManyChat · ${keyword}` : 'ManyChat';

  const identity = subscriberId || `@${igUsername.toLowerCase()}`;
  const mcKey = createHash('sha256')
    .update(`${identity}|${guide?.guideId || requested || keyword.toLowerCase()}`)
    .digest('hex')
    .slice(0, 24);

  const saved = await upsertManychatLead(mcKey, {
    name: mcField(body.name, 120) || (igUsername ? `@${igUsername}` : 'Instagram'),
    email: isEmail(email) ? email : '',
    phone: mcField(body.phone, 40).replace(/[^\d+\-() ]/g, '').trim(),
    igUsername,
    subscriberId,
    keyword,
    guide: guide?.ref ?? '',
    project: guide?.title || campaign,
    sourceSection: campaign,
    source: 'manychat',
  });
  if (!saved) {
    res.status(500).json({ ok: false, error: 'lead not saved' });
    return;
  }
  res.status(200).json({
    ok: true,
    leadId: saved.id,
    deduped: saved.deduped,
    guideFound: Boolean(guide),
    guideUrl: guide?.url ?? '',
    guideTitle: guide?.title ?? '',
  });
}
