import {
  MessageCircle,
  CalendarCheck,
  FileText,
  Inbox,
  ListChecks,
  FolderOpen,
  UserCheck,
  KeyRound,
  Phone,
  PenLine,
  FlaskConical,
  Rocket,
  type LucideIcon,
} from 'lucide-react';

/**
 * Copy for the /ai page, rewritten 2026-09-23 as a practical guide for someone who wants an agent
 * built — not a technical brochure. Three questions, in the order a client actually asks them:
 * what is it, what do I need to prepare, how do we build it together.
 *
 * Voice: an experienced IT person explaining to a client across the table. Plain Hebrew, no
 * acronyms that need a glossary (no RAG / MCP / LLM / Guardian here), no invented numbers — the
 * previous page promised "8–12 hours a week back", which nothing on the page could back up.
 * Guarded by scripts/__tests__/site-copy.test.mjs (no ?/!, banned buzzwords, word budgets).
 */

export interface GuideCard {
  icon: LucideIcon;
  title: string;
  body: string;
}

export const AI_GUIDE_HERO = {
  title: 'סוכן AI שעושה את העבודה החוזרת',
  subtitle: 'מה זה, מה צריך להכין, ואיך בונים אותו יחד. בלי מונחים מסובכים.',
};

/** 1 — What an agent is, in one paragraph and three everyday examples. */
export const AI_GUIDE_WHAT = {
  title: 'מה זה בעצם סוכן AI',
  intro:
    'תחשבו על עובד דיגיטלי שמקבל משימה אחת ברורה. הוא קורא הודעות ומיילים, מבין מה מבקשים ממנו, ועושה את הצעד הבא בכלים שכבר יש לכם. כשצריך החלטה אמיתית, הוא עוצר ושואל אתכם.',
  difference: 'ההבדל מצ׳אטבוט: צ׳אטבוט רק עונה. סוכן גם עושה, למשל קובע פגישה, שולח הצעת מחיר או מעדכן טבלה.',
  examples: [
    { icon: MessageCircle, title: 'עונה בוואטסאפ', body: 'עונה ללקוחות על השאלות שחוזרות כל יום, ומעביר אליכם רק את מה שדורש אתכם.' },
    { icon: CalendarCheck, title: 'מתאם פגישות', body: 'מוצא זמן פנוי ביומן, קובע, ושולח תזכורת. בלי הלוך ושוב של הודעות.' },
    { icon: FileText, title: 'מכין מסמכים', body: 'הצעות מחיר, סיכומי שיחה ומסמכים חוזרים, מוכנים לאישור שלכם בלחיצה.' },
  ] satisfies GuideCard[],
};

/** 2 — What to prepare. Everything here is something a client can do before the first call. */
export const AI_GUIDE_PREP = {
  title: 'מה צריך להכין',
  intro: 'לא צריך ידע טכני. צריך להכיר טוב את העבודה שלכם. חמישה דברים שכדאי שיהיו מוכנים:',
  items: [
    { icon: ListChecks, title: 'משימה אחת', body: 'עבודה אחת שחוזרת כל יום או כל שבוע וגוזלת לכם זמן. מתחילים ממנה בלבד.' },
    { icon: Inbox, title: 'איפה זה קורה', body: 'באיזה ערוץ המשימה מגיעה אליכם: וואטסאפ, מייל, טופס באתר או טלפון.' },
    { icon: FolderOpen, title: 'דוגמאות אמיתיות', body: 'כמה פניות או מקרים מהעבר, ואיך עניתם עליהם. מהן הסוכן לומד את הסגנון שלכם.' },
    { icon: UserCheck, title: 'מי מאשר', body: 'מה הסוכן עושה לבד, ומה חייב לעבור דרככם לפני שהוא יוצא החוצה.' },
    { icon: KeyRound, title: 'גישה לכלים', body: 'גישה ליומן, למייל או לתיקיית המסמכים. את החיבור עצמו אני מגדיר איתכם.' },
  ] satisfies GuideCard[],
};

/** 3 — The build, as four steps that each end with the client's go-ahead. */
export const AI_GUIDE_PROCESS = {
  title: 'איך בונים את זה יחד',
  intro: 'בכל שלב אתם רואים מה נבנה ומחליטים אם ממשיכים.',
  steps: [
    { icon: Phone, title: 'שיחת היכרות', body: 'מדברים על העבודה שלכם ובוחרים משימה אחת שכדאי להתחיל ממנה.' },
    { icon: PenLine, title: 'תוכנית בכתב', body: 'מקבלים מסמך קצר: מה הסוכן עושה, מה הוא לא עושה, ובמה הוא מתחבר.' },
    { icon: FlaskConical, title: 'בנייה ובדיקה', body: 'בונים ובודקים על מקרים אמיתיים שלכם, לפני שלקוח אחד רואה משהו.' },
    { icon: Rocket, title: 'הפעלה וליווי', body: 'מפעילים, עוקבים יחד בשבועות הראשונים, ומתקנים מה שצריך. מרחיבים רק כשזה עובד.' },
  ] satisfies GuideCard[],
};

export const AI_GUIDE_CTA = {
  title: 'הצעד הבא: שיחה קצרה',
  body: 'ספרו לי מה חוזר אצלכם כל יום, ואגיד לכם בכנות אם סוכן יפתור את זה.',
};
