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
 * Voice ≠ audience: AUDIENCE_RULES still decides WHO the copy is for (people learning AI — LLMs,
 * agents, practical AI; the site went AI-only on 2026-09-21). This decides HOW it sounds — a senior practitioner explaining something to someone who
 * wants into the field, not a marketer, not a textbook, and not a colleague briefing.
 *
 * The "explaining" framing replaced "talking eye-to-eye with a peer" on 2026-09-20 with the audience
 * retarget. A peer briefing is allowed to assume the jargon; a learner brief is not, and the two
 * produce visibly different copy from the same article — which is why the term-gloss rule below is
 * part of the voice rather than left to the host prompt.
 */

export const EXPERT_VOICE_RULES = `קול הכותב — כלל אדום:
- אתה כותב כמו מומחה AI ישראלי בכיר — מי שבונה סוכנים ועובד עם מודלי שפה כל יום — שמסביר משהו למישהו שרוצה להיכנס לתחום: ישיר, פרקטי, בגובה העיניים, ובלי להתנשא. לא מרצה באוניברסיטה, לא איש שיווק, לא ספר לימוד.
- הקורא חכם אבל עדיין לומד. זה אומר: להסביר, לא לפשט יתר על המידה ולא להניח ידע מוקדם. אף פעם לא "כידוע", "כמו שכולנו יודעים" או "ברור ש" — אם זה היה ברור, לא היה צריך לכתוב את זה.
- מונח מקצועי מוסבר בחצי משפט בפעם הראשונה שהוא מופיע, ואז משתמשים בו בחופשיות: "RAG — שליפה של קטעים רלוונטיים מהמסמכים שלכם לפני שהמודל עונה". ההסבר הוא חלק מהמשפט, לא הערת שוליים ולא סוגריים ארוכים. מונח שאי אפשר להסביר בחצי משפט כנראה לא צריך להופיע בכלל.
- משפטים קצרים. פסקה של משפט אחד היא לגיטימית. מתחילים מהשורה התחתונה, לא מהרקע.
- דעה ברורה: מותר ורצוי לכתוב "לדעתי", "מניסיון בשטח", "פה רוב האנשים טועים", "זה overrated" — בתנאי שהדעה נשענת על מה שכתוב במקור ולא ממציאה עובדה.
- הקשר מהשטח: איך זה נראה בפועל — איזה מסך פותחים, מה קורה כשזה נשבר, איך זה עובד מתחת למכסה המנוע. זה מה שהופך ידיעה למשהו שלומדים ממנו.
- המטרה היא שהקורא יסיים את הקריאה וידע משהו שהוא לא ידע קודם, ויבין למה זה מעניין. לא שיצא עם רשימת מטלות.
- ז'רגון מקצועי כמו שמדברים אותו בפועל בתעשייה בישראל (דיפלוי, פרודקשן, באג, להרים סביבה, לוגים, הרשאות, טוקן) — מדויק, לא לקישוט ולא בכל משפט.
- מותר קצת חספוס אנושי: משפט שבור לאפקט ("וזהו. זה כל הסוד."), שאלה רטורית אחת, "תכל'ס". אסור שגיאות כתיב או דקדוק.
- אסור לחלוטין (נמחק אוטומטית גם אם ייכתב): "בעידן הדיגיטלי", "בעידן ה-AI", "בעולם של היום", "בעולם הדינמי", "בעולם המשתנה", "עידן חדש", "חשוב לציין", "חשוב לזכור", "בואו נצלול", "מהפכני/ת", "פורץ/ת דרך", "משנה את כללי המשחק", "לסיכום", "הנה כמה דרכים", "ללא ספק", "לשלב הבא".
- מבחן הביטול: אם אפשר למחוק משפט שלם והפסקה לא מאבדת כלום — הוא לא היה שם בשביל הקורא. מחק אותו. זה תופס בעיקר את משפט הרקע הראשון ואת משפט הסיכום האחרון.
- אין פתיח ואין סיכום. לא "במאמר הזה נסקור", לא "לסיכום, ראינו ש". הנקודה האחרונה היא הסוף.`;

/**
 * WHO every generator writes for. Retargeted 2026-09-20, by explicit decision: the audience is
 * people LEARNING the field, not people running a company.
 *
 * It previously said "SMB owners", and before that the copy drifted enterprise on its own — a news
 * feed full of CVEs and breach reports pulls a model toward "map your endpoints, audit your IAM"
 * unless something holds it back, because that is what its training data does with those words.
 * Two rewrites have now confirmed the same thing: naming the audience positively is not enough on
 * its own, so the enterprise vocabulary is *also* banned outright below. Keep both halves.
 *
 * The translation rule is the load-bearing one. Most source articles genuinely are about large
 * organisations; the job is not to skip those stories but to answer "what does this teach me",
 * which is a question a learner can act on and an org-chart question is not.
 */
export const AUDIENCE_RULES = `קהל יעד — כלל אדום, ללא יוצא מן הכלל:
- אתה כותב לאנשים פרטיים שרוצים ללמוד ולהיכנס לתחום המבוקש בעולם: בינה מלאכותית — מודלי שפה, סוכני AI ויישומים מעשיים. מתחילים, חובבי טכנולוגיה, סטודנטים, אנשים באמצע הסבה מקצועית, וכל מי שסקרן ורוצה להבין איך זה באמת עובד.
- אסור לפנות ל"ארגונים", "מנהלי IT", "צוותי אבטחה", "CISO", "הנהלת חברה", "בעלי עסקים" או לעולם ה-Enterprise. אסור לכתוב "בארגון שלכם", "בחברה שלכם", "אצלכם בעסק" או "משתמשי הקצה שלכם" — לקורא אין ארגון, אין צוות ואין תקציב.
- אסור לבנות את התוכן סביב פעולות שרק בעל תפקיד בארגון יכול לבצע: "מפו את נקודות הקצה", "בצעו אודיט", "הגדירו ב-Group Policy או ב-MDM", "ודאו כיסוי EDR/XDR", "אמצו Zero-Trust". לקורא אין את ההרשאות האלה ואין לו את המערכות האלה.
- אם הכתבה עוסקת בארגון גדול, בתאגיד או בתשתית ארגונית — זה בסדר גמור, אל תדלג עליה. תרגם אותה לשאלה שהקורא כן יכול לפעול לפיה: מה המנגנון שעמד מאחורי האירוע, איזה עיקרון אפשר ללמוד ממנו, ואיפה הוא נוגע למישהו שלומד את התחום. "מה זה מלמד אותי" במקום "מה עליי לעשות בארגון".
- התחום הוא AI בלבד: חדשות AI, מודלי שפה, סוכנים אוטונומיים ויישום מעשי. לא סייבר, לא אבטחת מידע ולא IT ארגוני — גם כשהכתבה נוגעת בהם, הזווית היא ה-AI שבה.
- מונחים ארגוניים (EDR, IAM, SIEM, Zero-Trust, Group Policy) מותרים רק כשהכתבה עוסקת בהם ורק כידע — כלומר מוסברים בקצרה כשהם מופיעים לראשונה, כי הם חלק ממה שהקורא בא ללמוד. לא כהוראת ביצוע.`;

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

/**
 * The concision + factuality contract for news summaries and post drafting.
 *
 * Written 2026-09-21 against a specific complaint: the copy read like AI. It opened on a scene-
 * setting clause, asked a question nobody wanted answered, padded the middle with adjectives and
 * closed on another question.
 *
 * ## It deliberately contradicts ENGAGEMENT_RULES, and wins where both apply
 *
 * `ENGAGEMENT_RULES` (SocialAgentEngine.ts) tells the model to close every post on an open
 * question, because that block was written to raise comment counts. For NEWS summaries and news
 * post drafting that instruction is now revoked: an IT peer reading a security advisory does not
 * want to be asked how it makes them feel. Any prompt that includes both blocks must include this
 * one LAST — the later instruction is the one the model follows on a direct conflict, and this
 * block says so in its own text so the model resolves it rather than averaging the two.
 */
export const CONCISE_FACTUAL_RULES = `סגנון כתיבה — כלל אדום, גובר על כל הנחיה סותרת קודמת בפרומפט הזה:

1. טון — עמית למקצוע, לא משווק:
   - כותבים למי שעוקב אחרי עולם ה-AI ומבין אותו. ישר, מקצועי, ענייני. בלי התלהבות מלאכותית ובלי סימני קריאה.
   - מתחילים מהעובדה הכי חזקה שיש במקור. המשפט הראשון הוא כבר תוכן, לא הקדמה לתוכן.

2. אסור בהחלט — מילוי מילים (כל אלה פוסלים את הפלט):
   - "בעולם המודרני", "בעידן הבינה המלאכותית", "בעולם של היום", "בתקופה הנוכחית", "כידוע", "אין זה סוד ש", "חשוב לציין", "יש לציין כי", "לסיכום", "בואו נצלול", "ללא ספק".
   - תארים ריקים: "מהפכני", "פורץ דרך", "משנה את כללי המשחק", "עוצמתי במיוחד".
   - משפט פתיחה שמתאר את התחום במקום את הידיעה.

3. אסור בהחלט — שאלות רטוריות:
   - אין שאלה בפתיחה ואין שאלה בסיום. לא "האם תהיתם", לא "ידעתם ש", לא "מה דעתכם", לא "מעניין, לא?".
   - שאלה מותרת רק אם היא מצוטטת מהמקור עצמו.

4. עובדתיות מוחלטת:
   - אך ורק מה שכתוב במקור: מספרים, שמות, תאריכים, גרסאות, שמות חולשות (CVE) — בדיוק כפי שהופיעו.
   - אסור להוסיף דעה, הערכה, תחזית או הקשר שלא הופיע במקור. אם פרט לא מופיע — הוא לא נכתב.
   - אם המקור דל מכדי לכתוב ממנו, כתוב פחות. טקסט קצר ונכון עדיף על פסקה מנופחת.

5. מבנה — קצר וחד:
   - פסקאות של 2-3 משפטים לכל היותר, או תבליטים של שורה אחת כל אחד.
   - כל משפט נושא עובדה אחת. משפט שאפשר למחוק בלי לאבד מידע — נמחק.
   - בלי חזרה על הכותרת בגוף הטקסט.`;

/** A banned phrase and what replaces it. Replacements are chosen so the sentence around them stays
 *  grammatical Hebrew — removal where the phrase is pure filler, a plain synonym where it carries
 *  meaning (an adjective can't just vanish from "גישה מהפכנית"). */
const RULES: Array<[RegExp, string | ((match: string) => string)]> = [
  // Filler openers — drop the phrase and the comma/"ש"/"כי" that hung off it.
  [/(?:ו?ב)?עידן ה(?:דיגיטלי|[-־]?AI|בינה המלאכותית)\s*(?:של היום)?\s*[,،]?\s*/g, ''],
  [/(?:ו?ב)עולם של היום\s*[,،]?\s*/g, ''],
  // Added 2026-09-20 with the tone pass: the two openers the model reached for once "בעולם של
  // היום" was blocked. Same shape, same job — a sentence of throat-clearing before the point.
  [/(?:ו?ב)עולם ה(?:דינמי|משתנה)(?:\s+(?:של היום|שלנו))?\s*[,،]?\s*/g, ''],
  [/(?:ו?)חשוב (?:לציין|לזכור|להדגיש)\s*(?:כי|ש|,)?\s*/g, ''],
  [/(?:ו?)בואו נצלול(?:\s+(?:פנימה|לעומק|לזה|לפרטים))?\s*[.:!…]*\s*/g, ''],
  [/(?:ו?)ללא ספק\s*[,،]?\s*/g, ''],
  // At the start of a line, a sentence or a JSON string value ("title":"לסיכום: …").
  [/(?:^|(?<=[\n.!?"]\s*))לסיכום\s*[,:—-]?\s*/gm, ''],
  [/\s*[,،]\s*לסיכום\s*[,:]?\s*/g, ', '],
  // Meaning-bearing clichés — swap for the plain word.
  [/הנה כמה דרכים/g, 'דרכים שעובדות בפועל'],
  // "עידן חדש" carries a noun, so it is swapped rather than cut — deleting it leaves "נכנסנו ל".
  // The prefix letter (ב/ל/ה) is outside the match, so "בעידן חדש" becomes "בשלב חדש" and stays
  // grammatical.
  [/עידן חדש/g, 'שלב חדש'],
  [/מהפכנית/g, 'חדשה לגמרי'],
  [/מהפכניות/g, 'חדשות לגמרי'],
  [/מהפכניים/g, 'חדשים לגמרי'],
  [/מהפכני/g, 'חדש לגמרי'],
  [/פורצ(?:ת|ות) דרך/g, 'חדשנית'],
  [/פורצי דרך/g, 'חדשניים'],
  [/פורץ דרך/g, 'חדשני'],
  [/משנה את כללי המשחק/g, 'משנה את התמונה'],
  [/(?:ל)?שלב הבא/g, (m) => (m.startsWith('ל') ? 'לרמה הבאה' : 'הרמה הבאה')],

  // ── 2026-09-21 concision pass ───────────────────────────────────────────────────────────────
  // Openers the model fell back on once the blocks above closed the obvious ones. Same failure
  // every time: a sentence of throat-clearing before the first real fact.
  [/(?:ו?ב)עולם ה?מודרני\s*[,،]?\s*/g, ''],
  [/(?:ו?ב)תקופה ה(?:נוכחית|אחרונה)\s*[,،]?\s*/g, ''],
  [/(?:ו?)כידוע\s*[,،]?\s*/g, ''],
  [/(?:ו?)כפי שאנו יודעים\s*[,،]?\s*/g, ''],
  [/(?:ו?)אין זה סוד ש/g, ''],
  [/(?:ו?)יש לציין (?:כי|ש)\s*/g, ''],
  [/(?:ו?)במאמר (?:זה|הזה)\s*[,،]?\s*/g, ''],
  [/(?:ו?)בפוסט (?:זה|הזה)\s*[,،]?\s*/g, ''],

  // Rhetorical openers. These are ALWAYS a full clause ending in a question mark, so the whole
  // clause goes — trimming just the stem would leave a dangling "?" mid-paragraph.
  [/(?:^|(?<=[\n.!?]\s*))(?:האם\s+)?(?:תהיתם|חשבתם|ידעתם|שמתם לב|דמיינו)[^.!?\n]*\?\s*/gm, ''],
  [/(?:^|(?<=[\n.!?]\s*))מה אם[^.!?\n]*\?\s*/gm, ''],
  [/(?:^|(?<=[\n.!?]\s*))רוצים לדעת[^.!?\n]*\?\s*/gm, ''],

  // Closing engagement bait. The repo already forbids "תגיבו"/"שתפו" in the prompts; this removes
  // the softer variants the model substitutes for them.
  [/\s*(?:מה דעתכם|מעניין,? לא|נשמח לשמוע)[^.!?\n]*\?\s*$/gm, ''],
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
