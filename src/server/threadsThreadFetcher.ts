import * as cheerio from 'cheerio';

/**
 * Multi-post Threads thread fetcher. Server-side only — used by /api/agent-generate ·
 * action:"parse-thread", and consumed by `src/server/agents/threadsThreadAgent.ts`.
 *
 * Returns the main post AND every sub-reply the ORIGINAL AUTHOR wrote under it, in reading order,
 * each with any images that post carried. Other people's replies, quoted posts, the related-threads
 * rail and login chrome are dropped by structure, never by guessing at individual lines.
 *
 * Threads has no open post API, and every extraction path here can be defeated by a login wall or
 * a rate limit. So the contract is deliberately soft: this NEVER throws, and when it recovers
 * nothing it says so (`via:'none'`) rather than failing the request — the dashboard then asks the
 * operator to paste the thread text manually, which is a first-class path, not an error state.
 *
 * A `/share/<token>` link is RESOLVED to its canonical post first (`resolveShortTarget`). The token
 * in it is not a post code, and every path below matches on the post code, so skipping this step
 * made share links — the form the Threads app actually copies — fail without exception and drop the
 * operator into the manual-paste box.
 *
 * The page is fetched twice — as a browser and as a self-identified link-preview client, which
 * Threads serves far more fully — alongside Jina Reader, all in parallel. The best source wins:
 *   1. The server-rendered `data-sjs` JSON, which carries the thread verbatim, images included. The
 *      payload also holds replies, the related-threads rail and, behind a login wall, a feed of
 *      unrelated posts, so only the thread containing the requested post code is read.
 *   2. ld+json / `og:description`, the root post's text, clean: the public OG tags any chat app
 *      shows for a shared link. `og:url` must name the requested post; otherwise the page is a
 *      login wall or a profile, not the post.
 *   3. Jina Reader → markdown of the rendered page, split into one block per post (byline,
 *      permalink, body). Only the requested post and its author's own continuation are kept.
 * The metadata post anchors the choice: the reader's chain is used only when it opens with the
 * post the metadata describes.
 *
 * oEmbed was removed on 2026-09-11. threads.com/oembed now answers 302, and the tokenless
 * graph.threads.net oEmbed returns a blockquote with no post text in it.
 *
 * Renamed from `threadsImport.ts` on 2026-09-12 when the dedicated Threads agent landed; the
 * extraction paths below are unchanged and battle-tested, the images and the per-post shape are new.
 */

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,he-IL;q=0.8',
};

/**
 * How the metadata fetch identifies itself. Threads answers a browser user agent with a shell that
 * has no post in it, and an honestly named link-preview client with the post's OG tags. No other
 * client is impersonated.
 */
const PREVIEW_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (compatible; MrDanielLinkPreview/1.0; +https://mrdaniel.co.il)',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9,he-IL;q=0.8',
};

const JINA_KEY = process.env.JINA_API_KEY?.trim();

/** One post in the thread: its text plus any images it carried. */
export interface ThreadPost {
  text: string;
  /** Same-origin-proxied image URLs (see `proxiedImage`), so a canvas can draw them untainted. */
  images: string[];
}

export interface ImportedThread {
  ok: boolean;
  /** canonicalised post URL */
  url: string;
  /** "@handle" when recoverable, '' otherwise */
  author: string;
  /** the thread's posts, in reading order — one entry per post in the chain */
  posts: string[];
  /** the same chain with each post's images attached — what the visual agent lays out */
  items: ThreadPost[];
  /** every image in the thread, deduped and in order — for the operator's preview strip */
  images: string[];
  /** sub-replies by the same author under the main post: `posts.length - 1`, floored at 0 */
  replyCount: number;
  /** posts joined with blank lines; what the synthesis agent actually consumes */
  text: string;
  /** which path produced the content — surfaced in the UI so the operator knows how complete it is */
  via: 'direct' | 'meta' | 'jina' | 'manual' | 'none';
  /** operator-facing hint when extraction came back thin or empty */
  note?: string;
}

// ─── URL sanitization ───────────────────────────────────────────────────────────────────────

/** The first threads.net / threads.com link in the input. Share sheets copy text around the link
 *  ("Check this out https://…"), so the whole paste is searched, not just its start. */
const THREADS_LINK = /(?:https?:\/\/)?(?:www\.|m\.)?threads\.(?:net|com)\/[^\s<>"'`]+/i;

/** A post path: `/@user/post/CODE`, or the `/t/CODE` and `/share/CODE` short forms, optionally
 *  ending in `/media` or `/embed`. */
const POST_PATH =
  /^\/(?:@([A-Za-z0-9._]+)\/post\/([A-Za-z0-9_-]+)|(t|share|p)\/([A-Za-z0-9_-]+))(?:\/(?:media|embed))?\/?$/i;

export function isThreadsUrl(raw: string): boolean {
  return normalizeThreadsUrl(raw) !== null;
}

function withScheme(raw: string): string {
  const url = (raw || '').trim();
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/**
 * The canonical post URL plus the handle and post code in it, or null when the input holds no
 * Threads post link.
 *
 * Threads serves both threads.net and threads.com. Requests go to www.threads.com, the host the
 * current renderer answers on. Only the PATH is kept, so every share tracking parameter (`?xmt=`,
 * `?igshid=`, `?slof=`, `utm_*`) and any fragment is dropped by construction rather than by a
 * blocklist — they make the lookups miss. The host is never taken from the input, so this cannot
 * be used to fetch another site.
 */
export interface ThreadsTarget {
  /** the canonical post URL — or the short link exactly as pasted, when it still needs resolving */
  url: string;
  /** "@handle" when the URL names one, '' for a short link */
  handle: string;
  /** the post code — or, when `short`, the SHARE TOKEN, which is not a post code */
  code: string;
  /** true while `code` is only a share token: the real post code is known after `resolveShortTarget` */
  short: boolean;
}

export function normalizeThreadsUrl(raw: string): ThreadsTarget | null {
  const link = (raw || '').match(THREADS_LINK)?.[0];
  if (!link) return null;
  let path: string;
  try {
    path = new URL(withScheme(link)).pathname;
  } catch {
    return null;
  }
  // Some share targets encode the @ as %40, and trailing punctuation belongs to the sentence.
  const m = POST_PATH.exec(path.replace(/%40/gi, '@').replace(/[).,;:!?]+$/, ''));
  if (!m) return null;
  const handle = m[1] ?? '';
  if (handle) {
    return { url: `https://www.threads.com/@${handle}/post/${m[2] ?? ''}`, handle: `@${handle}`, code: m[2] ?? '', short: false };
  }
  // A short link keeps its OWN path. Rewriting `/share/<token>` to `/t/<token>` looks equivalent and
  // is not: only the `/share/` form redirects to the post. `/t/<token>` answers 200 with an empty app
  // shell — no OG tags, no payload — so the token never resolves and every path downstream misses.
  const kind = (m[3] ?? 't').toLowerCase();
  const token = m[4] ?? '';
  const url = kind === 'share' ? `https://www.threads.com/share/${token}/` : `https://www.threads.com/${kind}/${token}`;
  return { url, handle: '', code: token, short: true };
}

/** A fetched page plus the URL it actually came from — which, with `redirect:'follow'`, is what a
 *  short link resolved to. */
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
 *  because Threads HTML-escapes the handle in these tags (`&#064;iffikhans`), and the raw text
 *  would not match a Threads URL at all. */
function canonicalUrl(html: string): string {
  const $ = cheerio.load(html);
  return (
    $('meta[property="og:url"], meta[name="og:url"]').first().attr('content')?.trim() ||
    $('link[rel="canonical"]').attr('href')?.trim() ||
    ''
  );
}

/**
 * The post a `/share/<token>` (or `/t/`, `/p/`) link stands for, plus the page that answered.
 *
 * This step exists because a share token is NOT a post code, and every extraction path below keys
 * on the post code: `extractSjsThread` matches it against the payload, `readPageMeta` requires
 * `og:url` to name it, and `readerThread` finds the block with it. Handed a token, all three miss
 * and the import falls through to the manual-paste box — which is the bug this resolves.
 *
 * Only the link-preview identity is used. Verified against `/share/BAntyLO24K/` on 2026-09-12:
 * a browser user agent gets 200 and an empty app shell with NO redirect at all, so
 * `redirect:'follow'` alone resolves nothing; the self-identified preview client gets the 30x to
 * `/@iffikhans/post/DdKjD6yiBbt` and the full server-rendered payload with it. A HEAD request is
 * likewise answered 200 without a Location header, so it cannot be used either.
 *
 * The resolved page IS the post page, so it is handed back and reused rather than fetched twice.
 */
async function resolveShortTarget(short: ThreadsTarget): Promise<{ target: ThreadsTarget; html: string } | null> {
  const page = await getPage(short.url, 10000, PREVIEW_HEADERS);
  if (!page) return null;
  // The redirect chain first, then the page's own canonical tag for a client-side resolution.
  for (const candidate of [page.url, canonicalUrl(page.body)]) {
    const resolved = candidate ? normalizeThreadsUrl(candidate) : null;
    if (resolved && !resolved.short) return { target: resolved, html: page.body };
  }
  return null;
}

// ─── images ─────────────────────────────────────────────────────────────────────────────────

/** Hosts Threads actually serves post media from. An image URL from anywhere else in the payload
 *  is not post media, and is never handed to the relay. */
const MEDIA_HOST = /(?:^|\.)(?:cdninstagram\.com|fbcdn\.net)$/i;

/**
 * A Threads CDN image, rewritten to travel through the site's own relay.
 *
 * Instagram's CDN does not reliably send `Access-Control-Allow-Origin`, and the dashboard draws
 * these onto a `<canvas>` it then exports as PNG — a tainted canvas throws on `toDataURL`. The
 * existing `/api/img-proxy` re-serves the bytes CORS-open, so this returns the proxied form and
 * the renderer never has to know where the image came from. Returns '' for anything that is not a
 * Threads media URL.
 */
export function proxiedImage(raw: string): string {
  const url = String(raw || '').trim();
  if (!url) return '';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return '';
  }
  if (parsed.protocol !== 'https:' || !MEDIA_HOST.test(parsed.hostname)) return '';
  return `https://mrdaniel.co.il/api/img-proxy?url=${encodeURIComponent(parsed.toString())}`;
}

/** The widest candidate that is still sane to download (≤1440px), else the widest available. */
function pickCandidate(node: unknown): string {
  const cands = (node as { image_versions2?: { candidates?: unknown } } | null)?.image_versions2?.candidates;
  if (!Array.isArray(cands)) return '';
  const usable = cands
    .map((c) => c as { url?: unknown; width?: unknown })
    .filter((c): c is { url: string; width?: number } => typeof c.url === 'string' && c.url.length > 0)
    .sort((a, b) => (Number(b.width) || 0) - (Number(a.width) || 0));
  if (!usable.length) return '';
  return (usable.find((c) => (Number(c.width) || 0) <= 1440) ?? usable[0]).url;
}

/** Every image on one post object: its own, plus each frame of a carousel post. */
function sjsImages(node: unknown): string[] {
  const out: string[] = [];
  const own = pickCandidate(node);
  if (own) out.push(own);
  const carousel = (node as { carousel_media?: unknown } | null)?.carousel_media;
  if (Array.isArray(carousel)) {
    for (const frame of carousel) {
      const url = pickCandidate(frame);
      if (url) out.push(url);
    }
  }
  return [...new Set(out.map(proxiedImage).filter(Boolean))].slice(0, 4);
}

// ─── text hygiene ───────────────────────────────────────────────────────────────────────────

/**
 * A whole line that is Threads furniture, not post text: engagement counters (bare numbers,
 * including "2.9K", as the reader renders the like/reply/repost row), a "N views" heading, profile
 * stats, a post date, an @handle byline, badges, and login and footer chrome.
 */
const NOISE_LINE =
  /^(?:\d[\d,.]*\s*[km]?\s*(?:likes?|replies|reposts?|views?|comments?|followers?|threads|לייקים|תגובות|צפיות|עוקבים)\b.*|(?:log in|sign up|continue with instagram|התחבר(?:ות)?|הרשמה)\b.*|(?:translate|see translation|תרגם|הצג תרגום)\b.*|(?:more|see more|show more|עוד|הצג עוד)\s*$|(?:follow|following|עקוב|עוקב)\s*$|threads\s*$|instagram\s*$|(?:©|copyright)\s*\d{4}.*|meta platforms.*|(?:privacy|terms|cookies?)\s*(?:policy|notice)?\s*$|\d+\s*[hdwmy]\s*(?:ago)?\s*$|(?:just now|לפני רגע)\s*$|\d[\d,.]*\s*[km]?\s*$|(?:thread\s*)?\d[\d,.]*\s*[km]?\s*views?\s*$|\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\s*$|@[A-Za-z0-9._]{2,30}\s*$|learn more\s*$|sorry,? we'?re having trouble.*|report a problem\s*$|threads terms\s*$|[·•]?\s*author\s*$|edited\s*$|pinned\s*$|liked by (?:the )?original author\s*$|view activity\s*$|say more with threads.*|join threads to .*)$/i;

/**
 * Where the page's own content ends. After the thread, the reader proxy appends the "Related
 * threads" rail (other people's posts), a "Log in to see more replies" wall and the footer.
 * Everything from the first of them is cut. Generic words only count as a marker when they fill a
 * whole line, so a post that starts with "Discover…" is not mistaken for one.
 */
const TAIL_MARKER =
  /\n\s*(?:(?:related threads|more (?:from|like this)|you might like|suggested (?:threads|for you)|discover|log in to see more replies\.?)\s*(?:\n|$)|\[log in\]\(|log in or sign up for threads|say more with threads)/i;

function cutAtRelated(text: string): string {
  const m = text.match(TAIL_MARKER);
  return m && m.index !== undefined ? text.slice(0, m.index).trim() : text;
}

/**
 * Text that is a wall, not a post: a login gate, a CAPTCHA challenge, a deleted-post page, or the
 * reader proxy's own error boilerplate.
 *
 * Jina Reader answers 200 for a dead or gated Threads URL and returns its complaint as the page
 * body ("Warning: This page maybe requiring CAPTCHA…", "The link's not working or the page is
 * gone"). Paths that cannot prove by structure that they hold the post are checked against this.
 */
const GATE_TEXT =
  /(?:requiring CAPTCHA|please make sure you are authorized|not all who wander are lost|the link'?s not working|page is gone|sorry,? this page isn'?t available|page not found|content isn'?t available|log ?in to (?:threads|see|continue)|you must log in|join threads|create a threads account|enable javascript|something went wrong)/i;

function isGateText(text: string): boolean {
  return GATE_TEXT.test(text);
}

/** Drop gate/error boilerplate from a candidate post list. */
function dropGatePosts(posts: ThreadPost[]): ThreadPost[] {
  return posts.filter((p) => !isGateText(p.text));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Trim, cap and drop empties across a candidate chain, preserving each post's images. */
function tidyChain(items: ThreadPost[]): ThreadPost[] {
  return items
    .map((p) => ({ text: p.text.trim().slice(0, 3000), images: p.images.slice(0, 4) }))
    .filter((p) => p.text.length > 0)
    .slice(0, 30);
}

// ─── source 1 · server-rendered JSON ────────────────────────────────────────────────────────

interface SjsPost {
  code: string;
  user: string;
  text: string;
  images: string[];
}

/** A post object from the payload: anything carrying a post code and a caption. */
function sjsPost(node: unknown): SjsPost | null {
  if (!node || typeof node !== 'object') return null;
  const o = node as { code?: unknown; caption?: { text?: unknown } | null; user?: { username?: unknown } | null };
  if (typeof o.code !== 'string' || typeof o.caption?.text !== 'string') return null;
  return {
    code: o.code,
    user: typeof o.user?.username === 'string' ? o.user.username : '',
    text: o.caption.text,
    images: sjsImages(node),
  };
}

/** The posts of one thread container, in reading order, or null when the node is not one. Both
 *  shapes the payload uses are accepted: the object carries `thread_items` itself, or it is a
 *  GraphQL edge wrapping one in `node`. */
function threadItems(node: unknown): SjsPost[] | null {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
  const holder = node as { thread_items?: unknown; node?: { thread_items?: unknown } | null };
  const raw = Array.isArray(holder.thread_items)
    ? holder.thread_items
    : Array.isArray(holder.node?.thread_items)
      ? holder.node.thread_items
      : null;
  if (!raw) return null;
  return raw
    .map((item) => sjsPost((item as { post?: unknown } | null)?.post))
    .filter((p): p is SjsPost => p !== null);
}

/**
 * The author's own chain out of one list of thread containers: the container holding the requested
 * post, then every following container that is still the same author's.
 *
 * Threads does not keep a self-reply chain inside the root post's `thread_items`. The root sits in
 * its own container and the "1/, 2/, 3/" replies in the NEXT one, so reading a single container —
 * what this did before 2026-09-12 — returns the root post alone and reports `replyCount:0` for a
 * nine-post thread. Walking forward past it is what recovers the rest; the first container by
 * anyone else is a reply from a stranger and ends the thread.
 */
function chainFrom(groups: SjsPost[][], code: string): SjsPost[] {
  const at = groups.findIndex((g) => g.some((p) => p.code === code));
  if (at < 0) return [];
  const author = (groups[at].find((p) => p.code === code)?.user ?? '').toLowerCase();
  if (!author) return groups[at];
  const out: SjsPost[] = [];
  const seen = new Set<string>();
  for (let i = at; i < groups.length; i++) {
    const own = groups[i].filter((p) => p.user.toLowerCase() === author);
    if (i > at && own.length === 0) break;
    for (const post of own) {
      if (seen.has(post.code)) continue;
      seen.add(post.code);
      out.push(post);
    }
  }
  return out;
}

/**
 * The requested post and its author's own continuation, from the server-rendered JSON.
 *
 * Threads inlines its GraphQL payload in `<script type="application/json" data-sjs>` blobs. Besides
 * the requested thread, that payload holds the post it quotes, every reply, a `relatedPosts` rail —
 * which on this page included two NEAR-DUPLICATE earlier posts by the same author — and, behind a
 * login wall, a feed of unrelated posts, all with captions. So captions are never collected
 * wholesale, and "everything by this author" is never the rule either.
 *
 * Instead the ARRAY of thread containers that holds the requested post code is the page's own
 * thread list, and only that array is walked. The related-posts rail does not contain the requested
 * code, so it can never be chosen — no path or key name is hardcoded to exclude it. When more than
 * one array qualifies, the one yielding the longest chain wins. If the payload has the post but no
 * thread list around it, that one post is returned; if it lacks the code, nothing is.
 */
function extractSjsThread(html: string, code: string): { posts: ThreadPost[]; author: string } | null {
  const candidates: SjsPost[][][] = [];
  let single: SjsPost | null = null;
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      const groups = node.map(threadItems);
      if (groups.some((g) => g?.some((p) => p.code === code))) candidates.push(groups.map((g) => g ?? []));
      for (const item of node) visit(item);
      return;
    }
    const o = node as Record<string, unknown>;
    const post = sjsPost(o);
    if (post?.code === code && !single) single = post;
    for (const value of Object.values(o)) visit(value);
  };
  for (const m of html.matchAll(/<script type="application\/json"[^>]*data-sjs[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      visit(JSON.parse(m[1]));
    } catch {
      // one unparseable blob does not invalidate the others
    }
  }
  const best = candidates
    .map((groups) => chainFrom(groups, code))
    .sort((a, b) => b.length - a.length)[0];
  const chain = best?.length ? best : single ? [single] : [];
  const posts = tidyChain(chain.map((p) => ({ text: p.text, images: p.images })));
  return posts.length ? { posts, author: chain[0].user ? `@${chain[0].user}` : '' } : null;
}

// ─── source 2 · page metadata ───────────────────────────────────────────────────────────────

const POSTING_TYPE = /^(?:SocialMediaPosting|DiscussionForumPosting|BlogPosting|Article)$/;

/** The `articleBody` / `text` of the first posting in an ld+json block, or ''. */
function ldPostingText(json: string): string {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return '';
  }
  const queue: unknown[] = [data];
  while (queue.length) {
    const node = queue.shift();
    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }
    if (!node || typeof node !== 'object') continue;
    const o = node as Record<string, unknown>;
    const types = ([] as unknown[]).concat(o['@type'] ?? []).map(String);
    const body = [o.articleBody, o.text].find((v): v is string => typeof v === 'string' && v.trim().length > 0);
    if (body && types.some((t) => POSTING_TYPE.test(t))) return body.trim();
    if (o['@graph']) queue.push(o['@graph']);
    if (o.mainEntity) queue.push(o.mainEntity);
  }
  return '';
}

interface PageMeta {
  /** the root post's text; '' when the page is not the requested post */
  text: string;
  author: string;
  /** the post's lead image from `og:image`, proxied — '' when absent or not Threads media */
  image: string;
}

/**
 * The root post from a page's metadata: an ld+json posting first, then `og:description`.
 *
 * It is only trusted when `og:url` (or the canonical link) names the requested post. A gated or
 * deleted post comes back as the login page, whose description is Threads' own pitch, and a
 * profile page's description is the bio. Neither may become a slide.
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
  if (pageUrl && !pageUrl.includes(`/post/${code}`)) return { text: '', author: '', image: '' };

  const handle =
    pageUrl.match(/threads\.(?:net|com)\/@([A-Za-z0-9._]+)\/post\//i)?.[1] ??
    content('og:title', 'twitter:title').match(/\(@([A-Za-z0-9._]+)\)/)?.[1] ??
    '';
  let text = '';
  $('script[type="application/ld+json"]').each((_i, el) => {
    if (!text) text = ldPostingText($(el).text());
  });
  if (!text) text = content('og:description', 'twitter:description', 'description');
  // With no page URL to check against, the gate filter is the only guard left.
  if (!pageUrl && isGateText(text)) text = '';
  // og:image on a gated page is the Threads logo, so it rides the same page-URL check as the text.
  const image = text ? proxiedImage(content('og:image', 'twitter:image')) : '';
  return { text, author: handle ? `@${handle}` : '', image };
}

// ─── source 3 · reader markdown ─────────────────────────────────────────────────────────────

/** A post's permalink line as the reader renders it: the post's timestamp, linked to the post. */
const PERMALINK_LINE =
  /^\[([^\]\n]{1,40})\]\(https?:\/\/(?:www\.)?threads\.(?:com|net)\/@([A-Za-z0-9._]+)\/post\/([A-Za-z0-9_-]+)\/?\)$/;

/** What that timestamp looks like ("07/09/26", "3h", "Sep 7", "2026-09-07"). A quoted post's text
 *  is also linked to its permalink, and this is what tells the two apart. */
const TIMESTAMP_TEXT =
  /^(?:\d{1,2}[/.]\d{1,2}[/.]\d{2,4}|\d+\s*[smhdwy]|[a-z]{3,9}\.?\s+\d{1,2}(?:,?\s+\d{4})?|\d{4}-\d{2}-\d{2}|just now|yesterday)$/i;

/** An image the reader rendered inside a post block: `![alt](https://…cdninstagram.com/…)`. */
const MD_IMAGE = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;

interface ReaderBlock {
  handle: string;
  code: string;
  lines: string[];
}

/**
 * Reader markdown split into posts. Each post starts at its permalink line and runs until the next
 * post's byline, which is the avatar and handle links just above that post's permalink.
 */
function readerBlocks(md: string): ReaderBlock[] {
  const lines = cutAtRelated(md).split('\n');
  const starts: { at: number; handle: string; code: string }[] = [];
  lines.forEach((line, at) => {
    const m = PERMALINK_LINE.exec(line.trim());
    if (m && TIMESTAMP_TEXT.test(m[1].trim())) starts.push({ at, handle: m[2], code: m[3] });
  });
  return starts.map((s, n) => {
    const next = starts[n + 1];
    let end = next ? next.at : lines.length;
    if (next) {
      const byline = new RegExp(`\\]\\(https?://(?:www\\.)?threads\\.(?:com|net)/@${escapeRe(next.handle)}/?\\)$`, 'i');
      while (end > s.at + 1 && (!lines[end - 1].trim() || byline.test(lines[end - 1].trim()))) end--;
    }
    return { handle: s.handle, code: s.code, lines: lines.slice(s.at + 1, end) };
  });
}

/** A quoted post embedded in the post above it. Its whole text is a link to its own permalink. */
function isQuoteEmbed(b: ReaderBlock): boolean {
  const first = b.lines.find((l) => l.trim())?.trim() ?? '';
  const permalink = `\\]\\(https?://(?:www\\.)?threads\\.(?:com|net)/@${escapeRe(b.handle)}/post/${escapeRe(b.code)}`;
  return new RegExp(`^\\[.+${permalink}`, 'i').test(first);
}

/** Post media the reader inlined in this block. Avatars are `[](…)` empty links, not `![](…)`
 *  images, so they do not reach here; anything off the media hosts is dropped by `proxiedImage`. */
function blockImages(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    for (const m of line.matchAll(MD_IMAGE)) {
      const url = proxiedImage(m[1]);
      if (url) out.push(url);
    }
  }
  return [...new Set(out)].slice(0, 4);
}

/**
 * A reader block as plain post text. Images, media and profile links, topic-tag chips,
 * link-preview cards and engagement counters are removed; ordinary links keep their text.
 */
function blockText(lines: string[]): string {
  const kept: string[] = [];
  for (const raw of lines) {
    let line = raw.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[\s*\]\([^)]*\)/g, '').trim();
    // A line that is nothing but one external link is a link-preview card, not prose.
    if (/^\[[^\]]*\]\((?!https?:\/\/(?:www\.)?threads\.)[^)]*\)$/.test(line)) continue;
    line = line
      .replace(/\[[^\]]*\]\(https?:\/\/(?:www\.)?threads\.(?:com|net)\/search[^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^#{1,6}\s+/, '')
      .replace(/^[*•‣▪-]\s+/, '')
      .trim();
    if (line && !NOISE_LINE.test(line)) kept.push(line);
  }
  return kept.join('\n').trim();
}

/**
 * The requested post and its author's own continuation, from the reader's blocks. Null when the
 * requested post is not among them: behind a login wall the reader renders a feed of strangers'
 * posts, and those must never become the deck.
 */
function readerThread(blocks: ReaderBlock[], code: string): { posts: ThreadPost[]; author: string } | null {
  const at = blocks.findIndex((b) => b.code === code);
  if (at < 0) return null;
  const author = blocks[at].handle.toLowerCase();
  const own = (b: ReaderBlock) => b.handle.toLowerCase() === author;
  // A mid-thread permalink renders the earlier posts of the same chain above it.
  let first = at;
  while (first > 0 && own(blocks[first - 1])) first--;
  const chain: ReaderBlock[] = [];
  for (const b of blocks.slice(first)) {
    if (own(b)) chain.push(b);
    else if (!isQuoteEmbed(b)) break; // the first reply from someone else ends the thread
  }
  const posts = tidyChain(chain.map((b) => ({ text: blockText(b.lines), images: blockImages(b.lines) })));
  return posts.length ? { posts, author: `@${blocks[at].handle}` } : null;
}

/**
 * The reader page as flat text: the fallback for when no post blocks are found at all, meaning the
 * reader's format changed. It keeps the old line-level filters. The author's own handle is passed
 * in so their byline can be removed by identity, not by a heuristic that would also eat a real
 * one-word line.
 */
function parseJina(md: string, handle = ''): string {
  let text = md
    .replace(/^Title:.*$/m, '')
    .replace(/^URL Source:.*$/m, '')
    .replace(/^Published Time:.*$/m, '')
    .replace(/^Markdown Content:\s*/m, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\]\([^)]*\)/g, '') // empty links — avatars, media thumbnails
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    // list markers only — the item's text is kept, since a thread post legitimately uses bullets
    .replace(/^\s*[*•‣▪-]\s+/gm, '')
    .replace(/^\s*https?:\/\/\S+\s*$/gm, '');
  const bare = handle.replace(/^@/, '');
  if (bare) text = text.replace(new RegExp(`^\\s*@?${escapeRe(bare)}\\s*$`, 'gim'), '');
  return cutAtRelated(text.replace(/\n{3,}/g, '\n\n').trim());
}

/** A reader page for a post, not a login wall: its title is "Name (@handle) on Threads". */
function isPostPageTitle(md: string): boolean {
  const title = md.match(/^Title:(.*)$/m)?.[1] ?? '';
  return /\bon Threads\b/i.test(title) && !/log ?in/i.test(title);
}

// ─── assembly ───────────────────────────────────────────────────────────────────────────────

/**
 * Split a flat text blob into the thread's individual posts.
 *
 * Handles the shapes an extracted or pasted thread actually arrives in: explicit part markers the
 * author typed ("1/", "2/7", "🧵 3.", "• "), or plain paragraph breaks. Anything under ~15 chars is
 * folded back into the previous part so a stray line ("👇") never becomes its own slide source.
 */
export function splitThreadPosts(raw: string): string[] {
  const text = (raw || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return [];

  const lines = text.split('\n');
  if (lines.filter((l) => PART_MARKER.test(l)).length >= 2) {
    const parts: string[] = [];
    for (const line of lines) {
      if (PART_MARKER.test(line) || parts.length === 0) parts.push(line.replace(PART_MARKER, '').trim());
      else parts[parts.length - 1] += `\n${line}`;
    }
    return tidyParts(parts);
  }
  return tidyParts(text.split(/\n{2,}/));
}

/**
 * A line that opens a new part of a thread: "1/", "2/7", "🧵 3.", "4 —", or a bulleted item.
 *
 * The bullet forms are here because authors number a thread two ways — with ordinals, or as a
 * bulleted list under one post — and only the ordinal form was recognised before, so a bulleted
 * thread collapsed into a single slide. A bullet only counts when at least two lines carry one, so
 * a post that happens to contain one bulleted aside is still one post.
 */
const PART_MARKER = /^\s*(?:🧵\s*)?(?:\(?\d{1,2}\s*(?:\/\s*\d{1,2})?\s*[.):\/]|\d{1,2}\s*—|[-*•‣▪▶→]\s)\s*/;

function tidyParts(parts: string[]): string[] {
  const out: string[] = [];
  for (const part of parts) {
    const clean = part
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !NOISE_LINE.test(l))
      .join('\n')
      .trim();
    if (!clean) continue;
    if (clean.length < 15 && out.length) out[out.length - 1] += `\n${clean}`;
    else out.push(clean);
  }
  return out.map((p) => p.slice(0, 3000)).slice(0, 30);
}

/** Whether two copies of a post open the same way. Only letters and digits are compared, because
 *  the reader and the metadata disagree on quotes, spacing and emoji. */
function sameOpening(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const key = norm(a).slice(0, 40);
  return key.length < 10 || norm(b).includes(key);
}

/**
 * The floor for "we actually got the post", in characters.
 *
 * Only the Jina path used to enforce a length at all, so the direct and oEmbed paths could answer
 * ok:true carrying a metadata shell - a truncated OG caption, an oEmbed blockquote that rendered to
 * little more than the author handle. That reads as success: the UI shows no warning and leaves the
 * paste box closed, and the operator only finds out at synthesis time, when the deck silently comes
 * back as the local fallback. Below this, the extraction is reported as thin so the UI can say so
 * up front and open the paste box, which is the documented first-class path.
 */
export const MIN_THREAD_CHARS = 60;

function totalChars(posts: ThreadPost[]): number {
  return posts.reduce((n, p) => n + p.text.trim().length, 0);
}

const THIN_NOTE =
  'הצלחנו למשוך רק קטע קצר מהפוסט (כנראה חסום מאחורי התחברות) — הדביקו את טקסט השרשור המלא כדי להמשיך.';

function finish(
  base: ImportedThread,
  items: ThreadPost[],
  via: ImportedThread['via'],
  author: string
): ImportedThread {
  const chars = totalChars(items);
  // Thin extractions are still returned, not discarded: the operator sees what little came back and
  // can paste the rest around it. They are just never reported as ok.
  const thin = chars > 0 && chars < MIN_THREAD_CHARS;
  const posts = items.map((p) => p.text);
  return {
    ...base,
    ok: items.length > 0 && !thin,
    author: author || base.author,
    posts,
    items,
    images: [...new Set(items.flatMap((p) => p.images))].slice(0, 20),
    replyCount: Math.max(0, items.length - 1),
    text: posts.join('\n\n'),
    via: items.length ? via : 'none',
    note: !items.length ? base.note : thin ? THIN_NOTE : undefined,
  };
}

/** The shape every unsuccessful return here starts from. */
function emptyThread(url: string, author: string, note: string): ImportedThread {
  return { ok: false, url, author, posts: [], items: [], images: [], replyCount: 0, text: '', via: 'none', note };
}

const FAILED_NOTE = 'לא הצלחנו למשוך את התוכן מ-Threads — הדביקו את טקסט השרשור ידנית.';

export async function importThreadContent(rawUrl: string): Promise<ImportedThread> {
  const normalized = normalizeThreadsUrl(rawUrl);
  if (!normalized) return emptyThread(withScheme(rawUrl), '', 'הקישור אינו קישור לפוסט ב-Threads.');

  // A share link carries a token, not a post code. Resolve it before anything reads the page:
  // every extraction path below matches on the post code, so a token makes all of them miss.
  const resolved = normalized.short ? await resolveShortTarget(normalized) : null;
  if (normalized.short && !resolved) {
    return emptyThread(
      normalized.url,
      '',
      'לא הצלחנו לפענח את הקישור המקוצר של Threads — פתחו את הפוסט והעתיקו את הקישור המלא, או הדביקו את הטקסט ידנית.'
    );
  }
  const { url, code, handle } = resolved?.target ?? normalized;
  const base = emptyThread(url, handle, FAILED_NOTE);

  const [browserHtml, previewHtml, readerMd] = await Promise.all([
    getText(url, 8000, BROWSER_HEADERS),
    // Resolving a short link already fetched the post page as the preview client — that IS this
    // request, so it is reused instead of being made a second time.
    resolved ? Promise.resolve(resolved.html) : getText(url, 8000, PREVIEW_HEADERS),
    getText(`https://r.jina.ai/${url}`, 12000, JINA_KEY ? { Authorization: `Bearer ${JINA_KEY}` } : {}),
  ]);

  const meta = readPageMeta(previewHtml || browserHtml || '', code);
  const author = meta.author || base.author;

  // 1 · server-rendered JSON: the requested thread's posts, verbatim, images included
  for (const html of [previewHtml, browserHtml]) {
    const sjs = html ? extractSjsThread(html, code) : null;
    if (sjs) return finish(base, sjs.posts, 'direct', sjs.author || author);
  }

  // 2 · the reader's chain, used only when it opens with the post the metadata describes
  const metaPost = meta.text.trim();
  const blocks = readerMd ? readerBlocks(readerMd) : [];
  const chain = readerThread(blocks, code);
  if (chain && (!metaPost || sameOpening(metaPost, chain.posts[0].text))) {
    const posts = chain.posts.map((p) => ({ ...p }));
    // The metadata copy of the root post is the cleaner one. The reader's is kept only when the
    // metadata came back cut short. The reader's images for that post survive either way.
    if (metaPost && metaPost.length >= posts[0].text.length * 0.9) posts[0].text = metaPost;
    if (meta.image && !posts[0].images.includes(meta.image)) posts[0].images.unshift(meta.image);
    const via = posts.length === 1 && metaPost ? 'meta' : 'jina';
    return finish(base, posts, via, chain.author || author);
  }

  // 3 · the metadata post alone. Without a usable page there is no telling whether the author
  //     continued the thread, so the operator is told only the first post came through.
  if (metaPost) {
    const result = finish(base, [{ text: metaPost, images: meta.image ? [meta.image] : [] }], 'meta', author);
    return result.ok
      ? { ...result, note: 'חולץ רק הפוסט הראשון (מתגיות המטא של הפוסט) — אם זה שרשור, הדביקו את ההמשך ידנית.' }
      : result;
  }

  // 4 · last resort: the reader page as flat text. Only when no post blocks were found at all (a
  //     reader format change) and the page is recognisably the post, never a login-wall feed.
  if (readerMd && !blocks.length && isPostPageTitle(readerMd)) {
    const posts = dropGatePosts(
      splitThreadPosts(parseJina(readerMd, normalized.handle || author)).map((text) => ({ text, images: [] }))
    );
    // The reader's own boilerplate can survive the gate filter as a handful of characters, so
    // this path keeps a stricter bar than the shared floor before it wins the result.
    if (posts.length && totalChars(posts) > 120) {
      const result = finish(base, posts, 'jina', author);
      return posts.length > 12
        ? { ...result, note: 'חולצו הרבה פוסטים — ייתכן שנכנסו גם פוסטים סמוכים. בדקו את הרשימה או הדביקו ידנית.' }
        : result;
    }
  }
  return base;
}

/** The header line a copied Threads post opens with: "username · 3h" (handle, then an age). */
const PASTE_HEADER = /^\s*@?([A-Za-z0-9._]{2,30})\s*[·•|]\s*\d+\s*[hdwmy]\b.*$/;

/** Drop that header. Only the FIRST line is tested — the same shape can legitimately appear
 *  mid-thread inside a quoted post, and removing that would delete real content. */
function stripPasteHeader(raw: string): string {
  const lines = (raw || '').replace(/\r\n?/g, '\n').split('\n');
  if (lines.length && PASTE_HEADER.test(lines[0])) lines.shift();
  return lines.join('\n').trimStart();
}

/**
 * The author handle in a pasted thread, or ''.
 *
 * Only the first couple of lines are searched: a copied Threads post opens with the poster's
 * handle, while an `@mention` deeper in the text is somebody the author was talking about — taking
 * that one would credit the wrong person in the deck's caption.
 */
export function authorFromPaste(raw: string): string {
  const lines = (raw || '').split('\n');
  const header = lines[0]?.match(PASTE_HEADER)?.[1];
  if (header) return `@${header}`;
  const handle = lines.slice(0, 2).join('\n').match(/@([A-Za-z0-9._]{2,30})/)?.[1];
  return handle ? `@${handle}` : '';
}

/** Local parse of a manually pasted thread — same shape as a successful fetch, minus the images
 *  (a paste carries text only; the operator can still get visuals from the generated backdrops). */
export function parseThreadRawText(raw: string, url = ''): ImportedThread {
  const author = authorFromPaste(raw);
  // The "username · 3h" header is app furniture, not the post — it would otherwise open the deck.
  const posts = splitThreadPosts(stripPasteHeader(raw));
  const items = posts.map((text) => ({ text, images: [] as string[] }));
  const chars = totalChars(items);
  const normalized = url ? normalizeThreadsUrl(url) : null;
  return {
    ok: posts.length > 0 && chars >= MIN_THREAD_CHARS,
    url: normalized?.url ?? (url ? withScheme(url) : ''),
    author,
    posts,
    items,
    images: [],
    replyCount: Math.max(0, posts.length - 1),
    text: posts.join('\n\n'),
    via: posts.length ? 'manual' : 'none',
    note: !posts.length
      ? 'לא נמצא טקסט שמיש בהדבקה.'
      : chars < MIN_THREAD_CHARS
        ? `הטקסט שהודבק קצר מדי (${chars} תווים) — נדרשים לפחות ${MIN_THREAD_CHARS} תווים ליצירת קרוסלה.`
        : undefined,
  };
}
