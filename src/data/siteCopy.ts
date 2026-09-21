/**
 * Marketing copy for the homepage hero, community grid, services header, contact outro, footer and
 * About page — one file so a copy pass never has to touch JSX.
 *
 * AI-only since 2026-09-21 (the cyber / enterprise-IT offer was retired). Direct IT-peer tone, no
 * rhetorical questions, no invented numbers or clients. Every string is rendered through `rtl()`
 * (src/lib/rtl.ts → hebrewTextSanitizer), so embedded Latin terms and years stay in place inside
 * RTL lines. Guarded by scripts/__tests__/site-copy.test.mjs, which also fails on any cyber /
 * enterprise term creeping back in.
 *
 * The three pillars, in this order everywhere: (1) building autonomous AI agents, (2) the LLM lab —
 * cutting-edge models broken down and put to work, (3) the live AI news + practical guides hub.
 */

export const HERO_COPY = {
  // No eyebrow chip since 2026-09-22. Headline drafted with Groq (gpt-oss-120b), picked by hand
  // and moved to the site's plural voice: short, human, no buzzwords.
  h1Lead: 'AI לשימוש יומי',
  h1Accent: 'בידיים שלכם',
  sub: 'חדשות AI בזמן אמת, פירוק של מודלי השפה החדשים, ובניית סוכני AI אוטונומיים שאפשר להפעיל כבר השבוע.',
  ctaPrimary: 'בנו איתי סוכן AI',
  ctaSecondary: 'לחדשות ה-AI',
};

export const ROTATOR_TERMS: readonly string[] = [
  'סוכני AI אוטונומיים',
  'פירוק מודלי LLM חדשים',
  'סוכן WhatsApp שעונה לבד',
  'חדשות AI בזמן אמת',
  'עוזר JARVIS בעברית',
];

export const SERVICES_COPY = {
  lead: 'סוכני AI',
  accent: 'שנבנים סביבכם',
  sub: 'סוכנים, RAG ואוטומציות על מודלי השפה המובילים. כל פתרון נבנה סביב העבודה שלכם, לא סביב תבנית.',
  closing: 'שיחת אפיון קצרה: ממפים את המשימה, בוחרים מודל וחוזרים עם תוכנית עבודה.',
  cta: 'בואו נאפיין סוכן',
};

export const CONTACT_COPY = {
  headline: 'דברו איתי ישירות, בלי בוטים',
  sub: 'אני עונה בעצמי, לא מוקד ולא בוט. שלחו הודעה עם מה שאתם רוצים לבנות, ואחזור עם כיוון ברור והיקף עבודה.',
};

export const FOOTER_COPY = {
  tagline: 'חדשות AI, פירוק מודלי שפה ובניית סוכנים אוטונומיים. בלי רעש, רק מה שעובד.',
  status: 'חדשות AI מתעדכנות בזמן אמת',
};

export const ABOUT_COPY = {
  title: 'דניאל בן ברוך',
  subtitle: 'בונה סוכני AI ומפרק מודלי שפה בעברית',
  lede: 'אני בונה סוכני AI שעובדים בשטח, לא רק בהדגמה, ומסביר בעברית פשוטה מה באמת חדש בעולם המודלים.',
  paras: [
    'הרקע שלי בניהול מערכות IT, ומשם מגיע ההרגל לבנות דברים שרצים כל יום בלי השגחה. היום כל הזמן שלי הולך ל-AI.',
    'אני בונה סוכני AI שמתחברים ל-WhatsApp, למייל, ליומן ולמסמכים, כולל JARVIS, עוזר אישי בעברית. כל סוכן נבנה סביב משימה אחת ברורה.',
    'באתר אני מפרסם חדשות AI, פירוקים של מודלים חדשים ומדריכים מעשיים, כדי שתוכלו ליישם לבד. ואם צריך עזרה, אתם מדברים איתי ישירות.',
  ],
  pillars: [
    { title: 'סוכני AI אוטונומיים', description: 'סוכנים שמריצים עבודה חוזרת מקצה לקצה, עם אישור אנושי בנקודות ההכרעה.' },
    { title: 'מעבדת LLM', description: 'Grok, Claude, Gemini ו-GPT תחת זכוכית מגדלת: מה כל מודל עושה טוב ומתי לבחור בו.' },
    { title: 'RAG ואוטומציה', description: 'מודל שפה שעונה מתוך המסמכים שלכם, ואוטומציות שמחברות בין הכלים הקיימים.' },
    { title: 'חדשות ומדריכים', description: 'חדשות AI ומדריכים מעשיים בעברית, מתעדכנים כל יום.' },
  ],
  quote: 'AI טוב נמדד בעבודה שהוא מוריד מכם, לא בהדגמה שהוא מייצר.',
  ctaTitle: 'בואו נבנה סוכן שעובד',
  ctaDescription: 'שיחת אפיון קצרה על הסוכן או האוטומציה שאתם צריכים, ותוכנית עבודה ברורה בסופה.',
};
