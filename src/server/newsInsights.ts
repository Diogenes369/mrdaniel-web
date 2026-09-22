import { genAI, isGroqConfigured, generateContentWithRetry, requireText, stripCodeFence, parseJsonOrThrow } from '../agent/geminiClient.js';
import { AUDIENCE_RULES } from '../agent/expertVoice.js';
import { estimateTokens } from '../agent/groqClient.js';
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

// Per-instance memo. Vercel keeps a Fluid Compute instance warm across requests, so a story that
// several visitors open in a row costs one Gemini call, not one per viewer.
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
 * Token budget for one call. Text routes to Groq first, whose free tier allows 8k tokens a MINUTE
 * (prompt + completion) and counts Hebrew at ~1 token per character (see groqClient.ts). The old
 * prompt carried the full voice + concision blocks (~5.6k tokens) before the article, which left
 * the completion clamped to 512 tokens and the JSON truncated. So this prompt keeps only the
 * audience block (the scrub in generateContentWithRetry still enforces the voice), reserves room
 * for the three sections, and gives the article whatever is left.
 */
// GROQ_TPM_BUDGET raises it on a paid tier (same env groqClient.ts reads), and with it the article share.
const TOKEN_WINDOW = (Number(process.env.GROQ_TPM_BUDGET) || 8_000) - 400;
const OUTPUT_TOKENS = 2_200;

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
 * The article's full body, fetched from the publisher. Bounded: the whole import (direct fetch,
 * then Jina Reader) races a budget so a slow origin can never eat the function's time.
 */
async function fetchFullText(link: string): Promise<string> {
  if (!/^https?:\/\//i.test(link)) return '';
  try {
    // Google-News mirror entries (Calcalist, Haaretz…) link to a news.google.com redirect whose
    // page is Google's consent wall — resolve it to the publisher's URL first.
    if (/^https?:\/\/news\.google\.com\//i.test(link)) {
      const resolved = await resolveGoogleNewsUrl(link, 5000);
      if (!resolved) return '';
      link = resolved;
    }
    const imported = await Promise.race([
      importUrlContent(link),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), FETCH_BUDGET_MS)),
    ]);
    const body = imported?.body?.trim() ?? '';
    if (imported) console.info(`[news-insights] full text via ${imported.via}/${imported.strategy}: ${body.length} chars`);
    return body;
  } catch (err) {
    console.warn('[news-insights] full-text fetch failed:', (err as Error)?.message?.slice(0, 200));
    return '';
  }
}

function cleanList(value: unknown, min: number, max: number): string[] {
  return (Array.isArray(value) ? value : [])
    .map(cleanLine)
    .filter((line) => line.length >= min)
    .slice(0, max);
}

/**
 * Generates the modal's three sections for one article. Throws when no engine is configured, the
 * call fails, or the answer is unusable — callers must surface that rather than substituting
 * boilerplate.
 */
export async function generateArticleInsights(input: InsightsInput): Promise<ArticleInsights> {
  if (!isInsightsConfigured()) throw new Error('no text engine configured');

  const title = String(input.title || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (title.length < 8) throw new Error('article title is missing or too short to analyze');

  const key = cacheKey({ ...input, title });
  const hit = readCache(key);
  if (hit) return { ...hit, cached: true };

  const teaser = String(input.summary || input.excerpt || '').replace(/\s+/g, ' ').trim();
  const fetched = await fetchFullText(String(input.link || ''));
  const fullText = fetched.length >= MIN_FULL_TEXT && fetched.length > teaser.length;
  const topic = String(input.topic || 'general');
  const lens = TOPIC_LENS[topic] ?? TOPIC_LENS.general;
  // Paragraph breaks are kept — they tell the model where the publisher's own sections are.
  const overhead = estimateTokens(SYSTEM_INSTRUCTION) + estimateTokens(title) + 350;
  const body = fitToTokens(fullText ? fetched : teaser, TOKEN_WINDOW - OUTPUT_TOKENS - overhead);

  const prompt = `כותרת הכתבה:
"""
${title}
"""

${fullText ? 'הטקסט המלא של הכתבה (נשלף מאתר המקור):' : 'תקציר הכתבה בלבד (הטקסט המלא לא היה זמין — כתוב פחות, אל תשלים מהדמיון):'}
"""
${body || '(המקור סיפק כותרת בלבד — הסתמך עליה ואל תמציא פרטים)'}
"""

מקור: ${String(input.source || 'לא צוין').slice(0, 80)}
קטגוריה: ${topic}
זווית הניתוח: ${lens}

הפק את שלושת החלקים לכתבה הזאת בלבד.`;

  const response = await generateContentWithRetry(
    {
      model: 'gemini-3.6-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        maxOutputTokens: OUTPUT_TOKENS,
        temperature: 0.5,
        topP: 0.9,
        responseMimeType: 'application/json',
      },
    },
    { textOnly: true }
  );

  // requireText() distinguishes a safety block from a truncated answer, so the endpoint reports
  // the real cause instead of a bare SyntaxError.
  const raw = stripCodeFence(requireText(response));
  const parsed = parseJsonOrThrow<Record<string, unknown>>(raw, 'news insights');
  const executiveSummary = cleanList(parsed.executiveSummary, 15, 4);
  const extendedArticle = cleanList(parsed.extendedArticle, 60, 3);
  const mrDanielAnalysis = cleanLine(parsed.mrDanielAnalysis);

  if (executiveSummary.length < 2 || extendedArticle.length < 1 || mrDanielAnalysis.length < 80) {
    throw new Error('model did not return a usable summary / article / analysis');
  }

  // No filler headline: if the model omitted it the modal renders the analysis without one.
  const value: ArticleInsights = {
    headline: cleanLine(parsed.headline),
    executiveSummary,
    extendedArticle,
    mrDanielAnalysis,
    fullText,
  };
  writeCache(key, value);
  return value;
}
