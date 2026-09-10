import type { NewsItem, NewsTopic } from './newsAgentTypes';
import { describeAiError } from './aiErrors';
import { adminSecretHeader } from './adminSecret';

/**
 * Universal slide-synthesis engine (text/data only — the canvas render lives in
 * instagramStoryRenderer.ts). Any content source — a scraped news item, a free-text prompt, or a
 * social-post draft — is first normalised to a `SlideSource`, then turned into a 4–5 slide deck:
 *
 *   Cover  →  2–3 deep content / fact slides  →  final CTA slide.
 *
 * Two paths, both guaranteeing that shape:
 *   synthesizeSlides()  — PRIMARY. Sends the source text to the LLM
 *                         (/api/agent-generate · action:"story-synthesize"), strict JSON per
 *                         slide { kind, title, narrativeText }. No bullets, no filler, every fact
 *                         grounded in the source. If the model under-delivers content slides the
 *                         richest narrative is split so the AI path is never a 2-slide deck.
 *   buildSlides()       — DETERMINISTIC FALLBACK (no GEMINI_API_KEY / 429 / network). Splits the
 *                         source body+summary text into >=2 narrative content slides — never a
 *                         2-slide deck, no "wisdom" banks, no bullet lists.
 *
 * `synthesizeStory()` / `buildStorySlides()` are thin NewsItem wrappers kept for existing callers
 * (instagramStoryRenderer, the autonomous cron). A server copy in src/server/storySlides.ts
 * stays in sync.
 */

export type StorySlideKind = 'cover' | 'bullets' | 'insight' | 'cta';

export interface StorySlide {
  kind: StorySlideKind;
  index: number;
  total: number;
  kicker: string;
  /** Slide's own headline / section title. */
  heading?: string;
  /** Cover slide only — the source headline. */
  headline?: string;
  /** Narrative paragraph body (2–4 sentences). Replaces the old `points[]` bullet list. */
  narrativeText?: string;
  /** @deprecated kept so old cached payloads still render — new payloads use `narrativeText`. */
  points?: string[];
  body?: string;
  linkLabel?: string;
  source?: string;
}

/** Structural twin of agentTypes' HookOption — kept local so this engine, and its server copy in
 * src/server/storySlides.ts, stay free of dashboard-only imports. */
export interface StoryHookOption {
  line: string;
  visual: string;
  pattern: string;
}

export interface StoryPayload {
  newsId: string;
  newsTitle: string;
  newsLink: string;
  topic: NewsTopic;
  imageUrl: string;
  slides: StorySlide[];
  /** true when the LLM synthesised the copy; false = deterministic fallback. */
  synthesized: boolean;
  /** When `synthesized` is false: the reason the LLM path was skipped (rate limit, auth, thin
   * text, network) — surfaced in the dashboard so the operator sees why it fell back. */
  fallbackReason?: string;
  createdAt: number;
  /** Three cover-hook alternatives from synthesis (first = the one on the cover). Absent on
   * deterministic decks and on payloads persisted before hook options existed. */
  hookOptions?: StoryHookOption[];
  /** Lineage id — minted once per generation and carried through every edit (payload spreads keep
   * it), so per-deck UI state such as the Growth panel's pack survives edits but not a regeneration. */
  deckId?: string;
}

function newDeckId(sourceId: string): string {
  return `${sourceId}:${Date.now().toString(36)}`;
}

/**
 * Normalised input to the slide engine. `bodyText` is the raw material every slide is grounded in
 * (article summary+body, or the operator's free text). `imageUrl` is optional (news photo);
 * free-text decks render on the branded graphic background.
 */
export interface SlideSource {
  id: string;
  title: string;
  bodyText: string;
  topic: NewsTopic;
  source: string;
  link: string;
  imageUrl: string;
}

const KICKER: Record<NewsTopic, string> = {
  cyber: 'סייבר ואבטחה',
  ai: 'בינה מלאכותית',
  cloud: 'ענן ותשתיות',
  general: 'טכנולוגיה',
};

// STANDARD final CTA slide (slide 5) — fixed, brand-consistent, page-follow oriented. Not
// derived from the article and NOT overridable by the LLM.
const CTA_HEADING = 'רוצים להישאר מעודכנים?';
const CTA_BODY =
  'עקבו אחר העמוד לניתוחי סייבר וטכנולוגיה בזמן אמת, וקראו את הכתבות המלאות באתר:';
const CTA_LINK = 'mrdaniel.co.il';
const TITLE_MAX = 90;

// ─── source normalisers ─────────────────────────────────────────────────────────────────────

function hashId(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `src-${Math.abs(h).toString(36)}`;
}

/** A scraped news item → SlideSource (keeps the article photo + link + outlet). */
export function newsItemToSlideSource(item: NewsItem, imageUrl = ''): SlideSource {
  return {
    id: item.id,
    title: item.title.trim(),
    bodyText: (item.summary || item.excerpt || '').trim(),
    topic: item.topic,
    source: item.source,
    link: item.link,
    imageUrl,
  };
}

/** Free text / a social-post draft → SlideSource. Title is derived from the first sentence when
 * not supplied; topic defaults to 'general'. */
export function textToSlideSource(
  text: string,
  opts: { title?: string; topic?: NewsTopic; source?: string } = {}
): SlideSource {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  const derivedTitle =
    (opts.title || '').trim() ||
    (sentences(clean)[0] || clean.split(/[.!?\n]/)[0] || 'תוכן חדש').trim().slice(0, TITLE_MAX);
  return {
    id: hashId(clean || derivedTitle),
    title: derivedTitle,
    bodyText: clean,
    topic: opts.topic || 'general',
    source: opts.source || 'טקסט חופשי',
    link: '',
    imageUrl: '',
  };
}

// ─── shared helpers ──────────────────────────────────────────────────────────────────────────

/** Cleaned sentences from the source body, de-duplicated, order preserved. */
function sentences(text: string): string[] {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  const seen = new Set<string>();
  return clean
    .split(/(?<=[.!?…])\s+|\s+[-–—]\s+/)
    .map((s) => s.replace(/^["'׳״]+|["'׳״.…]+$/g, '').trim())
    .filter((s) => {
      if (s.length < 16 || s.length > 260) return false;
      const key = s.slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function wordCount(s: string): number {
  return (s.trim().match(/\S+/g) ?? []).length;
}

/**
 * ZERO-TRUNCATION close. Trims dangling connective punctuation ("(", ",", "-", ":", "…") off the
 * END of a fragment, then adds a full stop only if the text now ends on a real word / ")" / '"'.
 * Never appends "…" and never adds a period after a broken mid-word fragment.
 */
function ensureSentenceEnd(s: string): string {
  let t = (s || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  // balance a dangling "(" — drop an unclosed trailing parenthetical rather than cut a list
  const opens = (t.match(/\(/g) || []).length;
  const closes = (t.match(/\)/g) || []).length;
  if (opens > closes) t = t.replace(/\s*\([^()]*$/, '').trim();
  t = t.replace(/[\s,;:–—\-….]+$/u, '').trim(); // strip trailing "…", commas, dashes, colons
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** Split text into an ordered array of COMPLETE sentences (terminal punctuation kept, "…" → ".").
 * De-duplicates near-identical sentences (OG-description + article lede repeats). A trailing
 * fragment with no terminator is closed via `ensureSentenceEnd` (or merged back). */
function toSentences(text: string): string[] {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const v = s.trim();
    if (wordCount(v) < 2) return;
    const key = v.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 60).toLowerCase();
    if (key.length > 12 && seen.has(key)) return;
    if (key.length > 12) seen.add(key);
    out.push(v);
  };
  const parts = clean.split(/(?<=[.!?…])\s+/);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    if (!p) continue;
    if (/[.!?…]$/.test(p)) push(p.replace(/…$/, '.'));
    else if (i === parts.length - 1) {
      const closed = ensureSentenceEnd(p);
      if (wordCount(closed) >= 3) push(closed);
      else if (out.length) out[out.length - 1] = ensureSentenceEnd(`${out[out.length - 1]} ${p}`);
    } else {
      push(ensureSentenceEnd(p));
    }
  }
  return out;
}

// ── META-PHRASE SCRUBBER ────────────────────────────────────────────────────────────────────
// Editorial output is CLEAN narrative ONLY. No framing labels, editor's notes, section headers
// or "context" tags may survive into a slide body / social-copy paragraph — on ANY route
// (LLM synthesis, deterministic fallback, or the slide-editor chat).
// "start of text / after newline / after a sentence end" — the positions a meta-label can open at.
const AT = '(?:^|\\n|(?<=[.!?…]\\s))';
const META_PATTERNS: RegExp[] = [
  new RegExp(`${AT}\\s*ה?הקשר\\s*(?:ה?טכני)?\\s*:\\s*`, 'gi'),
  new RegExp(`${AT}\\s*הקשר\\s+טכני\\s*:?\\s*`, 'gi'),
  /\s*ה?הקשר\s*:?\s*הידיעה שפורסמה תחת הכותרת\s*"?[^"\n.]*"?\s*(?:עוסקת בכך)?\s*\.?/gi,
  /\s*הידיעה שפורסמה תחת הכותרת\s*"?[^"\n.]*"?\s*(?:עוסקת בכך)?\s*\.?/gi,
  new RegExp(`${AT}\\s*נא\\s+לשים\\s+לב\\s*[:,]?\\s*`, 'gi'),
  new RegExp(`${AT}\\s*(?:כותרת(?:\\s+משנה)?|תת[- ]?כותרת|כותרת[- ]על|הערת עורך|לתשומת לב\\S*)\\s*:\\s*`, 'gi'),
  new RegExp(`${AT}\\s*(?:כמה נקודות|הנקודות|התובנות|מה ש\\S+)\\s+(?:ש?מעבר ל(?:כתבה|כותרת)|המעשיות מכאן|חשוב לקחת מכאן|כדאי לבדוק אצלכם עכשיו|נשאר מזה[^:\\n]*)\\s*:\\s*`, 'gi'),
  new RegExp(`${AT}\\s*מעבר לכותרת\\s*[,:]\\s*`, 'gi'),
  new RegExp(`${AT}\\s*מהשטח\\s*:\\s*`, 'gi'),
  /\s*זהו עיקר המידע שנמסר בשלב זה[^.\n]*\.?/gi,
  /\s*זהו הפרט המרכזי שנמסר[^.\n]*\.?/gi,
  /\s*(?:בשלב זה אלה הפרטים שפורסמו|ההתפתחות מובאת כאן כפי שדווחה)[^.\n]*\.?/gi,
  /\s*הפרטים המלאים מופיעים בכתבת המקור\.?/gi,
  new RegExp(`${AT}\\s*(?:לפי הדיווח|על פי הפרסום שהתקבל|בכתבה נמסר כי|מהפרטים שנחשפו עד כה עולה כי)\\s*,?\\s*`, 'g'),
];

/** Remove meta-framing / editor-note / section-label injections; return clean narrative only. */
export function stripMetaPhrases(text: string): string {
  let t = text || '';
  for (const re of META_PATTERNS) t = t.replace(re, (m) => (m.startsWith('\n') ? '\n' : ' '));
  return t
    .replace(/["'׳״]\s*["'׳״]/g, ' ')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[\s,;:.–—-]+/, '')
    .trim();
}

/** Word threshold above which the LLM's own per-slide split is kept as-is. */
const MIN_DENSE_WORDS = 26;
/** Aim ~this many words per content slide; the deck grows (up to MAX) to hit it without cutting. */
const SLIDE_TARGET_WORDS = 44;
/** A single content slide won't be forced past this many words even if it's one long sentence. */
const SLIDE_HARD_WORDS = 78;
/** Deck may grow to this many content slides (total up to 8) rather than truncate a sentence. */
const MAX_CONTENT_SLIDES = 6;

/** Headline hygiene: meta-scrubbed, no trailing "…", capped on a WORD boundary (never mid-word). */
function tidyHeadline(h: string): string {
  let t = stripMetaPhrases((h || '').replace(/\s+/g, ' ').trim()).replace(/[…\s.]+$/u, '').trim();
  if (t.length > 150) {
    const cut = t.slice(0, 150);
    const sp = cut.lastIndexOf(' ');
    t = (sp > 60 ? cut.slice(0, sp) : cut).replace(/[\s,;:–—-]+$/u, '');
  }
  return t;
}

/**
 * DYNAMIC content-slide builder. Packs WHOLE sentences into balanced ~44-word slides (hard ceiling
 * ~78) and GROWS the slide count (2..6) as needed so no sentence is ever split, dropped or cut.
 * Every returned body is complete sentences only, each ending with proper punctuation.
 */
function buildContentSlides(rawText: string, kicker: string): StorySlide[] {
  const text = stripMetaPhrases((rawText || '').replace(/\s+/g, ' ').trim());
  const sents = toSentences(text);
  if (sents.length === 0) return [];

  const w = sents.map(wordCount);

  // 1. Greedy pack: start a new chunk BEFORE the next sentence would overshoot the target / ceiling.
  let chunks: string[][] = [];
  let cur: string[] = [];
  let curW = 0;
  for (let i = 0; i < sents.length; i++) {
    cur.push(sents[i]);
    curW += w[i];
    const nextW = i + 1 < sents.length ? w[i + 1] : 0;
    if (nextW > 0 && (curW + nextW > SLIDE_TARGET_WORDS * 1.25 || curW + nextW > SLIDE_HARD_WORDS)) {
      chunks.push(cur);
      cur = [];
      curW = 0;
    }
  }
  if (cur.length) chunks.push(cur);

  // 2. Clamp to MAX by merging the smallest adjacent pair (whole sentences stay intact).
  while (chunks.length > MAX_CONTENT_SLIDES) {
    let mi = 0;
    let mw = Infinity;
    for (let i = 0; i < chunks.length - 1; i++) {
      const pairW = chunks[i].reduce((n, s) => n + wordCount(s), 0) + chunks[i + 1].reduce((n, s) => n + wordCount(s), 0);
      if (pairW < mw) {
        mw = pairW;
        mi = i;
      }
    }
    chunks.splice(mi, 2, [...chunks[mi], ...chunks[mi + 1]]);
  }

  // 3. Ensure >= 2 content slides when there's more than one sentence — split the largest chunk.
  if (chunks.length === 1 && chunks[0].length >= 2) {
    const only = chunks[0];
    const mid = Math.ceil(only.length / 2);
    chunks = [only.slice(0, mid), only.slice(mid)];
  }

  return chunks
    .filter((c) => c.length)
    .map((c) => {
      const body = ensureSentenceEnd(c.join(' '));
      return { kind: 'insight' as const, index: 0, total: 0, kicker, heading: '', narrativeText: body, body };
    });
}

export interface DeckValidation {
  ok: boolean;
  issues: string[];
}

/**
 * PRE-RENDER GATE. Every content/cover slide must end on a COMPLETE sentence — no mid-word cut,
 * no trailing "…" / "...", no unclosed "(", no dangling "," / "-" / ":".
 */
export function validateDeckSentences(payload: StoryPayload): DeckValidation {
  const issues: string[] = [];
  payload.slides.forEach((s, i) => {
    if (s.kind === 'cta') return;
    const t = (s.kind === 'cover' ? s.headline || '' : s.narrativeText || s.body || '').trim();
    if (!t) {
      if (s.kind !== 'cover') issues.push(`slide ${i + 1}: empty body`);
      return;
    }
    if (/(?:…|\.\.\.)\s*$/.test(t)) issues.push(`slide ${i + 1}: trailing ellipsis`);
    if ((t.match(/\(/g) || []).length > (t.match(/\)/g) || []).length) issues.push(`slide ${i + 1}: unclosed "("`);
    if (/[,;:–—-]\s*$/.test(t)) issues.push(`slide ${i + 1}: ends on dangling punctuation`);
    if (s.kind !== 'cover' && !/[.!?]["'׳״)\]]?\s*$/.test(t)) issues.push(`slide ${i + 1}: no terminal "."`);
  });
  return { ok: issues.length === 0, issues };
}

/**
 * Repair pass — scrub meta, force content slides heading-less + sentence-complete, tidy the
 * headline, keep the cover body empty, and always reset the CTA to the standard one. Idempotent;
 * run before the deck reaches the preview / export canvas.
 */
export function finalizeDeck(payload: StoryPayload): StoryPayload {
  const slides: StorySlide[] = payload.slides.map((s) => {
    if (s.kind === 'cta') {
      return { ...s, heading: CTA_HEADING, narrativeText: CTA_BODY, body: CTA_BODY, linkLabel: CTA_LINK };
    }
    if (s.kind === 'cover') {
      return { ...s, headline: tidyHeadline(s.headline || ''), narrativeText: '' };
    }
    const body = ensureSentenceEnd(stripMetaPhrases((s.narrativeText || s.body || '').trim()));
    return { ...s, heading: '', narrativeText: body, body };
  });
  stampIndexes(slides);
  return { ...payload, slides };
}

function stampIndexes(slides: StorySlide[]): void {
  const total = slides.length;
  slides.forEach((s, i) => {
    s.index = i;
    s.total = total;
  });
}

// ─── PRIMARY: LLM synthesis ──────────────────────────────────────────────────────────────────

interface SynthSlide {
  kind: 'cover' | 'body' | 'takeaway' | 'cta';
  title: string;
  narrativeText: string;
}

/** POST to the story-synth endpoint, retrying once on a 429 (Gemini free-tier hourly cap) after a
 * short, bounded wait so a brief quota blip doesn't force the deterministic fallback. */
async function postStorySynth(url: string, headers: Record<string, string>, body: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    // Per-attempt hard timeout — a hung fetch never rejects on its own, which would hang the
    // whole slide pipeline (and leave the Story Studio spinner stuck). On abort this throws,
    // the caller's catch runs, and generation falls back to buildSlides().
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 75000);
    let res: Response;
    try {
      res = await fetch(url, { method: 'POST', headers, body, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (res.status !== 429 || attempt >= 1) return res;
    let waitMs = 6000;
    try {
      const j = (await res.clone().json()) as { retryAfterSeconds?: number };
      if (typeof j.retryAfterSeconds === 'number') {
        waitMs = Math.min(12000, Math.max(3000, j.retryAfterSeconds * 1000));
      }
    } catch {
      /* keep the default wait */
    }
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

interface SynthResult {
  slides: SynthSlide[];
  hookOptions: StoryHookOption[];
}

/** Defensive read of the endpoint's optional cover-hook alternatives — anything malformed is
 * dropped, and an older endpoint that sends none simply yields []. */
function readHookOptions(raw: unknown): StoryHookOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((h) => (h && typeof h === 'object' ? (h as Record<string, unknown>) : {}))
    .map((h) => ({ line: String(h.line ?? '').trim(), visual: String(h.visual ?? '').trim(), pattern: String(h.pattern ?? '').trim() }))
    .filter((h) => h.line.length > 3)
    .slice(0, 3);
}

/** Call the synth endpoint for one source; returns the raw SynthSlide[] (plus any cover-hook
 * alternatives) or throws a descriptive (Hebrew) error the caller can show and fall back on. */
async function requestSynthesis(
  src: SlideSource,
  opts: { apiBase: string; adminSecret?: string }
): Promise<SynthResult> {
  if (src.bodyText.trim().length < 60) throw new Error('הטקסט קצר מדי לסינתזת AI (פחות מ-60 תווים)');

  const res = await postStorySynth(
    `${opts.apiBase.replace(/\/$/, '')}/api/agent-generate`,
    // opts.adminSecret is an arbitrary caller-supplied string, so it is re-checked here rather
    // than trusted: inspectSecret() strips paste artifacts and yields '' for anything fetch()
    // would reject, keeping a bad value from throwing a ByteString TypeError mid-render.
    { 'Content-Type': 'application/json', ...adminSecretHeader(opts.adminSecret) },
    JSON.stringify({ action: 'story-synthesize', title: src.title, source: src.source, topic: src.topic, articleText: src.bodyText })
  );

  // Read the endpoint's own classification rather than guessing from the status: a 500 can be a
  // revoked key, a Google outage or a safety block, and the operator's next move differs for each.
  // describeAiError also raises the shared 401 re-auth prompt exactly once. The message it returns
  // is what buildSlides() stamps into `fallbackReason`, so it is read verbatim off the deck badge.
  if (!res.ok) throw new Error((await describeAiError(res)).message);

  const data = (await res.json()) as { ok?: boolean; slides?: SynthSlide[]; hookOptions?: unknown; blocked?: boolean };
  if (data.blocked) throw new Error('פלט ה-AI נחסם ע"י מסנן התוכן');
  if (!data.ok || !Array.isArray(data.slides) || data.slides.length < 3) {
    throw new Error('מנוע ה-AI לא החזיר מספיק שקופיות תקינות');
  }
  return { slides: data.slides, hookOptions: readHookOptions(data.hookOptions) };
}

/**
 * Map the LLM's SynthSlide[] onto a 5-slide StoryPayload enforcing the density + layout rules:
 *   • Cover  = headline + tag + watermark ONLY (no body text — narrativeText forced empty).
 *   • Slides 2–4 = 2–3 rich, dense paragraphs (30–60 words each). If any LLM content slide is a
 *     thin single line, ALL the content is re-grouped into balanced dense paragraphs.
 *   • CTA    = clean closing line.
 */
function assembleSynthesized(src: SlideSource, synthSlides: SynthSlide[], hookOptions: StoryHookOption[] = []): StoryPayload {
  const kicker = KICKER[src.topic];

  const coverSynth = synthSlides.find((s) => s.kind === 'cover');
  const contentSynth = synthSlides.filter((s) => s.kind === 'body' || s.kind === 'takeaway');

  const contentTexts = contentSynth.map((s) => stripMetaPhrases((s.narrativeText || '').trim())).filter(Boolean);
  const alreadyDense =
    contentTexts.length >= 2 &&
    contentTexts.length <= 3 &&
    contentTexts.every((t) => wordCount(t) >= MIN_DENSE_WORDS);

  let content: StorySlide[];
  if (alreadyDense && contentTexts.every((t) => toSentences(t).length >= 1)) {
    // Keep the LLM's own per-slide split — but each body still runs through the sentence-complete
    // guard, and if any slide is over the hard word ceiling it's re-chunked dynamically.
    const overLong = contentTexts.some((t) => wordCount(t) > SLIDE_HARD_WORDS + 8);
    content = overLong
      ? buildContentSlides(contentTexts.join(' '), kicker)
      : contentTexts.slice(0, MAX_CONTENT_SLIDES).map((t) => {
          const body = ensureSentenceEnd(t);
          return { kind: 'insight' as const, index: 0, total: 0, kicker, heading: '', narrativeText: body, body };
        });
  } else {
    // Re-distribute all the LLM's sentences (+ cover's stray fact) into dynamic, sentence-safe slides.
    const pool = [coverSynth?.narrativeText ?? '', ...contentTexts].join(' ').trim();
    content = buildContentSlides(pool || src.bodyText, kicker);
  }
  if (content.length < 1) throw new Error('טקסט ה-AI היה דל מכדי לבנות שקופיות תוכן');

  const cover: StorySlide = {
    kind: 'cover',
    index: 0,
    total: 0,
    kicker,
    headline: tidyHeadline(coverSynth?.title || src.title),
    narrativeText: '',
    source: src.source,
  };
  const cta: StorySlide = {
    kind: 'cta',
    index: 0,
    total: 0,
    kicker,
    heading: CTA_HEADING,
    narrativeText: CTA_BODY,
    body: CTA_BODY,
    linkLabel: CTA_LINK,
  };

  const slides = [cover, ...content.slice(0, MAX_CONTENT_SLIDES), cta];
  stampIndexes(slides);

  return finalizeDeck({
    newsId: src.id,
    newsTitle: src.title,
    newsLink: src.link,
    topic: src.topic,
    imageUrl: src.imageUrl,
    slides,
    synthesized: true,
    createdAt: Date.now(),
    deckId: newDeckId(src.id),
    ...(hookOptions.length ? { hookOptions } : {}),
  });
}

/**
 * PRIMARY entry point. Any SlideSource → a 4–5 slide StoryPayload via the LLM. Throws a
 * descriptive error on any failure so the caller can fall back to buildSlides() and show why.
 */
export async function synthesizeSlides(
  src: SlideSource,
  opts: { apiBase: string; adminSecret?: string }
): Promise<StoryPayload> {
  const synth = await requestSynthesis(src, opts);
  return assembleSynthesized(src, synth.slides, synth.hookOptions);
}

// ─── FALLBACK: deterministic, source-grounded, no banks, no bullets ──────────────────────────

/**
 * Deterministic fallback. Enforces the SAME layout rules as the LLM path:
 *   • Cover (1)   = headline + tag + watermark ONLY (no body).
 *   • Slides 2–4  = 2–3 DENSE narrative paragraphs, NO heading, each ending on a full sentence.
 *   • CTA (5)     = the standard page-follow CTA (fixed).
 * `reason` records why the LLM path was skipped so the dashboard can show it.
 */
export function buildSlides(src: SlideSource, reason?: string): StoryPayload {
  const kicker = KICKER[src.topic];
  const sourceText = (src.bodyText || src.title || '').replace(/\s+/g, ' ').trim();

  let content = buildContentSlides(sourceText, kicker);
  // If we got nothing at all, fall back to the headline as a single clean content slide.
  if (content.length === 0) {
    const body = ensureSentenceEnd(stripMetaPhrases(sourceText || src.title));
    content = [{ kind: 'insight', index: 0, total: 0, kicker, heading: '', narrativeText: body, body }];
  }

  const slides: StorySlide[] = [
    { kind: 'cover', index: 0, total: 0, kicker, headline: tidyHeadline(src.title), narrativeText: '', source: src.source },
    ...content.slice(0, MAX_CONTENT_SLIDES),
    { kind: 'cta', index: 0, total: 0, kicker, heading: CTA_HEADING, narrativeText: CTA_BODY, body: CTA_BODY, linkLabel: CTA_LINK },
  ];
  stampIndexes(slides);

  return finalizeDeck({
    newsId: src.id,
    newsTitle: src.title,
    newsLink: src.link,
    topic: src.topic,
    imageUrl: src.imageUrl,
    slides,
    synthesized: false,
    fallbackReason: reason,
    createdAt: Date.now(),
    deckId: newDeckId(src.id),
  });
}

// ─── AI Slide Editor — live in-dashboard edits ──────────────────────────────────────────────

export interface SlideEdit {
  /** 1-based slide index. */
  n: number;
  kind: StorySlide['kind'];
  text: string;
}

/** Flatten a payload into the editable shape the chat widget / editor endpoint work with. */
export function slidesToEditable(payload: StoryPayload): SlideEdit[] {
  return payload.slides.map((s, i) => ({
    n: i + 1,
    kind: s.kind,
    text: s.kind === 'cover' ? s.headline || '' : s.narrativeText || s.body || '',
  }));
}

/**
 * Apply edited slide texts back onto a payload: cover text → headline, content → narrative
 * paragraph (heading-less), CTA (slide 5) always reset to the STANDARD CTA. Every field is
 * meta-scrubbed. Slide count and kinds are preserved.
 */
export function applySlideEdits(payload: StoryPayload, edits: SlideEdit[]): StoryPayload {
  const byN = new Map(edits.map((e) => [e.n, e]));
  const slides = payload.slides.map((s, i) => {
    if (s.kind === 'cta') {
      return { ...s, heading: CTA_HEADING, narrativeText: CTA_BODY, body: CTA_BODY, linkLabel: CTA_LINK };
    }
    const e = byN.get(i + 1);
    const raw = (e?.text ?? '').trim();
    if (!raw) return s;
    const clean = stripMetaPhrases(raw);
    if (s.kind === 'cover') return { ...s, headline: tidyHeadline(clean), narrativeText: '' };
    const body = ensureSentenceEnd(clean);
    return { ...s, kind: 'insight' as const, heading: '', narrativeText: body, body };
  });
  stampIndexes(slides);
  return finalizeDeck({ ...payload, slides, createdAt: Date.now() });
}

/** True while the deck still has room for one more content slide (MAX_CONTENT_SLIDES). */
export function canInsertContentSlide(payload: StoryPayload): boolean {
  const content = (payload?.slides ?? []).filter((s) => s && s.kind !== 'cover' && s.kind !== 'cta').length;
  return content < MAX_CONTENT_SLIDES;
}

/**
 * Insert one heading-less content slide right before the CTA — the Growth panel's save-worthy
 * cheat-sheet slide. Same rules as every other content slide (meta-scrubbed, sentence-complete, no
 * heading) and the same MAX_CONTENT_SLIDES budget: a full deck comes back unchanged rather than
 * growing past what the carousel format and the progress bar were sized for.
 */
export function insertContentSlide(payload: StoryPayload, text: string): StoryPayload {
  const body = ensureSentenceEnd(stripMetaPhrases((text || '').replace(/\s+/g, ' ').trim()));
  if (!body || !canInsertContentSlide(payload)) return payload;
  const kicker = payload.slides.find((s) => s.kind !== 'cover' && s.kind !== 'cta')?.kicker ?? KICKER[payload.topic] ?? '';
  const slide: StorySlide = { kind: 'insight', index: 0, total: 0, kicker, heading: '', narrativeText: body, body };
  const slides = [...payload.slides];
  const ctaAt = slides.findIndex((s) => s.kind === 'cta');
  slides.splice(ctaAt === -1 ? slides.length : ctaAt, 0, slide);
  stampIndexes(slides);
  return finalizeDeck({ ...payload, slides, createdAt: Date.now() });
}

/**
 * Deterministic local slide edit — used when the AI edit endpoint is unavailable (429 / offline).
 * Handles: shorten a slide, replace a slide with explicit quoted text. Rephrasing / tone changes
 * need the AI and return `changed:false` with a note.
 */
export function localSlideEdit(
  payload: StoryPayload,
  instruction: string
): { payload: StoryPayload; changed: boolean; note?: string } {
  const instr = (instruction || '').trim();
  const nMatch = instr.match(/שק(?:ופית|ף|ופיות)?\s*(?:מספר\s*)?(\d)/) || instr.match(/slide\s*(\d)/i);
  const n = nMatch ? Number(nMatch[1]) : 0;
  const target = n >= 1 && n <= payload.slides.length ? payload.slides[n - 1] : null;

  const quoted = instr.match(/["“„”']([^"“„”']{6,})["“„”']/);
  if (target && target.kind !== 'cta' && /החלף|החליף|שנה|תחליף|replace/i.test(instr) && quoted) {
    return { payload: applySlideEdits(payload, [{ n, kind: target.kind, text: quoted[1] }]), changed: true };
  }

  if (target && target.kind !== 'cta' && /תקצר|קצר|תמצת|תקצץ|shorten|קיצור/i.test(instr)) {
    const srcText = target.kind === 'cover' ? target.headline || '' : target.narrativeText || target.body || '';
    const sents = srcText.split(/(?<=[.!?…])\s+/).filter(Boolean);
    if (sents.length >= 2) {
      const keep = Math.max(1, Math.round(sents.length * 0.55));
      return { payload: applySlideEdits(payload, [{ n, kind: target.kind, text: sents.slice(0, keep).join(' ') }]), changed: true };
    }
  }

  return {
    payload,
    changed: false,
    note: 'העריכה הזו דורשת את מנוע ה-AI (כרגע לא זמין — מכסת Gemini). פעולות מקומיות נתמכות: "תקצר את שקופית 2", או החלפה מפורשת: החלף את שקף 1 ב"טקסט חדש".',
  };
}

// ─── NewsItem back-compat wrappers ──────────────────────────────────────────────────────────

/** @deprecated use `synthesizeSlides(newsItemToSlideSource(item, imageUrl), opts)`. */
export async function synthesizeStory(
  item: NewsItem,
  imageUrl: string,
  opts: { apiBase: string; adminSecret?: string }
): Promise<StoryPayload> {
  return synthesizeSlides(newsItemToSlideSource(item, imageUrl), opts);
}

/** @deprecated use `buildSlides(newsItemToSlideSource(item, imageUrl), reason)`. */
export function buildStorySlides(item: NewsItem, imageUrl: string, reason?: string): StoryPayload {
  return buildSlides(newsItemToSlideSource(item, imageUrl), reason);
}
