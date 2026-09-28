/**
 * Anti-slop — the copy filter for designed carousels, adapted from github.com/miqdadbadjuber/anti-slop
 * (skills/antislop-copywriting, read 2026-09-28) to Hebrew Instagram copy.
 *
 * Two halves, the same split as expertVoice.ts: the rules block moves the model most of the way,
 * and `detectSlop` catches what slips so the carousel verifier (src/server/carouselVerifier.ts) can
 * report it and drop the sentences that are pure ceremony. EXPERT_VOICE_RULES already bans a list of
 * Hebrew clichés word for word; this file is about the PATTERNS the upstream skill names — the shapes
 * a model reaches for whatever the vocabulary — which a word list cannot catch.
 *
 * Deliberate deviation from upstream: anti-slop bans the em dash outright (its R-02). This repo's
 * Hebrew copy uses "—" as real punctuation (AGENTS.md, unicode hygiene), so the rule here is "at most
 * one per slide", and a cluster is reported as a tell rather than rewritten. Upstream itself says an
 * em dash is evidence only inside a cluster.
 *
 * Kept free of engine imports so the dashboard can mirror the detector later without the prompt corpus.
 */

export const ANTI_SLOP_RULES = `פילטר anti-slop — כלל אדום. הקרוסלה נקראת שקופית אחרי שקופית, וכל תבנית של "AI כתב את זה" עולה בשמירות:
- אוצר מילים ריק: אסור "לפתוח את הפוטנציאל", "לקחת לשלב/לרמה הבאה", "חוויה חלקה", "עוצמתי", "חדשני" בלי לומר מה חדש, "מסע", "עולם שלם של", "חלק בלתי נפרד". כתבו מה הדבר עושה בפועל.
- ניפוח חשיבות: אסור "עידן חדש", "רגע מכונן", "נקודת מפנה", "העתיד של X", "צעד משמעותי". אם יש ראיה — כתבו את הראיה (המספר, השם, הגרסה) מהמקור.
- הקבלה שלילית: אסור "זה לא רק X, זה Y", "לא רק X אלא גם Y", ושברירי הדגשה בסוף משפט ("בלי ניחושים", "בלי בזבוז").
- נוסחאות אפוריזם: אסור "X הוא השפה של Y", "X הוא המטבע של Z", "זה לא כלי, זו מראה".
- דרמת סטקטו: לכל היותר משפט קצר אחד להדגשה בשקופית. לא רצף של שלושה שברי משפט.
- חוק השלוש: רשימה מכילה כמה פריטים שהתוכן באמת מכיל — לא שלישייה מאולצת בכל שקופית.
- כרוזי פתיחה: אסור "בואו נצלול", "הנה מה שצריך לדעת", "בפוסט הזה נסקור", "בלי הקדמות". עושים, לא מכריזים.
- פתיחי כנות מזויפים: אסור "בכנות?", "האמת?", "הנה העניין".
- טרופי סמכות: אסור "בבסיס הכל", "השאלה האמיתית היא", "מה שבאמת משנה", "בלב העניין".
- ייחוס עמום: אסור "מומחים אומרים", "לפי הערכות", "רבים טוענים" — או שם המקור מהטקסט, או שהמשפט יוצא.
- טווח מזויף: אסור "מ-X ועד Y, וכל מה שביניהם".
- סיום אופטימי גנרי: אסור "העתיד נראה מבטיח", "ימים מרגשים", "צעד בכיוון הנכון". השקופית נגמרת בעובדה הקונקרטית האחרונה.
- סגירות צ'טבוט: אסור "מקווה שעזר", "אשמח לענות על שאלות".
- נושא דומם עם פועל אנושי: לא "הדאטה מספר לנו", "המודל מבין מה אתם צריכים". כתבו מה המערכת עושה.
- הדגשה במרכאות, אימוג'י בכותרות, וקו מפריד ארוך (—) יותר מפעם אחת בשקופית — אסורים.
- מילוי: לא "על מנת ש" במקום "כדי", לא "בשל העובדה ש" במקום "כי", ולא יותר מהסתייגות אחת על אותה טענה.
- אל תעקרו את הקול: משפטים באורכים שונים, פרט ספציפי ולא מעוגל, ודעה אחת ברורה שנשענת על המקור — זה מה שנשמע אנושי.
- דיוק טענה (מתוך "Honesty & Evidence" של anti-slop): כל טענה נשארת בגודל שלה במקור. מספר השוואתי ("פי 193", "81% מול 84.4%") מופיע יחד עם מה שנמדד ומי מדד, ואסור להחיל אותו על דבר אחר — תוצאה של הערכה פנימית אחת לא הופכת ל"כל 20 המשימות". אסור לחזק או להחליף מילת תיאור: "state-changing" אינו "מסוכן", "worth turning into skills" אינו "מוצלח", "about 7.1 seconds" אינו "בבקשה אחת".
- לפני שמחזירים: שאלו "מה פה נשמע כמו AI?" ו"האם יש פה עובדה, שם, מספר או תאריך שלא מופיעים במקור?" ותקנו את שני הדברים.`;

export type SlopKind =
  | 'empty-vocabulary'
  | 'significance-inflation'
  | 'negative-parallelism'
  | 'aphorism'
  | 'signposting'
  | 'fake-candid'
  | 'authority-trope'
  | 'weasel'
  | 'false-range'
  | 'generic-conclusion'
  | 'chatbot-closer'
  | 'staccato'
  | 'em-dash-cluster'
  | 'emoji-heading'
  | 'filler';

export interface SlopHit {
  kind: SlopKind;
  match: string;
}

/**
 * Pattern → kind. `sentence: true` marks tells that ARE the whole sentence's purpose (a signpost, a
 * sign-off): those sentences can be removed without losing a fact. Everything else is only reported,
 * because rewriting it needs the model — a deterministic edit would change meaning.
 */
const PATTERNS: { kind: SlopKind; re: RegExp; sentence?: boolean }[] = [
  { kind: 'empty-vocabulary', re: /(?:לפתוח|למצות|לשחרר) את (?:מלוא )?הפוטנציאל|לקחת (?:את \S+ )?(?:לשלב|לרמה) הבא|חוויה חלקה|חלק בלתי נפרד|עולם שלם של|משנה(?:ת)? את כללי המשחק|game.?changer|next.?level|seamless/iu },
  { kind: 'significance-inflation', re: /עידן חדש|רגע מכונן|נקודת מפנה|צעד (?:משמעותי|היסטורי|דרמטי) (?:קדימה|בדרך)|מהפכה של ממש|העתיד של ה?\S+ (?:כבר )?כאן/u },
  { kind: 'negative-parallelism', re: /(?:^|[\s.])זה לא רק\s[^.!?]{1,60}[,،]\s*זה\s|לא רק\s[^.!?]{1,60}\sאלא גם\s/u },
  // The Hebrew headline form of the same formula: "לא צ'אט, אלא מנוע החלטות". Anchored to the start
  // so an ordinary mid-sentence "לא ... אלא" (real contrast inside an argument) is not flagged.
  { kind: 'negative-parallelism', re: /^\s*(?:זה |הוא |היא )?לא [^,.!?\n]{1,40}[,،]\s*אלא\s/u },
  { kind: 'aphorism', re: /הוא השפה של|היא השפה של|הוא המטבע של|היא המטבע של|זה לא כלי[,،]? (?:זו|זאת) מראה/u },
  { kind: 'signposting', re: /בואו נצלול|הנה מה שצריך לדעת|בפוסט (?:הזה|הבא) (?:נסקור|נעבור)|בקרוסלה הזו נסקור|בלי הקדמות|בלי יותר מדי הקדמות/u, sentence: true },
  { kind: 'fake-candid', re: /(?:^|[.!?]\s*)(?:בכנות|האמת)\?|הנה העניין[:,]/u },
  { kind: 'authority-trope', re: /בבסיס הכ(?:ו)?ל|השאלה האמיתית היא|מה שבאמת משנה|בלב העניין/u },
  // "לפי הערכות" is weasel only when nobody is named: "לפי הערכות החברה" / "…של TypeSafe" attribute.
  { kind: 'weasel', re: /מומחים (?:אומרים|טוענים|מעריכים)|לפי הערכות(?!\s+(?:ה?חברה|של\s|\p{Lu}|[A-Za-z]))|רבים טוענים|יש הטוענים/u },
  { kind: 'false-range', re: /מ-?\S+ ועד \S+[,،]? וכל מה שביניהם/u },
  { kind: 'generic-conclusion', re: /העתיד נראה (?:מבטיח|ורוד|מרגש)|ימים מרגשים|צעד בכיוון הנכון|השמיים הם הגבול|רק ההתחלה/u, sentence: true },
  { kind: 'chatbot-closer', re: /מקווה ש(?:זה )?עזר|אשמח לענות|אשמח לעזור|אל תהססו לשאול/u, sentence: true },
  { kind: 'filler', re: /על מנת ש|בשל העובדה ש|נכון לרגע זה|יש לציין כי/u },
];

const EMOJI = /\p{Extended_Pictographic}/u;

/** Every tell in one piece of slide copy. `heading` switches on the emoji-in-headline check. */
export function detectSlop(text: string, opts: { heading?: boolean } = {}): SlopHit[] {
  const t = String(text ?? '');
  if (!t.trim()) return [];
  const hits: SlopHit[] = [];
  for (const { kind, re } of PATTERNS) {
    const m = t.match(re);
    if (m) hits.push({ kind, match: m[0].trim().slice(0, 60) });
  }
  if ((t.match(/—/g) ?? []).length > 1) hits.push({ kind: 'em-dash-cluster', match: '—×' + (t.match(/—/g) ?? []).length });
  if (opts.heading && EMOJI.test(t)) hits.push({ kind: 'emoji-heading', match: t.match(EMOJI)?.[0] ?? '' });
  // Staccato: three or more consecutive "sentences" of at most three words.
  const sentences = t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  let run = 0;
  for (const s of sentences) {
    run = s.split(/\s+/).length <= 3 ? run + 1 : 0;
    if (run >= 3) {
      hits.push({ kind: 'staccato', match: s });
      break;
    }
  }
  return hits;
}

/**
 * The headline form of negative parallelism, repaired: "לא צ'אט, אלא מנוע החלטות" → "מנוע החלטות".
 * The Y half is the claim; the X half exists only to set up the reveal. Returns the input unchanged
 * when it does not match, or when the remainder would be too short to stand as a headline.
 */
export function repairContrastHeadline(text: string): string {
  const t = String(text ?? '');
  const m = t.match(/^\s*(?:זה |הוא |היא )?לא [^,.!?\n]{1,40}[,،]\s*אלא\s+(.+)$/u);
  if (!m) return t;
  const rest = m[1].trim();
  return rest.split(/\s+/).length >= 2 ? rest : t;
}

/**
 * Remove the sentences whose only job is ceremony (signposts, sign-offs, generic optimism). Returns
 * the text unchanged when removing them would leave nothing — an empty slide is worse than a tell.
 */
export function dropCeremonySentences(text: string): string {
  const t = String(text ?? '');
  const sentences = t.split(/(?<=[.!?])\s+/);
  if (sentences.length < 2) return t;
  const ceremonial = PATTERNS.filter((p) => p.sentence).map((p) => p.re);
  const kept = sentences.filter((s) => !ceremonial.some((re) => re.test(s)));
  return kept.length && kept.length < sentences.length ? kept.join(' ').trim() : t;
}
