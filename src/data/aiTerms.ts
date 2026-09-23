/**
 * "מילון AI מהחדשות של היום" (2026-09-23) — the terms that keep appearing in AI news, each with a
 * plain-Hebrew explanation a non-technical business owner follows on first read.
 *
 * The explanations are hand-written, not generated: the strip runs on every page view at zero cost
 * (no model call, no extra request — it reuses the news feed the page already loaded), and a
 * definition is exactly the kind of text a model gets subtly wrong. Which terms show is automatic;
 * what they mean is not.
 *
 * `match` is tested against each headline + summary. Hebrew patterns are plain substrings on
 * purpose: Hebrew attaches prefixes (ה/ב/ל/ו/ש) to the word, so a word-boundary match would miss
 * "בחלון ההקשר". Keep every pattern specific enough that a substring hit means the term.
 * Guarded by scripts/__tests__/ai-terms.test.mjs.
 */
export interface AiTerm {
  id: string;
  label: string;
  text: string;
  match: RegExp[];
}

export const AI_TERMS: AiTerm[] = [
  {
    id: 'agent',
    label: 'סוכן AI',
    text: 'תוכנה עם AI שלא רק עונה, אלא גם עושה: קובעת פגישה, שולחת מייל או מעדכנת טבלה, ועוצרת לאישור כשצריך.',
    // The Hebrew press writes it three ways: סוכן AI, סוכן ה-AI, and the transliteration אייג'נט.
    match: [/\bAI agents?\b/i, /\bagentic\b/i, /סוכני AI|סוכן AI|סוכן ה-?AI|סוכני ה-?AI|לסוכני AI|סוכנים אוטונומיים|סוכן אוטונומי|סוכני בינה|אייג['׳]נט|אג['׳]נטים/],
  },
  {
    id: 'llm',
    label: 'מודל שפה (LLM)',
    text: 'המנוע שמאחורי כלים כמו ChatGPT. מודל שלמד מכמויות עצומות של טקסט, ויודע להבין שאלה ולכתוב תשובה.',
    match: [/\bLLMs?\b/, /large language model/i, /מודל שפה|מודלי שפה/],
  },
  {
    id: 'mcp',
    label: 'MCP',
    text: 'שפה משותפת שדרכה סוכן AI מתחבר לכלים כמו יומן, מייל ותיקיות. כמו שקע סטנדרטי שמתאים לכל מכשיר.',
    match: [/\bMCP\b/, /Model Context Protocol/i],
  },
  {
    id: 'rag',
    label: 'RAG',
    text: 'שיטה שבה ה-AI קודם מחפש במסמכים שלכם ורק אז עונה. כך התשובה נשענת על המידע שלכם ולא על ניחוש.',
    match: [/\bRAG\b/, /retrieval[- ]augmented/i],
  },
  {
    id: 'open-weights',
    label: 'מודל פתוח',
    text: 'מודל שהחברה מפרסמת לכולם. אפשר להוריד אותו ולהריץ על מחשב משלכם, בלי לשלוח מידע החוצה.',
    match: [/open[- ]weights?/i, /open[- ]source (?:AI|model|LLM)/i, /קוד פתוח|משקלים פתוחים|מודל פתוח|מודלים פתוחים/],
  },
  {
    id: 'context-window',
    label: 'חלון הקשר',
    text: 'כמה טקסט המודל יכול להחזיק בראש בבת אחת. חלון גדול מאפשר לתת לו מסמך ארוך שלם ולשאול עליו.',
    match: [/context window/i, /חלון הקשר|חלון ההקשר/],
  },
  {
    id: 'token',
    label: 'טוקן',
    text: 'יחידת הטקסט שהמודל קורא וכותב, בערך חלק ממילה. לפיה נמדדים המחיר והמהירות של כל שימוש.',
    match: [/\btokens?\b/i, /טוקן|טוקנים/],
  },
  {
    id: 'reasoning',
    label: 'מודל חשיבה',
    text: 'מודל שעוצר לחשוב לפני שהוא עונה ובודק כמה דרכים. איטי ויקר יותר, אבל מדויק יותר בשאלות מסובכות.',
    match: [/reasoning model/i, /thinking model/i, /מודל חשיבה|מודלי חשיבה|יכולות חשיבה|יכולות הסקה/],
  },
  {
    id: 'multimodal',
    label: 'רב-מודאלי',
    text: 'מודל שמבין לא רק טקסט, אלא גם תמונות, קול ווידאו. למשל מקבל צילום של חשבונית ומבין מה כתוב בה.',
    match: [/multi-?modal/i, /רב-?מודאלי|מולטימודאלי|רב מודאלי/],
  },
  {
    id: 'hallucination',
    label: 'הזיה',
    text: 'כשמודל ממציא עובדה ואומר אותה בביטחון מלא. לכן סוכן טוב עונה ממקורות ומראה מאיפה לקח.',
    match: [/hallucinat/i, /הזיות|הזיה של|הוזה|הזיית/],
  },
  {
    id: 'fine-tuning',
    label: 'כוונון (Fine-tuning)',
    text: 'אימון נוסף של מודל קיים על דוגמאות שלכם, כדי שילמד סגנון או תחום מסוים.',
    match: [/fine[- ]?tun/i, /כוונון|כיוונון/],
  },
  {
    id: 'benchmark',
    label: 'בנצ׳מרק',
    text: 'מבחן אחיד שמשווה בין מודלים. טוב כדי לדרג, אבל לא תמיד מעיד על איך המודל יעבוד אצלכם.',
    match: [/benchmarks?/i, /בנצ['׳]?מרק|מבחני ביצועים|מבחן ביצועים/],
  },
  {
    id: 'inference',
    label: 'הרצה (Inference)',
    text: 'השימוש במודל בפועל כדי לקבל תשובה. זה החלק שמשלמים עליו בכל פעם שמישהו שואל משהו.',
    match: [/\binference\b/i, /אינפרנס/],
  },
  {
    id: 'gpu',
    label: 'שבבי AI',
    text: 'המעבדים שעליהם מאמנים ומריצים מודלים. הכמות והמחיר שלהם משפיעים על כל התעשייה, ועל מה שאתם משלמים.',
    match: [/\bGPUs?\b/, /\bAI chips?\b/i, /שבבי AI|שבבי בינה|מעבדים גרפיים|מעבדי AI|שבבים חדשים|שבבים ל|שבבי ה-?AI/],
  },
  {
    id: 'prompt-injection',
    label: 'הזרקת פרומפט',
    text: 'ניסיון לשתול לסוכן הוראות זדוניות בתוך טקסט שהוא קורא, למשל במייל. לכן לסוכן עם גישה לכלים צריך גבולות.',
    match: [/prompt injection/i, /הזרקת פרומפט|הזרקת הוראות/],
  },
  {
    id: 'prompt',
    label: 'פרומפט',
    text: 'ההוראה שכותבים למודל. ככל שהיא ברורה ומפורטת יותר, התשובה טובה יותר.',
    match: [/\bprompts?\b(?! injection)/i, /פרומפט(?!ים? זדוני)/],
  },
  {
    id: 'deepfake',
    label: 'דיפפייק',
    text: 'וידאו, תמונה או קול מזויפים שנוצרו עם AI ונראים אמיתיים. חשוב לבדוק מקור לפני שמאמינים.',
    match: [/deep ?fakes?/i, /דיפ ?פייק|זיוף עמוק/],
  },
  {
    id: 'agi',
    label: 'AGI',
    text: 'AI שיודע לעשות כמעט כל עבודה אנושית ברמה של אדם. אין הגדרה מוסכמת, ואין הסכמה מתי ואם נגיע לשם.',
    match: [/\bAGI\b/, /בינה מלאכותית כללית/],
  },
  {
    id: 'distillation',
    label: 'זיקוק מודל',
    text: 'לימוד מודל קטן וזול מתוך התשובות של מודל גדול, כדי לקבל תוצאות דומות בפחות כסף.',
    match: [/distill/i, /זיקוק/],
  },
  {
    id: 'vibe-coding',
    label: 'Vibe Coding',
    text: 'בניית תוכנה בשיחה עם AI בשפה רגילה, בלי לכתוב את הקוד בעצמכם.',
    match: [/vibe[- ]?coding/i, /וייב ?קודינג|ויב ?קודינג/],
  },
  {
    id: 'parameters',
    label: 'פרמטרים',
    text: 'המספרים הפנימיים שהמודל למד. יותר פרמטרים בדרך כלל אומר מודל חזק יותר, אבל גם כבד ויקר יותר להרצה.',
    match: [/\bparameters\b/i, /פרמטרים/],
  },
  {
    id: 'computer-use',
    label: 'סוכן שמפעיל מחשב',
    text: 'סוכן שעובד על המחשב כמו אדם: לוחץ, מקליד וגולש באתרים בעצמו, כדי לסיים משימה.',
    match: [/computer[- ]use/i, /browser agent/i, /שליטה במחשב|מפעיל את המחשב|גולש בעצמו/],
  },
  {
    id: 'ai-regulation',
    label: 'רגולציית AI',
    text: 'חוקים שקובעים מה מותר לעשות עם AI ומה חובה לגלות, למשל חוק ה-AI של האיחוד האירופי.',
    match: [/\bAI Act\b/, /AI regulation/i, /רגולציה על AI|רגולציית AI|רגולציה של בינה|חוק ה-?AI/],
  },
  {
    id: 'ai-safety',
    label: 'בטיחות AI',
    text: 'התחום שבודק שמערכות AI לא יגרמו נזק: לא ימסרו מידע מסוכן, לא יטעו בשקט ולא יפעלו בלי שליטה.',
    match: [/AI safety/i, /בטיחות AI|בטיחות ה-?AI|בטיחות בינה|בטיחות של מודלים/],
  },
  {
    id: 'superintelligence',
    label: 'בינת-על',
    text: 'AI שיעלה על בני אדם כמעט בכל תחום. כרגע זה רעיון ומטרה של חלק מהחברות, לא משהו שקיים.',
    match: [/superintelligen/i, /בינת[- ]על|בינה על-?על|אינטליגנציית על/],
  },
  {
    id: 'training-data',
    label: 'נתוני אימון',
    text: 'הטקסטים, התמונות והנתונים שמהם מודל לומד. מי שמחזיק נתונים טובים מחזיק יתרון, ויש סביבם שאלות של זכויות ופרטיות.',
    match: [/training data/i, /נתוני אימון|נתונים לאימון|לאימון מודלים|לאמן מודלים/],
  },
  {
    id: 'data-center',
    label: 'מרכז נתונים',
    text: 'חוות שרתים ענקית שבה רצים המודלים. בנייתם עולה הון ודורשת הרבה חשמל, ולכן הם מופיעים בחדשות הכלכליות.',
    match: [/data ?cent(?:er|re)s?/i, /מרכז נתונים|מרכזי נתונים|חוות שרתים|דאטה ?סנטר/],
  },
  {
    id: 'robotics',
    label: 'רובוטים עם AI',
    text: 'רובוטים שמשתמשים ב-AI כדי לראות, להבין ולפעול בעולם הפיזי, לא רק על המסך.',
    match: [/humanoid|robotics|\brobots?\b/i, /רובוט/],
  },
  {
    id: 'local-ai',
    label: 'AI מקומי',
    text: 'מודל שרץ על המחשב או הטלפון שלכם במקום בענן. המידע לא יוצא החוצה, ולפעמים זה גם זול יותר.',
    match: [/on-?device AI/i, /local (?:AI|model|LLM)/i, /על המכשיר|מודל מקומי|AI מקומי|רץ מקומית/],
  },
];

export interface TermHit {
  term: AiTerm;
  /** How many of the scanned stories mention it. */
  count: number;
  /** The newest story that mentions it — the "where did you see this" link. */
  firstId: string;
}

/**
 * Pure: which terms appear in these stories, most-mentioned first (ties → the order above, which
 * runs from most to least useful for a newcomer). `prompt` is dropped when `prompt-injection`
 * also matched the same story, so one headline is not counted as two terms.
 */
export function termsInStories(stories: Array<{ id: string; text: string }>, limit = 6): TermHit[] {
  const hits = new Map<string, TermHit>();
  for (const s of stories) {
    const matched = new Set(AI_TERMS.filter((t) => t.match.some((re) => re.test(s.text))).map((t) => t.id));
    if (matched.has('prompt-injection')) matched.delete('prompt');
    for (const id of matched) {
      const h = hits.get(id);
      if (h) h.count += 1;
      else hits.set(id, { term: AI_TERMS.find((t) => t.id === id)!, count: 1, firstId: s.id });
    }
  }
  const order = new Map(AI_TERMS.map((t, i) => [t.id, i]));
  return [...hits.values()].sort((a, b) => b.count - a.count || order.get(a.term.id)! - order.get(b.term.id)!).slice(0, limit);
}
