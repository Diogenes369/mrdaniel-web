/**
 * WhatsApp Community update payload — a mobile-native text block plus the data structure a future
 * WhatsApp Business Cloud API endpoint can post directly.
 *
 * The synthesised body already follows WhatsApp conventions (sharp hook, 2–3 short paragraphs,
 * `*single-asterisk*` bold, one CTA line). This module normalises it, appends a clean isolated
 * link + the brand line + hashtags, and produces the deep links + API skeleton.
 */

const SITE_URL = 'mrdaniel.co.il';
const LTR_OPEN = '⁦';
const LTR_CLOSE = '⁩';

export interface WhatsappPayload {
  /** The complete message text, ready to paste / send. */
  text: string;
  /** Just the synthesised narrative (hook + paragraphs + CTA), before link/brand/hashtags. */
  bodyText: string;
  hashtags: string[];
  link: string;
  /** Opens the OS WhatsApp share sheet with the text prefilled. */
  waMeLink: string;
  /** api.whatsapp.com equivalent (some desktop clients prefer it). */
  apiLink: string;
  /**
   * Skeleton for POST https://graph.facebook.com/v21.0/{PHONE_ID}/messages — fill `to` (and swap
   * in a real phone id / token) when a WhatsApp Business number is connected.
   */
  businessApiPayload: {
    messaging_product: 'whatsapp';
    recipient_type: 'individual';
    to: string;
    type: 'text';
    text: { preview_url: boolean; body: string };
  };
}

/** Normalise bold + whitespace + strip any stray URL the model may have left in the narrative. */
function normaliseBody(raw: string): string {
  return (raw || '')
    .replace(/\*\*(.+?)\*\*/g, '*$1*') // markdown ** → WhatsApp *
    .replace(/^#{1,6}\s+/gm, '') // drop any heading markers
    .replace(/^\s*[-•]\s+/gm, '') // drop bullet markers → WhatsApp updates read as prose
    .replace(/\bhttps?:\/\/\S+/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** LTR-isolate a bare domain / URL so it keeps its order inside the RTL message. */
function isolateLink(s: string): string {
  return `${LTR_OPEN}${s.replace(/^https?:\/\//i, '')}${LTR_CLOSE}`;
}

/**
 * Deterministic WhatsApp-shaped rewrite for when the AI rewrite is unavailable (429 / offline).
 * NOT a verbatim dump: restructures the source into a hook line + two balanced paragraphs + a
 * CTA line, so the community update still reads like a message, not a pasted article.
 */
export function deterministicWhatsappBody(text: string, title?: string): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  const sents = clean.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter((s) => s.length > 3);
  if (sents.length === 0) return clean;
  const useTitleHook = !!title && title.trim().length > 8;
  const hookRaw = (useTitleHook ? title!.trim() : sents[0]).replace(/[.׃]+$/, '');
  const hook = /[?!]$/.test(hookRaw) ? hookRaw : `${hookRaw}.`;
  const rest = useTitleHook ? sents : sents.slice(1);
  const mid = Math.ceil(rest.length / 2);
  const p1 = rest.slice(0, mid).join(' ');
  const p2 = rest.slice(mid).join(' ');
  const cta = 'שווה לצלול לפרטים — מוזמנים להגיב, לשתף או לשאול.';
  return [hook, p1, p2, cta].filter((s) => s && s.trim()).join('\n\n');
}

export function buildWhatsappPayload(input: {
  title?: string;
  body: string;
  hashtags?: string[];
  link?: string;
}): WhatsappPayload {
  const bodyText = normaliseBody(input.body);
  const hashtags = (input.hashtags ?? []).map((h) => (h.startsWith('#') ? h : `#${h}`)).slice(0, 6);
  const link = (input.link ?? '').trim();

  const lines: string[] = [bodyText, ''];
  if (link) lines.push(`🔗 המקור המלא: ${isolateLink(link)}`);
  lines.push(`📲 עוד עדכונים והצטרפות לקהילה: ${isolateLink(SITE_URL)}`);
  if (hashtags.length) lines.push('', hashtags.join(' '));

  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  return {
    text,
    bodyText,
    hashtags,
    link,
    waMeLink: `https://wa.me/?text=${encodeURIComponent(text)}`,
    apiLink: `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`,
    businessApiPayload: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '',
      type: 'text',
      text: { preview_url: true, body: text },
    },
  };
}
