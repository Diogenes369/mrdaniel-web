import nodemailer from 'nodemailer';
import {
  pushNewsletterSignup,
  readNewsletterEmails,
  readLeadEmails,
  readEmailConfig,
  readEmailTemplate,
  recordEmailCampaign,
} from '../src/agent/firebaseServer.js';
import { sendOne, sendCampaign, welcomeEmailHtml, wrapBrandedEmail, isEmailConfigured } from '../src/server/emailEngine.js';

// Vercel Serverless Function — the site's lead endpoint AND the email engine (folded in here
// rather than a new `/api/send-email` because Vercel Hobby caps a deployment at 12 functions).
//
//   • POST (no `action`)                 → the original: email the owner a new lead.
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
      const html = body.wrap === false ? rawHtml : wrapBrandedEmail(rawHtml, { title: subject, preheader: subject, extraSections });
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
    const html = body.wrap === false ? rawHtml : wrapBrandedEmail(rawHtml, { title: subject, preheader: subject, extraSections });
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

  // ---- Original lead flow ------------------------------------------------------------------
  const { name, email, phone, project, notes, sourceSection, selectedProduct, productCategory, price, userCompanySize } = body;
  if (!name || !email) {
    res.status(400).json({ ok: false, error: 'missing name/email' });
    return;
  }

  const transporter = getLeadTransporter();
  if (!transporter) {
    console.error('[api/leads] SMTP not configured — lead not delivered:', { name, email, phone, project, sourceSection });
    res.status(503).json({ ok: false, error: 'email delivery not configured' });
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
    } catch { /* auto-welcome is best-effort */ }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[api/leads] failed to send lead email:', err);
    res.status(500).json({ ok: false, error: 'send failed' });
  }
}
