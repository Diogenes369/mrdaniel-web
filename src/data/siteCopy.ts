/**
 * Marketing copy for the homepage hero, console, process strip, services header, contact outro,
 * footer and About page — one file so a copy pass never has to touch JSX.
 *
 * VOICE (rewritten 2026-09-23, by explicit decision): an experienced IT person talking to a client
 * across the table. Warm, direct, plain Hebrew that someone with no technical background follows
 * on first read. No buzzwords, no acronyms that need a glossary (LLM, RAG, MCP, "agentic"), no
 * rhetorical questions, no invented numbers or clients. "AI" and "סוכן AI" are the only technical
 * terms the reader is assumed to know.
 *
 * Every string is rendered through `rtl()` (src/lib/rtl.ts → hebrewTextSanitizer), so embedded
 * Latin terms stay in place inside RTL lines. Guarded by scripts/__tests__/site-copy.test.mjs,
 * which also fails on any cyber / enterprise term creeping back in.
 *
 * The three pillars, in this order everywhere: (1) building AI agents, (2) the model lab — new
 * models tried out and explained, (3) the AI news + practical guides hub.
 */

export const HERO_COPY = {
  // Learners first since 2026-10-01 (by decision): the opening meets the visitor's real fear — being
  // left behind — warmly, and the glyph-built second line promises the one thing this site does
  // about it ("בה" = הבינה המלאכותית). One button, into the story below.
  h1Lead: 'הבינה המלאכותית מתקדמת מהר, אבל אתם לא חייבים להישאר מאחור',
  h1Accent: 'בואו נעשה בה סדר',
  sub: 'כל שבוע יוצא כלי חדש, וכולם צועקים שהוא הכי טוב. אני מסביר הכול בעברית פשוטה, צעד אחרי צעד, מההתקנה הראשונה ועד שאתם בונים כלים משלכם.',
  ctaPrimary: 'בואו נתחיל מההתחלה',
  // Handwritten margin note pointing into the background noise. Comments, never claims.
  note: 'זה הרעש. נעבור עליו יחד',
  // What the moving background is made of — true by construction (GlyphField reads /api/news).
  // `{n}` is replaced with the number of headlines currently in the field.
  fieldCaption: 'ברקע: {n} כותרות AI אמיתיות מהימים האחרונים ושמות הכלים עצמם',
  fieldCaptionNoFeed: 'ברקע: שמות אמיתיים של כלים ומודלים של AI',
  latest: 'הכותרת האחרונה',
};

/**
 * The scroll story under the hero (2026-10-01): it's not you, it's the pace → I filter it for you →
 * the route from understanding to building like a developer → start with the free guide.
 * Written for learners, in the same plain voice; no figures, no promised results.
 */
export const STORY_COPY = {
  noise: {
    title: 'זה לא אתם. זה הקצב',
    body: 'כל יום יוצא מודל חדש, כלי חדש, ומישהו ברשת מבטיח שהפעם זה משנה הכול. קשה לדעת על מה לסמוך, וקל להרגיש שכבר פספסתם את הרכבת.',
    logTitle: 'רק מהימים האחרונים',
    modelsTitle: 'המודלים העדכניים',
    empty: 'אין השקות חדשות כרגע. הרשימה מתעדכנת לבד.',
    allNews: 'לכל החדשות',
    expand: 'עוד השקות',
    collapse: 'פחות',
  },
  order: {
    title: 'אני עושה את הסינון בשבילכם',
    body: 'אני מנסה כלים ומודלים חדשים על עבודה אמיתית, מוותר על מה שלא עובד, ומסביר את מה שנשאר בעברית פשוטה. בלי ז׳רגון ובלי הייפ.',
    pairs: [
      { term: 'חלון הקשר', plain: 'כמה טקסט המודל מסוגל לזכור בבת אחת' },
      { term: 'פרומפט', plain: 'הבקשה שאתם כותבים לו, במילים שלכם' },
      { term: 'סוכן AI', plain: 'AI שלא רק עונה, אלא גם עושה פעולות בשבילכם' },
      { term: 'מודל קוד פתוח', plain: 'מודל שמותר להוריד ולהריץ על המחשב שלכם' },
    ],
  },
  path: {
    title: 'מהצעד הראשון ועד לבנות כמו מפתחים',
    body: 'לא צריך רקע טכני כדי להתחיל. עולים שלב אחרי שלב, ובכל שלב מקבלים את הצעד הבא, לא את כל הספרייה.',
    note: 'אפשר להתחיל מכל שלב',
    steps: [
      { title: 'מבינים מה זה', body: 'מה זה AI, מה זה מודל, ומה הוא באמת יודע לעשות. בלי נוסחאות.' },
      { title: 'מתחילים להשתמש', body: 'פותחים חשבון, כותבים בקשה ראשונה ולומדים לנסח אותה כך שתקבלו תשובה טובה.' },
      { title: 'עובדים איתו כל יום', body: 'מיילים, סיכומים, מסמכים ותכנון: AI לעבודה שחוזרת אצלכם.' },
      { title: 'מתקינים כלים אמיתיים', body: 'יוצאים מחלון הצ׳אט לכלים שעובדים על המחשב שלכם, ומחברים ביניהם.' },
      { title: 'בונים כמו מפתחים', body: 'כותבים קוד עם AI, בונים סוכנים ומחברים מודלים לאפליקציות משלכם.' },
    ],
  },
  start: {
    title: 'מתחילים מכאן',
    body: 'המדריך הראשון כבר מחכה, בחינם. הוא מתחיל מהיסודות ולא מניח שאתם יודעים משהו מראש.',
    cta: 'להורדת המדריך בחינם',
    more: 'לכל המדריכים',
  },
};

/**
 * The "לומדים AI" page (/magazines) while the new guides and magazines are being written —
 * 2026-09-23. The headline and body are the operator's own wording, lightly edited.
 */
export const LEARN_AI_COPY = {
  kicker: 'לומדים AI',
  headline: 'בקרוב',
  sub: 'המדריכים והמגזינים העדכניים ביותר, שיעשו לכם סדר בעולם הבינה המלאכותית.',
  body: 'נסביר בגובה העיניים על כל המודלים החדשים, כדי שתוכלו להוביל את העסק שלכם קדימה.',
  notifyCta: 'עדכנו אותי כשזה עולה',
  freeTitle: 'בינתיים, אפשר להתחיל מכאן',
  freeSub: 'שני מדריכים מלאים שכבר זמינים להורדה חינם.',
  followCta: 'או עקבו אחריי ברשתות',
};

/**
 * The "how it works" strip under the three pillars: what happens if the visitor says yes. Three
 * steps, each a process fact, no promised timelines or results, and no 01/02/03 numbering.
 */
export const PROCESS_COPY = {
  lead: 'ככה נבנה',
  accent: 'סוכן שעובד',
  sub: 'שלושה שלבים, ואתם מחליטים בכל אחד מהם אם ממשיכים.',
  steps: [
    {
      title: 'בוחרים משימה אחת',
      body: 'מוצאים עבודה אחת שחוזרת אצלכם כל יום, ומחליטים יחד איך נראה סוכן שעושה אותה טוב.',
    },
    {
      title: 'בונים ובודקים',
      body: 'הסוכן מתחבר לכלים שכבר יש לכם, כמו וואטסאפ, מייל ויומן, ונבדק על מקרים אמיתיים שלכם.',
    },
    {
      title: 'מפעילים, אתם בשליטה',
      body: 'הסוכן עובד לבד, ובכל החלטה חשובה הוא עוצר ומחכה לאישור שלכם. מרחיבים רק כשזה עובד.',
    },
  ],
  cta: 'בואו נדבר על זה',
};

export const ROTATOR_TERMS: readonly string[] = [
  'סוכן שעונה ללקוחות בוואטסאפ',
  'עוזר אישי ליומן ולמייל',
  'מסמכים שמוכנים לבד',
  'פחות העתק-הדבק',
  'עוזר JARVIS בעברית',
];

export const SERVICES_COPY = {
  lead: 'מה אני בונה',
  accent: 'בשבילכם',
  sub: 'סוכנים ואוטומציות שנבנים סביב העבודה שלכם, לא סביב תבנית. מתחילים ממשימה אחת וגדלים משם.',
  closing: 'שיחה קצרה: מבינים מה חוזר אצלכם, ואני חוזר אליכם עם תוכנית פשוטה ומחיר ברור.',
  cta: 'בואו נדבר',
};

export const CONTACT_COPY = {
  headline: 'דברו איתי ישירות',
  sub: 'אני עונה בעצמי, לא מוקד ולא בוט. ספרו לי מה חוזר אצלכם כל יום, ואגיד לכם בכנות אם סוכן יכול לקחת את זה.',
};

export const FOOTER_COPY = {
  tagline: 'לומדים AI בעברית פשוטה, צעד אחרי צעד: חדשות, מדריכים והסברים בגובה העיניים.',
  status: 'חדשות AI מתעדכנות כל יום',
};

export const ABOUT_COPY = {
  title: 'דניאל בן ברוך',
  subtitle: 'בונה סוכני AI ומסביר AI בעברית פשוטה',
  lede: 'אני בונה סוכני AI שעובדים באמת, כל יום, ומסביר בגובה העיניים מה חדש ומה באמת שווה את הזמן שלכם.',
  paras: [
    'הרקע שלי בניהול מערכות מחשוב. משם ההרגל לבנות דברים שעובדים כל יום בלי שמישהו צריך לשמור עליהם. היום כל הזמן שלי הולך ל-AI.',
    'אני בונה סוכנים שמתחברים לוואטסאפ, למייל, ליומן ולמסמכים, וגם את JARVIS, עוזר אישי בעברית. כל סוכן מקבל משימה אחת ברורה ועושה אותה טוב.',
    'באתר אני מפרסם חדשות AI, הסברים על מודלים חדשים ומדריכים מעשיים, כדי שתוכלו גם לעשות לבד. ואם צריך עזרה, אתם מדברים איתי ישירות.',
  ],
  pillars: [
    { title: 'סוכני AI', description: 'סוכנים שעושים עבודה חוזרת מההתחלה ועד הסוף, ועוצרים לאישור שלכם כשצריך.' },
    { title: 'מעבדת מודלים', description: 'מנסה כל מודל חדש על משימות אמיתיות ומספר מה הוא עושה טוב ומתי לבחור בו.' },
    { title: 'סוכן שעונה מהמסמכים', description: 'סוכן שעונה רק מתוך המסמכים שלכם, ואוטומציות שמחברות בין הכלים שכבר יש לכם.' },
    { title: 'חדשות ומדריכים', description: 'חדשות AI ומדריכים מעשיים בעברית, מתעדכנים כל יום.' },
  ],
  quote: 'AI טוב נמדד בעבודה שהוא מוריד מכם, לא בהדגמה שהוא מייצר.',
  ctaTitle: 'בואו נבנה סוכן שעובד',
  ctaDescription: 'שיחה קצרה על העבודה שחוזרת אצלכם, ובסופה תוכנית פשוטה וברורה.',
};
