/**
 * Best-effort importer for a pasted URL (LinkedIn post, article, blog, …). Server-side only —
 * used by /api/agent-generate · action:"import-url". Extracts headline, body text, a source
 * attribution and the lead image, so the dashboard's Content Repurposer can seed the AI synthesis.
 *
 * Strategy: a direct browser-UA fetch first (gets OG tags + inline <p> text for most sites), then
 * the Jina Reader proxy (`r.jina.ai`) as a fallback for origins that WAF-block datacenter IPs
 * (LinkedIn among them — for those we usually still recover title + image + whatever preview text
 * the login wall exposes, and the operator pastes the rest). Never throws.
 */

import { upscaleImageUrl } from './newsFeed.js';

const JINA_KEY = process.env.JINA_API_KEY?.trim();

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
};

export interface ImportedContent {
  ok: boolean;
  url: string;
  title: string;
  body: string;
  image: string;
  source: string;
  /** which path produced the content — surfaced in the UI so the operator knows how complete it is */
  via: 'direct' | 'jina' | 'none';
}

async function getText(url: string, timeoutMs: number, headers: Record<string, string>): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow', headers });
    if (!res.ok) return undefined;
    const body = await res.text();
    return body.length > 1_500_000 ? body.slice(0, 1_500_000) : body;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

function meta(html: string, ...names: string[]): string {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]+content=["']([^"']+)["']`,
      'i'
    );
    const m = html.match(re) || html.match(
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i')
    );
    if (m?.[1]) return decodeEntities(m[1].trim());
  }
  return '';
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)));
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6]|br)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n\n')
    .trim();
}

/** Pull the most text-dense block: <article>, else the union of long <p> runs. */
function extractBody(html: string): string {
  const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  if (article) {
    const t = stripTags(article);
    if (t.length > 200) return t;
  }
  const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripTags(m[1]))
    .filter((t) => t.length > 40);
  return paras.join('\n\n').trim();
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// ─── clean & de-duplicate extraction ────────────────────────────────────────────────────────

/** Normalise for comparison: lowercase, drop punctuation / niqqud, collapse whitespace. */
function normKey(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '') // Hebrew niqqud / cantillation
    .replace(/["'׳״“”‘’.,:;!?()\[\]{}|—–\-•·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A whole line that is social-network UI chrome / site nav / footer, not article content.
 * Anchored at both ends; Hebrew keywords do NOT use `\b` (JS `\b` is ASCII-only, fails by Hebrew). */
const NOISE_LINE =
  /^(?:\d[\d,.]*\s*(?:תגובות|תגובה|comments?|reactions?|likes?|shares?|repost(?:s|ed)?).*|(?:הצג|ראה|קרא)\s+(?:עוד|הכל).*|(?:see|show|read)\s+more\b.*|(?:like|comment|share|repost|send|save|follow(?:ing)?|connect)\b.*|activate to view.*|report this\s+(?:post|comment|article|profile)\b.*|(?:promoted|sponsored)\b.*|(?:ממומן|מקודם|edited|נערך).*|\d+\s*(?:w|d|h|mo|yr|שע|יום|שב)\b.*|hashtag\b.*|#[\p{L}\p{N}_]+(?:\s+#[\p{L}\p{N}_]+)*|\d[\d,]*\s*(?:followers|עוקבים|connections|קשרים).*|(?:view profile|צפייה בפרופיל|message|שליחת הודעה).*|(?:image|photo|תמונה)|(?:תנאי שימוש|מדיניות פרטיות|privacy policy|terms of (?:use|service)|צרו קשר|contact us|about us|הניוזלטר.*|newsletter.*|כל הזכויות שמורות.*|all rights reserved.*|©.*|הקוד האתי.*|בואו נתחיל!?|היי,?\s*אנחנו.*|עקבו אחרינו.*|follow us.*|קטגוריות|categories|תפריט|menu|דילוג לתוכן|skip to (?:content|main)|כתבות (?:נוספות|קשורות).*|related (?:posts|articles).*|read (?:next|also).*|עוד (?:בנושא|כתבות).*|share this.*|שתפו.*)|[—–\-]\s*[\p{L}][\p{L}'.֐-׿ \-]{1,38}|\s*[•·|—–\-]\s*)$/iu;

/** Author byline / external credit lines to drop entirely. */
const BYLINE_LINE = /^\s*(?:מאת|נכתב(?:\s+על[- ]ידי)?|כתב[הת]?|קרדיט|by|written by|posted by|author|source|via)\s*[:\-–—]?\s*.{1,60}$/i;

/** Trailing " | Name Name" / " — שם כותב" author attribution glued onto the body's end. */
const TRAILING_AUTHOR = /[\s ]*[|｜]\s*[\p{L}][\p{L}'.\-֐-׿]{1,20}(?:\s+[\p{L}][\p{L}'.\-֐-׿]{1,20}){0,3}\s*$/u;

/**
 * Clean the extracted body: remove social/UI noise lines, author bylines, a first line that
 * duplicates the headline, repeated paragraphs, and trailing "| Author" credit — so the
 * "תוכן שחולץ" box holds only the essential article/post text.
 */
/** Drop leading site-nav / menu clutter and trailing footer clutter by cropping to the first and
 * last lines that look like real prose (long, punctuated, contains letters). Only crops the head
 * when what precedes the first prose line is mostly short/link-label lines. */
const CONSENT_HINT =
  /(?:עוגיות|cookies?)\b|consent (?:banner|panel)|האחסון או הגישה הטכניים|technical storage or access|legitimate purpose of storing|למטרה החוקית של מתן|subscriber or user|אי-הסכמה או ביטול הסכמה/i;

/** Truncate at the first "end of article" marker (job board / newsletter form / related posts /
 * prev-next nav) that appears past the first ~400 chars of real content. */
function cutAtTail(text: string): string {
  const markers: RegExp[] = [
    /\n[^\n]*\bGeektime INSIDER\b/i,
    /\n\s*\{\s*כללי\s*\}/,
    /\nכתבות (?:נוספות|קשורות|מומלצות)/,
    /\nעוד (?:בנושא|כתבות|מ)/,
    /\nPlease leave this field empty/i,
    /\n-?\s*\[[ x]\]\s*אני מאשר/,
    /\nהירשמו? לניוזלטר/,
    /\nשתפו את הכתבה/,
    /\n(?:לכתבה|למאמר) (?:הקודמ|הבא)/,
    /\nrelated (?:posts|articles|stories)/i,
    /\nsubscribe to (?:our )?newsletter/i,
  ];
  let cut = text.length;
  for (const re of markers) {
    const m = text.slice(400).match(re);
    if (m && m.index !== undefined) cut = Math.min(cut, 400 + m.index);
  }
  return text.slice(0, cut).trim();
}

function cropToArticle(text: string): string {
  const lines = text.split('\n');
  const isProse = (l: string): boolean => {
    const t = l.trim();
    if (CONSENT_HINT.test(t)) return false;
    return (t.length >= 70 && /[.!?…]/.test(t) && /[א-ת]/.test(t)) || (t.length >= 120 && /[A-Za-z]/.test(t));
  };
  let start = lines.findIndex(isProse);
  if (start < 0) return text;
  const head = lines.slice(0, start).filter((l) => l.trim());
  const shortish = head.filter((l) => l.trim().length < 50).length;
  if (head.length < 3 || shortish / Math.max(1, head.length) < 0.6) start = 0;
  let end = lines.length;
  for (let i = lines.length - 1; i > start; i--) {
    if (isProse(lines[i])) {
      end = i + 1;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

export function cleanExtractedBody(rawBody: string, title: string): string {
  let text = (rawBody || '')
    .replace(/\r\n?/g, '\n')
    .replace(/^#{1,6}\s+/gm, '') // markdown heading markers (Jina Reader output)
    .replace(/^\s*[*•‣▪]\s+/gm, '') // markdown / nav bullet markers
    .replace(/\[\]\([^)]*\)/g, '') // empty markdown links (Jina image placeholders)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // markdown links → their text
    .replace(/^\s*https?:\/\/\S+\s*$/gm, '') // bare URL-only lines
    .replace(/^\s*(?:mon|tue|wed|thu|fri|sat|sun),?\s+\d{1,2}\s+\S+\s+\d{4}\b.*$/gim, '') // RSS date lines
    .replace(/^\s*\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\s*$/gm, '')
    // cookie / GDPR consent-panel lines (long prose, but not article content)
    .replace(/^\s*\[[ x]\]\s.*$/gim, '') // "[x] Preferences" checkbox rows
    .replace(
      /^.*(?:אנחנו משתמשים בטכנולוגיות כמו עוגיות|הסכמה לטכנולוגיות אלו תאפשר|לאחסון ו\/או גישה למידע במכשיר|נתונים אישיים כמו התנהגות גלישה|אי-הסכמה או ביטול הסכמה|האחסון או הגישה הטכניים|העדפות שלא התבקשו|התנגד|נהל אפשרויות|צפה בהעדפות|תמיד פעיל|we use cookies (?:and|to|on)|by (?:clicking|continuing)[^.]*(?:accept|consent)|cookie (?:policy|consent|settings|preferences)|manage (?:your )?(?:cookie )?preferences|the technical storage or access|is necessary for the legitimate purpose|purpose of storing preferences|view preferences|always active|functional\b.*\[|statistics\b.*\[|marketing\b.*\[|(?:העדפות|סטטיסטיקה|שיווק|פונקציונלי|נחוץ)-?\s*\[).*$/gim,
      ''
    );

  text = cutAtTail(cropToArticle(text));

  // line-level filtering
  const titleKey = normKey(title);
  const lines = text.split('\n').map((l) => l.trim());
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {
      if (kept.length && kept[kept.length - 1] !== '') kept.push('');
      continue;
    }
    if (NOISE_LINE.test(line) || BYLINE_LINE.test(line)) continue;
    // drop a leading line that just repeats the headline
    if (kept.filter(Boolean).length === 0 && titleKey.length > 10) {
      const lk = normKey(line);
      if (lk === titleKey || (lk.length > 12 && (titleKey.includes(lk) || lk.includes(titleKey)))) continue;
    }
    kept.push(line);
  }

  // Drop runs of >=4 consecutive short link-label lines (site nav / category column dumps).
  const short = (l: string) => l.length > 0 && l.length < 34 && !/[.!?…:]/.test(l);
  const pruned: string[] = [];
  for (let i = 0; i < kept.length; i++) {
    if (short(kept[i])) {
      let j = i;
      while (j < kept.length && (short(kept[j]) || kept[j] === '')) j++;
      const runLen = kept.slice(i, j).filter(Boolean).length;
      if (runLen >= 4) {
        i = j - 1;
        continue;
      }
    }
    pruned.push(kept[i]);
  }
  text = pruned.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  // paragraph-level de-duplication (OG description + article lede, Jina repeats)
  const seen = new Set<string>();
  const paras: string[] = [];
  for (const p of text.split(/\n{2,}/)) {
    const para = p.trim();
    if (!para) continue;
    const key = normKey(para).slice(0, 90);
    if (key.length > 20 && seen.has(key)) continue;
    // also skip a paragraph fully contained in one we already kept
    if (para.length < 400 && paras.some((k) => normKey(k).includes(normKey(para)) && normKey(para).length > 20)) continue;
    seen.add(key);
    paras.push(para);
  }
  text = paras.join('\n\n').trim();

  // trailing "| Author" credit
  text = text.replace(TRAILING_AUTHOR, '').trim();
  // a final orphan byline line
  const finalLines = text.split('\n');
  while (finalLines.length && (BYLINE_LINE.test(finalLines[finalLines.length - 1].trim()) || NOISE_LINE.test(finalLines[finalLines.length - 1].trim()))) {
    finalLines.pop();
  }
  return finalLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Jina Reader returns clean markdown with `Title:` / `URL Source:` headers then the body. */
function parseJina(md: string): { title: string; body: string } {
  const title = md.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || '';
  const body = md
    .replace(/^Title:.*$/m, '')
    .replace(/^URL Source:.*$/m, '')
    .replace(/^Published Time:.*$/m, '')
    .replace(/^Markdown Content:\s*/m, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, body };
}

export async function importUrlContent(rawUrl: string): Promise<ImportedContent> {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const host = hostOf(url);
  const base: ImportedContent = { ok: false, url, title: '', body: '', image: '', source: host, via: 'none' };

  const direct = await getText(url, 6000, BROWSER_HEADERS);
  if (direct) {
    const title = decodeEntities(
      meta(direct, 'og:title', 'twitter:title') || (direct.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? '').trim()
    );
    const ogDesc = meta(direct, 'og:description', 'twitter:description', 'description');
    const rawImage = meta(direct, 'og:image:secure_url', 'og:image', 'article:image', 'twitter:image');
    const image = rawImage ? upscaleImageUrl(rawImage) : rawImage;
    const body = cleanExtractedBody(
      [ogDesc, extractBody(direct)].filter(Boolean).join('\n\n').slice(0, 14000),
      title
    ).slice(0, 12000);
    if ((title && body.length > 60) || body.length > 200) {
      return { ...base, ok: true, title, body, image, source: host, via: 'direct' };
    }
    // keep partials (title/image) to merge with the Jina attempt
    base.title = title;
    base.image = image;
    if (body) base.body = body;
  }

  const viaJina = await getText(
    `https://r.jina.ai/${url}`,
    9000,
    JINA_KEY ? { Authorization: `Bearer ${JINA_KEY}` } : {}
  );
  if (viaJina) {
    const { title, body } = parseJina(viaJina);
    const resolvedTitle = base.title || title;
    const cleaned = cleanExtractedBody(body, resolvedTitle);
    const merged = cleaned.length > base.body.length ? cleaned : base.body;
    if (merged.length > 60) {
      return {
        ...base,
        ok: true,
        title: resolvedTitle,
        body: merged.slice(0, 12000),
        source: host,
        via: 'jina',
      };
    }
  }

  return base.title || base.body ? { ...base, ok: true, via: base.body ? 'direct' : 'none' } : base;
}
