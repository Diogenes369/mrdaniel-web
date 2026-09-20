import * as cheerio from 'cheerio';

/**
 * X (Twitter) post fetcher. Server-side only — used by /api/agent-generate · action:"parse-x-post",
 * and consumed by `src/server/agents/xPostAgent.ts`.
 *
 * Returns the post's text, its images, its VIDEO (every mp4 rendition X published), and — when the
 * pasted link is the tail of a thread — the author's own ancestor posts in reading order.
 *
 * ## Why the syndication endpoint and not the X API
 *
 * The v2 X API is paid at every tier that returns a tweet by id, so it is out of scope here (see
 * AGENTS.md: no new paid dependency). `cdn.syndication.twimg.com/tweet-result` is the public JSON
 * that powers X's own embed widget — it is what `vercel/react-tweet` reads, needs no key, and
 * returns the full post object including `mediaDetails[].video_info.variants`, which is the only
 * free source of a direct mp4 URL. Verified live on 2026-09-21 against post `2087025097546809533`:
 * 200 + the complete payload, video variants included.
 *
 * The endpoint requires a `token` query parameter derived from the post id (`syndicationToken`).
 * It is not a secret and not an auth credential — it is a cache-busting checksum X's own embed
 * script computes client-side, reproduced here verbatim.
 *
 * ## The contract is soft, on purpose
 *
 * Like the Threads fetcher this NEVER throws. A deleted post, an age-gated post or a rate limit
 * comes back as `ok:false` with a Hebrew `note`, and the dashboard opens the manual-paste box,
 * which is a first-class path rather than an error state. oEmbed is tried in parallel as a second
 * source: it survives some cases syndication 404s on, and carries the post text (but never the
 * video), so a post that only oEmbed answers for still produces a carousel — just no subtitles.
 */

// ─── types ──────────────────────────────────────────────────────────────────────────────────

/** One post in the chain: its text plus any images it carried. Mirrors ThreadPost in
 *  threadsThreadFetcher.ts so both sources satisfy the shared `DeckSource` layout contract. */
export interface XPost {
  text: string;
  /** Same-origin-proxied image URLs (see `proxiedXImage`), so a canvas can draw them untainted. */
  images: string[];
}

/** One mp4 rendition X published for the post's video. */
export interface XVideoVariant {
  url: string;
  /** bits per second, when X declared one — drives the "smallest usable" pick for transcription */
  bitrate: number;
  width: number;
  height: number;
}

export interface XVideo {
  /** Every mp4 rendition, largest first. HLS (`.m3u8`) variants are dropped — neither the browser
   *  canvas path nor the server transcription path can read a playlist without a demuxer. */
  variants: XVideoVariant[];
  /** Poster frame, same-origin-proxied. */
  poster: string;
  durationMs: number;
  /** `[w, h]` as X declared it, e.g. `[16, 9]`. */
  aspectRatio: [number, number];
  /** 'video' for a real clip, 'animated_gif' for a looping silent GIF — the latter has no audio,
   *  so the subtitle pipeline refuses it up front instead of spending a model call on silence. */
  kind: 'video' | 'animated_gif';
}

export interface ImportedXPost {
  ok: boolean;
  /** canonicalised post URL, always on x.com */
  url: string;
  /** the post's numeric id */
  id: string;
  /** "@handle" when recoverable, '' otherwise */
  author: string;
  /** the author's display name, when recoverable */
  authorName: string;
  /** the post and its same-author ancestors, in reading order */
  posts: string[];
  /** the same chain with each post's images attached — what the visual agent lays out */
  items: XPost[];
  /** every image in the chain, deduped and in order — for the operator's preview strip */
  images: string[];
  /** the post's video, when it published one */
  video?: XVideo;
  /** ancestor posts by the same author above this one: `posts.length - 1`, floored at 0 */
  replyCount: number;
  /** posts joined with blank lines; what the synthesis agent actually consumes */
  text: string;
  /** which path produced the content — surfaced in the UI so the operator knows how complete it is */
  via: 'syndication' | 'oembed' | 'manual' | 'none';
  /** operator-facing hint when extraction came back thin or empty */
  note?: string;
}

// ─── URL sanitization ───────────────────────────────────────────────────────────────────────

/** The first x.com / twitter.com link in the input. Share sheets copy text around the link, so the
 *  whole paste is searched, not just its start. The mirror hosts (fxtwitter, vxtwitter, nitter…)
 *  are accepted because the "copy link" button of several X clients rewrites to them, and the post
 *  id in the path is the same — only the id is ever used. */
const X_LINK =
  /(?:https?:\/\/)?(?:www\.|m\.|mobile\.)?(?:x|twitter|fxtwitter|vxtwitter|fixupx|twittpr|nitter\.[a-z0-9.-]+)\.com\/[^\s<>"'`]+/i;

/** A post path: `/<handle>/status/<id>`, or the `/i/status/<id>` and `/i/web/status/<id>` forms
 *  X itself redirects from, optionally ending in `/photo/1`, `/video/1` or `/analytics`. */
const POST_PATH =
  /^\/(?:i\/(?:web\/)?status\/(\d{1,25})|([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{1,25}))(?:\/(?:photo|video|analytics|likes|retweets)(?:\/\d+)?)?\/?$/i;

export interface XTarget {
  /** the canonical post URL on x.com */
  url: string;
  /** "@handle" when the URL names one, '' for the `/i/status/` form */
  handle: string;
  /** the numeric post id */
  id: string;
}

/**
 * The canonical post URL plus the handle and id in it, or null when the input holds no X post link.
 *
 * Only the PATH is kept, so every share parameter (`?s=20`, `?t=…`, `utm_*`) and any fragment is
 * dropped by construction rather than by a blocklist. The host is never taken from the input — a
 * `nitter.example.com` link normalises to `x.com` — so this cannot be used to fetch another site.
 */
export function normalizeXUrl(raw: string): XTarget | null {
  const link = (raw || '').match(X_LINK)?.[0];
  if (!link) return null;
  let path: string;
  try {
    path = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`).pathname;
  } catch {
    return null;
  }
  // Trailing sentence punctuation belongs to the prose the link was pasted inside, not to the path.
  const m = POST_PATH.exec(path.replace(/[).,;:!?]+$/, ''));
  if (!m) return null;
  const id = m[1] ?? m[3] ?? '';
  const handle = m[2] ?? '';
  if (!id) return null;
  return {
    url: `https://x.com/${handle || 'i'}/status/${id}`,
    handle: handle ? `@${handle}` : '',
    id,
  };
}

export function isXUrl(raw: string): boolean {
  return normalizeXUrl(raw) !== null;
}

/**
 * The `token` query parameter `cdn.syndication.twimg.com` requires.
 *
 * Reproduced verbatim from X's own embed script (and from `vercel/react-tweet`, which is the
 * reference implementation): the id is scaled into a float, multiplied by π and printed in base 36,
 * then zeroes and the decimal point are stripped. It carries no identity and grants no access — the
 * endpoint serves public posts only — it exists so a hand-built URL misses X's edge cache.
 */
export function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(6 ** 2).replace(/(0+|\.)/g, '');
}

// ─── fetch helpers ──────────────────────────────────────────────────────────────────────────

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9,he-IL;q=0.8',
};

async function getJson(url: string, timeoutMs: number): Promise<unknown | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow', headers: BROWSER_HEADERS });
    if (!res.ok) return undefined;
    const body = await res.text();
    // X answers a missing / protected post with a full HTML error page on a 404, and occasionally
    // with an HTML shell on a 200. Anything that isn't JSON is not a post.
    if (!body.trimStart().startsWith('{')) return undefined;
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

// ─── images ─────────────────────────────────────────────────────────────────────────────────

/** Hosts X actually serves post media from. A URL from anywhere else in the payload is not post
 *  media, and is never handed to the relay. */
const MEDIA_HOST = /(?:^|\.)(?:twimg\.com)$/i;

/**
 * An X CDN image, rewritten to travel through the site's own relay.
 *
 * Same reason as the Threads fetcher's `proxiedImage`: `pbs.twimg.com` does not send
 * `Access-Control-Allow-Origin` on images, and the dashboard draws these onto a `<canvas>` it then
 * exports as PNG — a tainted canvas throws on `toDataURL`. Returns '' for anything that is not an
 * X media URL.
 *
 * Note this is images only. The VIDEO is deliberately NOT proxied: `video.twimg.com` reflects the
 * requesting origin in `Access-Control-Allow-Origin` and honours range requests (verified
 * 2026-09-21), so the browser can read the mp4 cross-origin without tainting anything — and routing
 * a 12 MB mp4 through a serverless function per subtitle render would spend the function budget for
 * nothing. `api/img-proxy.ts` would reject it anyway; it is an `image/*`-only relay.
 */
export function proxiedXImage(raw: string): string {
  const url = String(raw || '').trim();
  if (!url) return '';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return '';
  }
  if (parsed.protocol !== 'https:' || !MEDIA_HOST.test(parsed.hostname)) return '';
  // `?name=small` is X's own downscale parameter; asking for `large` keeps the slide backdrop sharp.
  if (/\/media\//.test(parsed.pathname)) parsed.searchParams.set('name', 'large');
  return `https://mrdaniel.co.il/api/img-proxy?url=${encodeURIComponent(parsed.toString())}`;
}

/** Only `video.twimg.com` mp4s are ever handed back as a playable/transcribable source. Anything
 *  else in the payload is not the post's video, and both the browser burner and the server
 *  transcriber fetch whatever this returns. */
export function isXVideoUrl(raw: string): boolean {
  try {
    const u = new URL(String(raw || ''));
    return u.protocol === 'https:' && /(?:^|\.)video\.twimg\.com$/i.test(u.hostname) && /\.mp4$/i.test(u.pathname);
  } catch {
    return false;
  }
}

// ─── syndication payload → post ─────────────────────────────────────────────────────────────

type Rec = Record<string, unknown>;

const rec = (v: unknown): Rec => (v && typeof v === 'object' ? (v as Rec) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** The `w x h` a variant's own URL encodes — X puts the rendition size in the path
 *  (`/vid/avc1/698x360/…mp4`) and nowhere else in the payload. */
function sizeFromVariantUrl(url: string): { width: number; height: number } {
  const m = /\/(\d{2,5})x(\d{2,5})\//.exec(url);
  return { width: Number(m?.[1]) || 0, height: Number(m?.[2]) || 0 };
}

/**
 * The post's video, assembled from whichever of the two shapes the payload used.
 *
 * `mediaDetails[].video_info` is the canonical one and carries bitrates; the top-level `video`
 * object is the widget's own flattened copy and omits them. Both are read so a payload that drops
 * either still produces a usable clip.
 */
export function extractXVideo(payload: unknown): XVideo | undefined {
  const root = rec(payload);
  const media = arr(root.mediaDetails).map(rec);
  const clip = media.find((m) => str(m.type) === 'video' || str(m.type) === 'animated_gif');
  const flat = rec(root.video);

  const rawVariants: { url: string; bitrate: number }[] = [
    ...arr(rec(clip?.video_info).variants)
      .map(rec)
      .map((v) => ({ url: str(v.url), bitrate: Number(v.bitrate) || 0 })),
    ...arr(flat.variants)
      .map(rec)
      .map((v) => ({ url: str(v.src), bitrate: 0 })),
  ];

  const seen = new Set<string>();
  const variants: XVideoVariant[] = [];
  for (const v of rawVariants) {
    if (!isXVideoUrl(v.url) || seen.has(v.url)) continue;
    seen.add(v.url);
    variants.push({ url: v.url, bitrate: v.bitrate, ...sizeFromVariantUrl(v.url) });
  }
  if (!variants.length) return undefined;
  // Largest first, so `variants[0]` is what the operator previews and burns; the transcription pick
  // walks from the other end (see `pickTranscriptionVariant`).
  variants.sort((a, b) => b.width * b.height - a.width * a.height || b.bitrate - a.bitrate);

  const ratio = arr(rec(clip?.video_info).aspect_ratio).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const flatRatio = arr(flat.aspectRatio).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const aspect = (ratio.length === 2 ? ratio : flatRatio.length === 2 ? flatRatio : [16, 9]) as [number, number];

  return {
    variants,
    poster: proxiedXImage(str(clip?.media_url_https) || str(flat.poster)),
    durationMs: Number(rec(clip?.video_info).duration_millis) || Number(flat.durationMs) || 0,
    aspectRatio: aspect,
    kind: str(clip?.type) === 'animated_gif' ? 'animated_gif' : 'video',
  };
}

/**
 * The smallest rendition still worth transcribing.
 *
 * The subtitle pass reads SPEECH, not detail: a 2094×1080 rendition costs eight times the bytes of
 * the 698×360 one and tells the model nothing more about what was said. So the smallest variant at
 * or above `minHeight` wins, and the outright smallest is the fallback for a clip that has no
 * rendition that tall. Returns undefined when the post has no usable mp4 at all.
 */
export function pickTranscriptionVariant(video: XVideo | undefined, minHeight = 270): XVideoVariant | undefined {
  if (!video?.variants.length) return undefined;
  const ascending = [...video.variants].sort((a, b) => a.width * a.height - b.width * b.height || a.bitrate - b.bitrate);
  return ascending.find((v) => v.height >= minHeight) ?? ascending[0];
}

/** X UI furniture and link shorteners that ride along in the post text. `t.co` links are stripped
 *  entirely: the target is already in `entities`, and a bare `https://t.co/AbC` on a slide is a
 *  dead string. */
const TCO_LINK = /https?:\/\/t\.co\/[A-Za-z0-9]+/g;

/**
 * The post's own prose: the `text` field with the trailing media shortlink removed.
 *
 * X appends a `t.co` link for the attached photo/video to the end of `text`, and `display_text_range`
 * is the payload's own statement of where the human-written part ends. Honouring it is what keeps
 * "…here's how 👇 https://t.co/FAol8DgfLx" from becoming a slide title.
 */
export function cleanPostText(payload: unknown): string {
  const root = rec(payload);
  const raw = str(root.text);
  const range = arr(root.display_text_range).map(Number);
  const sliced =
    range.length === 2 && Number.isFinite(range[0]) && Number.isFinite(range[1]) && range[1] > range[0]
      ? // The range is in Unicode code points, not UTF-16 units — an emoji before the cut shifts it.
        [...raw].slice(range[0], range[1]).join('')
      : raw;
  return sliced
    .replace(TCO_LINK, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Every image on one payload, deduped and proxied. A video's poster is NOT included — it is the
 *  video's own frame, and putting it on a slide as if it were a published photo double-counts it. */
function payloadImages(payload: unknown): string[] {
  const media = arr(rec(payload).mediaDetails).map(rec);
  const urls = media.filter((m) => str(m.type) === 'photo').map((m) => proxiedXImage(str(m.media_url_https)));
  return [...new Set(urls.filter(Boolean))].slice(0, 4);
}

// ─── thread assembly ────────────────────────────────────────────────────────────────────────

/** How far up a reply chain the fetcher will walk. A long quote-war is not a thread, and each step
 *  is its own round-trip on a 120 s function budget shared with the model call. */
const MAX_ANCESTORS = 12;

/**
 * The chain the pasted post belongs to, oldest first.
 *
 * The syndication payload exposes only the post's PARENT, never its children, so what is
 * recoverable is the chain ABOVE the pasted link. That is the useful direction in practice: the
 * link a reader shares is usually the punchline at the bottom of a tutorial thread, and walking up
 * from it recovers the setup. Walking stops at the first post by a different author — someone
 * else's reply is not part of this author's thread — which is the same structural rule the Threads
 * fetcher applies to `selfThread`.
 */
async function walkAncestors(root: Rec, handle: string, timeoutMs: number): Promise<Rec[]> {
  const chain: Rec[] = [];
  let parent = rec(root.parent);
  for (let i = 0; i < MAX_ANCESTORS && str(parent.id_str); i++) {
    const parentHandle = str(rec(parent.user).screen_name).toLowerCase();
    if (!parentHandle || parentHandle !== handle) break;
    // The embedded `parent` is a trimmed copy with no `parent` of its own, so each ancestor is
    // re-fetched by id to keep climbing. A failed fetch ends the walk rather than the import.
    const id = str(parent.id_str);
    const full = rec(await getJson(syndicationUrl(id), timeoutMs));
    const usable = str(full.id_str) ? full : parent;
    chain.unshift(usable);
    parent = rec(usable.parent);
  }
  return chain;
}

function syndicationUrl(id: string): string {
  return `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(id)}&token=${syndicationToken(id)}&lang=en`;
}

// ─── oEmbed fallback ────────────────────────────────────────────────────────────────────────

/**
 * The post text from X's public oEmbed endpoint.
 *
 * Keyless and separately rate-limited from syndication, so it answers for some posts syndication
 * 404s on. It returns an HTML blockquote, never media, so this is a TEXT-only recovery: a post that
 * reaches the deck this way has no images and no video, and the UI says so.
 */
async function fetchOEmbed(url: string, timeoutMs: number): Promise<{ text: string; author: string } | null> {
  const endpoint = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=1&dnt=1&lang=en`;
  const data = rec(await getJson(endpoint, timeoutMs));
  const html = str(data.html);
  if (!html) return null;
  const $ = cheerio.load(html);
  // <br> is the paragraph break inside the blockquote; without this every line runs together.
  $('br').replaceWith('\n');
  const blockquote = $('blockquote').first();
  blockquote.find('a').each((_i, el) => {
    const href = $(el).attr('href') ?? '';
    // The trailing permalink back to the post itself is chrome, not content.
    if (/\/status(?:es)?\/\d+/.test(href)) $(el).remove();
  });
  const text = blockquote
    .text()
    .replace(TCO_LINK, ' ')
    // oEmbed closes with "— Name (@handle) March 21, 2006"; that is attribution, not the post.
    .replace(/—\s*[^\n—]*\(@[A-Za-z0-9_]{1,15}\)\s*\w+ \d{1,2}, \d{4}\s*$/, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) return null;
  const handle = str(data.author_url).match(/(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})/)?.[1] ?? '';
  return { text, author: handle ? `@${handle}` : '' };
}

// ─── entry points ───────────────────────────────────────────────────────────────────────────

/** Minimum source characters for AI adaptation. Below it there is not enough to build a deck from,
 *  and calling the model anyway just spends quota to get the local fallback back. Mirrored in
 *  dashboard/src/lib/xImportApi.ts. */
export const MIN_X_CHARS = 60;

const FAILED_NOTE = 'לא הצלחנו למשוך את הפוסט מ-X — הדביקו את טקסט הפוסט ידנית.';

function assemble(input: {
  url: string;
  id: string;
  author: string;
  authorName: string;
  items: XPost[];
  video?: XVideo;
  via: ImportedXPost['via'];
  note?: string;
}): ImportedXPost {
  const items = input.items.filter((p) => p.text.trim());
  const posts = items.map((p) => p.text);
  const chars = posts.join(' ').trim().length;
  return {
    // A post whose only content is a video is still a successful import: the transcript becomes the
    // deck's source text. `ok` therefore tolerates thin prose when a clip came with it.
    ok: posts.length > 0 && (chars >= MIN_X_CHARS || Boolean(input.video)),
    url: input.url,
    id: input.id,
    author: input.author,
    authorName: input.authorName,
    posts,
    items,
    images: [...new Set(items.flatMap((p) => p.images))].slice(0, 20),
    video: input.video,
    replyCount: Math.max(0, posts.length - 1),
    text: posts.join('\n\n'),
    via: posts.length ? input.via : 'none',
    note:
      input.note ??
      (!posts.length
        ? FAILED_NOTE
        : chars < MIN_X_CHARS && !input.video
          ? `טקסט הפוסט קצר מדי (${chars} תווים) — נדרשים לפחות ${MIN_X_CHARS} תווים ליצירת קרוסלה. הוסיפו טקסט ידנית.`
          : undefined),
  };
}

function emptyPost(url: string, id: string, handle: string, note: string): ImportedXPost {
  return assemble({ url, id, author: handle, authorName: '', items: [], via: 'none', note });
}

/**
 * Import a public X post: its text, images, video, and the author's own posts above it.
 *
 * Never throws. Syndication and oEmbed are raced in parallel and the richer one wins — syndication
 * whenever it answers, because it is the only one of the two that carries media.
 */
export async function importXPost(rawUrl: string): Promise<ImportedXPost> {
  const target = normalizeXUrl(rawUrl);
  if (!target) return emptyPost('', '', '', 'הכתובת אינה קישור תקין לפוסט ב-X / Twitter.');

  const [payload, oembed] = await Promise.all([
    getJson(syndicationUrl(target.id), 12000),
    fetchOEmbed(target.url, 10000).catch(() => null),
  ]);

  const root = rec(payload);
  if (str(root.id_str) || str(root.text)) {
    const handle = str(rec(root.user).screen_name);
    const ancestors = handle ? await walkAncestors(root, handle.toLowerCase(), 8000) : [];
    const chain = [...ancestors, root];
    const items: XPost[] = chain
      .map((node) => ({ text: cleanPostText(node), images: payloadImages(node) }))
      .filter((p) => p.text || p.images.length);
    // The video always comes from the post the operator actually pasted, never from an ancestor:
    // the subtitle pipeline's whole premise is "this clip, these subtitles".
    return assemble({
      url: target.url,
      id: target.id,
      author: handle ? `@${handle}` : target.handle,
      authorName: str(rec(root.user).name),
      items,
      video: extractXVideo(root),
      via: 'syndication',
    });
  }

  if (oembed) {
    return assemble({
      url: target.url,
      id: target.id,
      author: oembed.author || target.handle,
      authorName: '',
      items: [{ text: oembed.text, images: [] }],
      via: 'oembed',
      note: 'התוכן נמשך מתגית ההטמעה הציבורית — ללא תמונות וללא וידאו. להורדת הסרטון הדביקו קישור לפוסט המקורי.',
    });
  }

  return emptyPost(target.url, target.id, target.handle, FAILED_NOTE);
}

// ─── manual paste ───────────────────────────────────────────────────────────────────────────

/** X UI chrome that rides along when a post is copied out of the app or the web client. */
const NOISE_LINE =
  /^(?:\d[\d,.]*\s*[km]?\s*(?:likes?|replies|reposts?|views?|quotes?|bookmarks?|followers?|לייקים|תגובות|צפיות|עוקבים)\b.*|(?:log in|sign up|subscribe|follow|following|עקוב|עוקב|הרשמה|התחבר(?:ות)?)\s*$|(?:translate post|show more|read more|תרגם|הצג עוד)\b.*|(?:©|copyright)\s*\d{4}.*|\d+\s*[smhdwy]\s*(?:ago)?\s*$|(?:just now|לפני רגע)\s*$|(?:show this thread|הצג את השרשור)\s*$|\d[\d,.]*\s*[km]?\s*$|(?:replying to\b.*|מגיב ל.*)|\d{1,2}:\d{2}\s*(?:am|pm)?\s*[·•].*)$/i;

/** The header line a copied X post opens with: "Name @handle · 3h". */
const PASTE_HEADER = /^\s*.*?@([A-Za-z0-9_]{1,15})\s*(?:[·•|]\s*\w+)?\s*$/;

/** A line that opens a new part of a thread. Mirrors the Threads fetcher's PART_MARKER: authors
 *  number an X thread the same two ways. */
const PART_MARKER = /^\s*(?:🧵\s*)?(?:\(?\d{1,2}\s*(?:\/\s*\d{1,2})?\s*[.):\/]|\d{1,2}\s*—|[-*•‣▪▶→]\s)\s*/;

/**
 * Local parse of a manually pasted post or thread. Same contract as the Threads fetcher's
 * `parseThreadRawText`, and mirrored client-side so the paste path needs no round-trip at all.
 */
export function parseXRawText(raw: string, url = ''): ImportedXPost {
  const target = normalizeXUrl(url);
  const source = (raw || '').replace(/\r\n?/g, '\n').trim();
  const sourceLines = source.split('\n');
  const header = sourceLines[0]?.match(PASTE_HEADER)?.[1];
  const handle = header ?? sourceLines.slice(0, 2).join('\n').match(/@([A-Za-z0-9_]{1,15})/)?.[1] ?? '';
  // That header is app furniture, not content — dropped so it can't open the deck. Only the first
  // line is tested; the same shape mid-thread is a quoted post, i.e. real content.
  const text = (header ? sourceLines.slice(1) : sourceLines).join('\n').trimStart().replace(TCO_LINK, ' ');
  const lines = text.split('\n');

  let parts: string[];
  if (lines.filter((l) => PART_MARKER.test(l)).length >= 2) {
    parts = [];
    for (const line of lines) {
      if (PART_MARKER.test(line) || parts.length === 0) parts.push(line.replace(PART_MARKER, '').trim());
      else parts[parts.length - 1] += `\n${line}`;
    }
  } else {
    parts = text.split(/\n{2,}/);
  }

  const posts: string[] = [];
  for (const part of parts) {
    const clean = part
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !NOISE_LINE.test(l))
      .join('\n')
      .trim();
    if (!clean) continue;
    // A stray one-liner ("👇") belongs to the post above it, not to a slide of its own.
    if (clean.length < 15 && posts.length) posts[posts.length - 1] += `\n${clean}`;
    else posts.push(clean.slice(0, 3000));
  }

  return assemble({
    url: target?.url ?? url.trim(),
    id: target?.id ?? '',
    author: handle ? `@${handle}` : (target?.handle ?? ''),
    authorName: '',
    items: posts.slice(0, 30).map((t) => ({ text: t, images: [] })),
    via: 'manual',
    note: posts.length ? undefined : 'לא נמצא טקסט שמיש בהדבקה.',
  });
}
