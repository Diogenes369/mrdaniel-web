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
  // One warm promise in the visitor's own words, and one button that takes them to the agents
  // section. The "news" button was removed 2026-09-23: the ticker above the header already carries
  // the news, and two CTAs split the first click.
  h1Lead: 'בואו נהפוך את הבינה המלאכותית',
  h1Accent: 'לעובד הכי יעיל שלכם',
  sub: 'אני בונה סוכני AI שעונים ללקוחות, קובעים פגישות ומכינים מסמכים במקומכם. אתם מאשרים, הם עושים את השאר.',
  ctaPrimary: 'איך זה עובד אצלכם',
};

/**
 * The hero's console: AI model updates ONLY (2026-09-23 — guides and posts were taken out; the way
 * to the guides is the "לומדים AI" nav link). General news stays in the ticker.
 */
export const HERO_CONSOLE_COPY = {
  label: 'MODELS · LIVE',
  title: 'עדכוני מודלים',
  currentLabel: 'המודלים העדכניים',
  releasesLabel: 'השקות אחרונות',
  empty: 'אין השקות חדשות כרגע. הרשימה מתעדכנת לבד.',
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
 * The "how it works" strip between the three pillars and the savings calculator: what happens if
 * the visitor says yes. Three steps, each a process fact, no promised timelines or results.
 */
export const PROCESS_COPY = {
  lead: 'ככה נבנה',
  accent: 'סוכן שעובד',
  sub: 'שלושה שלבים, ואתם מחליטים בכל אחד מהם אם ממשיכים.',
  steps: [
    {
      kicker: '01',
      title: 'בוחרים משימה אחת',
      body: 'מוצאים עבודה אחת שחוזרת אצלכם כל יום, ומחליטים יחד איך נראה סוכן שעושה אותה טוב.',
    },
    {
      kicker: '02',
      title: 'בונים ובודקים',
      body: 'הסוכן מתחבר לכלים שכבר יש לכם, כמו וואטסאפ, מייל ויומן, ונבדק על מקרים אמיתיים שלכם.',
    },
    {
      kicker: '03',
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
  tagline: 'סוכני AI שעושים את העבודה החוזרת, וחדשות AI בעברית פשוטה.',
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
