import { SITE_ORIGIN } from './useDashboardRefresh';
import { getAdminSecret } from './adminSecret';
import { describeAiError } from './aiErrors';
import { renumberSteps, type TechTipDeck, type TechTipSlide, type ThreadTheme } from './techTipsApi';

/**
 * Threads → Hebrew carousel — content layer for the dashboard's "יבוא מ-Threads" tab.
 *
 * Two server round-trips, both through /api/agent-generate (no new Vercel Function — the project
 * is at the Hobby 12-function cap):
 *   1. `parse-thread`  → fetch the post AND the author's own sub-replies, with their images
 *                        (`src/server/threadsThreadFetcher.ts`).
 *   2. `thread-deck`   → the dedicated agent (`src/server/agents/threadsThreadAgent.ts`): Hebrew
 *                        adaptation, then theme, badges, step indicators, prompt boxes and a CTA
 *                        pointed at whichever live `/g/<slug>` guide matches the topic.
 *
 * The deck type is deliberately TechTipDeck, so the entire existing Tech-Tips pipeline —
 * techTipRenderer (PNG carousel + ZIP), motionStudioService (9:16 reel), the preview player —
 * works on this output with no changes.
 *
 * Like every other client lib here, deck synthesis NEVER throws: on 429/503/network/thin output it
 * returns a deterministic deck built from the thread's OWN text (untranslated, clearly marked), so
 * the studio always has something real to render. Import DOES surface errors, because a failed
 * import has a concrete operator action attached to it — paste the thread manually.
 */

/** One post in the thread: its text plus any images it carried (already same-origin-proxied). */
export interface ThreadPost {
  text: string;
  images: string[];
}

export interface ImportedThread {
  ok: boolean;
  url: string;
  author: string;
  posts: string[];
  /** the same chain with each post's images attached */
  items: ThreadPost[];
  /** every image in the thread, deduped and in order */
  images: string[];
  /** sub-replies by the same author under the main post */
  replyCount: number;
  text: string;
  via: 'direct' | 'meta' | 'jina' | 'manual' | 'none';
  note?: string;
}

/** The agent's read of the thread's subject. Mirrors ThreadTopicProfile in the agent module. */
export interface ThreadTopicProfile {
  theme: ThreadTheme;
  badge: string;
  guideSlug: string;
  signals: string[];
}

/** Minimum source characters for AI adaptation - mirrors MIN_THREAD_CHARS in
 *  src/server/threadsThreadFetcher.ts, so client and server agree on what "too thin" means. */
export const MIN_THREAD_CHARS = 60;

export const EMPTY_THREAD: ImportedThread = {
  ok: false,
  url: '',
  author: '',
  posts: [],
  items: [],
  images: [],
  replyCount: 0,
  text: '',
  via: 'none',
};

const ENDPOINT = `${SITE_ORIGIN.replace(/\/$/, '')}/api/agent-generate`;

/** Mirrors normalizeThreadsUrl in src/server/threadsThreadFetcher.ts: the first threads.net /
 *  threads.com post link anywhere in the input, so a pasted share text ("look at this https://…")
 *  validates. */
const THREADS_LINK = /(?:https?:\/\/)?(?:www\.|m\.)?threads\.(?:net|com)\/[^\s<>"'`]+/i;
const POST_PATH =
  /^\/(?:@([A-Za-z0-9._]+)\/post\/([A-Za-z0-9_-]+)|(t|share|p)\/([A-Za-z0-9_-]+))(?:\/(?:media|embed))?\/?$/i;

/** The canonical post URL with share tracking (`?xmt=`, `?igshid=`, …) dropped, or null when the
 *  input holds no Threads post link. Only the path survives, so tracking is removed by
 *  construction rather than by a blocklist.
 *
 *  A SHORT link keeps its own path. This used to rewrite `/share/<token>` to `/t/<token>` before
 *  sending it on, which silently broke every share link the operator pasted: only the `/share/`
 *  form redirects to the post, so the server received a URL that could never resolve and the import
 *  always fell back to manual paste. The server resolves the short form itself — see
 *  `resolveShortTarget` in src/server/threadsThreadFetcher.ts. */
export function sanitizeThreadsUrl(raw: string): string | null {
  const link = (raw || '').match(THREADS_LINK)?.[0];
  if (!link) return null;
  let path: string;
  try {
    path = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`).pathname;
  } catch {
    return null;
  }
  const m = POST_PATH.exec(path.replace(/%40/gi, '@').replace(/[).,;:!?]+$/, ''));
  if (!m) return null;
  if (m[1]) return `https://www.threads.com/@${m[1]}/post/${m[2]}`;
  const kind = (m[3] ?? 't').toLowerCase();
  return kind === 'share' ? `https://www.threads.com/share/${m[4]}/` : `https://www.threads.com/${kind}/${m[4]}`;
}

export function isThreadsUrl(raw: string): boolean {
  return sanitizeThreadsUrl(raw) !== null;
}

/**
 * Shared POST helper with one bounded 429 retry (Gemini free-tier hourly cap) and one 5xx retry.
 *
 * Exported because the Instagram importer (`instagramImportApi.ts`) talks to the same endpoint with
 * the same auth header and needs the same retry behaviour; a second copy would be one place for the
 * 429 backoff to silently diverge.
 */
export async function postToAgent(action: string, body: Record<string, unknown>, timeoutMs = 90000): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(getAdminSecret() ? { 'x-admin-secret': getAdminSecret() } : {}),
  };
  const payload = JSON.stringify({ action, ...body });
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(ENDPOINT, { method: 'POST', headers, body: payload, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (attempt >= 1) return res;
    if (res.status === 429) {
      let waitMs = 6000;
      try {
        const j = (await res.clone().json()) as { retryAfterSeconds?: number };
        if (typeof j.retryAfterSeconds === 'number') waitMs = Math.min(12000, Math.max(3000, j.retryAfterSeconds * 1000));
      } catch {
        /* keep default */
      }
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    if (res.status >= 500) {
      await new Promise((r) => setTimeout(r, 800));
      continue;
    }
    return res;
  }
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

/**
 * Fills in the fields a thread may be missing.
 *
 * A thread can reach here from three places with three vintages: this build's server, a
 * sessionStorage entry written by the previous build, or the local paste parser. Deriving
 * `items` / `images` / `replyCount` from `posts` whenever they are absent means no consumer has to
 * defend against a half-populated object.
 */
export function normalizeThread(raw: Partial<ImportedThread> | null | undefined): ImportedThread {
  const posts = (Array.isArray(raw?.posts) ? raw.posts : []).map((p) => String(p ?? '')).filter(Boolean);
  const items: ThreadPost[] =
    Array.isArray(raw?.items) && raw.items.length === posts.length
      ? posts.map((text, i) => ({ text, images: keepProxied(raw.items?.[i]?.images) }))
      : posts.map((text) => ({ text, images: [] }));
  const images = [...new Set(items.flatMap((p) => p.images))].slice(0, 20);
  return {
    ok: Boolean(raw?.ok),
    url: String(raw?.url ?? ''),
    author: String(raw?.author ?? ''),
    posts,
    items,
    images,
    replyCount: Math.max(0, posts.length - 1),
    text: String(raw?.text ?? posts.join('\n\n')),
    via: (raw?.via ?? (posts.length ? 'manual' : 'none')) as ImportedThread['via'],
    note: raw?.note,
  };
}

/**
 * Server-side import of a public Threads post and the author's own sub-replies.
 *
 * Throws only on a transport/auth failure. A post that exists but can't be read (login wall, rate
 * limit) comes back as `ok:false` with a `note` — the UI shows that note and opens the paste box,
 * which is the documented fallback, not a failure.
 */
export async function importThread(url: string): Promise<ImportedThread> {
  const res = await postToAgent('parse-thread', { url: sanitizeThreadsUrl(url) ?? url }, 30000);
  if (!res.ok) throw new Error((await describeAiError(res)).message);
  const data = (await res.json()) as { ok?: boolean; blocked?: boolean; thread?: Partial<ImportedThread>; error?: string };
  if (data.blocked) throw new Error('התוכן שיובא נחסם ע"י מסנן התוכן.');
  if (!data.thread) throw new Error(data.error || 'לא הצלחנו לקרוא את השרשור — הדביקו את הטקסט ידנית.');
  return normalizeThread(data.thread);
}

/** Threads UI chrome that rides along when a post is copied out of the app. Mirrors the server's
 *  NOISE_LINE — a pasted post carries the same furniture a scraped one does. */
const NOISE_LINE =
  /^(?:\d[\d,.]*\s*[km]?\s*(?:likes?|replies|reposts?|views?|comments?|followers?|threads|לייקים|תגובות|צפיות|עוקבים)\b.*|(?:log in|sign up|continue with instagram|התחבר(?:ות)?|הרשמה)\b.*|(?:translate|see translation|תרגם|הצג תרגום)\b.*|(?:more|see more|show more|עוד|הצג עוד)\s*$|(?:follow|following|עקוב|עוקב)\s*$|threads\s*$|instagram\s*$|(?:©|copyright)\s*\d{4}.*|meta platforms.*|(?:privacy|terms|cookies?)\s*(?:policy|notice)?\s*$|\d+\s*[hdwmy]\s*(?:ago)?\s*$|(?:just now|לפני רגע)\s*$|\d[\d,.]*\s*[km]?\s*$|[·•]?\s*author\s*$|edited\s*$|pinned\s*$|liked by (?:the )?original author\s*$|view activity\s*$)$/i;

/** The header line a copied Threads post opens with: "username · 3h" (handle, then an age). */
const PASTE_HEADER = /^\s*@?([A-Za-z0-9._]{2,30})\s*[·•|]\s*\d+\s*[hdwmy]\b.*$/;

/** A line that opens a new part of a thread. Mirrors PART_MARKER in the server fetcher: ordinals
 *  ("1/", "2/7", "🧵 3.") and bulleted items, since authors number a thread both ways. */
const PART_MARKER = /^\s*(?:🧵\s*)?(?:\(?\d{1,2}\s*(?:\/\s*\d{1,2})?\s*[.):\/]|\d{1,2}\s*—|[-*•‣▪▶→]\s)\s*/;

/** Local split of a manually pasted thread. Mirrors the server fetcher's splitter so the paste
 *  path needs no round-trip at all. */
export function parseThreadRawText(raw: string, url = ''): ImportedThread {
  const source = (raw || '').replace(/\r\n?/g, '\n').trim();
  // Author = the "username · 3h" header a copied post opens with, else a handle in the first two
  // lines. An @mention deeper in the thread is someone the author was talking about, not them.
  const sourceLines = source.split('\n');
  const header = sourceLines[0]?.match(PASTE_HEADER)?.[1];
  const handle = header ?? sourceLines.slice(0, 2).join('\n').match(/@([A-Za-z0-9._]{2,30})/)?.[1] ?? '';
  // That header is app furniture, not content — dropped so it can't open the deck. Only the first
  // line is tested; the same shape mid-thread is a quoted post, i.e. real content.
  const text = (header ? sourceLines.slice(1) : sourceLines).join('\n').trimStart();
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

  const kept = posts.slice(0, 30);
  const chars = kept.join(' ').trim().length;
  return normalizeThread({
    ok: kept.length > 0 && chars >= MIN_THREAD_CHARS,
    url: url.trim(),
    author: handle ? `@${handle}` : '',
    posts: kept,
    text: kept.join('\n\n'),
    via: kept.length ? 'manual' : 'none',
    note: !kept.length
      ? 'לא נמצא טקסט שמיש בהדבקה.'
      : chars < MIN_THREAD_CHARS
        ? `הטקסט שהודבק קצר מדי (${chars} תווים) — נדרשים לפחות ${MIN_THREAD_CHARS} תווים ליצירת קרוסלה.`
        : undefined,
  });
}

// ─── step 2 · translate, adapt & lay out ────────────────────────────────────────────────────

const VISUAL_BASE =
  'abstract dark cyber technology background, deep obsidian, subtle circuit and node grid geometry, neon green and cyan accents, no text, no letters, no words, no logos, no watermark';

const MAX_TITLE_WORDS = 8;
const MAX_BODY_WORDS = 30;

/**
 * Offline twin of the agent's theme table (src/server/agents/threadsThreadAgent.ts).
 *
 * Only reached when the server never answered, so the local fallback deck still gets a sensible
 * accent and badge instead of rendering grey. Deliberately coarser than the server's — it exists to
 * avoid a colourless deck, not to reproduce the agent's scoring. Keep the families in sync.
 */
const LOCAL_THEMES: { theme: ThreadTheme; badge: string; re: RegExp }[] = [
  { theme: 'security', badge: 'Cyber Security', re: /\b(security|cyber|vulnerab|exploit|ransomware|phishing|zero[- ]?trust|injection)\b|סייבר|אבטח/i },
  { theme: 'web3', badge: 'Web3', re: /\b(web3|blockchain|solidity|ethereum|smart ?contract|nft|crypto)\b|בלוקצ|קריפטו/i },
  { theme: 'automation', badge: 'Automation', re: /\b(automation|automate|workflow|n8n|zapier|webhook|no-?code|zero[- ]?touch)\b|אוטומצ/i },
  { theme: 'ai', badge: 'AI & LLM', re: /\b(ai|llm|gpt|gemini|claude|openai|prompt|rag|embedding|agent|mcp)\b|בינה מלאכותית|פרומפט/i },
  { theme: 'data', badge: 'Data', re: /\b(data|sql|postgres|mongo|vector|analytics|database)\b|נתונים/i },
  { theme: 'code', badge: 'Engineering', re: /\b(python|typescript|javascript|react|docker|kubernetes|api|git|npm)\b|קוד|פיתוח/i },
];

export function localTopic(text: string): ThreadTopicProfile {
  const hit = LOCAL_THEMES.find((t) => t.re.test(text));
  return {
    theme: hit?.theme ?? 'general',
    badge: hit?.badge ?? 'Tech',
    // No guide is promised offline: the slug list lives on the server and guessing one risks a
    // dead link on a published carousel.
    guideSlug: '',
    signals: hit ? [`${hit.theme} (מקומי)`] : [],
  };
}

function clampWords(text: string, max: number): string {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  return words.length <= max ? words.join(' ') : words.slice(0, max).join(' ').replace(/[,;:\-–—״"']+$/, '').trim();
}

function slide(partial: Partial<TechTipSlide> & Pick<TechTipSlide, 'kind'>): TechTipSlide {
  return {
    kicker: 'מהשרשור',
    title: '',
    body: '',
    bullets: [],
    code: '',
    codeLang: '',
    stepNumber: 0,
    visualPrompt: VISUAL_BASE,
    ...partial,
  };
}

/**
 * Deterministic local deck built from an imported source's own text, used whenever the server is
 * unreachable. Deliberately honest: it does NOT machine-translate and does NOT invent Hebrew copy
 * — it carries the source text through, one segment per slide, so the operator can see exactly what
 * was imported and edit from there. `synthesized:false` drives the amber "גיבוי מקומי" badge.
 *
 * Source-agnostic: `segments` are the units a slide is built from (a thread's posts, an Instagram
 * caption's paragraphs) and `images` are that source's own published images in the same order, with
 * `images[0]` backing the cover and `images[i+1]` the i-th content slide. The Instagram importer
 * calls this too — the failure mode and the honest-draft contract are identical, and a second copy
 * would be one more place for the two tabs' offline decks to drift apart.
 */
export function buildLocalDeck(input: {
  segments: string[];
  images: string[];
  reason: string;
  /** cover title when the source yielded no usable first segment */
  fallbackTitle: string;
}): TechTipDeck {
  const source = input.segments.filter(Boolean);
  const topic = localTopic(source.join(' '));
  // Not run through sanitizeHebrewText: this text is the untranslated source (usually English),
  // and techTipRenderer already sanitises every string at draw time.
  const cover = clampWords(source[0] ?? input.fallbackTitle, MAX_TITLE_WORDS) || input.fallbackTitle;
  const content = source.slice(1, 11);
  const body = content.map((p, i) =>
    slide({
      kind: 'concept',
      kicker: `חלק ${i + 1}`,
      title: clampWords(p.split('\n')[0] ?? '', MAX_TITLE_WORDS),
      body: clampWords(p.replace(/\n+/g, ' '), MAX_BODY_WORDS),
      theme: topic.theme,
      badge: topic.badge,
      stepLabel: `${i + 1} / ${content.length}`,
      sourceImage: input.images[i + 1],
    })
  );

  return {
    title: cover,
    slides: [
      // No author credit on the cover either — same rule as the caption below.
      slide({
        kind: 'cover',
        kicker: 'טיוטה',
        title: cover,
        body: 'טקסט המקור כפי שיובא — לעריכה ידנית לפני פרסום.',
        theme: topic.theme,
        badge: topic.badge,
        sourceImage: input.images[0],
      }),
      ...body,
      slide({
        kind: 'cta',
        kicker: 'צעד הבא',
        title: 'רוצים את הגרסה המלאה?',
        body: 'עוד מדריכים, כלים ודוגמאות — ב-mrdaniel.co.il. עקבו לעוד תוכן על AI ואוטומציה לעסקים.',
        theme: topic.theme,
        badge: topic.badge,
      }),
    ],
    hashtags: ['#AI', '#אוטומציה', '#עסקים', '#טכנולוגיה'],
    synthesized: false,
    fallbackReason: input.reason,
    topic,
    createdAt: Date.now(),
  };
}

function buildFallbackDeck(thread: ImportedThread, reason: string): TechTipDeck {
  const segments = thread.posts.length ? thread.posts : [thread.text].filter(Boolean);
  return buildLocalDeck({
    segments,
    // Index i must line up with segment i, so each post contributes its OWN first image. The cover
    // is the exception and keeps the thread's first image overall: a thread whose root post carries
    // no media but whose second post does should still open on that picture rather than on nothing.
    images: segments.map((_p, i) => (i === 0 ? thread.images[0] : thread.items[i]?.images[0]) ?? ''),
    reason,
    fallbackTitle: 'שרשור מ-Threads',
  });
}

/** Translate, adapt and lay out an imported thread into a themed Hebrew deck. Never throws. */
export async function synthesizeThreadDeck(thread: ImportedThread, notes?: string): Promise<TechTipDeck> {
  const posts = thread.posts.filter((p) => p.trim());
  // Mirrors MIN_THREAD_CHARS on the server. Below it there is not enough source text for a deck,
  // and calling the model anyway just spends quota to get this same fallback back.
  const sourceChars = posts.join(' ').trim().length;
  if (sourceChars < MIN_THREAD_CHARS) {
    return buildFallbackDeck(
      thread,
      `טקסט השרשור קצר מדי לעיבוד AI (${sourceChars} תווים, נדרשים ${MIN_THREAD_CHARS}) — הדביקו את הטקסט המלא`
    );
  }
  try {
    // The whole thread goes over, images included, so the agent can place each post's own media on
    // the slide that post became.
    const res = await postToAgent('thread-deck', {
      thread: {
        posts,
        items: thread.items,
        author: thread.author || undefined,
        url: thread.url || undefined,
        via: thread.via,
      },
      notes: notes?.trim() || undefined,
    });
    if (!res.ok) return buildFallbackDeck(thread, (await describeAiError(res)).message);
    const data = (await res.json()) as {
      ok?: boolean;
      blocked?: boolean;
      synthesized?: boolean;
      fallbackReason?: string;
      topic?: ThreadTopicProfile;
      deck?: { title: string; slides: TechTipSlide[]; hashtags: string[] };
    };
    if (data.blocked) return buildFallbackDeck(thread, 'הפלט נחסם ע"י מסנן התוכן');
    if (!data.ok || !data.deck || !Array.isArray(data.deck.slides) || data.deck.slides.length < 5) {
      return buildFallbackDeck(thread, 'מנוע ה-AI לא החזיר דק שמיש');
    }
    return {
      title: data.deck.title || thread.posts[0]?.slice(0, 80) || 'שרשור מ-Threads',
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
    return buildFallbackDeck(thread, (e as Error).message || 'שגיאת רשת מול מנוע ה-AI');
  }
}

/**
 * Ready-to-paste Instagram caption for an adapted thread deck.
 *
 * Carries no source attribution, per the repo-wide rule that the only brand on generated output is
 * mrdaniel.co.il (see AGENTS.md; the server's `stripSourceCredits` enforces the same on slide copy).
 * When the agent picked a guide, the caption promotes that exact link — the same one printed on the
 * CTA slide, so the carousel and its caption never point at two different places.
 */
export function threadDeckCaption(deck: TechTipDeck): string {
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
 * The imported thread + adapted deck survive a tab switch and a hot reload, the same way the News
 * Agent's deck does (see deckPersistence.ts). Rendered PNGs are NOT persisted — they re-render
 * from the deck in a second, and a 12-slide data-URL set blows the ~5 MB sessionStorage quota.
 */
const STATE_KEY = 'threads-importer:v1';

export interface PersistedThreadState {
  thread: ImportedThread;
  deck: TechTipDeck | null;
  url: string;
  notes: string;
  savedAt: number;
}

export function saveThreadState(state: PersistedThreadState): void {
  try {
    window.sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode — non-fatal, state stays in React */
  }
}

export function loadThreadState(): PersistedThreadState | null {
  try {
    const raw = window.sessionStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedThreadState;
    if (!parsed?.thread || !Array.isArray(parsed.thread.posts)) return null;
    if (parsed.deck && !Array.isArray(parsed.deck.slides)) parsed.deck = null;
    // An entry written by the previous build has no items/images/replyCount — filled in here so the
    // restored session behaves exactly like a fresh import.
    return { ...parsed, thread: normalizeThread(parsed.thread) };
  } catch {
    return null;
  }
}

export function clearThreadState(): void {
  try {
    window.sessionStorage.removeItem(STATE_KEY);
  } catch {
    /* ignore */
  }
}
