import { genAI, generateContentWithRetry, requireText, stripCodeFence, parseJsonOrThrow } from '../agent/geminiClient.js';
import { AUDIENCE_RULES, CONCISE_FACTUAL_RULES, EXPERT_VOICE_RULES } from '../agent/expertVoice.js';

/**
 * Article-grounded technical analysis ("ניתוח טכנולוגי ומשמעויות" / MR. DANIEL Analysis) for the
 * News Command Center modal.
 *
 * This REPLACES the old topic-keyed boilerplate that lived in src/lib/newsAnalysis.ts (a static
 * `IMPACT` table that printed the same "בדקו אם וקטור התקיפה…" / "ודאו כיסוי EDR/XDR…" text under
 * every cyber story). Every analysis is now produced by Gemini from the article's OWN title and
 * body, and there is deliberately NO generic fallback: if the model is unconfigured, rate-limited
 * or returns something unusable we throw, the endpoint answers with an honest error, and the modal
 * simply hides the section rather than showing filler that isn't about this story.
 */



export function isInsightsConfigured(): boolean {
  return genAI !== null;
}

export interface ArticleInsights {
  /** One line naming the concrete angle this specific story changes. */
  headline: string;
  /** Exactly 3 actionable, story-specific insights. */
  points: string[];
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

const SYSTEM_INSTRUCTION = `אתה דניאל בן ברוך — בונה סוכני AI ומפרק מודלי שפה. אתה כותב את מקטע "ניתוח טכנולוגי ומשמעויות" שמופיע מתחת לכתבת חדשות AI באתר MrDaniel.co.il.

${EXPERT_VOICE_RULES}

${AUDIENCE_RULES}

קיבלת כתבה אחת ספציפית. הפק ניתוח שנגזר אך ורק מהכתבה הזאת.

חוקי ברזל:
1. כל תובנה חייבת להזכיר במפורש את הנושא/הטכנולוגיה/החברה/המספר שמופיעים בכתבה עצמה. אם התובנה מתאימה גם לכתבה אחרת — היא פסולה, כתוב אותה מחדש.
2. אסור בהחלט טקסט גנרי או תבניתי. אסורות לחלוטין אמירות מסוג "AI משנה את העולם", "כדאי להתחיל להשתמש ב-AI", "המודלים משתפרים", "התחילו מתרחיש מדיד" — אלא אם הכתבה עצמה עוסקת ישירות בדיוק בזה, ואז בהקשר הקונקרטי שלה.
3. בדיוק 3 תובנות. כל תובנה משפט אחד עד שניים (25-45 מילים), ומלמדת משהו: איך המנגנון שבכתבה עובד, למה זה קרה, או מה זה מלמד על התחום. לא רשימת מטלות ולא הוראות תפעול — הקורא לומד את התחום, הוא לא מפעיל מערכת.
4. אל תמציא עובדות, מספרים, שמות או ציטוטים שלא הופיעו בכתבה. מותר להסיק משמעות — אסור להמציא מציאות.
4א. כל מספר שאתה מציין חייב לשמור בדיוק על היחידה והמשמעות שלו בכתבה. אם בכתבה כתוב "12.9 מיליארד דולר" — זה סכום כסף, אסור להפוך אותו להורדות, למשתמשים או למודלים. אם כתוב "14 מודלים נבדקו" — זה מודלים, לא משתמשים ולא מערכות. בספק — השמט את המספר לגמרי וכתוב את התובנה בלעדיו.
5. אם הכתבה עוסקת במודל AI חדש (למשל GPT-6 / AGI) — נתח מה המודל עושה אחרת, במה הוא עדיף ומה המחיר. אם היא עוסקת בסוכן או בכלי — נתח איך הוא עובד ואיפה הוא נשבר. וכן הלאה, לפי הנושא בפועל.
6. עברית תקנית, טון מקצועי ישיר ומסביר, בלי סופרלטיבים, בלי אימוג'ים, בלי "כידוע"/"בעולם של היום". כתוב בגוף שלישי או בפנייה ישירה מסבירה ("מה שקרה כאן הוא...", "שווה להבין ש..."), לא בשורת פקודות תפעוליות ("בדקו", "מפו", "ודאו", "הגדירו") — אלו פונות למישהו שמנהל מערכת, וזה לא הקורא.
7. מונחים טכניים באנגלית נשארים באנגלית ונכתבים במלואם (RAG, MCP, GPT-6) — בלי מקפים תלויים ובלי לפצל מילה לועזית.
8. אל תפתח שורה במקף, מקף מוביל, כוכבית או תבליט — הממשק מוסיף את התבליט בעצמו.
9. אל תזכיר את שם כלי ה-AI, אל תכתוב "לפי הכתבה" יותר מפעם אחת, ואל תסכם מחדש את הכתבה — הסיכום כבר מופיע מעליך.

השדה headline: משפט אחד קצר (עד 12 מילים) שאומר מה הדבר המעניין או המפתיע שיש כאן ללמוד, ספציפית לכתבה הזאת. לא כותרת הכתבה מחדש, ולא הוראה למה לעשות.

החזר JSON תקני בלבד, בלי code fence:
{"headline":"...","points":["...","...","..."]}`;

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

/**
 * Generates the 3 story-specific insights for one article. Throws when Gemini is unconfigured,
 * fails, or returns an unusable shape — callers must surface that rather than substituting
 * boilerplate.
 */
export async function generateArticleInsights(input: InsightsInput): Promise<ArticleInsights> {
  if (!genAI) throw new Error('GEMINI_API_KEY not configured');

  const title = String(input.title || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (title.length < 8) throw new Error('article title is missing or too short to analyze');

  const key = cacheKey({ ...input, title });
  const hit = readCache(key);
  if (hit) return { ...hit, cached: true };

  // Full available text — the feed's `summary` is the real lede (see server/newsFeed.ts), with the
  // shorter excerpt as a backstop. Capped so a long scrape can't blow the request up.
  const body = String(input.summary || input.excerpt || '').replace(/\s+/g, ' ').trim().slice(0, 6000);
  const topic = String(input.topic || 'general');
  const lens = TOPIC_LENS[topic] ?? TOPIC_LENS.general;

  const prompt = `כותרת הכתבה:
"""
${title}
"""

גוף הכתבה (כפי שסופק על ידי המקור):
"""
${body || '(המקור סיפק כותרת בלבד — הסתמך עליה ועל הקטגוריה, ואל תמציא פרטים)'}
"""

מקור: ${String(input.source || 'לא צוין').slice(0, 80)}
קטגוריה: ${topic}
זווית הניתוח המבוקשת: ${lens}

הפק את הניתוח לכתבה הספציפית הזאת בלבד.`;

  const response = await generateContentWithRetry({
    model: 'gemini-3.6-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction: `${SYSTEM_INSTRUCTION}

${CONCISE_FACTUAL_RULES}`,
      temperature: 0.55,
      topP: 0.9,
      responseMimeType: 'application/json',
    },
  });

  // requireText() distinguishes a safety block from a truncated answer; the bare JSON.parse below
  // it used to throw a raw SyntaxError ("Unexpected end of JSON input") straight to the endpoint.
  const raw = stripCodeFence(requireText(response));
  const parsed = parseJsonOrThrow<{ headline?: unknown; points?: unknown }>(raw, 'news insights');
  const headline = cleanLine(parsed.headline);
  const points = (Array.isArray(parsed.points) ? parsed.points : [])
    .map(cleanLine)
    .filter((p) => p.length >= 25)
    .slice(0, 3);

  if (points.length < 3) throw new Error('model did not return 3 usable insights');

  // No filler headline: if the model omitted it the modal simply renders the points without a
  // sub-heading, rather than printing a stock line that isn't about this story.
  const value: ArticleInsights = { headline, points };
  writeCache(key, value);
  return value;
}
