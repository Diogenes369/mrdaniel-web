/**
 * Client mirror of the email block/shell builders in src/server/emailEngine.ts — used to compose
 * the campaign body (user HTML + optional Services / Featured-News sections) AND to render the
 * live iframe preview with the exact same markup the server will send.
 */

const SITE = 'https://mrdaniel.co.il';
const GREEN = '#76B900';
const GREEN_LIGHT = '#9FE870';

const esc = (s: string) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function withUtm(url: string, campaign = 'newsletter'): string {
  if (!/^https?:\/\//i.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}utm_source=newsletter&utm_medium=email&utm_campaign=${encodeURIComponent(campaign)}`;
}

export function emailButton(href: string, label: string, campaign?: string): string {
  return `<a href="${esc(withUtm(href, campaign))}" style="display:inline-block;background:${GREEN};background-image:linear-gradient(180deg,${GREEN_LIGHT},#5C9200);color:#0b0f0e;font:800 15px/1 Arial,Helvetica,sans-serif;text-decoration:none;padding:14px 28px;border-radius:12px;box-shadow:0 6px 22px rgba(118,185,0,0.35);">${esc(label)}&nbsp;&larr;</a>`;
}

function sectionCard(heading: string, innerHtml: string): string {
  return `<tr><td style="padding:8px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#181820;border:1px solid #24242e;border-radius:16px;padding:22px 24px;">
      <div style="color:#ffffff;font:800 14px/1.3 Arial,Helvetica,sans-serif;border-bottom:2px solid ${GREEN};display:inline-block;padding-bottom:6px;margin-bottom:14px;">${esc(heading)}</div>
      ${innerHtml}
    </td></tr></table>
  </td></tr>`;
}

export interface EmailNewsItem {
  slug?: string;
  link?: string;
  title: string;
  excerpt?: string;
  image?: string;
}

export function featuredNewsHtml(items: EmailNewsItem[], campaign?: string): string {
  const rows = items
    .filter((i) => i?.title)
    .slice(0, 4)
    .map((i) => {
      const url = i.slug ? `${SITE}/news/${encodeURIComponent(i.slug)}` : i.link || `${SITE}/news`;
      const thumb = i.image
        ? `<img src="${esc(i.image)}" width="96" height="96" alt="" style="display:block;width:96px;height:96px;border-radius:12px;object-fit:cover;border:1px solid #24242e;">`
        : `<div style="width:96px;height:96px;border-radius:12px;background:#0e0e14;border:1px solid #24242e;"></div>`;
      return `<tr><td style="padding:10px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="96" valign="top" style="padding-left:14px;">${thumb}</td>
          <td valign="top" style="color:#c7cad0;font:400 13px/1.7 Arial,Helvetica,sans-serif;">
            <a href="${esc(withUtm(url, campaign))}" style="color:#ffffff;font:700 15px/1.5 Arial,Helvetica,sans-serif;text-decoration:none;">${esc(i.title)}</a><br>
            ${i.excerpt ? esc(i.excerpt.slice(0, 140)) : ''}
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
        <a href="${esc(withUtm(i.href, campaign))}" style="color:#ffffff;font:800 14px/1.4 Arial,Helvetica,sans-serif;text-decoration:none;">${esc(i.t)}</a>
        <div style="color:#8a8f98;font:400 12px/1.7 Arial,Helvetica,sans-serif;margin-top:4px;">${esc(i.d)}</div>
      </td></tr></table>
    </td></tr>`
    )
    .join('');
  return sectionCard('מה אנחנו עושים', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`);
}

/** Full shell — mirrors wrapBrandedEmail() for the preview iframe. */
export function previewShell(inner: string, subject: string, extraSections = ''): string {
  const year = new Date().getFullYear();
  const link = (href: string, label: string) => `<a href="${esc(href)}" style="color:${GREEN_LIGHT};text-decoration:none;">${esc(label)}</a>`;
  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="color-scheme" content="dark"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#09090b;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#09090b;background-image:linear-gradient(180deg,#0c0c10,#09090b);">
<tr><td align="center" style="padding:30px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">
  <tr><td style="height:4px;line-height:4px;font-size:0;background:${GREEN};background-image:linear-gradient(90deg,${GREEN},${GREEN_LIGHT},${GREEN});border-radius:4px 4px 0 0;">&nbsp;</td></tr>
  <tr><td style="background:#121218;background-image:linear-gradient(180deg,#17171f,#0e0e14);padding:26px 30px;border-radius:0 0 6px 6px;">
    <span style="color:#ffffff;font:800 22px/1 Arial,Helvetica,sans-serif;letter-spacing:3px;">MR. DANIEL</span>
    <span style="display:block;color:#8a8f98;font:400 12px/1.6 Arial,Helvetica,sans-serif;margin-top:7px;">סוכני AI &nbsp;·&nbsp; אבטחת סייבר &nbsp;·&nbsp; פיתוח דיגיטלי</span>
  </td></tr>
  <tr><td style="padding:16px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#181820;border:1px solid #24242e;border-radius:16px;padding:30px;color:#d8dade;font:400 15px/1.85 Arial,Helvetica,sans-serif;">${inner}</td></tr></table></td></tr>
  ${extraSections}
  <tr><td style="padding:22px 30px 6px;color:#6e727b;font:400 12px/1.9 Arial,Helvetica,sans-serif;text-align:center;">
    ${link(SITE, 'האתר')} &nbsp;·&nbsp; ${link(`${SITE}/ai`, 'סוכני AI')} &nbsp;·&nbsp; ${link(`${SITE}/cyber`, 'סייבר')} &nbsp;·&nbsp; ${link(`${SITE}/news`, 'חדשות')}<br>
    <a href="mailto:daniel@mrdaniel.co.il" style="color:${GREEN_LIGHT};text-decoration:none;">daniel@mrdaniel.co.il</a> &nbsp;·&nbsp; ${link('https://www.linkedin.com/', 'LinkedIn')} &nbsp;·&nbsp; ${link('https://www.instagram.com/mrdaniel.ai/', 'Instagram')}
  </td></tr>
  <tr><td style="padding:6px 30px 0;color:#54575e;font:400 11px/1.8 Arial,Helvetica,sans-serif;text-align:center;">
    &copy; ${year} דניאל בן ברוך · כל הזכויות שמורות.<br>קיבלת מייל זה כי נרשמת לעדכונים ב-mrdaniel.co.il. <span style="color:#7c848d;text-decoration:underline;">להסרה מרשימת התפוצה</span>.
  </td></tr>
</table></td></tr></table></body></html>`;
}
