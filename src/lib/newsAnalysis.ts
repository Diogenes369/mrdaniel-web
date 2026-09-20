import type { NewsItem } from '../services/newsService';

/**
 * Deterministic, client-side enrichment of a feed item for the News Command Center's expanded
 * view: the executive summary and deep-dive are re-shaped from the article's OWN summary/excerpt
 * text, with no LLM call and no invented facts.
 *
 * The "ניתוח טכנולוגי ומשמעויות" (MR. DANIEL Analysis) block that used to live here as a static,
 * topic-keyed `IMPACT` table has been REMOVED — it printed identical boilerplate under every story
 * of a given topic. It is now generated per-article by Gemini via `POST /api/news/analyze`
 * (src/server/newsInsights.ts, consumed through src/services/newsInsightsService.ts), and there is
 * intentionally no local fallback: no analysis means the modal hides the section.
 */

/** Bare registrable domain of a URL — "geektime.co.il", "www." stripped. */
export function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const HEBREW_RE = /[֐-׿]/g;
const LATIN_RE = /[A-Za-z]/g;

// Known foreign / English tech outlets that reach the feed (directly or via Google News).
// Matched loosely against `item.source`; anything here is excluded regardless of the title.
const FOREIGN_SOURCE_RE =
  /bleeping|hacker\s*news|krebs|techcrunch|the\s*verge|ars\s*technica|cybernews|wired|reuters|bloomberg|the\s*register|zdnet|engadget|gizmodo|mashable|the\s*next\s*web|venturebeat|investing\.com|forbes(?!\.co\.il)|3druck|passportnews|تسنیم|dark\s*reading|securityweek/i;

/**
 * News Command Center card requirement — a validated **Hebrew-language article from an Israeli
 * tech portal** that carries a usable lead image. Excludes foreign/English sources
 * (BleepingComputer, The Hacker News, TechCrunch, The Verge, …) both by an explicit source
 * blocklist AND by requiring the title/excerpt to be strongly Hebrew-dominant (≥ 2× the Latin
 * letter count), and drops text-only / no-image cards.
 */
/**
 * A lead image whose URL itself declares a rendition too small to fill a card.
 *
 * Mirrors `isTooSmallByUrl` in src/server/newsFeed.ts, which is where this is now rejected at the
 * source. Kept here as well because `/api/news` is cached for 15 minutes: without this, a response
 * that was already cached before the server fix shipped would still put a WordPress emoji sprite
 * (72×72) on the homepage as a lead photo, where it loads fine and then fails NewsImage's 400×300
 * floor — the blank-card bug. Dropping the item instead lets a real story take the slot.
 */
function tooSmallByUrl(url: string): boolean {
  const m = /(?:^|[\/_-])(\d{2,4})x(\d{2,4})(?:[\/._-]|$)/.exec(url);
  if (m) {
    const w = Number(m[1]);
    const h = Number(m[2]);
    if (w >= 8 && h >= 8 && (w < 400 || h < 300)) return true;
  }
  const q = /[?&](?:w|width)=(\d{1,4})\b/i.exec(url);
  return q ? Number(q[1]) < 400 : false;
}

export function isHebrewWithImage(item: NewsItem): boolean {
  if (FOREIGN_SOURCE_RE.test(item.source || '')) return false;
  const img = (item.image || '').trim();
  if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(img)) return false;
  if (tooSmallByUrl(img)) return false;
  const text = `${item.title} ${item.excerpt || ''}`;
  const he = (text.match(HEBREW_RE) || []).length;
  const la = (text.match(LATIN_RE) || []).length;
  return he >= 10 && he >= la * 2;
}

/** Apply the strict Hebrew-Israeli command-center filter, keeping the feed's newest-first order. */
export function filterCommandCenter(items: NewsItem[]): NewsItem[] {
  return items.filter(isHebrewWithImage);
}

/**
 * Strips a leading bullet glyph or hyphen off a line. A raw "- " at the head of a Hebrew line
 * renders on the wrong side and drags punctuation with it inside an RTL list, so the marker is
 * always the UI's job, never the text's.
 */
export function stripLeadingBullet(text: string): string {
  return (text || '').replace(/^[\s\-–—•*·>]+/, '').trim();
}

function toSentences(text: string): string[] {
  return (text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…])\s+(?=[^\s])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}

function heDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('he-IL', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** 3–5 executive-summary bullets, drawn from the article's own text. */
export function executiveSummary(item: NewsItem): string[] {
  const src = (item.summary || item.excerpt || '').trim();
  const ss = toSentences(src).map(stripLeadingBullet);
  if (ss.length >= 3) return ss.slice(0, 5);

  const out: string[] = [];
  if (item.title) out.push(item.title.replace(/[.\s]+$/, '') + '.');
  if (src && !out.includes(src)) out.push(src.length > 12 ? src : `${src}.`);
  out.push(`הכתבה פורסמה ב-${item.source}${heDate(item.publishedAt) ? ` · ${heDate(item.publishedAt)}` : ''}.`);
  return out.filter(Boolean).map(stripLeadingBullet).filter(Boolean);
}

/** The deep-dive body: the article summary regrouped into readable ~2-sentence paragraphs. */
export function deepDive(item: NewsItem): string[] {
  const src = (item.summary || item.excerpt || '').trim();
  if (!src) {
    return [
      'הפיד סיפק לכתבה זו כותרת ותקציר קצר בלבד. הניתוח כאן מבוסס על המידע הזמין; לסיקור המלא עברו למקור המקורי בכפתור למטה.',
    ];
  }
  const ss = toSentences(src).map(stripLeadingBullet);
  if (ss.length <= 2) return [stripLeadingBullet(src)];
  const paras: string[] = [];
  for (let i = 0; i < ss.length; i += 2) paras.push(ss.slice(i, i + 2).join(' '));
  return paras;
}
