/**
 * The one voice every Hebrew generator writes in, and the filter that enforces it after the fact.
 *
 * Two halves on purpose. The rules block goes into the system instructions, which moves the model
 * most of the way. But the Threads importer already taught this codebase that prompting alone never
 * fully holds (see `stripSlideCta` in threadsThreadAgent.ts): the model still reaches for
 * "חשוב לציין" often enough that every tenth post reads machine-written. So `scrubAiPhrases` runs on
 * every model answer inside `generateContentWithRetry` — one choke point, so no call site can forget it.
 *
 * Kept separate from SocialAgentEngine.ts so geminiClient.ts can import it without pulling the whole
 * prompt corpus into the chat / translate / insights bundles (the same reason geminiClient exists).
 *
 * Voice ≠ audience: AUDIENCE_RULES still decides WHO the copy is for (SMB owners). This decides HOW
 * it sounds — a senior practitioner talking eye-to-eye, not a marketer and not a textbook.
 */

export const EXPERT_VOICE_RULES = `קול הכותב — כלל אדום:
- אתה כותב כמו מומחה IT / סייבר / פיתוח ישראלי בכיר שמדבר ישירות עם עמית: ישיר, פרקטי, בגובה העיניים. לא מרצה, לא איש שיווק, לא ספר לימוד.
- משפטים קצרים. פסקה של משפט אחד היא לגיטימית. מתחילים מהשורה התחתונה, לא מהרקע.
- דעה ברורה: מותר ורצוי לכתוב "לדעתי", "מניסיון בשטח", "פה רוב האנשים טועים", "זה overrated" — בתנאי שהדעה נשענת על מה שכתוב במקור ולא ממציאה עובדה.
- הקשר מהשטח: מה זה אומר ביום שני בבוקר — איזה מסך פותחים, מה בודקים, מה שובר את הפרודקשן.
- ז'רגון מקצועי כמו שמדברים אותו בפועל בתעשייה בישראל (דיפלוי, פרודקשן, באג, להרים סביבה, לוגים, הרשאות, טוקן) — מדויק, לא לקישוט ולא בכל משפט.
- מותר קצת חספוס אנושי: משפט שבור לאפקט ("וזהו. זה כל הסוד."), שאלה רטורית אחת, "תכל'ס". אסור שגיאות כתיב או דקדוק.
- אסור לחלוטין (נמחק אוטומטית גם אם ייכתב): "בעידן הדיגיטלי", "בעידן ה-AI", "בעולם של היום", "חשוב לציין", "חשוב לזכור", "בואו נצלול", "מהפכני/ת", "פורץ/ת דרך", "משנה את כללי המשחק", "לסיכום", "הנה כמה דרכים", "ללא ספק", "לשלב הבא".
- אין פתיח ואין סיכום. לא "במאמר הזה נסקור", לא "לסיכום, ראינו ש". הנקודה האחרונה היא הסוף.`;

/**
 * The caption half of the voice, for Instagram and TikTok.
 *
 * Added when the carousel renderer took over the teaching: slides now carry 30–60 word paragraphs,
 * so a caption that also explains the topic competes with them and the post gets scrolled past. The
 * caption's only job is to earn the swipe. Limits are numeric on purpose — "short and punchy" gets
 * 150 words back from every model, "3 sentences, 45 words, then stop" gets 3 sentences.
 *
 * LinkedIn deliberately does not use this: it is a long-form feed and a 3-sentence post underperforms
 * there. Mirrored for the local Ollama path in `mcp-server/src/copy-rules.js`.
 */
export function shortCaptionRules(hasCarousel: boolean): string {
  return `כללי כיתוב — כלל אדום:
- 3 משפטים קצרים לכל היותר, ואז CTA אחד. סך הכל עד 45 מילים. זו תקרה, לא יעד.
- המשפט הראשון עוצר גלילה בכוחות עצמו: אמירה חדה, מספר, או הטעות שכולם עושים. לא שאלה גנרית ולא "רוצים לדעת איך".
${hasCarousel ? '- התוכן הכבד יושב בשקפים. הכיתוב לא מסביר אותם, לא מסכם אותם ולא חוזר על ההוק — הוא רק גורם למישהו להחליק ימינה.' : '- אין קרוסלה, ולכן המשפטים חייבים לעמוד לבד. עדיין עד המגבלה למעלה — משפט אחד חד עדיף על שלושה כלליים.'}
- CTA אחד בלבד בסוף, קונקרטי (שמרו / כתבו לי X / קישור בביו). לא שניים ולא שלושה.
- בלי קישורים ובלי URL בגוף הכיתוב (אינסטגרם לא הופכת אותם ללחיצים ממילא).
- אימוג'י אחד לכל היותר, ורק אם הוא מוסיף. לא אימוג'י לכל שורה.`;
}

/** A banned phrase and what replaces it. Replacements are chosen so the sentence around them stays
 *  grammatical Hebrew — removal where the phrase is pure filler, a plain synonym where it carries
 *  meaning (an adjective can't just vanish from "גישה מהפכנית"). */
const RULES: Array<[RegExp, string | ((match: string) => string)]> = [
  // Filler openers — drop the phrase and the comma/"ש"/"כי" that hung off it.
  [/(?:ו?ב)?עידן ה(?:דיגיטלי|[-־]?AI|בינה המלאכותית)\s*(?:של היום)?\s*[,،]?\s*/g, ''],
  [/(?:ו?ב)עולם של היום\s*[,،]?\s*/g, ''],
  [/(?:ו?)חשוב (?:לציין|לזכור|להדגיש)\s*(?:כי|ש|,)?\s*/g, ''],
  [/(?:ו?)בואו נצלול(?:\s+(?:פנימה|לעומק|לזה|לפרטים))?\s*[.:!…]*\s*/g, ''],
  [/(?:ו?)ללא ספק\s*[,،]?\s*/g, ''],
  // At the start of a line, a sentence or a JSON string value ("title":"לסיכום: …").
  [/(?:^|(?<=[\n.!?"]\s*))לסיכום\s*[,:—-]?\s*/gm, ''],
  [/\s*[,،]\s*לסיכום\s*[,:]?\s*/g, ', '],
  // Meaning-bearing clichés — swap for the plain word.
  [/הנה כמה דרכים/g, 'דרכים שעובדות בפועל'],
  [/מהפכנית/g, 'חדשה לגמרי'],
  [/מהפכניות/g, 'חדשות לגמרי'],
  [/מהפכניים/g, 'חדשים לגמרי'],
  [/מהפכני/g, 'חדש לגמרי'],
  [/פורצ(?:ת|ות) דרך/g, 'חדשנית'],
  [/פורצי דרך/g, 'חדשניים'],
  [/פורץ דרך/g, 'חדשני'],
  [/משנה את כללי המשחק/g, 'משנה את התמונה'],
  [/(?:ל)?שלב הבא/g, (m) => (m.startsWith('ל') ? 'לרמה הבאה' : 'הרמה הבאה')],
];

/** Hebrew letter present at all — the scrubber is a no-op on English image prompts and code. */
const HEBREW = /[֐-׿]/;

/**
 * Removes the banned AI-cliché phrases from generated Hebrew text.
 *
 * Safe on JSON: every rule only deletes or rewrites words and punctuation *inside* a string value
 * (never a quote, brace or backslash), so a JSON answer still parses after scrubbing. The one
 * whitespace side effect — a doubled space where a phrase was cut — is collapsed without touching
 * newlines, which carry paragraph structure in posts.
 */
export function scrubAiPhrases(text: string): string {
  if (!text || !HEBREW.test(text)) return text;
  let out = text;
  for (const [re, rep] of RULES) out = typeof rep === 'string' ? out.replace(re, rep) : out.replace(re, rep);
  return out.replace(/[ \t]{2,}/g, ' ').replace(/ +([,.:;!?])/g, '$1');
}
