import { describeAiError } from './aiErrors';
import { renumberSteps, type TechTipDeck, type TechTipSlide } from './techTipsApi';
import { postToAgent, buildLocalDeck, type ThreadTopicProfile } from './threadsImportApi';

/**
 * Instagram → Hebrew carousel — content layer for the dashboard's "יבוא מ-Instagram" tab.
 *
 * Two server round-trips, both through /api/agent-generate (no new Vercel Function — the project is
 * at the Hobby 12-function cap):
 *   1. `parse-instagram` → fetch the caption, the carousel's frames and the text printed on them
 *                          (`src/server/instagramFetcher.ts`).
 *   2. `instagram-deck`  → the dedicated agent (`src/server/agents/instagramAgent.ts`): Hebrew
 *                          adaptation, then theme, badges, step indicators, prompt boxes and a CTA
 *                          pointed at whichever live `/g/<slug>` guide matches the topic.
 *
 * The deck type is deliberately TechTipDeck, so the entire existing pipeline — techTipRenderer (PNG
 * carousel + ZIP), motionStudioService (9:16 reel), the preview player — works on this output with
 * no changes. This tab adds a source, not a second pipeline; the retry helper and the offline
 * fallback deck are imported from the Threads importer for exactly the same reason.
 *
 * Deck synthesis NEVER throws: on 429/503/network/thin output it returns a deterministic deck built
 * from the post's OWN caption (untranslated, clearly marked), so the studio always has something
 * real to render. Import DOES surface errors, because a failed import has a concrete operator
 * action attached to it — paste the caption manually.
 */

/** One frame of the post: the text Instagram's OCR read off it, plus its proxied image URL. */
export interface InstagramSlide {
  text: string;
  image: string;
}

export interface ImportedInstagramPost {
  ok: boolean;
  url: string;
  code: string;
  author: string;
  caption: string;
  /** the caption split into reviewable lines */
  lines: string[];
  hashtags: string[];
  /** every image in the post, proxied and in order */
  images: string[];
  /** one entry per carousel frame */
  slides: InstagramSlide[];
  isCarousel: boolean;
  /** the caption with hashtags stripped — what the agent adapts */
  text: string;
  via: 'direct' | 'meta' | 'jina' | 'manual' | 'none';
  note?: string;
}

/** Minimum source characters for AI adaptation — mirrors MIN_CAPTION_CHARS in
 *  src/server/instagramFetcher.ts, so client and server agree on what "too thin" means. */
export const MIN_CAPTION_CHARS = 60;

export const EMPTY_POST: ImportedInstagramPost = {
  ok: false,
  url: '',
  code: '',
  author: '',
  caption: '',
  lines: [],
  hashtags: [],
  images: [],
  slides: [],
  isCarousel: false,
  text: '',
  via: 'none',
};

// ─── url handling ───────────────────────────────────────────────────────────────────────────

/** Mirrors normalizeInstagramUrl in src/server/instagramFetcher.ts: the first instagram.com post
 *  link anywhere in the input, so a pasted share text ("look at this https://…") validates. */
const INSTAGRAM_LINK = /(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/[^\s<>"'`]+/i;
const POST_PATH =
  /^\/(?:share\/)?(?:([A-Za-z0-9._]+)\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)(?:\/embed(?:\/captioned)?)?\/?$/i;
const SHARE_PATH = /^\/share\/([A-Za-z0-9_-]+)\/?$/i;

/**
 * The canonical post URL with share tracking (`?utm_source=ig_web_copy_link`, `?igsh=`, `?stkn=`,
 * `?img_index=`) dropped, or null when the input holds no Instagram post link. Only the path
 * survives, so tracking is removed by construction rather than by a blocklist.
 *
 * A bare `/share/<token>` link keeps its own path — the token is not a post code, and only the
 * server can resolve it (see `resolveShortTarget` in src/server/instagramFetcher.ts).
 */
export function sanitizeInstagramUrl(raw: string): string | null {
  const link = (raw || '').match(INSTAGRAM_LINK)?.[0];
  if (!link) return null;
  let path: string;
  try {
    path = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`).pathname;
  } catch {
    return null;
  }
  const clean = path.replace(/%40/gi, '').replace(/[).,;:!?]+$/, '');
  const m = POST_PATH.exec(clean);
  if (m) {
    const kind = (m[2] ?? 'p').toLowerCase();
    return `https://www.instagram.com/${kind === 'reels' ? 'reel' : kind}/${m[3]}/`;
  }
  const share = SHARE_PATH.exec(clean);
  return share ? `https://www.instagram.com/share/${share[1]}/` : null;
}

export function isInstagramUrl(raw: string): boolean {
  return sanitizeInstagramUrl(raw) !== null;
}

// ─── step 1 · import ────────────────────────────────────────────────────────────────────────

/** Only images the site's own relay serves may be drawn onto the export canvas — anything else
 *  taints it and makes `toDataURL` throw at export time. */
function keepProxied(url: unknown): string {
  const v = String(url ?? '');
  return v.startsWith('https://mrdaniel.co.il/api/img-proxy?url=') ? v : '';
}

/** "#tag" entries in the caption, deduped and in order. Mirrors extractHashtags on the server. */
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

/** The caption with its hashtags removed — what the agent adapts. Mirrors the server's
 *  captionWithoutHashtags: tags are metadata, and a 30-tag block read as prose becomes a slide
 *  made of keywords. */
export function captionWithoutHashtags(caption: string): string {
  return String(caption || '')
    .replace(/#[\p{L}\p{N}_]{2,60}/gu, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Caption furniture that is not content: a bare hashtag block, a "." spacer, an engagement ask. */
const NOISE_LINE =
  /^(?:[.•·─-╿\s]*|(?:#\S+\s*)+|(?:follow|follow me|follow for more|save this|share this|like and share|tag a friend|link in bio|credit|credits|source|via|dm me|turn on notifications)\b.*|(?:עקבו|שמרו|שתפו|תייגו|הקישור בביו|קרדיט|מקור)\b.*)$/i;

/** The caption as reviewable lines. Mirrors captionLines on the server. */
export function captionLines(caption: string): string[] {
  return String(caption || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !NOISE_LINE.test(l))
    .slice(0, 60);
}

/**
 * Fills in the fields a post may be missing.
 *
 * A post can reach here from three places: this build's server, a sessionStorage entry written by
 * an earlier build, or the local paste parser. Deriving `lines` / `hashtags` / `images` from the
 * caption and frames whenever they are absent means no consumer has to defend against a
 * half-populated object.
 */
export function normalizePost(raw: Partial<ImportedInstagramPost> | null | undefined): ImportedInstagramPost {
  const caption = String(raw?.caption ?? raw?.text ?? '');
  const text = String(raw?.text ?? captionWithoutHashtags(caption));
  const slides: InstagramSlide[] = (Array.isArray(raw?.slides) ? raw.slides : [])
    .slice(0, 20)
    .map((s) => ({ text: String(s?.text ?? ''), image: keepProxied(s?.image) }))
    .filter((s) => s.text || s.image);
  return {
    ok: Boolean(raw?.ok),
    url: String(raw?.url ?? ''),
    code: String(raw?.code ?? ''),
    author: String(raw?.author ?? ''),
    caption,
    lines: Array.isArray(raw?.lines) && raw.lines.length ? raw.lines.map(String) : captionLines(text),
    hashtags: Array.isArray(raw?.hashtags) && raw.hashtags.length ? raw.hashtags.map(String) : extractHashtags(caption),
    images: slides.map((s) => s.image).filter(Boolean),
    slides,
    isCarousel: Boolean(raw?.isCarousel ?? slides.length > 1),
    text,
    via: (raw?.via ?? (text ? 'manual' : 'none')) as ImportedInstagramPost['via'],
    note: raw?.note,
  };
}

/**
 * Server-side import of a public Instagram post, carousel or reel.
 *
 * Throws only on a transport/auth failure. A post that exists but can't be read (private account,
 * login wall, rate limit) comes back as `ok:false` with a `note` — the UI shows that note and opens
 * the paste box, which is the documented fallback, not a failure.
 */
export async function importInstagramPost(url: string): Promise<ImportedInstagramPost> {
  const res = await postToAgent('parse-instagram', { url: sanitizeInstagramUrl(url) ?? url }, 30000);
  if (!res.ok) throw new Error((await describeAiError(res)).message);
  const data = (await res.json()) as {
    ok?: boolean;
    blocked?: boolean;
    post?: Partial<ImportedInstagramPost>;
    error?: string;
  };
  if (data.blocked) throw new Error('התוכן שיובא נחסם ע"י מסנן התוכן.');
  if (!data.post) throw new Error(data.error || 'לא הצלחנו לקרוא את הפוסט — הדביקו את הכיתוב ידנית.');
  return normalizePost(data.post);
}

/** The header line a copied Instagram caption opens with: "fullstackparody · 3h", "@handle". */
const PASTE_HEADER = /^\s*@?([A-Za-z0-9._]{2,30})\s*(?:[·•|]\s*\d+\s*[hdwmy]\b.*)?$/;

/**
 * Local parse of a manually pasted caption — no round-trip. Mirrors parseInstagramRawText on the
 * server so the paste path behaves identically whether it runs here or there.
 */
export function parseInstagramRawText(raw: string, url = ''): ImportedInstagramPost {
  const lines = (raw || '').replace(/\r\n?/g, '\n').split('\n');
  const trimmed = lines.map((l) => l.trim()).filter(Boolean);
  const header = trimmed[0]?.match(PASTE_HEADER)?.[1];
  // An @mention deeper in the caption is someone the author was talking about, not them.
  const handle = header ?? trimmed.slice(0, 2).join('\n').match(/@([A-Za-z0-9._]{2,30})/)?.[1] ?? '';
  // That header is app furniture, not content — dropped so it can't open the deck.
  const caption = (lines.length && PASTE_HEADER.test(lines[0].trim()) ? lines.slice(1) : lines).join('\n').trim();
  const text = captionWithoutHashtags(caption);
  const chars = text.trim().length;
  return normalizePost({
    ok: chars >= MIN_CAPTION_CHARS,
    url: sanitizeInstagramUrl(url) ?? url.trim(),
    author: handle ? `@${handle}` : '',
    caption,
    text,
    via: chars ? 'manual' : 'none',
    note: !chars
      ? 'לא נמצא טקסט שמיש בהדבקה.'
      : chars < MIN_CAPTION_CHARS
        ? `הטקסט שהודבק קצר מדי (${chars} תווים) — נדרשים לפחות ${MIN_CAPTION_CHARS} תווים ליצירת קרוסלה.`
        : undefined,
  });
}

// ─── step 2 · adapt & lay out ───────────────────────────────────────────────────────────────

/** The offline deck, built from the post's own caption paragraphs. Shared with the Threads
 *  importer — same honest-draft contract, same amber "גיבוי מקומי" badge. */
function buildFallbackDeck(post: ImportedInstagramPost, reason: string): TechTipDeck {
  const segments = (post.text || post.caption)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return buildLocalDeck({
    segments: segments.length ? segments : [post.text].filter(Boolean),
    // A carousel's frames are already in reading order, so frame i backs segment i directly.
    images: post.images,
    reason,
    fallbackTitle: 'פוסט מאינסטגרם',
  });
}

/** Translate, adapt and lay out an imported post into a themed Hebrew deck. Never throws. */
/** The three cream & terracotta presets, plus the existing dark 'creator' default. Mirrors
 *  InstagramVisualPreset in src/server/agents/instagramAgent.ts — kept in sync by hand since the
 *  two live in different packages. */
export type InstagramVisualPreset = 'creator' | 'cream-skill' | 'cream-workflow' | 'cream-prompt-library';

export async function synthesizeInstagramDeck(
  post: ImportedInstagramPost,
  notes?: string,
  opts: { useSlideText?: boolean; visualPreset?: InstagramVisualPreset } = {}
): Promise<TechTipDeck> {
  const useSlideText = opts.useSlideText ?? true;
  // Mirrors MIN_CAPTION_CHARS on the server. Below it there is not enough source text for a deck,
  // and calling the model anyway just spends quota to get this same fallback back. Does NOT apply
  // to the prompt-library preset: its content is printed on the carousel frames, not the caption
  // (the real target post's caption is 57 chars), so a frame image is what it needs instead.
  const sourceChars = captionWithoutHashtags(post.caption || post.text).trim().length;
  const isPromptLibrary = opts.visualPreset === 'cream-prompt-library';
  if (!isPromptLibrary && sourceChars < MIN_CAPTION_CHARS) {
    return buildFallbackDeck(
      post,
      `כיתוב הפוסט קצר מדי לעיבוד AI (${sourceChars} תווים, נדרשים ${MIN_CAPTION_CHARS}) — הדביקו את הכיתוב המלא`
    );
  }
  if (isPromptLibrary && !post.slides.some((s) => s.image)) {
    return buildFallbackDeck(post, 'לא נמצאו תמונות שקופיות לקריאה חזותית — עיצוב "ספריית פרומפטים" דורש קרוסלה עם תמונות');
  }
  try {
    // The whole post goes over, frames included, so the agent can place each frame's own image on
    // the slide it became and read the carousel's structure off its printed text.
    const res = await postToAgent('instagram-deck', {
      post: {
        caption: post.caption,
        text: post.text,
        slides: post.slides,
        author: post.author || undefined,
        url: post.url || undefined,
        code: post.code || undefined,
        via: post.via,
      },
      notes: notes?.trim() || undefined,
      useSlideText,
      visualPreset: opts.visualPreset ?? 'creator',
    });
    if (!res.ok) return buildFallbackDeck(post, (await describeAiError(res)).message);
    const data = (await res.json()) as {
      ok?: boolean;
      blocked?: boolean;
      synthesized?: boolean;
      fallbackReason?: string;
      topic?: ThreadTopicProfile;
      deck?: { title: string; slides: TechTipSlide[]; hashtags: string[] };
    };
    if (data.blocked) return buildFallbackDeck(post, 'הפלט נחסם ע"י מסנן התוכן');
    if (!data.ok || !data.deck || !Array.isArray(data.deck.slides) || data.deck.slides.length < 5) {
      return buildFallbackDeck(post, 'מנוע ה-AI לא החזיר דק שמיש');
    }
    return {
      title: data.deck.title || post.lines[0]?.slice(0, 80) || 'פוסט מאינסטגרם',
      slides: renumberSteps(data.deck.slides),
      hashtags: data.deck.hashtags?.length ? data.deck.hashtags : ['#AI', '#אוטומציה', '#עסקים'],
      // The agent serves its own source-faithful deck when the model's output is unusable, and says
      // so here — reporting that as synthesised would hide a real degradation from the operator.
      synthesized: data.synthesized !== false,
      fallbackReason: data.fallbackReason,
      topic: data.topic,
      createdAt: Date.now(),
    };
  } catch (e) {
    return buildFallbackDeck(post, (e as Error).message || 'שגיאת רשת מול מנוע ה-AI');
  }
}

/**
 * Ready-to-paste Instagram caption for an adapted deck.
 *
 * Carries no source attribution, per the repo-wide rule that the only brand on generated output is
 * mrdaniel.co.il. The SOURCE post's hashtags are deliberately not reused either — they are tuned to
 * someone else's audience, and the deck's own are generated from its adapted Hebrew content.
 */
export function instagramDeckCaption(deck: TechTipDeck): string {
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
 * The imported post + adapted deck survive a tab switch and a hot reload, the same way the Threads
 * importer's do. Rendered PNGs are NOT persisted — they re-render from the deck in a second, and a
 * 12-slide data-URL set blows the ~5 MB sessionStorage quota.
 */
const STATE_KEY = 'instagram-importer:v1';

export interface PersistedInstagramState {
  post: ImportedInstagramPost;
  deck: TechTipDeck | null;
  url: string;
  notes: string;
  /** Absent on a session written before the cream presets shipped — restored as 'creator'. */
  visualPreset?: InstagramVisualPreset;
  savedAt: number;
}

export function saveInstagramState(state: PersistedInstagramState): void {
  try {
    window.sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode — non-fatal, state stays in React */
  }
}

export function loadInstagramState(): PersistedInstagramState | null {
  try {
    const raw = window.sessionStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedInstagramState;
    if (!parsed?.post) return null;
    if (parsed.deck && !Array.isArray(parsed.deck.slides)) parsed.deck = null;
    const preset = parsed.visualPreset;
    const visualPreset: InstagramVisualPreset =
      preset === 'cream-skill' || preset === 'cream-workflow' || preset === 'cream-prompt-library' ? preset : 'creator';
    return { ...parsed, post: normalizePost(parsed.post), visualPreset };
  } catch {
    return null;
  }
}

export function clearInstagramState(): void {
  try {
    window.sessionStorage.removeItem(STATE_KEY);
  } catch {
    /* ignore */
  }
}
