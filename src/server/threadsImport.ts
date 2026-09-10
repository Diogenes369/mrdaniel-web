/**
 * Best-effort importer for a public Threads post / thread. Server-side only — used by
 * /api/agent-generate · action:"parse-thread". Returns the thread's posts in order plus the
 * author handle, so the dashboard's Threads → carousel workflow can hand real source text to the
 * translation agent.
 *
 * Threads has no open post API, and every extraction path here can be defeated by a login wall or
 * a rate limit. So the contract is deliberately soft: this NEVER throws, and when it recovers
 * nothing it says so (`via:'none'`) rather than failing the request — the dashboard then asks the
 * operator to paste the thread text manually, which is a first-class path, not an error state.
 *
 * Strategy, in order:
 *   1. direct fetch (browser UA) → the server-rendered `data-sjs` JSON blobs, which carry each
 *      post's caption text verbatim; OG tags as a floor.
 *   2. oEmbed (`/oembed/?url=`) → author + the post's HTML, for the cases where the HTML page
 *      itself is gated but the embed endpoint answers.
 *   3. Jina Reader (`r.jina.ai`) → clean markdown for origins that WAF-block datacenter IPs.
 */

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,he-IL;q=0.8',
};

const JINA_KEY = process.env.JINA_API_KEY?.trim();

export interface ImportedThread {
  ok: boolean;
  /** canonicalised post URL */
  url: string;
  /** "@handle" when recoverable, '' otherwise */
  author: string;
  /** the thread's posts, in reading order — one entry per post in the chain */
  posts: string[];
  /** posts joined with blank lines; what the synthesis agent actually consumes */
  text: string;
  /** which path produced the content — surfaced in the UI so the operator knows how complete it is */
  via: 'direct' | 'oembed' | 'jina' | 'manual' | 'none';
  /** operator-facing hint when extraction came back thin or empty */
  note?: string;
}

/** `https://www.threads.com/@user/post/CODE` (also accepts threads.net and the /t/CODE short form). */
const THREADS_URL =
  /^https?:\/\/(?:www\.)?threads\.(?:net|com)\/(?:@([A-Za-z0-9._]+)\/post\/([A-Za-z0-9_-]+)|t\/([A-Za-z0-9_-]+))/i;

export function isThreadsUrl(raw: string): boolean {
  return THREADS_URL.test(withScheme(raw));
}

function withScheme(raw: string): string {
  const url = (raw || '').trim();
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/**
 * Canonical form + the handle carried in the path.
 *
 * Threads moved from threads.net to threads.com and serves both; the .com host is what the current
 * renderer answers on, so requests are normalised to it and the query string (`?igshid=…` share
 * tracking) is dropped — it makes the oEmbed lookup miss.
 */
export function normalizeThreadsUrl(raw: string): { url: string; handle: string; code: string } | null {
  const m = THREADS_URL.exec(withScheme(raw));
  if (!m) return null;
  const handle = m[1] ?? '';
  const code = m[2] ?? m[3] ?? '';
  const url = handle ? `https://www.threads.com/@${handle}/post/${code}` : `https://www.threads.com/t/${code}`;
  return { url, handle: handle ? `@${handle}` : '', code };
}

async function getText(url: string, timeoutMs: number, headers: Record<string, string>): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow', headers });
    if (!res.ok) return undefined;
    const body = await res.text();
    return body.length > 2_000_000 ? body.slice(0, 2_000_000) : body;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
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

function meta(html: string, ...names: string[]): string {
  for (const name of names) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m =
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]+content=["']([^"']*)["']`, 'i')) ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${esc}["']`, 'i'));
    if (m?.[1]) return decodeEntities(m[1].trim());
  }
  return '';
}

/**
 * A whole line that is Threads furniture, not post text: engagement counters (bare numbers, as the
 * reader renders the like/reply/repost row), a "N views" heading, a post date, an @handle byline,
 * consent/footer chrome.
 */
const NOISE_LINE =
  /^(?:\d[\d,.]*\s*(?:likes?|replies|reposts?|views?|comments?|לייקים|תגובות|צפיות)\b.*|(?:log in|sign up|התחבר(?:ות)?|הרשמה)\b.*|(?:translate|see translation|תרגם|הצג תרגום)\b.*|(?:more|see more|show more|עוד|הצג עוד)\s*$|(?:follow|following|עקוב|עוקב)\s*$|threads\s*$|instagram\s*$|(?:©|copyright)\s*\d{4}.*|meta platforms.*|(?:privacy|terms|cookies?)\s*(?:policy|notice)?\s*$|\d+\s*[hdwmy]\s*(?:ago)?\s*$|(?:just now|לפני רגע)\s*$|\d[\d,.]*\s*$|(?:thread\s*)?\d[\d,.]*\s*[km]?\s*views?\s*$|\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\s*$|@[A-Za-z0-9._]{2,30}\s*$|learn more\s*$|sorry,? we'?re having trouble.*|report a problem\s*$|threads terms\s*$|[·•]?\s*author\s*$)$/i;

/**
 * Where the thread ends and the page's other content begins.
 *
 * The reader proxy appends the "Related threads" rail — other people's posts — after the thread
 * itself. Left in, those become slides, so everything from the first such marker is cut.
 */
const TAIL_MARKER = /\n\s*(?:related threads|more (?:from|like this)|you might like|suggested (?:threads|for you)|discover)\s*\n/i;

function cutAtRelated(text: string): string {
  const m = text.match(TAIL_MARKER);
  return m && m.index !== undefined ? text.slice(0, m.index).trim() : text;
}

/**
 * Text that is a wall, not a post: a login gate, a CAPTCHA challenge, a deleted-post page, or the
 * reader proxy's own error boilerplate.
 *
 * This matters more than it looks. Jina Reader answers 200 for a dead or gated Threads URL and
 * returns its complaint as the page body ("Warning: This page maybe requiring CAPTCHA…", "The
 * link's not working or the page is gone"), which the splitter would happily turn into slides. So
 * every extracted candidate is checked against this before it can be treated as content.
 */
const GATE_TEXT =
  /(?:requiring CAPTCHA|please make sure you are authorized|not all who wander are lost|the link'?s not working|page is gone|sorry,? this page isn'?t available|page not found|content isn'?t available|log ?in to (?:threads|see|continue)|you must log in|join threads|create a threads account|enable javascript|something went wrong)/i;

function isGateText(text: string): boolean {
  return GATE_TEXT.test(text);
}

/** Drop gate/error boilerplate from a candidate post list. */
function dropGatePosts(posts: string[]): string[] {
  return posts.filter((p) => !isGateText(p));
}

/** Unescape one JSON string body captured out of a `data-sjs` blob. */
function unescapeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\//g, '/')
      .replace(/\\u([0-9a-f]{4})/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)));
  }
}

/**
 * Pull post texts out of the server-rendered JSON.
 *
 * Threads inlines its GraphQL payload in `<script type="application/json" data-sjs>` blobs; every
 * post in a chain appears there as `"caption":{"text":"…"}` (with `"text_post_app_info"` siblings
 * carrying reply/quote metadata we don't need). Scanning the raw HTML for that shape is far more
 * robust than trying to walk the whole payload, whose surrounding envelope changes constantly.
 * Document order is reading order, so matches are kept in order and de-duplicated.
 */
function extractSjsPosts(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /"caption"\s*:\s*\{\s*(?:[^{}]*?,)?\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"/g,
    /"post_text"\s*:\s*"((?:\\.|[^"\\])*)"/g,
  ];
  for (const re of patterns) {
    for (const m of html.matchAll(re)) {
      const text = unescapeJsonString(m[1]).trim();
      if (text.length < 2) continue;
      const key = text.slice(0, 120);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(text);
    }
    if (out.length) break; // the first shape that yields anything is the authoritative one
  }
  return out;
}

/** Author handle from the page — the `@user` in the OG title, or the profile link in the markup. */
function extractAuthor(html: string): string {
  const ogTitle = meta(html, 'og:title', 'twitter:title');
  const fromTitle = ogTitle.match(/\(@([A-Za-z0-9._]+)\)/) || ogTitle.match(/@([A-Za-z0-9._]+)/);
  if (fromTitle?.[1]) return `@${fromTitle[1]}`;
  const fromJson = html.match(/"username"\s*:\s*"([A-Za-z0-9._]{2,30})"/);
  return fromJson?.[1] ? `@${fromJson[1]}` : '';
}

/**
 * Split a flat text blob into the thread's individual posts.
 *
 * Handles the two shapes an extracted thread actually arrives in: explicit part markers the author
 * typed ("1/", "2/7", "🧵 3."), or plain paragraph breaks. Anything under ~15 chars is folded back
 * into the previous part so a stray line ("👇") never becomes its own slide source.
 */
export function splitThreadPosts(raw: string): string[] {
  const text = (raw || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return [];

  const lines = text.split('\n');
  const MARKER = /^\s*(?:🧵\s*)?(?:\(?\d{1,2}\s*(?:\/\s*\d{1,2})?\s*[.):\/]|\d{1,2}\s*—)\s+/;
  if (lines.filter((l) => MARKER.test(l)).length >= 2) {
    const parts: string[] = [];
    for (const line of lines) {
      if (MARKER.test(line) || parts.length === 0) parts.push(line.replace(MARKER, '').trim());
      else parts[parts.length - 1] += `\n${line}`;
    }
    return tidyParts(parts);
  }
  return tidyParts(text.split(/\n{2,}/));
}

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

/** oEmbed returns `{author_name, html}` — the html is a blockquote holding the post text. */
function parseOEmbed(json: string): { author: string; text: string } {
  try {
    const data = JSON.parse(json) as { author_name?: string; html?: string };
    const html = String(data.html ?? '');
    const text = decodeEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|blockquote)>/gi, '\n\n')
        .replace(/<[^>]+>/g, ' ')
    )
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const author = String(data.author_name ?? '').trim();
    return { author: author ? (author.startsWith('@') ? author : `@${author}`) : '', text };
  } catch {
    return { author: '', text: '' };
  }
}

/**
 * Jina Reader gives clean markdown with `Title:` / `URL Source:` headers, then the body.
 *
 * A Threads page comes back carrying markdown furniture the splitter must not mistake for content:
 * empty `[](profile-url)` avatar and media links, `##` headings, and the author's own handle
 * repeated as a byline above the post. The handle is passed in so that byline can be removed by
 * identity rather than by a heuristic that would also eat a legitimate one-word line.
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
  if (bare) {
    const esc = bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`^\\s*@?${esc}\\s*$`, 'gim'), '');
  }
  return cutAtRelated(text.replace(/\n{3,}/g, '\n\n').trim());
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

function totalChars(posts: string[]): number {
  return posts.reduce((n, p) => n + p.trim().length, 0);
}

const THIN_NOTE =
  'הצלחנו למשוך רק קטע קצר מהפוסט (כנראה חסום מאחורי התחברות) — הדביקו את טקסט השרשור המלא כדי להמשיך.';

function finish(base: ImportedThread, posts: string[], via: ImportedThread['via'], author: string): ImportedThread {
  const chars = totalChars(posts);
  // Thin extractions are still returned, not discarded: the operator sees what little came back and
  // can paste the rest around it. They are just never reported as ok.
  const thin = chars > 0 && chars < MIN_THREAD_CHARS;
  return {
    ...base,
    ok: posts.length > 0 && !thin,
    author: author || base.author,
    posts,
    text: posts.join('\n\n'),
    via: posts.length ? via : 'none',
    note: !posts.length ? base.note : thin ? THIN_NOTE : undefined,
  };
}

export async function importThreadContent(rawUrl: string): Promise<ImportedThread> {
  const normalized = normalizeThreadsUrl(rawUrl);
  const url = normalized?.url ?? withScheme(rawUrl);
  const base: ImportedThread = {
    ok: false,
    url,
    author: normalized?.handle ?? '',
    posts: [],
    text: '',
    via: 'none',
    note: 'לא הצלחנו למשוך את התוכן מ-Threads — הדביקו את טקסט השרשור ידנית.',
  };
  if (!normalized) return { ...base, note: 'הקישור אינו קישור לפוסט ב-Threads.' };

  // 1 · direct fetch → server-rendered JSON
  const html = await getText(url, 8000, BROWSER_HEADERS);
  if (html) {
    const author = extractAuthor(html) || base.author;
    const posts = dropGatePosts(tidyParts(extractSjsPosts(html)));
    if (posts.length) return finish(base, posts, 'direct', author);
    // OG description is a truncated single post, but it beats nothing — kept as a floor and only
    // returned if the richer paths below also come up empty.
    const ogDesc = meta(html, 'og:description', 'twitter:description', 'description');
    if (ogDesc.length > 40 && !isGateText(ogDesc)) {
      base.posts = tidyParts([ogDesc]);
      base.author = author;
    }
  }

  // 2 · oEmbed
  const oembed = await getText(
    `https://www.threads.com/oembed/?url=${encodeURIComponent(url)}&omitscript=true`,
    6000,
    { ...BROWSER_HEADERS, Accept: 'application/json' }
  );
  if (oembed) {
    const { author, text } = parseOEmbed(oembed);
    const posts = dropGatePosts(splitThreadPosts(text));
    if (posts.length) return finish(base, posts, 'oembed', author || base.author);
  }

  // 3 · Jina Reader
  const viaJina = await getText(`https://r.jina.ai/${url}`, 10000, JINA_KEY ? { Authorization: `Bearer ${JINA_KEY}` } : {});
  if (viaJina) {
    // The reader answers 200 for a gated or deleted post and returns its own complaint as the
    // body, so gate text is stripped first and real substance is required after that.
    const posts = dropGatePosts(splitThreadPosts(parseJina(viaJina, normalized.handle)));
    // The reader's own boilerplate can survive the gate filter as a handful of characters, so
    // this path keeps a stricter bar than the shared floor before it wins the result.
    if (posts.length && totalChars(posts) > 120) {
      const result = finish(base, posts, 'jina', base.author);
      // The reader renders neighbouring feed posts alongside the target thread, so an unusually
      // long result is a sign the extraction over-reached. Flagged rather than silently trimmed —
      // the operator sees every extracted post in the UI and can cut it down or paste instead.
      return posts.length > 12
        ? { ...result, note: 'חולצו הרבה פוסטים — ייתכן שנכנסו גם פוסטים סמוכים. בדקו את הרשימה או הדביקו ידנית.' }
        : result;
    }
  }

  // The OG-description floor: a truncated single caption. It goes through the same substance check
  // as every other path, so a one-line shell is reported as thin rather than as a usable import.
  if (base.posts.length) {
    const chars = totalChars(base.posts);
    return {
      ...base,
      ok: chars >= MIN_THREAD_CHARS,
      text: base.posts.join('\n\n'),
      via: 'direct',
      note:
        chars >= MIN_THREAD_CHARS
          ? 'חולץ רק תקציר הפוסט (הפוסט חסום מאחורי התחברות) — השלימו ידנית אם חסר תוכן.'
          : THIN_NOTE,
    };
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

/** Local parse of a manually pasted thread — same shape as a successful fetch. */
export function parseThreadRawText(raw: string, url = ''): ImportedThread {
  const author = authorFromPaste(raw);
  // The "username · 3h" header is app furniture, not the post — it would otherwise open the deck.
  const posts = splitThreadPosts(stripPasteHeader(raw));
  const chars = totalChars(posts);
  return {
    ok: posts.length > 0 && chars >= MIN_THREAD_CHARS,
    url: url ? withScheme(url) : '',
    author,
    posts,
    text: posts.join('\n\n'),
    via: posts.length ? 'manual' : 'none',
    note: !posts.length
      ? 'לא נמצא טקסט שמיש בהדבקה.'
      : chars < MIN_THREAD_CHARS
        ? `הטקסט שהודבק קצר מדי (${chars} תווים) — נדרשים לפחות ${MIN_THREAD_CHARS} תווים ליצירת קרוסלה.`
        : undefined,
  };
}
