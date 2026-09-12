import * as cheerio from 'cheerio';
import { proxiedImage } from './threadsThreadFetcher.js';

/**
 * Instagram post / carousel / reel fetcher. Server-side only — used by /api/agent-generate ·
 * action:"parse-instagram", and consumed by `src/server/agents/instagramAgent.ts`.
 *
 * Returns the post's caption, its hashtags, and one entry per carousel frame carrying that frame's
 * image AND the text Instagram's own OCR read off it. A carousel is the interesting case: the
 * caption is the pitch, but the TEACHING lives on the slides, and without the per-frame text an
 * eight-slide guide collapses into one paragraph.
 *
 * Instagram has no open post API, and every path here can be defeated by a login wall or a rate
 * limit. So the contract matches the Threads fetcher's deliberately: this NEVER throws, and when it
 * recovers nothing it says so (`via:'none'`) rather than failing the request — the dashboard then
 * asks the operator to paste the caption manually, which is a first-class path, not an error state.
 *
 * What each client identity actually gets, verified against /p/DcjETTmjf_8/ on 2026-09-12:
 *   - a browser user agent  → 200 and a 623KB app shell with NO caption and NO media in it
 *   - a self-identified link-preview client → 200, the full OG tags AND the server-rendered
 *     `data-sjs` payload with the caption, all eight carousel frames and their alt text
 * So the preview identity is the one that does the work. No other client is impersonated — in
 * particular `facebookexternalhit`, which also works, is deliberately not used.
 *
 * Extraction order, best source first:
 *   1. `data-sjs` JSON, anchored on the requested post code. The payload ALSO holds the author's
 *      other recent posts (each with its own caption), so the code anchor is what keeps a
 *      neighbouring post from becoming the deck.
 *   2. `og:description` / `og:title`, which carry the caption behind a "N likes, M comments -
 *      handle on DATE:" preamble. Truncated by Instagram at ~500 chars, so it is a fallback only.
 *   3. Jina Reader's `Title:` line — its markdown body is a login wall, but the title carries the
 *      complete caption verbatim.
 */

/**
 * How the fetch identifies itself. Instagram answers a browser user agent with a shell that has no
 * post in it, and an honestly named link-preview client with the whole payload.
 */
const PREVIEW_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (compatible; MrDanielLinkPreview/1.0; +https://mrdaniel.co.il)',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9,he-IL;q=0.8',
};

const JINA_KEY = process.env.JINA_API_KEY?.trim();

/** One frame of the post: its image plus whatever text Instagram's OCR read off that image. */
export interface InstagramSlide {
  /** on-image text as Instagram's accessibility OCR read it — '' when it read none */
  text: string;
  /** same-origin-proxied image URL (see `proxiedImage`), so a canvas can draw it untainted */
  image: string;
}

export interface ImportedInstagramPost {
  ok: boolean;
  /** canonical post URL */
  url: string;
  /** the post shortcode */
  code: string;
  /** "@handle" when recoverable, '' otherwise */
  author: string;
  /** the caption, verbatim and complete */
  caption: string;
  /** the caption split into non-empty, de-noised lines — what the operator reviews */
  lines: string[];
  /** "#tag" entries lifted out of the caption, deduped and in order */
  hashtags: string[];
  /** every image in the post, proxied and in order */
  images: string[];
  /** one entry per carousel frame: image + OCR text */
  slides: InstagramSlide[];
  /** true when the post is a multi-image carousel rather than a single photo or a reel */
  isCarousel: boolean;
  /** the caption with hashtags stripped — what the synthesis agent actually consumes */
  text: string;
  /** which path produced the content — surfaced in the UI so the operator knows how complete it is */
  via: 'direct' | 'meta' | 'jina' | 'manual' | 'none';
  /** operator-facing hint when extraction came back thin or empty */
  note?: string;
}

// ─── URL normalization ──────────────────────────────────────────────────────────────────────

/** The first instagram.com link in the input. Share sheets copy text around the link ("Check this
 *  out https://…"), so the whole paste is searched, not just its start. */
const INSTAGRAM_LINK = /(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/[^\s<>"'`]+/i;

/**
 * A post path. Instagram serves the same post under several shapes, and all of them are accepted:
 *   /p/CODE            /reel/CODE      /reels/CODE     /tv/CODE
 *   /<username>/p/CODE                 /<username>/reel/CODE
 *   /share/p/CODE                      /share/reel/CODE
 * optionally followed by `/embed` or a trailing slash. The kind word is matched explicitly rather
 * than as a generic first segment, so `/share/p/CODE` cannot be read as a profile called "share".
 */
const POST_PATH =
  /^\/(?:share\/)?(?:([A-Za-z0-9._]+)\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)(?:\/embed(?:\/captioned)?)?\/?$/i;

/** The bare share form, `/share/TOKEN`, whose token is NOT a post code. Tested only after
 *  POST_PATH, so `/share/p/CODE` — which already names the code — never reaches it. */
const SHARE_PATH = /^\/share\/([A-Za-z0-9_-]+)\/?$/i;

export interface InstagramTarget {
  /** the canonical post URL — or the share link exactly as pasted, when it still needs resolving */
  url: string;
  /** "@handle" when the URL names one, '' otherwise */
  handle: string;
  /** the post code — or, when `short`, the SHARE TOKEN, which is not a post code */
  code: string;
  /** true while `code` is only a share token: the real code is known after `resolveShortTarget` */
  short: boolean;
}

function withScheme(raw: string): string {
  const url = (raw || '').trim();
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/**
 * The canonical post URL plus the handle and post code in it, or null when the input holds no
 * Instagram post link.
 *
 * Only the PATH is kept, so every share tracking parameter (`?utm_source=ig_web_copy_link`,
 * `?igsh=`, `?igshid=`, `?stkn=`, `?img_index=`) and any fragment is dropped by construction rather
 * than by a blocklist. The host is never taken from the input, so this cannot be used to fetch
 * another site.
 */
export function normalizeInstagramUrl(raw: string): InstagramTarget | null {
  const link = (raw || '').match(INSTAGRAM_LINK)?.[0];
  if (!link) return null;
  let path: string;
  try {
    path = new URL(withScheme(link)).pathname;
  } catch {
    return null;
  }
  // Some share targets encode the @ as %40, and trailing punctuation belongs to the sentence.
  const clean = path.replace(/%40/gi, '').replace(/[).,;:!?]+$/, '');

  const m = POST_PATH.exec(clean);
  if (m) {
    const owner = m[1] ?? '';
    const kind = (m[2] ?? 'p').toLowerCase();
    // `reels` is the plural route Instagram redirects to `reel`; both name the same media.
    const canonicalKind = kind === 'reels' ? 'reel' : kind;
    return {
      url: `https://www.instagram.com/${canonicalKind}/${m[3] ?? ''}/`,
      handle: owner ? `@${owner}` : '',
      code: m[3] ?? '',
      short: false,
    };
  }

  // `/share/<token>`: the token is NOT a post code and must be resolved before anything reads it.
  const share = SHARE_PATH.exec(clean);
  if (share) {
    return { url: `https://www.instagram.com/share/${share[1]}/`, handle: '', code: share[1], short: true };
  }
  return null;
}

export function isInstagramUrl(raw: string): boolean {
  return normalizeInstagramUrl(raw) !== null;
}

// ─── fetching ───────────────────────────────────────────────────────────────────────────────

/** A fetched page plus the URL it actually came from — which, with `redirect:'follow'`, is what a
 *  share link resolved to. */
async function getPage(
  url: string,
  timeoutMs: number,
  headers: Record<string, string>
): Promise<{ url: string; body: string } | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow', headers });
    if (!res.ok) return undefined;
    const body = await res.text();
    return { url: res.url || url, body: body.length > 2_000_000 ? body.slice(0, 2_000_000) : body };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

async function getText(url: string, timeoutMs: number, headers: Record<string, string>): Promise<string | undefined> {
  return (await getPage(url, timeoutMs, headers))?.body;
}

/** The page's own idea of its address: `og:url`, else the canonical link. Read through cheerio
 *  because Instagram HTML-escapes these tags. */
function canonicalUrl(html: string): string {
  const $ = cheerio.load(html);
  return (
    $('meta[property="og:url"], meta[name="og:url"]').first().attr('content')?.trim() ||
    $('link[rel="canonical"]').attr('href')?.trim() ||
    ''
  );
}

/**
 * The post a `/share/<token>` link stands for, plus the page that answered.
 *
 * A share token is not a post code, and every extraction path below keys on the post code, so
 * handed a token all of them miss and the import falls through to the manual-paste box. The
 * resolved page IS the post page, so it is handed back and reused rather than fetched twice.
 */
async function resolveShortTarget(short: InstagramTarget): Promise<{ target: InstagramTarget; html: string } | null> {
  const page = await getPage(short.url, 10000, PREVIEW_HEADERS);
  if (!page) return null;
  // The redirect chain first, then the page's own canonical tag for a client-side resolution.
  for (const candidate of [page.url, canonicalUrl(page.body)]) {
    const resolved = candidate ? normalizeInstagramUrl(candidate) : null;
    if (resolved && !resolved.short) return { target: resolved, html: page.body };
  }
  return null;
}

// ─── images ─────────────────────────────────────────────────────────────────────────────────

/**
 * How wide a CDN candidate is.
 *
 * Instagram's candidate objects carry a `url` and, unlike Threads', usually NO `width` — the size
 * is encoded in the `stp` parameter instead (`_p720x720_`, `_s640x640_`). A candidate with no size
 * marker is the uncropped original, so it takes the node's own `original_width`. Sorting on a
 * missing width (what a naive port of the Threads picker does) makes every candidate score 0 and
 * silently returns the first one, which on a carousel frame is not reliably the largest.
 */
function candidateWidth(url: string, original: number): number {
  const explicit = url.match(/[_/](?:p|s)(\d{2,4})x\d{2,4}/);
  if (explicit) return Number(explicit[1]);
  return original > 0 ? original : 2048;
}

/** The widest candidate that is still sane to download (≤1440px), else the narrowest available. */
function pickCandidate(node: unknown): string {
  const o = (node ?? null) as { image_versions2?: { candidates?: unknown }; original_width?: unknown } | null;
  const cands = o?.image_versions2?.candidates;
  if (!Array.isArray(cands)) return '';
  const original = Number(o?.original_width) || 0;
  const usable = cands
    .map((c) => c as { url?: unknown; width?: unknown })
    .filter((c): c is { url: string; width?: number } => typeof c.url === 'string' && c.url.length > 0)
    .map((c) => ({ url: c.url, width: Number(c.width) || candidateWidth(c.url, original) }))
    .sort((a, b) => b.width - a.width);
  if (!usable.length) return '';
  return (usable.find((c) => c.width <= 1440) ?? usable[usable.length - 1]).url;
}

// ─── on-image text ──────────────────────────────────────────────────────────────────────────

/**
 * The text Instagram's OCR read off one image, out of its accessibility caption.
 *
 * The raw field reads: `Photo by NAME on DATE. May be a graphic of poster and text that says
 * '…the actual on-image text…'.` Only the quoted run is content; the rest is a generated
 * description of the picture and must never reach a slide.
 *
 * Returns '' when the alt text carries no quoted run at all, which is what a photo with no text on
 * it looks like. NOT trusted as prose — see `dedupeOcr`: this is machine OCR of a designed slide,
 * so it arrives with duplicated and mangled tokens, and the agent is told to read it for structure
 * only.
 */
export function ocrFromAltText(raw: string): string {
  const alt = String(raw || '');
  // Both the straight and the curly apostrophe appear, depending on the locale of the caption.
  const quoted = alt.match(/text that says\s*['‘"“]([\s\S]*?)['’"”]\s*\.?\s*$/i);
  if (!quoted) return '';
  return dedupeOcr(quoted[1]);
}

/**
 * Collapse the duplication Instagram's OCR produces.
 *
 * A designed carousel slide has the same string rendered at two sizes, or with a shadow behind it,
 * and the OCR emits each pass: "GLM- GLM-5.2 5.2", "50.8k 50.8kstars stars", "TIMEOUT "API_". Left
 * in, that noise is what the model would faithfully carry into a Hebrew slide. Immediately-repeated
 * tokens are folded, and a token that is a prefix of the one right after it is dropped in its
 * favour — which is exactly the shape the double-render produces.
 */
function dedupeOcr(raw: string): string {
  const tokens = String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  const out: string[] = [];
  for (const token of tokens) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push(token);
      continue;
    }
    const a = prev.toLowerCase();
    const b = token.toLowerCase();
    if (a === b) continue; // "stars stars"
    if (a.length >= 3 && b.startsWith(a)) {
      out[out.length - 1] = token; // "GLM- GLM-5.2" → "GLM-5.2"
      continue;
    }
    if (b.length >= 3 && a.startsWith(b)) continue; // "GLM-5.2 GLM-" → "GLM-5.2"
    out.push(token);
  }
  return out
    .join(' ')
    // Carousel furniture the designer put on every frame — never content.
    .replace(/\bSWIPE\s*[→>\-–—]*\s*$/i, '')
    .replace(/^@[A-Za-z0-9._]{2,30}\s*/, '')
    .trim();
}

// ─── caption hygiene ────────────────────────────────────────────────────────────────────────

/** A whole line that is caption furniture, not content: a bare hashtag block, an engagement ask,
 *  a "." spacer line (the trick captions use to keep the preview short), or credit chrome. */
const NOISE_LINE =
  /^(?:[.•·─-╿\s]*|(?:#\S+\s*)+|(?:follow|follow me|follow for more|save this|share this|like and share|tag a friend|link in bio|credit|credits|source|via|dm me|turn on notifications)\b.*|(?:עקבו|שמרו|שתפו|תייגו|הקישור בביו|קרדיט|מקור)\b.*)$/i;

/** "#tag" entries in the caption, deduped and in order. Unicode-aware so Hebrew tags survive. */
export function extractHashtags(caption: string): string[] {
  const found = String(caption || '').match(/#[\p{L}\p{N}_]{2,60}/gu) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of found) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out.slice(0, 30);
}

/** The caption with its hashtags removed — what the agent adapts. Tags are metadata, and feeding
 *  a 30-tag block to the model as if it were prose produces a slide made of keywords. */
export function captionWithoutHashtags(caption: string): string {
  return String(caption || '')
    .replace(/#[\p{L}\p{N}_]{2,60}/gu, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The caption as reviewable lines: trimmed, de-noised, empties dropped. */
export function captionLines(caption: string): string[] {
  return String(caption || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !NOISE_LINE.test(l))
    .slice(0, 60);
}

/**
 * Text that is a wall, not a post: a login gate, a deleted-post page, or the reader proxy's own
 * error boilerplate. Jina answers 200 for a gated URL and returns its complaint as the body.
 */
const GATE_TEXT =
  /(?:requiring CAPTCHA|please make sure you are authorized|the link'?s not working|page is gone|sorry,? this page isn'?t available|page not found|content isn'?t available|log ?in to (?:instagram|see|continue)|you must log in|create an? instagram account|enable javascript|something went wrong|restricted content)/i;

// ─── source 1 · server-rendered JSON ────────────────────────────────────────────────────────

interface SjsMedia {
  code: string;
  user: string;
  caption: string;
  slides: InstagramSlide[];
  isCarousel: boolean;
}

/**
 * The requested post's own node out of the `data-sjs` payload.
 *
 * The payload also holds the author's OTHER recent posts, each with a full caption of its own — so
 * captions are never collected wholesale. Only the node whose `code` matches the requested one is
 * read, which means a neighbouring post can never become the deck without any path or key name
 * being hardcoded to exclude it.
 *
 * Instagram wraps the real media object in `if_not_gated_logged_out`, and the outer wrapper carries
 * the same `code` with no caption on it, so the node is required to hold BOTH the code and a
 * caption before it counts.
 */
function extractSjsMedia(html: string, code: string): SjsMedia | null {
  let best: SjsMedia | null = null;

  const visit = (node: unknown, depth: number): void => {
    if (depth > 50 || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const o = node as Record<string, unknown>;
    const caption = o.caption as { text?: unknown } | null;
    const captionText =
      caption && typeof caption === 'object' && typeof caption.text === 'string' ? caption.text : '';
    if (o.code === code && captionText) {
      const frames = Array.isArray(o.carousel_media) ? o.carousel_media : [];
      const slides: InstagramSlide[] = frames.length
        ? frames.map((frame) => ({
            text: ocrFromAltText(String((frame as Record<string, unknown>)?.accessibility_caption ?? '')),
            image: proxiedImage(pickCandidate(frame)),
          }))
        : [{ text: ocrFromAltText(String(o.accessibility_caption ?? '')), image: proxiedImage(pickCandidate(o)) }];
      const candidate: SjsMedia = {
        code,
        user: typeof (o.user as { username?: unknown } | null)?.username === 'string'
          ? String((o.user as { username: string }).username)
          : '',
        caption: captionText,
        slides: slides.filter((s) => s.text || s.image).slice(0, 20),
        isCarousel: frames.length > 1,
      };
      // The richest copy wins: the wrapper and the inner node can both match, and only one of
      // them carries the media array.
      if (!best || candidate.slides.length > best.slides.length || candidate.caption.length > best.caption.length) {
        best = candidate;
      }
    }
    for (const value of Object.values(o)) visit(value, depth + 1);
  };

  for (const m of html.matchAll(/<script type="application\/json"[^>]*data-sjs[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      visit(JSON.parse(m[1]), 0);
    } catch {
      // one unparseable blob does not invalidate the others
    }
  }
  return best;
}

// ─── source 2 · page metadata ───────────────────────────────────────────────────────────────

/**
 * The caption out of Instagram's OG description.
 *
 * The tag reads: `153 likes, 2 comments - fullstackparody on August 27, 2026: "…caption…"`. The
 * counters, the handle and the date are Instagram's own framing, not the author's words, and the
 * caption itself is wrapped in quotes. Instagram truncates this at roughly 500 characters, so it is
 * a fallback and never preferred over the payload.
 */
export function captionFromOgDescription(raw: string): string {
  let text = String(raw || '').trim();
  if (!text) return '';
  const colon = text.match(/^[^:]{0,160}?\b(?:likes?|comments?|לייקים|תגובות)\b[^:]{0,160}?:\s*/i);
  if (colon) text = text.slice(colon[0].length);
  // The caption arrives wrapped in straight or curly quotes; an unterminated one means Instagram
  // cut it, and the opening quote still has to come off.
  text = text.replace(/^["“”']/, '').replace(/["“”']\s*$/, '');
  return text.trim();
}

interface PageMeta {
  caption: string;
  author: string;
  /** the post's lead image from `og:image`, proxied — '' when absent or not Instagram media */
  image: string;
}

/**
 * The post from a page's metadata.
 *
 * Only trusted when `og:url` (or the canonical link) names the requested post: a gated or deleted
 * post comes back as the login page, whose description is Instagram's own pitch, and a profile
 * page's description is the bio. Neither may become a slide.
 */
function readPageMeta(html: string, code: string): PageMeta {
  const $ = cheerio.load(html);
  const content = (...keys: string[]): string => {
    for (const key of keys) {
      const v = $(`meta[property="${key}"], meta[name="${key}"]`).first().attr('content')?.trim();
      if (v) return v;
    }
    return '';
  };
  const pageUrl = content('og:url') || $('link[rel="canonical"]').attr('href')?.trim() || '';
  if (pageUrl && !pageUrl.includes(`/${code}`)) return { caption: '', author: '', image: '' };

  const handle =
    pageUrl.match(/instagram\.com\/([A-Za-z0-9._]+)\/(?:p|reel|reels|tv)\//i)?.[1] ??
    content('og:title', 'twitter:title').match(/\(@([A-Za-z0-9._]+)\)/)?.[1] ??
    '';
  let caption = captionFromOgDescription(content('og:description', 'description', 'twitter:description'));
  // `og:title` carries the same caption as `Name on Instagram: "…"`, sometimes less truncated.
  const fromTitle = content('og:title').match(/\bon Instagram:\s*["“]([\s\S]+)$/i)?.[1] ?? '';
  const titleCaption = fromTitle.replace(/["“”]\s*$/, '').trim();
  if (titleCaption.length > caption.length) caption = titleCaption;
  // The page-URL check above cannot run when the page carries neither tag, and Instagram's login
  // wall describes itself with its own marketing pitch — so the gate filter guards both cases.
  if (GATE_TEXT.test(caption)) caption = '';
  // og:image on a gated page is the Instagram logo, so it rides the same check as the caption.
  const image = caption ? proxiedImage(content('og:image', 'twitter:image')) : '';
  return { caption, author: handle ? `@${handle}` : '', image };
}

// ─── source 3 · reader title ────────────────────────────────────────────────────────────────

/**
 * The caption out of Jina Reader's `Title:` line.
 *
 * The reader's markdown BODY of an Instagram post is a login wall — verified 2026-09-12, it renders
 * the "Log In / Sign Up" chrome and nothing else. Its title, however, is `Name on Instagram:
 * "…complete caption…"`, untruncated and spanning multiple lines up to the `URL Source:` line. So
 * this reads the title only and ignores the body entirely.
 */
export function captionFromReader(md: string): string {
  const source = String(md || '');
  const start = source.match(/^Title:\s*/m);
  if (!start || start.index === undefined) return '';
  const rest = source.slice(start.index + start[0].length);
  const end = rest.search(/\n(?:URL Source|Published Time|Markdown Content):/);
  const title = (end >= 0 ? rest.slice(0, end) : rest).trim();
  const quoted = title.match(/\bon Instagram:\s*["“]([\s\S]+?)["”]?\s*$/i);
  const caption = (quoted?.[1] ?? '').trim();
  if (!caption || GATE_TEXT.test(caption)) return '';
  return caption;
}

// ─── assembly ───────────────────────────────────────────────────────────────────────────────

/**
 * The floor for "we actually got the post", in characters.
 *
 * Below this the extraction is reported as thin so the UI can say so up front and open the paste
 * box, rather than letting a truncated OG shell pass as success and only surface later as a
 * silent local-mode deck. Mirrors MIN_THREAD_CHARS in threadsThreadFetcher.ts.
 */
export const MIN_CAPTION_CHARS = 60;

const THIN_NOTE =
  'הצלחנו למשוך רק קטע קצר מהפוסט (כנראה חסום מאחורי התחברות) — הדביקו את הכיתוב המלא כדי להמשיך.';

const FAILED_NOTE = 'לא הצלחנו למשוך את התוכן מ-Instagram — הדביקו את כיתוב הפוסט ידנית.';

/** The shape every unsuccessful return here starts from. */
function emptyPost(url: string, code: string, author: string, note: string): ImportedInstagramPost {
  return {
    ok: false,
    url,
    code,
    author,
    caption: '',
    lines: [],
    hashtags: [],
    images: [],
    slides: [],
    isCarousel: false,
    text: '',
    via: 'none',
    note,
  };
}

function finish(
  base: ImportedInstagramPost,
  caption: string,
  slides: InstagramSlide[],
  via: ImportedInstagramPost['via'],
  author: string,
  isCarousel: boolean
): ImportedInstagramPost {
  const body = captionWithoutHashtags(caption);
  // Thin extractions are still returned, not discarded: the operator sees what little came back and
  // can paste the rest around it. They are just never reported as ok.
  const thin = body.trim().length > 0 && body.trim().length < MIN_CAPTION_CHARS;
  const clean = slides.filter((s) => s.text || s.image).slice(0, 20);
  return {
    ...base,
    ok: body.trim().length >= MIN_CAPTION_CHARS,
    author: author || base.author,
    caption,
    lines: captionLines(body),
    hashtags: extractHashtags(caption),
    images: clean.map((s) => s.image).filter(Boolean),
    slides: clean,
    isCarousel,
    text: body,
    via: body.trim().length ? via : 'none',
    note: !body.trim().length ? base.note : thin ? THIN_NOTE : undefined,
  };
}

export async function importInstagramContent(rawUrl: string): Promise<ImportedInstagramPost> {
  const normalized = normalizeInstagramUrl(rawUrl);
  if (!normalized) return emptyPost(withScheme(rawUrl), '', '', 'הקישור אינו קישור לפוסט באינסטגרם.');

  // A `/share/<token>` link carries a token, not a post code. Resolve it before anything reads the
  // page: every extraction path below matches on the post code, so a token makes all of them miss.
  const resolved = normalized.short ? await resolveShortTarget(normalized) : null;
  if (normalized.short && !resolved) {
    return emptyPost(
      normalized.url,
      '',
      '',
      'לא הצלחנו לפענח את הקישור המקוצר של Instagram — פתחו את הפוסט והעתיקו את הקישור המלא, או הדביקו את הכיתוב ידנית.'
    );
  }
  const { url, code, handle } = resolved?.target ?? normalized;
  const base = emptyPost(url, code, handle, FAILED_NOTE);

  const [previewHtml, readerMd] = await Promise.all([
    // Resolving a share link already fetched the post page as the preview client — that IS this
    // request, so it is reused instead of being made a second time.
    resolved ? Promise.resolve(resolved.html) : getText(url, 10000, PREVIEW_HEADERS),
    getText(`https://r.jina.ai/${url}`, 12000, JINA_KEY ? { Authorization: `Bearer ${JINA_KEY}` } : {}),
  ]);

  const meta = readPageMeta(previewHtml || '', code);
  const author = meta.author || base.author;

  // 1 · server-rendered JSON: the caption verbatim, every carousel frame, and their OCR text
  const sjs = previewHtml ? extractSjsMedia(previewHtml, code) : null;
  if (sjs && captionWithoutHashtags(sjs.caption).trim().length >= MIN_CAPTION_CHARS) {
    return finish(base, sjs.caption, sjs.slides, 'direct', sjs.user ? `@${sjs.user}` : author, sjs.isCarousel);
  }

  // 2 · the reader's title, which carries the complete caption when the payload was gated
  const readerCaption = readerMd ? captionFromReader(readerMd) : '';
  // 3 · the OG description, truncated at ~500 chars — the last of the automatic paths
  const metaCaption = meta.caption;
  const best = readerCaption.length >= metaCaption.length ? readerCaption : metaCaption;
  if (best.trim()) {
    // Whatever media the payload did yield still rides along; the lead image is the fallback.
    const slides = sjs?.slides.length ? sjs.slides : meta.image ? [{ text: '', image: meta.image }] : [];
    const via = best === readerCaption && readerCaption.length > metaCaption.length ? 'jina' : 'meta';
    const result = finish(base, best, slides, via, sjs?.user ? `@${sjs.user}` : author, Boolean(sjs?.isCarousel));
    return result.ok && !sjs
      ? { ...result, note: 'הכיתוב חולץ מתגיות המטא — ייתכן שהוא קטוע. השוו למקור לפני יצירת הדק.' }
      : result;
  }

  // 4 · the payload had the post but its caption was too thin to stand on its own. Returned
  //     anyway, marked thin, so the operator sees what came back and pastes the rest around it.
  if (sjs) return finish(base, sjs.caption, sjs.slides, 'direct', sjs.user ? `@${sjs.user}` : author, sjs.isCarousel);
  return base;
}

// ─── manual paste ───────────────────────────────────────────────────────────────────────────

/** The header line a copied Instagram caption opens with: "fullstackparody · 3h", "@handle". */
const PASTE_HEADER = /^\s*@?([A-Za-z0-9._]{2,30})\s*(?:[·•|]\s*\d+\s*[hdwmy]\b.*)?$/;

/**
 * The author handle in a pasted caption, or ''.
 *
 * Only the first couple of lines are searched: a copied post opens with the poster's handle, while
 * an `@mention` deeper in the caption is somebody the author was talking about — taking that one
 * would credit the wrong person.
 */
export function authorFromPaste(raw: string): string {
  const lines = (raw || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const header = lines[0]?.match(PASTE_HEADER)?.[1];
  if (header) return `@${header}`;
  const handle = lines.slice(0, 2).join('\n').match(/@([A-Za-z0-9._]{2,30})/)?.[1];
  return handle ? `@${handle}` : '';
}

/**
 * Local parse of a manually pasted caption — same shape as a successful fetch, minus the images (a
 * paste carries text only; the operator can still get visuals from the generated backdrops).
 */
export function parseInstagramRawText(raw: string, url = ''): ImportedInstagramPost {
  const author = authorFromPaste(raw);
  const lines = (raw || '').replace(/\r\n?/g, '\n').split('\n');
  // The "handle · 3h" header is app furniture, not the post — it would otherwise open the deck.
  const caption = (lines.length && PASTE_HEADER.test(lines[0].trim()) ? lines.slice(1) : lines).join('\n').trim();
  const body = captionWithoutHashtags(caption);
  const normalized = url ? normalizeInstagramUrl(url) : null;
  const chars = body.trim().length;
  return {
    ok: chars >= MIN_CAPTION_CHARS,
    url: normalized?.url ?? (url ? withScheme(url) : ''),
    code: normalized?.code ?? '',
    author,
    caption,
    lines: captionLines(body),
    hashtags: extractHashtags(caption),
    images: [],
    slides: [],
    isCarousel: false,
    text: body,
    via: chars ? 'manual' : 'none',
    note: !chars
      ? 'לא נמצא טקסט שמיש בהדבקה.'
      : chars < MIN_CAPTION_CHARS
        ? `הטקסט שהודבק קצר מדי (${chars} תווים) — נדרשים לפחות ${MIN_CAPTION_CHARS} תווים ליצירת קרוסלה.`
        : undefined,
  };
}
