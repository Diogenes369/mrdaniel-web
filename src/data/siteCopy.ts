/**
 * Marketing copy for the homepage hero, community grid, services header, contact outro, footer and
 * About page — one file so a copy pass never has to touch JSX.
 *
 * Written 2026-09-21 with Groq (`openai/gpt-oss-120b`) under the site's copy rules, then
 * hand-edited: direct IT-peer tone, no rhetorical questions, no invented numbers or clients. Every
 * string is rendered through `rtl()` (src/lib/rtl.ts → hebrewTextSanitizer), so embedded Latin
 * terms and years stay in place inside RTL lines. Guarded by scripts/__tests__/site-copy.test.mjs.
 *
 * The three value pillars, in this order everywhere: (1) custom AI agents + automation for small
 * businesses and individuals, (2) enterprise cyber + AI integrations into SaaS, (3) the 2026 hub
 * for AI tutorials, news and practical guides.
 */

export type ChannelId = 'instagram' | 'threads' | 'tiktok' | 'x' | 'linkedin' | 'spotify' | 'whatsapp';

export const HERO_COPY = {
  eyebrow: 'סוכני AI · סייבר · מדריכי 2026',
  h1Lead: 'סוכן AI אישי',
  h1Accent: 'שמתחבר ל-WhatsApp ול-CRM שלכם',
  sub: 'סוכני AI ואוטומציה לעסקים קטנים ולפרטיים, סייבר ואינטגרציות AI ברמת Enterprise, וההאב של 2026 למדריכים ולחדשות.',
  ctaPrimary: 'קבעו שיחת אפיון',
  ctaSecondary: 'למדריכים ולחדשות',
};

export const ROTATOR_TERMS: readonly string[] = [
  'סוכני AI לעסקים',
  'הגנת Zero-Trust לארגונים',
  'סוכן WhatsApp שעונה לבד',
  'מדריכי AI בזמן אמת',
  'עוזר JARVIS בעברית',
];

export const COMMUNITY_COPY: {
  eyebrow: string;
  lead: string;
  accent: string;
  sub: string;
  channels: Record<ChannelId, string>;
} = {
  eyebrow: 'כל הערוצים',
  lead: 'AI וסייבר',
  accent: 'בכל פלטפורמה',
  sub: 'עדכונים, מדריכים קצרים וקשר ישיר איתי. בחרו איפה נוח לכם לעקוב.',
  channels: {
    instagram: 'קרוסלות ומדריכים יומיים',
    threads: 'דיונים ופירוקים של חדשות AI',
    tiktok: 'טיפים קצרים בסרטון',
    x: 'חדשות AI בזמן אמת',
    linkedin: 'תובנות מקצועיות על AI וסייבר',
    spotify: 'פסקול לעבודה ממוקדת',
    whatsapp: 'שיחה ישירה איתי',
  },
};

export const SERVICES_COPY = {
  lead: 'AI וסייבר',
  accent: 'בהתאמה אישית',
  sub: 'סוכנים, אוטומציות, הגנה ופיתוח לעסקים קטנים, לפרטיים ולארגונים. כל פתרון נבנה סביב התהליך שלכם.',
  closing: 'שיחת אפיון קצרה: ממפים את הצורך, מגדירים היקף וחוזרים עם תוכנית עבודה.',
  cta: 'בואו נאפיין את הפתרון',
};

export const CONTACT_COPY = {
  headline: 'דברו איתי ישירות, בלי בוטים',
  sub: 'אני עונה בעצמי, לא מוקד ולא בוט. שלחו הודעה עם מה שאתם צריכים, ואחזור עם כיוון ברור והיקף עבודה.',
};

export const FOOTER_COPY = {
  tagline: 'סוכני AI לעסקים ולפרטיים, סייבר לארגונים, ומדריכי AI לכל מי שבונה.',
  status: 'חדשות AI מתעדכנות בזמן אמת',
};

export const ABOUT_COPY = {
  title: 'דניאל בן ברוך',
  subtitle: 'מנהל IT, ארכיטקט סייבר ובונה סוכני AI',
  lede: 'אני מחבר תשתיות, סייבר ו-AI למערכת אחת שעובדת בשטח, לא רק בהדגמה.',
  paras: [
    'ביום-יום אני מנהל תשתיות ורשת: FortiGate, VLAN ו-VPN, זהויות ב-Active Directory וב-Entra ID, והגנת קצה. מכאן מגיעה גישת ה-Zero-Trust שלי.',
    'על הבסיס הזה אני בונה סוכני AI שמתחברים ל-WhatsApp, ל-CRM, למייל וליומן, כולל JARVIS, עוזר אישי בעברית. כל אינטגרציה נבנית לפי התהליך שלכם.',
    'באתר אני מפרסם חדשות AI וסייבר ומדריכים מעשיים, כדי שתוכלו ליישם לבד. ואם צריך עזרה, אתם מדברים איתי ישירות.',
  ],
  pillars: [
    { title: 'סוכני AI ואוטומציה', description: 'סוכנים מותאמים לעסקים קטנים ולאנשים פרטיים, שמורידים עבודה חוזרת מהלו״ז.' },
    { title: 'סייבר Enterprise', description: 'Zero-Trust, ניהול זהויות והקשחת רשת, מתוך ניסיון ניהול תשתיות בפועל.' },
    { title: 'אינטגרציות AI ל-SaaS', description: 'חיבור מודלי AI למערכות ה-SaaS הקיימות, עם SSO, הרשאות ולוגים.' },
    { title: 'האב של 2026', description: 'חדשות, מדריכים ותוכן מעשי על AI וסייבר, מתעדכן כל יום.' },
  ],
  quote: 'טכנולוגיה טובה נמדדת בשקט התפעולי שהיא מייצרת, לא במורכבות שלה.',
  ctaTitle: 'בואו נבנה את זה נכון',
  ctaDescription: 'שיחת אפיון קצרה על AI, סייבר או תשתיות, ותוכנית עבודה ברורה בסופה.',
};
