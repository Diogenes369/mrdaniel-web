import nodemailer from 'nodemailer';

/**
 * Email engine — Nodemailer over ImprovMX (or any custom) SMTP.
 *
 * Env (set on the Vercel `my-website` project):
 *   SMTP_HOST   default "smtp.improvmx.com"
 *   SMTP_PORT   default 587 (STARTTLS; 465 = implicit TLS)
 *   SMTP_USER   the sending alias, e.g. "daniel@mrdaniel.co.il"
 *   SMTP_PASS   the ImprovMX SMTP password (Account → SMTP)
 *   SMTP_FROM   optional display address; defaults to SMTP_USER
 *
 * Used by api/leads.ts's email actions (send-campaign / send-test / send-welcome) and the
 * auto-welcome-on-signup path.
 */

export const SMTP_HOST = process.env.SMTP_HOST || 'smtp.improvmx.com';
export const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
export const FROM_ADDRESS = process.env.SMTP_FROM || process.env.SMTP_USER || 'daniel@mrdaniel.co.il';

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

const BRAND_GREEN = '#76B900';

/** Wraps arbitrary inner HTML in the branded MR. DANIEL shell (dark header, readable light body,
 * footer with the site link). `inner` may be plain paragraphs or full markup. */
export function wrapBrandedEmail(inner: string, opts: { title?: string; preheader?: string } = {}): string {
  const { title = 'MR. DANIEL', preheader = '' } = opts;
  return `<!doctype html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#0b0f0e;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f0e;padding:24px 0;">
<tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#111614;border:1px solid #23302a;border-radius:16px;overflow:hidden;">
    <tr><td style="background:#0d1210;padding:22px 28px;border-bottom:2px solid ${BRAND_GREEN};">
      <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:1px;">MR. DANIEL</span>
    </td></tr>
    <tr><td style="padding:28px;color:#d7dbd8;font-size:15px;line-height:1.8;">
      ${inner}
    </td></tr>
    <tr><td style="padding:18px 28px;border-top:1px solid #23302a;color:#7c847f;font-size:12px;line-height:1.7;">
      דניאל בן ברוך · סוכני AI, אבטחת סייבר ופיתוח דיגיטלי<br>
      <a href="https://mrdaniel.co.il" style="color:${BRAND_GREEN};text-decoration:none;">mrdaniel.co.il</a>
      &nbsp;·&nbsp; קיבלת את המייל הזה כי נרשמת לעדכונים באתר.
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

export function welcomeEmailHtml(name?: string): { subject: string; html: string } {
  const hi = name ? `שלום ${escapeHtml(name)},` : 'שלום,';
  const inner = `
    <p style="margin:0 0 14px;color:#ffffff;font-size:18px;font-weight:700;">${hi}</p>
    <p style="margin:0 0 14px;">תודה שנרשמת. מכאן תקבלו עדכונים ממוקדים על סוכני AI, אבטחת סייבר, ופתרונות טכנולוגיים שמייצרים ערך עסקי אמיתי — בלי רעש מיותר.</p>
    <p style="margin:0 0 14px;">בינתיים, אפשר לעיין בפתרונות ובכתבות העדכניות באתר:</p>
    <p style="margin:0 0 6px;">
      <a href="https://mrdaniel.co.il" style="display:inline-block;background:${BRAND_GREEN};color:#0b0f0e;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:10px;">כניסה לאתר</a>
    </p>`;
  return { subject: 'ברוכים הבאים — MR. DANIEL', html: wrapBrandedEmail(inner, { title: 'ברוכים הבאים', preheader: 'תודה שנרשמת לעדכונים' }) };
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

/** Sends `html` to every address in `recipients`, batched via BCC (max ~40/message) so one
 * campaign is a handful of SMTP transactions, not hundreds. Never throws. */
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
      await tx.sendMail({
        from: `"דניאל בן ברוך" <${FROM_ADDRESS}>`,
        to: FROM_ADDRESS,
        bcc: slice,
        subject: opts.subject,
        html: opts.html,
      });
      sent += slice.length;
    } catch (err) {
      console.error('[email] campaign batch failed:', (err as Error)?.message ?? err);
      failed += slice.length;
    }
  }
  return { ok: failed === 0, total: recipients.length, sent, failed, batches };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
