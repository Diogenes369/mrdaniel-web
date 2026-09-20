import { describeAiError } from './aiErrors';
import { postToAgent, buildLocalDeck, type ThreadTopicProfile } from './threadsImportApi';
import { renumberSteps, type TechTipDeck, type TechTipSlide } from './techTipsApi';
import { normalizeCues, cuesToTranscript, type SubtitleCue, type SubtitleTrack } from './xSubtitleFormat';

/**
 * X (Twitter) → Hebrew carousel + Hebrew-subtitled video — content layer for the dashboard's
 * "ייבוא מ-X / Twitter" tab.
 *
 * Three server round-trips, all through /api/agent-generate (no new Vercel Function — the project
 * is at the Hobby 12-function cap):
 *   1. `parse-x-post` → the post's text, images and video renditions (`src/server/xPostFetcher.ts`).
 *   2. `x-subtitles`  → optional, and only when the post carried a clip: Gemini transcribes the mp4
 *                       and translates it into timed Hebrew cues (`src/server/xSubtitles.ts`).
 *   3. `x-post-deck`  → the dedicated agent (`src/server/agents/xPostAgent.ts`): the post text plus
 *                       the transcript become a themed, laid-out Hebrew carousel.
 *
 * The deck type is deliberately TechTipDeck, so the entire existing Tech-Tips pipeline —
 * techTipRenderer (PNG carousel + ZIP), motionStudioService (9:16 reel), the preview player — works
 * on this output with no changes. The same reasoning as `threadsImportApi.ts`, whose `postToAgent`
 * (one bounded 429 retry, one 5xx retry) and `buildLocalDeck` (the honest untranslated fallback)
 * are reused here rather than re-implemented: a second copy would be one more place for the retry
 * policy and the fallback contract to quietly diverge.
 *
 * Error policy matches the Threads tab: deck synthesis NEVER throws (a failed run still leaves the
 * operator a real deck to edit), while IMPORT and SUBTITLES do — both have a concrete operator
 * action attached, "paste the post manually" and "the clip is too long / retry", and swallowing
 * them would present a silent degradation as a success.
 */

export interface XPost {
  text: string;
  images: string[];
}

export interface XVideoVariant {
  url: string;
  bitrate: number;
  width: number;
  height: number;
}

export interface XVideo {
  /** every mp4 rendition, largest first */
  variants: XVideoVariant[];
  poster: string;
  durationMs: number;
  aspectRatio: [number, number];
  /** an `animated_gif` has no audio track, so the subtitle pass is refused for it up front */
  kind: 'video' | 'animated_gif';
}

export interface ImportedXPost {
  ok: boolean;
  url: string;
  id: string;
  author: string;
  authorName: string;
  posts: string[];
  items: XPost[];
  images: string[];
  video?: XVideo;
  replyCount: number;
  text: string;
  via: 'syndication' | 'oembed' | 'manual' | 'none';
  note?: string;
}

/** Minimum source characters for AI adaptation — mirrors MIN_X_CHARS in src/server/xPostFetcher.ts,
 *  so client and server agree on what "too thin" means. */
export const MIN_X_CHARS = 60;

/** Mirrors MAX_VIDEO_SECONDS in src/server/xSubtitles.ts. Checked client-side too so a 20-minute
 *  clip is refused before the upload rather than after a 45-second download. */
export const MAX_VIDEO_SECONDS = 600;

export const EMPTY_X_POST: ImportedXPost = {
  ok: false,
  url: '',
  id: '',
  author: '',
  authorName: '',
  posts: [],
  items: [],
  images: [],
  replyCount: 0,
  text: '',
  via: 'none',
};

// ─── url ────────────────────────────────────────────────────────────────────────────────────

/** Mirrors X_LINK / POST_PATH in src/server/xPostFetcher.ts. The mirror hosts are accepted because
 *  several X clients' "copy link" rewrites to them; only the post id is ever used, and the result
 *  is always canonicalised back onto x.com. */
const X_LINK =
  /(?:https?:\/\/)?(?:www\.|m\.|mobile\.)?(?:x|twitter|fxtwitter|vxtwitter|fixupx|twittpr|nitter\.[a-z0-9.-]+)\.com\/[^\s<>"'`]+/i;
const POST_PATH =
  /^\/(?:i\/(?:web\/)?status\/(\d{1,25})|([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{1,25}))(?:\/(?:photo|video|analytics|likes|retweets)(?:\/\d+)?)?\/?$/i;

/** The canonical post URL with share tracking (`?s=20`, `?t=…`, `utm_*`) dropped, or null when the
 *  input holds no X post link. Only the path survives, so tracking is removed by construction
 *  rather than by a blocklist. */
export function sanitizeXUrl(raw: string): string | null {
  const link = (raw || '').match(X_LINK)?.[0];
  if (!link) return null;
  let path: string;
  try {
    path = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`).pathname;
  } catch {
    return null;
  }
  const m = POST_PATH.exec(path.replace(/[).,;:!?]+$/, ''));
  if (!m) return null;
  const id = m[1] ?? m[3] ?? '';
  if (!id) return null;
  return `https://x.com/${m[2] ?? 'i'}/status/${id}`;
}

export function isXUrl(raw: string): boolean {
  return sanitizeXUrl(raw) !== null;
}

// ─── step 1 · import ────────────────────────────────────────────────────────────────────────

/** Only images the site's own relay serves may be drawn onto the export canvas — anything else
 *  taints it and makes `toDataURL` throw at export time. */
function keepProxied(v: unknown): string[] {
  return (Array.isArray(v) ? v : [])
    .map((u) => String(u ?? ''))
    .filter((u) => u.startsWith('https://mrdaniel.co.il/api/img-proxy?url='))
    .slice(0, 4);
}

/** Only `video.twimg.com` mp4s are ever played, fetched or burned. Mirrors `isXVideoUrl` on the
 *  server: the burner fetches whatever survives this check, so an unchecked URL here would be a
 *  request the operator's browser makes on a crafted session's behalf. */
export function isXVideoUrl(raw: string): boolean {
  try {
    const u = new URL(String(raw || ''));
    return u.protocol === 'https:' && /(?:^|\.)video\.twimg\.com$/i.test(u.hostname) && /\.mp4$/i.test(u.pathname);
  } catch {
    return false;
  }
}

function normalizeVideo(raw: unknown): XVideo | undefined {
  const v = (raw && typeof raw === 'object' ? raw : null) as Partial<XVideo> | null;
  if (!v) return undefined;
  const variants = (Array.isArray(v.variants) ? v.variants : [])
    .map((x) => ({
      url: String(x?.url ?? ''),
      bitrate: Number(x?.bitrate) || 0,
      width: Number(x?.width) || 0,
      height: Number(x?.height) || 0,
    }))
    .filter((x) => isXVideoUrl(x.url));
  if (!variants.length) return undefined;
  const ratio = (Array.isArray(v.aspectRatio) ? v.aspectRatio.map(Number) : []).filter((n) => Number.isFinite(n) && n > 0);
  return {
    variants,
    poster: keepProxied([v.poster])[0] ?? '',
    durationMs: Math.max(0, Number(v.durationMs) || 0),
    aspectRatio: (ratio.length === 2 ? ratio : [16, 9]) as [number, number],
    kind: v.kind === 'animated_gif' ? 'animated_gif' : 'video',
  };
}

/**
 * Fills in the fields a post may be missing.
 *
 * A post can reach here from three places with three vintages: this build's server, a
 * sessionStorage entry written by a previous build, or the local paste parser. Deriving
 * `items` / `images` / `replyCount` from `posts` whenever they are absent means no consumer has to
 * defend against a half-populated object.
 */
export function normalizeXPost(raw: Partial<ImportedXPost> | null | undefined): ImportedXPost {
  const posts = (Array.isArray(raw?.posts) ? raw.posts : []).map((p) => String(p ?? '')).filter(Boolean);
  const items: XPost[] =
    Array.isArray(raw?.items) && raw.items.length === posts.length
      ? posts.map((text, i) => ({ text, images: keepProxied(raw.items?.[i]?.images) }))
      : posts.map((text) => ({ text, images: [] }));
  const video = normalizeVideo(raw?.video);
  const chars = posts.join(' ').trim().length;
  return {
    ok: Boolean(raw?.ok) || (posts.length > 0 && (chars >= MIN_X_CHARS || Boolean(video))),
    url: String(raw?.url ?? ''),
    id: String(raw?.id ?? ''),
    author: String(raw?.author ?? ''),
    authorName: String(raw?.authorName ?? ''),
    posts,
    items,
    images: [...new Set(items.flatMap((p) => p.images))].slice(0, 20),
    video,
    replyCount: Math.max(0, posts.length - 1),
    text: String(raw?.text ?? posts.join('\n\n')),
    via: (raw?.via ?? (posts.length ? 'manual' : 'none')) as ImportedXPost['via'],
    note: raw?.note,
  };
}

/**
 * Server-side import of a public X post: its text, images, video renditions, and the author's own
 * posts above it in a thread.
 *
 * Throws only on a transport/auth failure. A post that exists but can't be read (deleted, protected,
 * rate-limited) comes back as `ok:false` with a `note` — the UI shows that note and opens the paste
 * box, which is the documented fallback, not a failure.
 */
export async function importXPost(url: string): Promise<ImportedXPost> {
  const res = await postToAgent('parse-x-post', { url: sanitizeXUrl(url) ?? url }, 40000);
  if (!res.ok) throw new Error((await describeAiError(res)).message);
  const data = (await res.json()) as { ok?: boolean; blocked?: boolean; post?: Partial<ImportedXPost>; error?: string };
  if (data.blocked) throw new Error('התוכן שיובא נחסם ע"י מסנן התוכן.');
  if (!data.post) throw new Error(data.error || 'לא הצלחנו לקרוא את הפוסט — הדביקו את הטקסט ידנית.');
  return normalizeXPost(data.post);
}

/** X UI chrome that rides along when a post is copied out of the app. Mirrors the server's
 *  NOISE_LINE — a pasted post carries the same furniture a scraped one does. */
const NOISE_LINE =
  /^(?:\d[\d,.]*\s*[km]?\s*(?:likes?|replies|reposts?|views?|quotes?|bookmarks?|followers?|לייקים|תגובות|צפיות|עוקבים)\b.*|(?:log in|sign up|subscribe|follow|following|עקוב|עוקב|הרשמה|התחבר(?:ות)?)\s*$|(?:translate post|show more|read more|תרגם|הצג עוד)\b.*|(?:©|copyright)\s*\d{4}.*|\d+\s*[smhdwy]\s*(?:ago)?\s*$|(?:just now|לפני רגע)\s*$|(?:show this thread|הצג את השרשור)\s*$|\d[\d,.]*\s*[km]?\s*$|(?:replying to\b.*|מגיב ל.*)|\d{1,2}:\d{2}\s*(?:am|pm)?\s*[·•].*)$/i;
const PASTE_HEADER = /^\s*.*?@([A-Za-z0-9_]{1,15})\s*(?:[·•|]\s*\w+)?\s*$/;
const PART_MARKER = /^\s*(?:🧵\s*)?(?:\(?\d{1,2}\s*(?:\/\s*\d{1,2})?\s*[.):\/]|\d{1,2}\s*—|[-*•‣▪▶→]\s)\s*/;
const TCO_LINK = /https?:\/\/t\.co\/[A-Za-z0-9]+/g;

/** Local parse of a manually pasted post or thread. Mirrors `parseXRawText` on the server, so the
 *  paste path needs no round-trip at all. */
export function parseXRawText(raw: string, url = ''): ImportedXPost {
  const source = (raw || '').replace(/\r\n?/g, '\n').trim();
  const sourceLines = source.split('\n');
  const header = sourceLines[0]?.match(PASTE_HEADER)?.[1];
  const handle = header ?? sourceLines.slice(0, 2).join('\n').match(/@([A-Za-z0-9_]{1,15})/)?.[1] ?? '';
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
    if (clean.length < 15 && posts.length) posts[posts.length - 1] += `\n${clean}`;
    else posts.push(clean.slice(0, 3000));
  }

  const kept = posts.slice(0, 30);
  const chars = kept.join(' ').trim().length;
  return normalizeXPost({
    ok: kept.length > 0 && chars >= MIN_X_CHARS,
    url: sanitizeXUrl(url) ?? url.trim(),
    author: handle ? `@${handle}` : '',
    posts: kept,
    text: kept.join('\n\n'),
    via: kept.length ? 'manual' : 'none',
    note: !kept.length
      ? 'לא נמצא טקסט שמיש בהדבקה.'
      : chars < MIN_X_CHARS
        ? `הטקסט שהודבק קצר מדי (${chars} תווים) — נדרשים לפחות ${MIN_X_CHARS} תווים ליצירת קרוסלה.`
        : undefined,
  });
}

// ─── step 2 · Hebrew subtitles ──────────────────────────────────────────────────────────────

/**
 * The rendition the burner plays and the one the transcriber reads are picked differently on
 * purpose: the burn wants the sharpest picture the browser can decode, the transcript wants the
 * fewest bytes that still carry the speech.
 *
 * `maxHeight` caps the burn pick because a 2094×1080 source re-encoded frame-by-frame in a tab is
 * minutes of work for a clip nobody will publish above 1080×1350.
 */
export function pickPlaybackVariant(video: XVideo | undefined, maxHeight = 1080): XVideoVariant | undefined {
  if (!video?.variants.length) return undefined;
  const descending = [...video.variants].sort((a, b) => b.width * b.height - a.width * a.height);
  return descending.find((v) => v.height > 0 && v.height <= maxHeight) ?? descending[descending.length - 1];
}

/** The smallest rendition still worth transcribing — the subtitle pass reads speech, not detail.
 *  Mirrors `pickTranscriptionVariant` in src/server/xPostFetcher.ts. */
export function pickTranscriptionVariant(video: XVideo | undefined, minHeight = 270): XVideoVariant | undefined {
  if (!video?.variants.length) return undefined;
  const ascending = [...video.variants].sort((a, b) => a.width * a.height - b.width * b.height || a.bitrate - b.bitrate);
  return ascending.find((v) => v.height >= minHeight) ?? ascending[0];
}

export interface SubtitleResult extends SubtitleTrack {
  srt: string;
  vtt: string;
}

/**
 * Transcribe the post's video and translate it into timed Hebrew cues.
 *
 * Throws, deliberately — unlike deck synthesis there is no honest local fallback for "what was said
 * in this clip", and inventing one would put fabricated Hebrew on a published video. Every failure
 * here has an operator action: shorten the clip, retry after the rate limit, or skip subtitles and
 * build the carousel from the post text alone.
 */
export async function fetchXSubtitles(video: XVideo, notes?: string): Promise<SubtitleResult> {
  if (video.kind === 'animated_gif') throw new Error('הפוסט מכיל GIF מונפש ללא פס קול — אין מה לתמלל.');
  const variant = pickTranscriptionVariant(video);
  if (!variant) throw new Error('לא נמצאה גרסת MP4 של הסרטון בפוסט הזה.');
  if (video.durationMs > MAX_VIDEO_SECONDS * 1000) {
    throw new Error(
      `הסרטון ארוך מדי לתמלול (${Math.round(video.durationMs / 60000)} דקות). המגבלה היא ${MAX_VIDEO_SECONDS / 60} דקות.`
    );
  }
  // The model reads the whole clip; a long one legitimately takes minutes, so this gets its own
  // ceiling rather than the 90s default every text action shares.
  const res = await postToAgent(
    'x-subtitles',
    {
      videoUrl: variant.url,
      durationMs: video.durationMs,
      width: variant.width,
      height: variant.height,
      notes: notes?.trim() || undefined,
    },
    180000
  );
  if (!res.ok) throw new Error((await describeAiError(res)).message);
  const data = (await res.json()) as {
    ok?: boolean;
    blocked?: boolean;
    track?: Partial<SubtitleTrack>;
    srt?: string;
    vtt?: string;
    error?: string;
  };
  if (data.blocked) throw new Error('התמלול נחסם ע"י מסנן התוכן.');
  if (!data.ok || !data.track) throw new Error(data.error || 'תמלול הסרטון נכשל.');
  // Re-normalised client-side rather than trusted: this is the same repair the cue editor runs
  // after every operator edit, so a restored session and a fresh run hold the identical invariants.
  const cues = normalizeCues((data.track.cues ?? []) as SubtitleCue[], video.durationMs);
  return {
    cues,
    sourceLanguage: String(data.track.sourceLanguage ?? ''),
    durationMs: video.durationMs,
    transcript: cuesToTranscript(cues),
    srt: String(data.srt ?? ''),
    vtt: String(data.vtt ?? ''),
  };
}

// ─── step 3 · translate, adapt & lay out ────────────────────────────────────────────────────

function buildFallbackDeck(post: ImportedXPost, transcript: string, reason: string): TechTipDeck {
  // The transcript is already Hebrew (the subtitle pass translated it), so on a video post this
  // fallback is a genuinely usable draft rather than an untranslated one. Split on sentence breaks
  // so a segment is a slide's worth, mirroring `segmentTranscript` in the server agent.
  const spoken = transcript
    ? (transcript.match(/[^.!?׃]+[.!?׃]+|\S+$/g) ?? [transcript]).reduce<string[]>((acc, sentence) => {
        const last = acc[acc.length - 1];
        if (last && last.split(/\s+/).length < 60) acc[acc.length - 1] = `${last} ${sentence.trim()}`;
        else acc.push(sentence.trim());
        return acc;
      }, [])
    : [];
  const segments = [...post.posts.filter((p) => p.trim()), ...spoken.slice(0, 10)];
  return buildLocalDeck({
    segments: segments.length ? segments : [post.text].filter(Boolean),
    images: segments.map((_s, i) => (i === 0 ? post.images[0] : post.items[i]?.images[0]) ?? ''),
    reason,
    fallbackTitle: 'פוסט מ-X',
  });
}

/** Translate, adapt and lay out an imported X post (plus its video transcript, when one was
 *  produced) into a themed Hebrew deck. Never throws. */
export async function synthesizeXDeck(post: ImportedXPost, transcript = '', notes?: string): Promise<TechTipDeck> {
  const posts = post.posts.filter((p) => p.trim());
  const sourceChars = `${posts.join(' ')} ${transcript}`.trim().length;
  if (sourceChars < MIN_X_CHARS) {
    return buildFallbackDeck(
      post,
      transcript,
      `אין מספיק טקסט מקור לעיבוד AI (${sourceChars} תווים, נדרשים ${MIN_X_CHARS}) — הדביקו את טקסט הפוסט או הפיקו כתוביות`
    );
  }
  try {
    const res = await postToAgent('x-post-deck', {
      post: {
        url: post.url || undefined,
        id: post.id || undefined,
        author: post.author || undefined,
        authorName: post.authorName || undefined,
        posts,
        items: post.items,
      },
      transcript: transcript.trim() || undefined,
      notes: notes?.trim() || undefined,
    });
    if (!res.ok) return buildFallbackDeck(post, transcript, (await describeAiError(res)).message);
    const data = (await res.json()) as {
      ok?: boolean;
      blocked?: boolean;
      synthesized?: boolean;
      fallbackReason?: string;
      topic?: ThreadTopicProfile;
      deck?: { title: string; slides: TechTipSlide[]; hashtags: string[] };
    };
    if (data.blocked) return buildFallbackDeck(post, transcript, 'הפלט נחסם ע"י מסנן התוכן');
    if (!data.ok || !data.deck || !Array.isArray(data.deck.slides) || data.deck.slides.length < 5) {
      return buildFallbackDeck(post, transcript, 'מנוע ה-AI לא החזיר דק שמיש');
    }
    return {
      title: data.deck.title || posts[0]?.slice(0, 80) || 'פוסט מ-X',
      slides: renumberSteps(data.deck.slides),
      hashtags: data.deck.hashtags?.length ? data.deck.hashtags : ['#AI', '#אוטומציה', '#כלים'],
      // The agent serves its own source-faithful deck when the model's output is unusable and says
      // so here — reporting that as synthesised would hide a real degradation from the operator.
      synthesized: data.synthesized !== false,
      fallbackReason: data.fallbackReason,
      topic: data.topic,
      createdAt: Date.now(),
    };
  } catch (e) {
    return buildFallbackDeck(post, transcript, (e as Error).message || 'שגיאת רשת מול מנוע ה-AI');
  }
}

/**
 * Ready-to-paste caption for an adapted X deck.
 *
 * Carries no source attribution, per the repo-wide rule that the only brand on generated output is
 * mrdaniel.co.il (AGENTS.md; the server's `stripSourceCredits` enforces the same on slide copy).
 * When the agent picked a guide, the caption promotes that exact link — the same one the CTA slide
 * refers to, so the carousel and its caption never point at two different places.
 */
export function xDeckCaption(deck: TechTipDeck): string {
  const first = deck.slides.find((s) => s.body)?.body ?? '';
  const link = deck.slides.find((s) => s.kind === 'cta')?.ctaUrl ?? '';
  return [
    deck.title,
    '',
    first.slice(0, 220),
    '',
    'החליקו לכל השקפים ➔',
    link ? `המדריך המלא: ${link}` : 'עוד מדריכים ב-mrdaniel.co.il',
    '',
    deck.hashtags.join(' '),
  ]
    .join('\n')
    .trim();
}

// ─── session persistence ────────────────────────────────────────────────────────────────────

/**
 * The imported post, its subtitle track and the adapted deck survive a tab switch and a hot reload,
 * the same way the Threads importer's state does. Rendered PNGs and the burned MP4 are NOT
 * persisted — the PNGs re-render from the deck in a second, and a video blob blows the ~5 MB
 * sessionStorage quota on its own.
 */
const STATE_KEY = 'x-importer:v1';

export interface PersistedXState {
  post: ImportedXPost;
  deck: TechTipDeck | null;
  cues: SubtitleCue[];
  sourceLanguage: string;
  url: string;
  notes: string;
  savedAt: number;
}

export function saveXState(state: PersistedXState): void {
  try {
    window.sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode — non-fatal, state stays in React */
  }
}

export function loadXState(): PersistedXState | null {
  try {
    const raw = window.sessionStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedXState;
    if (!parsed?.post || !Array.isArray(parsed.post.posts)) return null;
    if (parsed.deck && !Array.isArray(parsed.deck.slides)) parsed.deck = null;
    return {
      ...parsed,
      post: normalizeXPost(parsed.post),
      cues: Array.isArray(parsed.cues) ? parsed.cues : [],
      sourceLanguage: String(parsed.sourceLanguage ?? ''),
    };
  } catch {
    return null;
  }
}

export function clearXState(): void {
  try {
    window.sessionStorage.removeItem(STATE_KEY);
  } catch {
    /* ignore */
  }
}
