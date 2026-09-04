import { GoogleGenAI } from '@google/genai';

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

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

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

const TOPIC_LENS: Record<string, string> = {
  cyber: 'זווית הסייבר וההגנה — מי בדיוק חשוף לפי הכתבה, ומה משתנה בפועל בסביבת ה-IT.',
  ai: 'זווית אימוץ ה-AI בארגון — מה הטכנולוגיה שבכתבה מאפשרת או מסכנת בתהליך עבודה אמיתי.',
  cloud: 'זווית התשתית והפיתוח — מה משתנה בארכיטקטורה, בעלות או בביצועים לפי הכתבה.',
  general: 'זווית ההחלטה הטכנולוגית — מה בכתבה משנה תהליך, עלות או סיכון בפועל.',
};

const SYSTEM_INSTRUCTION = `אתה דניאל בן ברוך — מומחה מערכות IT, אבטחת סייבר ובינה מלאכותית. אתה כותב את מקטע "ניתוח טכנולוגי ומשמעויות" שמופיע מתחת לכתבת חדשות טכנולוגיה באתר MrDaniel.co.il.

קיבלת כתבה אחת ספציפית. הפק ניתוח שנגזר אך ורק מהכתבה הזאת.

חוקי ברזל:
1. כל תובנה חייבת להזכיר במפורש את הנושא/הטכנולוגיה/החברה/המספר שמופיעים בכתבה עצמה. אם התובנה מתאימה גם לכתבה אחרת — היא פסולה, כתוב אותה מחדש.
2. אסור בהחלט טקסט גנרי או תבניתי. אסורות לחלוטין אמירות מסוג "ודאו כיסוי EDR/XDR", "בדקו אם וקטור התקיפה רלוונטי", "אמצו Zero-Trust", "התחילו מתרחיש מדיד" — אלא אם הכתבה עצמה עוסקת ישירות בדיוק בזה, ואז בהקשר הקונקרטי שלה.
3. בדיוק 3 תובנות. כל תובנה משפט אחד עד שניים (25-45 מילים), פרקטית ובת-ביצוע: מה לבדוק, מה לשנות, מה זה אומר על החלטה קרובה.
4. אל תמציא עובדות, מספרים, שמות או ציטוטים שלא הופיעו בכתבה. מותר להסיק משמעות — אסור להמציא מציאות.
4א. כל מספר שאתה מציין חייב לשמור בדיוק על היחידה והמשמעות שלו בכתבה. אם בכתבה כתוב "12.9 מיליארד דולר" — זה סכום כסף, אסור להפוך אותו להורדות, למשתמשים או למודלים. אם כתוב "14 ארגונים נפגעו" — זה ארגונים, לא שרתים ולא מערכות. בספק — השמט את המספר לגמרי וכתוב את התובנה בלעדיו.
5. אם הכתבה עוסקת במודל AI חדש (למשל GPT-6 / AGI) — נתח את ההשלכה על אוטומציה, על אבטחת מידע ארגונית ועל אופן השילוב במערכות קיימות. אם היא עוסקת בפרצה — נתח את המערכת הספציפית שנפרצה ואת מי שמריץ אותה. וכן הלאה, לפי הנושא בפועל.
6. עברית תקנית, גוף שני רבים ("בדקו", "מפו"), טון מקצועי ישיר בלי סופרלטיבים, בלי אימוג'ים, בלי "כידוע"/"בעולם של היום".
7. מונחים טכניים באנגלית נשארים באנגלית ונכתבים במלואם (EDR, Kubernetes, GPT-6) — בלי מקפים תלויים ובלי לפצל מילה לועזית.
8. אל תפתח שורה במקף, מקף מוביל, כוכבית או תבליט — הממשק מוסיף את התבליט בעצמו.
9. אל תזכיר את שם כלי ה-AI, אל תכתוב "לפי הכתבה" יותר מפעם אחת, ואל תסכם מחדש את הכתבה — הסיכום כבר מופיע מעליך.

השדה headline: משפט אחד קצר (עד 12 מילים) שאומר למי ולמה זה משנה, ספציפית לכתבה הזאת. לא כותרת הכתבה מחדש.

החזר JSON תקני בלבד, בלי code fence:
{"headline":"...","points":["...","...","..."]}`;

/** Strips a ```json fence the model sometimes wraps JSON in despite responseMimeType. */
function stripCodeFence(text: string): string {
  return text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

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

  const response = await genAI.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.55,
      topP: 0.9,
      responseMimeType: 'application/json',
    },
  });

  const raw = stripCodeFence(response.text?.trim() || '');
  if (!raw) throw new Error('model returned an empty analysis');

  const parsed = JSON.parse(raw) as { headline?: unknown; points?: unknown };
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
