/**
 * Best-effort importer for a pasted URL (LinkedIn post, article, blog, …). Server-side only —
 * used by /api/agent-generate · action:"import-url". Extracts headline, body text, a source
 * attribution and the lead image, so the dashboard's Content Repurposer can seed the AI synthesis.
 *
 * Strategy — a three-link fallback chain, each link only running when the previous one came back
 * too thin (< MIN_BODY_CHARS):
 *   1. DIRECT + STRUCTURED — browser-UA fetch, then the DOM-scoped zero-noise extractor in
 *      articleExtract.ts (ads / nav / share bars / related rails / comments removed before any text
 *      is read). This is the path that actually works on Israeli news portals.
 *   2. JINA READER — `r.jina.ai`, for origins that WAF-block datacenter IPs (LinkedIn among them);
 *      for those we usually still recover title + image + whatever the login wall exposes.
 *   3. LOOSE DIRECT — the original `<article>` / `<p>`-union scrape of the already-fetched HTML, as
 *      a last resort for markup the structured pass does not recognise at all.
 * Whichever link produces the most text wins, so a partial result is never preferred to a full one.
 * Never throws.
 */

import { upscaleImageUrl } from './newsFeed.js';
import { extractArticleFromHtml, extractLeadImage } from './articleExtract.js';

/**
 * Below this, a body is treated as a metadata shell (an OG description and nothing else) rather
 * than an article, and the next link in the fallback chain runs. 200 is the threshold the brief
 * calls for; in practice a real article clears it several times over.
 */
const MIN_BODY_CHARS = 200;

/** Below this a body is "usable but suspiciously thin" — worth spending one more fetch to beat. */
const GOOD_BODY_CHARS = 700;

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
  /** which extraction pass won, for diagnosing a thin import without re-running it by hand */
  strategy?: 'json-ld' | 'dom' | 'jina' | 'loose' | 'none';
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
    if (NOISE_LINE.test(line) || BYLINE_LINE.test(line) || PROMOTED_LINE.test(line)) continue;
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

/**
 * A line explicitly labelled as paid placement. Conservative enough to run on every extraction
 * path: these markers are how Israeli publishers are legally required to mark commercial content,
 * so they do not appear inside editorial prose.
 */
const PROMOTED_LINE = /(?:תוכן\s+מקודם|תוכן\s+שיווקי|בשיתוף\s+מסחרי|ממומן|בחסות\s|\bSponsored\b|\bPromoted\b|\bAdvertorial\b)/i;

/**
 * Content-recommendation rails (Taboola / Outbrain) that Jina Reader inlines as if they were prose.
 * They are not `<p>` text on the page, so the structured pass never sees them — but Jina flattens
 * the whole widget, and each entry ends in the same telltale "Sponsor | ממומן Learn More / Undo"
 * shape. Aggressive by design, and applied to Jina output only.
 */
const SPONSORED_RAIL_LINE = new RegExp(
  `${PROMOTED_LINE.source}|\\bLearn More\\b|^\\s*Undo\\s*$|^\\s*הכי נקראות|Read More about`,
  'i'
);

/** Jina Reader returns clean markdown with `Title:` / `URL Source:` headers then the body. */
function parseJina(md: string): { title: string; body: string } {
  const title = md.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || '';
  const body = md
    .split('\n')
    .filter((line) => !SPONSORED_RAIL_LINE.test(line))
    .join('\n')
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

/** One candidate body produced by a link in the fallback chain. */
interface Candidate {
  body: string;
  via: ImportedContent['via'];
  strategy: NonNullable<ImportedContent['strategy']>;
}

/**
 * How trustworthy each extraction pass is, independent of how much text it returned.
 *
 * Length alone is the wrong ranking. Jina Reader's markdown regularly runs 2-3× longer than the
 * structured read on the same page because it inlines the Taboola / Outbrain "ממומן … Learn More …
 * Undo" rail and the "הכי נקראות" sidebar as if they were prose — exactly the noise this pipeline
 * exists to remove. So a pass that scoped itself to the article container wins whenever it returned
 * a real article, and length only breaks ties within the same tier.
 */
const STRATEGY_RANK: Record<NonNullable<ImportedContent['strategy']>, number> = {
  'json-ld': 3,
  dom: 3,
  jina: 2,
  loose: 1,
  none: 0,
};

/**
 * Pick the winning candidate, in three tiers — longest wins inside a tier, and an earlier tier
 * always beats a later one:
 *   A. a container-scoped pass (json-ld / dom) that returned a full article — zero noise, trusted
 *      even when a noisier pass returned more text;
 *   B. any pass that returned at least an article's worth of text;
 *   C. whatever there is, so a stub still reaches the operator rather than nothing.
 */
function pickBest(candidates: Candidate[]): Candidate | undefined {
  const longest = (list: Candidate[]): Candidate | undefined =>
    list.reduce<Candidate | undefined>((a, c) => (!a || c.body.length > a.body.length ? c : a), undefined);

  return (
    longest(candidates.filter((c) => STRATEGY_RANK[c.strategy] >= 3 && c.body.length >= GOOD_BODY_CHARS)) ??
    longest(candidates.filter((c) => c.body.length >= MIN_BODY_CHARS)) ??
    longest(candidates)
  );
}

export async function importUrlContent(rawUrl: string): Promise<ImportedContent> {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const host = hostOf(url);
  const base: ImportedContent = { ok: false, url, title: '', body: '', image: '', source: host, via: 'none', strategy: 'none' };

  const candidates: Candidate[] = [];
  const best = (): Candidate | undefined => pickBest(candidates);

  // ── link 1: direct fetch + structured, zero-noise DOM extraction ───────────────────────────
  const direct = await getText(url, 8000, BROWSER_HEADERS);
  if (direct) {
    base.title = decodeEntities(
      meta(direct, 'og:title', 'twitter:title') || (direct.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? '').trim()
    );
    const rawImage =
      meta(direct, 'og:image:secure_url', 'og:image', 'article:image', 'twitter:image') || extractLeadImage(direct);
    base.image = rawImage ? upscaleImageUrl(rawImage) : rawImage;

    const structured = extractArticleFromHtml(direct);
    if (structured.text) {
      const cleaned = cleanExtractedBody(structured.text.slice(0, 20000), base.title).slice(0, 12000);
      if (cleaned) candidates.push({ body: cleaned, via: 'direct', strategy: structured.strategy });
    }

    // The OG description is the publisher's own lede. It is only worth keeping when the structured
    // pass found nothing — otherwise it just duplicates the article's first paragraph.
    if (!candidates.length) {
      const ogDesc = meta(direct, 'og:description', 'twitter:description', 'description');
      if (ogDesc) candidates.push({ body: cleanExtractedBody(ogDesc, base.title), via: 'direct', strategy: 'none' });
    }
  }

  // ── link 2: Jina Reader, when the direct pass came back thin or the origin blocked us ──────
  if ((best()?.body.length ?? 0) < GOOD_BODY_CHARS) {
    const viaJina = await getText(
      `https://r.jina.ai/${url}`,
      9000,
      JINA_KEY ? { Authorization: `Bearer ${JINA_KEY}` } : {}
    );
    if (viaJina) {
      const parsed = parseJina(viaJina);
      if (!base.title) base.title = parsed.title;
      const cleaned = cleanExtractedBody(parsed.body, base.title || parsed.title).slice(0, 12000);
      if (cleaned) candidates.push({ body: cleaned, via: 'jina', strategy: 'jina' });
    }
  }

  // ── link 3: loose scrape of the already-fetched HTML, for markup neither pass recognised ───
  if (direct && (best()?.body.length ?? 0) < MIN_BODY_CHARS) {
    const loose = cleanExtractedBody(extractBody(direct).slice(0, 14000), base.title).slice(0, 12000);
    if (loose) candidates.push({ body: loose, via: 'direct', strategy: 'loose' });
  }

  const winner = best();
  if (winner && ((base.title && winner.body.length > 60) || winner.body.length > MIN_BODY_CHARS)) {
    return { ...base, ok: true, body: winner.body, via: winner.via, strategy: winner.strategy };
  }
  if (winner?.body) return { ...base, ok: true, body: winner.body, via: winner.via, strategy: winner.strategy };
  return base.title ? { ...base, ok: true } : base;
}
