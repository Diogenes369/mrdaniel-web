import { SITE_ORIGIN } from './useDashboardRefresh';
import { getAdminSecret, reportAuthFailure } from './adminSecret';
import { renumberSteps, type TechTipDeck, type TechTipSlide } from './techTipsApi';

/**
 * Threads → Hebrew carousel — content layer for the dashboard's "יבוא מ-Threads" tab.
 *
 * Two server round-trips, both through /api/agent-generate (no new Vercel Function — the project
 * is at the Hobby 12-function cap):
 *   1. `parse-thread`  → fetch & split a public Threads post into its individual posts.
 *   2. `thread-deck`   → translate/adapt those posts into a Hebrew TechTipDeck.
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

export interface ImportedThread {
  ok: boolean;
  url: string;
  author: string;
  posts: string[];
  text: string;
  via: 'direct' | 'oembed' | 'jina' | 'manual' | 'none';
  note?: string;
}

const ENDPOINT = `${SITE_ORIGIN.replace(/\/$/, '')}/api/agent-generate`;

const THREADS_URL =
  /^https?:\/\/(?:www\.)?threads\.(?:net|com)\/(?:@[A-Za-z0-9._]+\/post\/[A-Za-z0-9_-]+|t\/[A-Za-z0-9_-]+)/i;

export function isThreadsUrl(raw: string): boolean {
  const url = (raw || '').trim();
  return THREADS_URL.test(/^https?:\/\//i.test(url) ? url : `https://${url}`);
}

/** Shared POST helper with one bounded 429 retry (Gemini free-tier hourly cap) and one 5xx retry. */
async function post(action: string, body: Record<string, unknown>, timeoutMs = 90000): Promise<Response> {
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

function httpReason(status: number): string {
  if (status === 429) return 'מכסת ה-API של Gemini לשעה זו מוצתה (429)';
  if (status === 401) {
    // One actionable re-auth prompt — the usual cause is a build-time secret that went stale
    // after ADMIN_API_SECRET was rotated on the site.
    reportAuthFailure('agent-generate');
    return 'אימות מול /api/agent-generate נכשל (401)';
  }
  if (status === 503) return 'GEMINI_API_KEY לא מוגדר בסביבת השרת (503)';
  return `שרת ה-AI החזיר שגיאה ${status}`;
}

// ─── step 1 · import ────────────────────────────────────────────────────────────────────────

/**
 * Server-side import of a public Threads post.
 *
 * Throws only on a transport/auth failure. A post that exists but can't be read (login wall, rate
 * limit) comes back as `ok:false` with a `note` — the UI shows that note and opens the paste box,
 * which is the documented fallback, not a failure.
 */
export async function importThread(url: string): Promise<ImportedThread> {
  const res = await post('parse-thread', { url }, 30000);
  if (!res.ok) throw new Error(httpReason(res.status));
  const data = (await res.json()) as { ok?: boolean; blocked?: boolean; thread?: ImportedThread; error?: string };
  if (data.blocked) throw new Error('התוכן שיובא נחסם ע"י מסנן התוכן.');
  if (!data.thread) throw new Error(data.error || 'לא הצלחנו לקרוא את השרשור — הדביקו את הטקסט ידנית.');
  return data.thread;
}

/** Threads UI chrome that rides along when a post is copied out of the app. Mirrors the server's
 *  NOISE_LINE — a pasted post carries the same furniture a scraped one does. */
const NOISE_LINE =
  /^(?:\d[\d,.]*\s*(?:likes?|replies|reposts?|views?|comments?|לייקים|תגובות|צפיות)\b.*|(?:log in|sign up|התחבר(?:ות)?|הרשמה)\b.*|(?:translate|see translation|תרגם|הצג תרגום)\b.*|(?:more|see more|show more|עוד|הצג עוד)\s*$|(?:follow|following|עקוב|עוקב)\s*$|threads\s*$|instagram\s*$|(?:©|copyright)\s*\d{4}.*|meta platforms.*|(?:privacy|terms|cookies?)\s*(?:policy|notice)?\s*$|\d+\s*[hdwmy]\s*(?:ago)?\s*$|(?:just now|לפני רגע)\s*$)$/i;

/** The header line a copied Threads post opens with: "username · 3h" (handle, then an age). */
const PASTE_HEADER = /^\s*@?([A-Za-z0-9._]{2,30})\s*[·•|]\s*\d+\s*[hdwmy]\b.*$/;

/** Local split of a manually pasted thread. Mirrors src/server/threadsImport.ts's splitter so the
 *  paste path needs no round-trip at all. */
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
  const MARKER = /^\s*(?:🧵\s*)?(?:\(?\d{1,2}\s*(?:\/\s*\d{1,2})?\s*[.):\/]|\d{1,2}\s*—)\s+/;

  let parts: string[];
  if (lines.filter((l) => MARKER.test(l)).length >= 2) {
    parts = [];
    for (const line of lines) {
      if (MARKER.test(line) || parts.length === 0) parts.push(line.replace(MARKER, '').trim());
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
  return {
    ok: kept.length > 0,
    url: url.trim(),
    author: handle ? `@${handle}` : '',
    posts: kept,
    text: kept.join('\n\n'),
    via: kept.length ? 'manual' : 'none',
    note: kept.length ? undefined : 'לא נמצא טקסט שמיש בהדבקה.',
  };
}

// ─── step 2 · translate & adapt ─────────────────────────────────────────────────────────────

const VISUAL_BASE =
  'abstract dark cyber technology background, deep obsidian, subtle circuit and node grid geometry, neon green and cyan accents, no text, no letters, no words, no logos, no watermark';

const MAX_TITLE_WORDS = 8;
const MAX_BODY_WORDS = 30;

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
 * Deterministic local deck built from the thread's own posts, used whenever AI adaptation is
 * unavailable. Deliberately honest: it does NOT machine-translate and does NOT invent Hebrew copy
 * — it carries the source text through, one post per slide, so the operator can see exactly what
 * was imported and edit from there. `synthesized:false` drives the amber "גיבוי מקומי" badge.
 */
function buildFallbackDeck(thread: ImportedThread, reason: string): TechTipDeck {
  const source = thread.posts.length ? thread.posts : [thread.text].filter(Boolean);
  // Not run through sanitizeHebrewText: this text is the untranslated source (usually English),
  // and techTipRenderer already sanitises every string at draw time.
  const cover = clampWords(source[0] ?? 'שרשור מ-Threads', MAX_TITLE_WORDS);
  const body = source.slice(1, 11).map((p, i) =>
    slide({
      kind: 'concept',
      kicker: `חלק ${i + 1}`,
      title: clampWords(p.split('\n')[0] ?? '', MAX_TITLE_WORDS),
      body: clampWords(p.replace(/\n+/g, ' '), MAX_BODY_WORDS),
    })
  );

  return {
    title: cover,
    slides: [
      // No author credit on the cover either — same rule as the caption above.
      slide({
        kind: 'cover',
        kicker: 'טיוטה',
        title: cover,
        body: 'טקסט המקור כפי שיובא — לעריכה ידנית לפני פרסום.',
      }),
      ...body,
      slide({
        kind: 'cta',
        kicker: 'צעד הבא',
        title: 'רוצים את הגרסה המלאה?',
        body: 'עוד מדריכים, כלים ודוגמאות — ב-mrdaniel.co.il. עקבו לעוד תוכן על AI ואוטומציה לעסקים.',
      }),
    ],
    hashtags: ['#AI', '#אוטומציה', '#עסקים', '#טכנולוגיה'],
    synthesized: false,
    fallbackReason: reason,
    createdAt: Date.now(),
  };
}

/** Translate & adapt an imported thread into a Hebrew TechTipDeck. Never throws. */
export async function synthesizeThreadDeck(
  thread: ImportedThread,
  notes?: string
): Promise<TechTipDeck> {
  const posts = thread.posts.filter((p) => p.trim());
  if (posts.join('\n').trim().length < 40) {
    return buildFallbackDeck(thread, 'טקסט השרשור קצר מדי לעיבוד AI');
  }
  try {
    const res = await post('thread-deck', {
      posts,
      author: thread.author || undefined,
      sourceUrl: thread.url || undefined,
      notes: notes?.trim() || undefined,
    });
    if (!res.ok) return buildFallbackDeck(thread, httpReason(res.status));
    const data = (await res.json()) as {
      ok?: boolean;
      blocked?: boolean;
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
      synthesized: true,
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
 */
export function threadDeckCaption(deck: TechTipDeck): string {
  const first = deck.slides.find((s) => s.body)?.body ?? '';
  return [
    deck.title,
    '',
    first.slice(0, 220),
    '',
    'החליקו לכל השקפים ➔',
    'עוד מדריכים ב-mrdaniel.co.il',
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
    return parsed;
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
