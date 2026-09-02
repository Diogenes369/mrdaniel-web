import nodemailer from 'nodemailer';

/**
 * Email engine — Nodemailer over SMTP (ImprovMX / Gmail / custom) + the branded HTML shell.
 *
 * Env (Vercel `my-website` project):
 *   SMTP_HOST  default "smtp.improvmx.com"   SMTP_PORT  default 587 (465 = implicit TLS)
 *   SMTP_USER  (required)                    SMTP_PASS  (required)
 *   SMTP_FROM  optional display address; defaults to SMTP_USER
 *
 * All output is table-based with 100% inline CSS — no <style>, no fl/grid — for Gmail / Outlook /
 * Apple Mail compatibility, and `max-width` + fluid widths for mobile.
 */

export const SMTP_HOST = process.env.SMTP_HOST || 'smtp.improvmx.com';
export const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
export const FROM_ADDRESS = process.env.SMTP_FROM || process.env.SMTP_USER || 'daniel@mrdaniel.co.il';

const SITE = 'https://mrdaniel.co.il';
const GREEN = '#76B900';
const GREEN_LIGHT = '#9FE870';

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter: nodemailer.Transporter | null = null;
export function getTransporter(): nodemailer.Transporter | null {
  if (!isEmailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Appends canonical newsletter UTM params (preserving any existing query string). */
export function withUtm(url: string, campaign = 'newsletter'): string {
  if (!/^https?:\/\//i.test(url)) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}utm_source=newsletter&utm_medium=email&utm_campaign=${encodeURIComponent(campaign)}`;
}

/** Sharp CTA button with a green gradient + soft glow. */
export function emailButton(href: string, label: string, campaign?: string): string {
  return `<a href="${escapeHtml(withUtm(href, campaign))}" style="display:inline-block;background:${GREEN};background-image:linear-gradient(180deg,${GREEN_LIGHT},#5C9200);color:#0b0f0e;font:800 15px/1 Arial,Helvetica,sans-serif;text-decoration:none;padding:14px 28px;border-radius:12px;box-shadow:0 6px 22px rgba(118,185,0,0.35);">${escapeHtml(label)}&nbsp;&larr;</a>`;
}

export interface EmailNewsItem {
  slug?: string;
  link?: string;
  title: string;
  excerpt?: string;
  image?: string;
}

/** "Featured articles" block — thumbnail + headline (deep-link to /news/<slug>) + excerpt. */
export function featuredNewsHtml(items: EmailNewsItem[], campaign?: string): string {
  const rows = items
    .filter((i) => i?.title)
    .slice(0, 4)
    .map((i) => {
      const url = i.slug ? `${SITE}/news/${encodeURIComponent(i.slug)}` : i.link || `${SITE}/news`;
      const thumb = i.image
        ? `<img src="${escapeHtml(i.image)}" width="96" height="96" alt="" style="display:block;width:96px;height:96px;border-radius:12px;object-fit:cover;border:1px solid #24242e;">`
        : `<div style="width:96px;height:96px;border-radius:12px;background:#0e0e14;border:1px solid #24242e;"></div>`;
      return `<tr><td style="padding:10px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="96" valign="top" style="padding-left:14px;">${thumb}</td>
          <td valign="top" style="color:#c7cad0;font:400 13px/1.7 Arial,Helvetica,sans-serif;">
            <a href="${escapeHtml(withUtm(url, campaign))}" style="color:#ffffff;font:700 15px/1.5 Arial,Helvetica,sans-serif;text-decoration:none;">${escapeHtml(i.title)}</a><br>
            ${i.excerpt ? escapeHtml(i.excerpt.slice(0, 140)) : ''}
          </td>
        </tr></table>
      </td></tr>`;
    })
    .join('');
  if (!rows) return '';
  return sectionCard(
    'כתבות מובילות מהאתר',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
     <div style="margin-top:14px;">${emailButton(`${SITE}/news`, 'לכל החדשות', campaign)}</div>`
  );
}

/** AI / Cyber / Infrastructure highlights — a stacked list of 3 mini-cards linking to the site. */
export function servicesHighlightsHtml(campaign?: string): string {
  const items = [
    { t: 'סוכני AI מותאמים אישית', d: 'אוטומציה מקצה לקצה, RAG, אינטגרציה למערכות קיימות.', href: `${SITE}/ai` },
    { t: 'אבטחת סייבר וניהול IT', d: 'Zero-Trust, הקשחה, ניטור, רשת וזהויות ברמת Enterprise.', href: `${SITE}/cyber` },
    { t: 'ארכיטקטורה ותשתיות', d: 'תכן מערכות, ענן, ופיתוח פלטפורמות מהיר ויציב.', href: `${SITE}/architecture` },
  ];
  const rows = items
    .map(
      (i) => `<tr><td style="padding:7px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#0e0e14;border:1px solid #24242e;border-radius:12px;padding:14px 16px;">
        <a href="${escapeHtml(withUtm(i.href, campaign))}" style="color:#ffffff;font:800 14px/1.4 Arial,Helvetica,sans-serif;text-decoration:none;">${escapeHtml(i.t)}</a>
        <div style="color:#8a8f98;font:400 12px/1.7 Arial,Helvetica,sans-serif;margin-top:4px;">${escapeHtml(i.d)}</div>
      </td></tr></table>
    </td></tr>`
    )
    .join('');
  return sectionCard('מה אנחנו עושים', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`);
}

/** A rounded #181820 section container with a small green-underlined heading. */
function sectionCard(heading: string, innerHtml: string): string {
  return `<tr><td style="padding:8px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#181820;border:1px solid #24242e;border-radius:16px;padding:22px 24px;">
      <div style="color:#ffffff;font:800 14px/1.3 Arial,Helvetica,sans-serif;border-bottom:2px solid ${GREEN};display:inline-block;padding-bottom:6px;margin-bottom:14px;">${escapeHtml(heading)}</div>
      ${innerHtml}
    </td></tr></table>
  </td></tr>`;
}

export interface WrapOptions {
  title?: string;
  preheader?: string;
  campaign?: string;
  unsubscribeUrl?: string;
  /** Extra section HTML (from servicesHighlightsHtml / featuredNewsHtml) appended after the body. */
  extraSections?: string;
}

/**
 * Wraps arbitrary inner HTML in the premium MR. DANIEL email shell:
 * deep-dark #09090b canvas, gradient #121218 header with a green accent line and the brand title,
 * a rounded #181820 body card, optional extra sections, and a full footer (site links, contact,
 * socials, copyright, anti-spam unsubscribe note).
 */
export function wrapBrandedEmail(inner: string, opts: WrapOptions = {}): string {
  const { title = 'MR. DANIEL', preheader = '', campaign = 'newsletter', unsubscribeUrl = `${SITE}/unsubscribe`, extraSections = '' } = opts;
  const year = new Date().getFullYear();
  const link = (href: string, label: string) =>
    `<a href="${escapeHtml(withUtm(href, campaign))}" style="color:${GREEN_LIGHT};text-decoration:none;">${escapeHtml(label)}</a>`;

  return `<!doctype html>
<html dir="rtl" lang="he" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#09090b;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader || title)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#09090b;background-image:linear-gradient(180deg,#0c0c10,#09090b);">
<tr><td align="center" style="padding:30px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">

  <tr><td style="height:4px;line-height:4px;font-size:0;background:${GREEN};background-image:linear-gradient(90deg,${GREEN},${GREEN_LIGHT},${GREEN});border-radius:4px 4px 0 0;">&nbsp;</td></tr>

  <tr><td style="background:#121218;background-image:linear-gradient(180deg,#17171f,#0e0e14);padding:26px 30px;border-radius:0 0 6px 6px;">
    <span style="color:#ffffff;font:800 22px/1 Arial,Helvetica,sans-serif;letter-spacing:3px;">MR. DANIEL</span>
    <span style="display:block;color:#8a8f98;font:400 12px/1.6 Arial,Helvetica,sans-serif;margin-top:7px;">סוכני AI &nbsp;·&nbsp; אבטחת סייבר &nbsp;·&nbsp; פיתוח דיגיטלי</span>
  </td></tr>

  <tr><td style="padding:16px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#181820;border:1px solid #24242e;border-radius:16px;padding:30px;color:#d8dade;font:400 15px/1.85 Arial,Helvetica,sans-serif;">
      ${inner}
    </td></tr></table>
  </td></tr>

  ${extraSections}

  <tr><td style="padding:22px 30px 6px;color:#6e727b;font:400 12px/1.9 Arial,Helvetica,sans-serif;text-align:center;">
    ${link(SITE, 'האתר')} &nbsp;·&nbsp; ${link(`${SITE}/ai`, 'סוכני AI')} &nbsp;·&nbsp; ${link(`${SITE}/cyber`, 'סייבר')} &nbsp;·&nbsp; ${link(`${SITE}/news`, 'חדשות')} &nbsp;·&nbsp; ${link(`${SITE}/jarvis`, 'JARVIS')}<br>
    <a href="mailto:daniel@mrdaniel.co.il" style="color:${GREEN_LIGHT};text-decoration:none;">daniel@mrdaniel.co.il</a>
    &nbsp;·&nbsp; ${link('https://www.linkedin.com/', 'LinkedIn')}
    &nbsp;·&nbsp; ${link('https://www.instagram.com/mrdaniel.ai/', 'Instagram')}
    &nbsp;·&nbsp; ${link('https://wa.me/972506473039', 'WhatsApp')}
  </td></tr>
  <tr><td style="padding:6px 30px 0;color:#54575e;font:400 11px/1.8 Arial,Helvetica,sans-serif;text-align:center;">
    &copy; ${year} דניאל בן ברוך · כל הזכויות שמורות.<br>
    קיבלת מייל זה כי נרשמת לעדכונים ב-mrdaniel.co.il. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#7c848d;text-decoration:underline;">להסרה מרשימת התפוצה</a>.
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

export function welcomeEmailHtml(name?: string): { subject: string; html: string } {
  const hi = name ? `שלום ${escapeHtml(name)},` : 'שלום,';
  const inner = `
    <p style="margin:0 0 14px;color:#ffffff;font:700 19px/1.5 Arial,Helvetica,sans-serif;">${hi}</p>
    <p style="margin:0 0 14px;">תודה שנרשמת. מכאן תקבלו עדכונים ממוקדים על סוכני AI, אבטחת סייבר ופתרונות טכנולוגיים שמייצרים ערך עסקי אמיתי — בלי רעש מיותר.</p>
    <p style="margin:0 0 18px;">בינתיים אפשר לעיין בפתרונות ובכתבות העדכניות באתר:</p>
    <p style="margin:0;">${emailButton(SITE, 'כניסה לאתר', 'welcome')}</p>`;
  return {
    subject: 'ברוכים הבאים — MR. DANIEL',
    html: wrapBrandedEmail(inner, { title: 'ברוכים הבאים', preheader: 'תודה שנרשמת לעדכונים', campaign: 'welcome', extraSections: servicesHighlightsHtml('welcome') }),
  };
}

export async function sendOne(msg: { to: string; subject: string; html: string; replyTo?: string }): Promise<{ ok: boolean; error?: string }> {
  const tx = getTransporter();
  if (!tx) return { ok: false, error: 'smtp-not-configured' };
  try {
    await tx.sendMail({
      from: `"דניאל בן ברוך" <${FROM_ADDRESS}>`,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
    });
    return { ok: true };
  } catch (err) {
    console.error('[email] sendOne failed:', (err as Error)?.message ?? err);
    return { ok: false, error: (err as Error)?.message ?? 'send-failed' };
  }
}

export async function sendCampaign(opts: {
  subject: string;
  html: string;
  recipients: string[];
}): Promise<{ ok: boolean; total: number; sent: number; failed: number; batches: number; error?: string }> {
  const tx = getTransporter();
  const recipients = [...new Set(opts.recipients.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!tx) return { ok: false, total: recipients.length, sent: 0, failed: recipients.length, batches: 0, error: 'smtp-not-configured' };
  if (recipients.length === 0) return { ok: true, total: 0, sent: 0, failed: 0, batches: 0 };

  const BATCH = 40;
  let sent = 0;
  let failed = 0;
  let batches = 0;
  for (let i = 0; i < recipients.length; i += BATCH) {
    const slice = recipients.slice(i, i + BATCH);
    batches++;
    try {
      await tx.sendMail({ from: `"דניאל בן ברוך" <${FROM_ADDRESS}>`, to: FROM_ADDRESS, bcc: slice, subject: opts.subject, html: opts.html });
      sent += slice.length;
    } catch (err) {
      console.error('[email] campaign batch failed:', (err as Error)?.message ?? err);
      failed += slice.length;
    }
  }
  return { ok: failed === 0, total: recipients.length, sent, failed, batches };
}
