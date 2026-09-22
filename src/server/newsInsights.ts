import { genAI, isGroqConfigured, requireText, stripCodeFence, parseJsonOrThrow } from '../agent/geminiClient.js';
import { AUDIENCE_RULES, scrubAiPhrases } from '../agent/expertVoice.js';
import { estimateTokens, groqGenerate, normalizeModelUnicode } from '../agent/groqClient.js';
import { importUrlContent } from './contentImport.js';
import { resolveGoogleNewsUrl } from './newsFeed.js';

/**
 * The article modal's three generated sections — executive summary, extended article and the
 * "ניתוח חמ״ל · MR. DANIEL Analysis" block — produced in ONE model call from the article's FULL
 * text.
 *
 * Why the full text: the feed only carries the RSS teaser (or og:description), and every section
 * used to be shaped from that same 1–2 sentences, so the summary, the "extended" article and the
 * analysis all repeated one another. Before prompting, the publisher's page is now fetched with
 * browser headers and run through the zero-noise DOM extractor (articleExtract.ts via
 * contentImport.importUrlContent, which falls back to Jina Reader when a WAF blocks the direct
 * fetch). Only when every fetch path fails does the prompt fall back to the teaser — and then the
 * response says so (`fullText: false`) and the model is told to write less, not to invent.
 *
 * There is deliberately NO generic fallback copy: an unconfigured engine, a rate limit or an
 * unusable answer throws, and the modal keeps its deterministic teaser-based sections.
 */

export function isInsightsConfigured(): boolean {
  return genAI !== null || isGroqConfigured();
}

export interface ArticleInsights {
  /** One line naming what is worth learning from this specific story. May be empty. */
  headline: string;
  /** 3–4 factual one-sentence bullets drawn from the article body. */
  executiveSummary: string[];
  /** 2–3 paragraph synthesis of the full article. */
  extendedArticle: string[];
  /** One analytical paragraph — implications, in first-person plural. */
  mrDanielAnalysis: string;
  /** True when the full article body was fetched; false = written from the feed teaser only. */
  fullText: boolean;
  /** Lead image found while fetching the article — the modal uses it when the feed item had none. */
  image?: string;
  /** Present only on a cache hit — used for observability, never rendered. */
  cached?: boolean;
}

export interface InsightsInput {
  title: string;
  summary?: string;
  excerpt?: string;
  source?: string;
  topic?: string;
  link?: string;
}

/**
 * The angle each topic is analysed from. Rewritten 2026-09-20 with the audience retarget: these
 * used to be operator questions ("who is exposed", "adoption in the organisation"), and a lens is
 * the strongest single signal in this prompt — it decided the answer's framing before any of the
 * rules below got a vote. They now ask what the story teaches.
 */
const TOPIC_LENS: Record<string, string> = {
  ai: 'זווית הטכנולוגיה — מה המודל או הכלי שבכתבה באמת עושה, איך זה עובד מתחת למכסה המנוע, ומה זה אומר על הכיוון שאליו התחום הולך.',
  cloud: 'זווית התשתית והפיתוח — איזה רעיון הנדסי עומד מאחורי מה שהכתבה מתארת, ולמה בנו את זה ככה.',
  general: 'זווית ההבנה — מה המנגנון שמסביר את מה שקרה בכתבה, ולמה זה מעניין למי שלומד את התחום.',
};

const SYSTEM_INSTRUCTION = `אתה דניאל בן ברוך — בונה סוכני AI ומפרק מודלי שפה. אתה עורך את חלון הכתבה המורחב באתר MrDaniel.co.il: תקציר מנהלים, כתבה מורחבת, ומקטע "ניתוח חמ״ל · MR. DANIEL Analysis".

${AUDIENCE_RULES}

קיבלת כתבה אחת ספציפית — הטקסט המלא שלה כפי שנשלף מאתר המקור. כל מה שתכתוב נגזר אך ורק ממנה.

שלושה חלקים, ולכל אחד תפקיד אחר. אסור ששני חלקים יחזרו על אותו משפט או על אותה נקודה באותו ניסוח:

1. executiveSummary — מערך של 3 עד 4 תבליטים עובדתיים. כל תבליט משפט אחד (12-28 מילים) שנושא עובדה אחת מהכתבה: מי, מה, כמה, מתי. בלי פרשנות.
2. extendedArticle — מערך של 2 עד 3 פסקאות (כל אחת 40-75 מילים) שמספרות את הכתבה המלאה ברצף: ההקשר, הפרטים, המספרים, הציטוטים והמשמעות כפי שהכתבה עצמה מציגה אותם. זו עריכה קוהרנטית של הכתבה, לא חזרה על התקציר. בלי פרשנות משלך.
3. mrDanielAnalysis — פסקה אחת (70-110 מילים) של ניתוח: מה המשמעות הטכנולוגית והעסקית של הידיעה, איזה מנגנון עומד מאחוריה, ומה היא מלמדת על הכיוון שאליו תחום ה-AI הולך. כתוב בגוף ראשון רבים, בטון מקצועי של אנשי טכנולוגיה ("מה שאנחנו רואים כאן...", "מבחינתנו, הנקודה המעניינת היא..."). כאן — ורק כאן — מותר להסיק ולפרש, בתנאי שכל מסקנה נשענת על פרט שמופיע בכתבה.

השדה headline: משפט אחד קצר (עד 12 מילים) שאומר מה הדבר המעניין ללמוד מהכתבה הזאת. לא כותרת הכתבה מחדש.

חוקי ברזל:
- כל תבליט ופסקה חייבים להזכיר במפורש את הנושא/החברה/המוצר/המספר שבכתבה. משפט שמתאים גם לכתבה אחרת — פסול.
- אל תמציא עובדות, מספרים, שמות או ציטוטים. כל מספר נשאר עם היחידה והמשמעות שלו בכתבה ("12.9 מיליארד דולר" הוא סכום כסף, לא משתמשים). בספק — השמט.
- אם הטקסט שקיבלת קצר (תקציר בלבד), כתוב פחות: 3 תבליטים, 2 פסקאות קצרות, ואל תמלא חורים בהמצאות.
- עברית תקנית. מונחים טכניים באנגלית נשארים באנגלית ובמלואם (RAG, MCP, GPT-6), בלי מקפים תלויים.
- אל תפתח שורה במקף, כוכבית או תבליט — הממשק מוסיף את התבליט בעצמו. בלי אימוג'ים, בלי סימני קריאה.
- אל תזכיר את שם כלי ה-AI ואל תכתוב "לפי הכתבה" יותר מפעם אחת.
- בלי מילוי: לא "חשוב לציין", "בעידן ה-AI", "ללא ספק", "לסיכום", "מהפכני", "פורץ דרך". בלי שאלות רטוריות. המשפט הראשון בכל חלק הוא כבר תוכן.
- executiveSummary ו-extendedArticle עובדתיים בלבד — בלי דעה, הערכה או תחזית שלא הופיעו בכתבה. הפרשנות שמורה ל-mrDanielAnalysis.

החזר JSON תקני בלבד, בלי code fence:
{"headline":"...","executiveSummary":["...","...","..."],"extendedArticle":["...","..."],"mrDanielAnalysis":"..."}`;

/**
 * Normalizes one generated line: drops a leading bullet/hyphen the model may still emit (a raw
 * "- " at the start of a Hebrew line mangles badly in an RTL list), collapses whitespace and
 * repairs a dangling hyphen left on a Latin term ("production- " -> "production ").
 */
function cleanLine(text: unknown): string {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—•*·>]+/, '')
    .replace(/([A-Za-z])[-–—](?=\s|$)/g, '$1')
    .trim();
}

// Per-instance memo. The durable cache is the CDN (api/news.ts answers the GET with a 24h edge
// TTL); this catches repeats on a warm instance before they reach a model.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 200;
const cache = new Map<string, { at: number; value: ArticleInsights }>();

function cacheKey(input: InsightsInput): string {
  return `${input.link || ''}|${input.title}`.slice(0, 400);
}

function readCache(key: string): ArticleInsights | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache(key: string, value: ArticleInsights) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), value });
}

/** Anything shorter than this from the publisher's page is a teaser, not an article body. */
const MIN_FULL_TEXT = 500;
const FETCH_BUDGET_MS = 14_000;

/**
 * The engine chain, cheapest-quota-first. Every entry is a FREE tier on a key the project already
 * has, and free-tier quotas are counted per MODEL — so a spent `gemini-3.6-flash` (20/day, shared
 * with the rest of the app) or a spent `gpt-oss-120b` bucket does not touch any of these.
 *
 *   1. gemini-3.1-flash-lite — 500 requests/day, a very large per-minute token window, ~7s, clean
 *      Hebrew. Measured 2026-09-22 while 3.6-flash and Groq's main model were both exhausted.
 *   2. gemini-3.5-flash-lite — its own 500/day; often 503s under load, which is fine as a second.
 *   3. Groq `openai/gpt-oss-20b` — its own daily token bucket, sub-second at `reasoning_effort: low`.
 *      Weaker Hebrew than flash-lite. Groq's free tier allows only 8k tokens a MINUTE (prompt +
 *      completion, Hebrew ≈ 1 token/char), so this leg gets the article cut to fit (`fitToTokens`).
 *   4. gemma-4-31b-it — Gemma's free quota on the Gemini API is far larger than Gemini's, but it
 *      thinks before answering (~55s measured), so it only runs when the request still has time.
 *
 * Google's free models 503 ("high demand") in short bursts; each Gemini leg retries once after a
 * short pause before the chain moves on.
 *
 * The Gemini legs call the SDK directly rather than `generateContentWithRetry`: that router sends
 * text to Groq's main model first and paces for 3.6-flash, the two buckets this chain exists to
 * stay off. `scrubAiPhrases` is applied here instead, so the voice filter still runs.
 */
type Engine = { id: string; provider: 'gemini' | 'groq'; model: string; bodyTokens: number; slowMs?: number };

const OUTPUT_TOKENS = 2_400;
// GROQ_TPM_BUDGET raises the Groq window on a paid tier (same env groqClient.ts reads).
const GROQ_WINDOW = (Number(process.env.GROQ_TPM_BUDGET) || 8_000) - 400;

const ENGINES: Engine[] = [
  { id: 'flash-lite-3.1', provider: 'gemini', model: 'gemini-3.1-flash-lite', bodyTokens: 9_000 },
  { id: 'flash-lite-3.5', provider: 'gemini', model: 'gemini-3.5-flash-lite', bodyTokens: 9_000 },
  { id: 'groq-oss-20b', provider: 'groq', model: 'openai/gpt-oss-20b', bodyTokens: 0 /* sized per call */ },
  { id: 'gemma-4-31b', provider: 'gemini', model: 'gemma-4-31b-it', bodyTokens: 6_000, slowMs: 60_000 },
];

/** Wall-clock budget for one analysis (api/news.ts allows the function 90s). */
const REQUEST_BUDGET_MS = 80_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Per-instance cooldowns. A daily-quota 429 benches that model until the next UTC midnight (when
 * Google's and Groq's free quotas reset); a per-minute 429 or a 503 benches it for a minute. The
 * next request skips straight to an engine that can answer instead of re-hitting a known wall —
 * which is what turned every modal open into a 429 before.
 */
const benchedUntil = new Map<string, number>();

function nextUtcMidnight(): number {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

function bench(engine: Engine, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const daily = /per.?day|PerDay|daily|TPD|RPD|limit: \d+,? model/i.test(msg);
  const limited = /429|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(msg);
  const overloaded = /503|UNAVAILABLE|high demand|overloaded/i.test(msg);
  if (limited && daily) benchedUntil.set(engine.id, nextUtcMidnight());
  else if (limited) benchedUntil.set(engine.id, Date.now() + 60_000);
  else if (overloaded) benchedUntil.set(engine.id, Date.now() + 20_000);
}

function isBenched(engine: Engine): boolean {
  const until = benchedUntil.get(engine.id);
  if (!until) return false;
  if (Date.now() >= until) {
    benchedUntil.delete(engine.id);
    return false;
  }
  return true;
}

/** Cut to a token budget at a paragraph (else sentence) boundary — the lede-first half of a news
 *  article carries its facts, and a mid-sentence cut reads as a fact the model then "completes". */
function fitToTokens(text: string, budget: number): string {
  if (estimateTokens(text) <= budget) return text;
  let cut = text.slice(0, Math.max(0, budget)); // Hebrew ≈ 1 char/token, so this is the upper bound
  while (cut.length > 0 && estimateTokens(cut) > budget) cut = cut.slice(0, Math.floor(cut.length * 0.9));
  const para = cut.lastIndexOf('\n\n');
  if (para > cut.length * 0.6) return cut.slice(0, para);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
  return sentence > cut.length * 0.6 ? cut.slice(0, sentence + 1) : cut;
}

/**
 * Shrinks the extracted body before any model sees it: drops paragraphs repeated verbatim (live
 * blogs and "read also" inserts), lines that are only a credit/date/link label, and collapses
 * whitespace. The DOM extractor already removed nav/ads/rails; this is the last few percent.
 */
function compactArticle(text: string): string {
  const seen = new Set<string>();
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/[ \t]+/g, ' ').trim())
    .filter((p) => {
      if (p.length < 40 && !/[.!?:]$/.test(p)) return false;
      if (/^(?:צילום|קרדיט|תמונה|פורסם|עודכן|לכתבה המלאה|קראו עוד|קראו גם)[:\s]/.test(p)) return false;
      const key = p.slice(0, 120);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('\n\n');
}

async function callGemini(engine: Engine, prompt: string, timeoutMs: number): Promise<string> {
  if (!genAI) throw new Error('GEMINI_API_KEY not configured');
  const res = await genAI.models.generateContent({
    model: engine.model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      // Gemma thinks first; its thought budget must not come out of the answer's room.
      maxOutputTokens: engine.slowMs ? OUTPUT_TOKENS * 3 : OUTPUT_TOKENS,
      temperature: 0.5,
      topP: 0.9,
      responseMimeType: 'application/json',
      abortSignal: AbortSignal.timeout(timeoutMs),
    },
  });
  // `.text` would include Gemma's thought parts; keep only the answer.
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  const answer = parts.filter((p) => !p.thought && p.text).map((p) => p.text).join('');
  return answer || requireText(res);
}

async function callEngine(engine: Engine, prompt: string, timeoutMs: number): Promise<string> {
  if (engine.provider === 'gemini') {
    try {
      return await callGemini(engine, prompt, timeoutMs);
    } catch (err) {
      if (engine.slowMs || !/503|UNAVAILABLE|high demand/i.test(String((err as Error)?.message))) throw err;
      await sleep(1_500);
      return callGemini(engine, prompt, timeoutMs);
    }
  }
  if (!isGroqConfigured()) throw new Error('GROQ_API_KEY not configured');
  const res = await groqGenerate(
    {
      model: engine.model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        maxOutputTokens: OUTPUT_TOKENS,
        temperature: 0.5,
        responseMimeType: 'application/json',
      },
    },
    { model: engine.model, scrub: false, reasoningEffort: 'low' }
  );
  return requireText(res);
}

function buildPrompt(input: { title: string; body: string; fullText: boolean; source: string; topic: string }): string {
  const lens = TOPIC_LENS[input.topic] ?? TOPIC_LENS.general;
  return `כותרת הכתבה:
"""
${input.title}
"""

${input.fullText ? 'הטקסט המלא של הכתבה (נשלף מאתר המקור):' : 'תקציר הכתבה בלבד (הטקסט המלא לא היה זמין — כתוב פחות, אל תשלים מהדמיון):'}
"""
${input.body || '(המקור סיפק כותרת בלבד — הסתמך עליה ואל תמציא פרטים)'}
"""

מקור: ${input.source.slice(0, 80) || 'לא צוין'}
קטגוריה: ${input.topic}
זווית הניתוח: ${lens}

הפק את שלושת החלקים לכתבה הזאת בלבד.`;
}

/**
 * The article's full body, fetched from the publisher. Bounded: the whole import (direct fetch,
 * then Jina Reader) races a budget so a slow origin can never eat the function's time.
 */
async function fetchFullText(link: string): Promise<{ body: string; image: string }> {
  const none = { body: '', image: '' };
  if (!/^https?:\/\//i.test(link)) return none;
  try {
    // Google-News mirror entries (Calcalist, Haaretz…) link to a news.google.com redirect whose
    // page is Google's consent wall — resolve it to the publisher's URL first.
    if (/^https?:\/\/news\.google\.com\//i.test(link)) {
      const resolved = await resolveGoogleNewsUrl(link, 5000);
      if (!resolved) return none;
      link = resolved;
    }
    const imported = await Promise.race([
      importUrlContent(link),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), FETCH_BUDGET_MS)),
    ]);
    const body = imported?.body?.trim() ?? '';
    if (imported) console.info(`[news-insights] full text via ${imported.via}/${imported.strategy}: ${body.length} chars`);
    return { body, image: /^https?:\/\//i.test(imported?.image ?? '') ? imported!.image : '' };
  } catch (err) {
    console.warn('[news-insights] full-text fetch failed:', (err as Error)?.message?.slice(0, 200));
    return none;
  }
}

function cleanList(value: unknown, min: number, max: number): string[] {
  return (Array.isArray(value) ? value : [])
    .map(cleanLine)
    .filter((line) => line.length >= min)
    .slice(0, max);
}

/** Parse + validate one engine's answer. Throws on an unusable shape so the chain moves on. */
function toInsights(raw: string, fullText: boolean): ArticleInsights {
  const parsed = parseJsonOrThrow<Record<string, unknown>>(stripCodeFence(raw), 'news insights');
  const tidy = (v: unknown) => scrubAiPhrases(normalizeModelUnicode(String(v ?? '')));
  const executiveSummary = cleanList((Array.isArray(parsed.executiveSummary) ? parsed.executiveSummary : []).map(tidy), 15, 4);
  const extendedArticle = cleanList((Array.isArray(parsed.extendedArticle) ? parsed.extendedArticle : []).map(tidy), 60, 3);
  const mrDanielAnalysis = cleanLine(tidy(parsed.mrDanielAnalysis));
  if (executiveSummary.length < 2 || extendedArticle.length < 1 || mrDanielAnalysis.length < 80) {
    throw new Error('model did not return a usable summary / article / analysis');
  }
  // No filler headline: if the model omitted it the modal renders the analysis without one.
  return { headline: cleanLine(tidy(parsed.headline)), executiveSummary, extendedArticle, mrDanielAnalysis, fullText };
}

// Concurrent opens of the same story share one generation instead of each spending quota.
const inFlight = new Map<string, Promise<ArticleInsights>>();

/**
 * Generates the modal's three sections for one article. Throws when every engine is unavailable or
 * unusable — callers must surface that rather than substituting boilerplate.
 */
export async function generateArticleInsights(input: InsightsInput): Promise<ArticleInsights> {
  if (!isInsightsConfigured()) throw new Error('no text engine configured');

  const title = String(input.title || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (title.length < 8) throw new Error('article title is missing or too short to analyze');

  const key = cacheKey({ ...input, title });
  const hit = readCache(key);
  if (hit) return { ...hit, cached: true };
  const pending = inFlight.get(key);
  if (pending) return pending;

  const run = (async () => {
    const started = Date.now();
    const teaser = String(input.summary || input.excerpt || '').replace(/\s+/g, ' ').trim();
    const page = await fetchFullText(String(input.link || ''));
    const fetched = compactArticle(page.body);
    const fullText = fetched.length >= MIN_FULL_TEXT && fetched.length > teaser.length;
    // Paragraph breaks are kept — they tell the model where the publisher's own sections are.
    const article = fullText ? fetched : teaser;
    const meta = { title, fullText, source: String(input.source || ''), topic: String(input.topic || 'general') };
    const overhead = estimateTokens(SYSTEM_INSTRUCTION) + estimateTokens(buildPrompt({ ...meta, body: '' }));

    const failures: string[] = [];
    for (const engine of ENGINES) {
      if (isBenched(engine)) {
        failures.push(`${engine.id}: benched`);
        continue;
      }
      if (engine.provider === 'gemini' && !genAI) continue;
      if (engine.provider === 'groq' && !isGroqConfigured()) continue;
      const budget = engine.provider === 'groq' ? GROQ_WINDOW - OUTPUT_TOKENS - overhead : engine.bodyTokens;
      if (budget < 400) {
        failures.push(`${engine.id}: prompt too large for its window`);
        continue;
      }
      const left = REQUEST_BUDGET_MS - (Date.now() - started);
      if (left < (engine.slowMs ?? 12_000)) {
        failures.push(`${engine.id}: skipped, ${Math.round(left / 1000)}s left`);
        continue;
      }
      const t0 = Date.now();
      try {
        const raw = await callEngine(engine, buildPrompt({ ...meta, body: fitToTokens(article, budget) }), Math.min(left, 60_000));
        const value = { ...toInsights(raw, fullText), ...(page.image ? { image: page.image } : {}) };
        console.info(`[news-insights] ${engine.id} answered in ${Date.now() - t0}ms (fullText=${fullText})`);
        writeCache(key, value);
        return value;
      } catch (err) {
        bench(engine, err);
        const msg = (err instanceof Error ? err.message : String(err)).replace(/\s+/g, ' ').slice(0, 160);
        console.warn(`[news-insights] ${engine.id} failed:`, msg);
        failures.push(`${engine.id}: ${msg}`);
      }
    }
    // Keeps the words the endpoint's 429 detection looks for when every leg was rate-limited.
    throw new Error(`all news engines unavailable — ${failures.join(' | ')}`);
  })();

  inFlight.set(key, run);
  try {
    return await run;
  } finally {
    inFlight.delete(key);
  }
}
