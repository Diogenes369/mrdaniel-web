/**
 * Demo guide for reviewing the landing page's full editorial layout.
 *
 * Reachable at `/download?id=demo` (also `/download/demo`, `/g/demo`). It short-circuits the API
 * call entirely, so the whole page — hero, executive summary, every body section, interstitials,
 * spec table and both CTA blocks — can be reviewed in a browser without a live published guide,
 * without the bridge running, and without the tunnel being up.
 *
 * The copy below is representative sample content written for layout review. It is NOT a real
 * guide: `isDemo` drives a visible banner so this can never be mistaken for a published artefact,
 * and the preview images fall back to the skeleton because no such guide exists on the bridge.
 */

export interface GuideSection {
  index: number;
  headline: string;
  subhead: string;
  cards: string[];
}

export interface GuideMeta {
  ok: boolean;
  guideId: string;
  title: string;
  slides: number;
  hasPdf: boolean;
  topics: string[];
  sections: GuideSection[];
  createdAt: number | null;
  expiresAt: number | null;
  isDemo?: boolean;
}

export const DEMO_IDS = new Set(['demo', 'preview', 'sample']);

export const DEMO_GUIDE: GuideMeta = {
  ok: true,
  guideId: 'demo',
  title: 'איך מגנים על סוכן AI מפני Prompt Injection',
  slides: 5,
  hasPdf: true,
  topics: [],
  createdAt: Date.now() - 2 * 86_400_000,
  expiresAt: Date.now() + 5 * 86_400_000,
  isDemo: true,
  sections: [
    {
      index: 0,
      headline: 'רוב הסוכנים בייצור חשופים להזרקת פרומפט',
      subhead:
        'סוכן שקורא מייל, דף אינטרנט או מסמך שהמשתמש העלה — מקבל טקסט שנכתב על ידי מישהו אחר. אם הטקסט הזה מגיע לאותו הקשר שבו יושבות ההוראות שלכם, התוקף כותב את ההוראות הבאות.',
      cards: [
        'כל תוכן שהסוכן קורא הוא קלט לא מהימן, גם אם הגיע ממקור מוכר',
        'הזרקה לא דורשת פריצה — מספיק משפט בתוך מסמך',
        'ההרשאות של הסוכן הן הגבול העליון של הנזק',
      ],
    },
    {
      index: 1,
      headline: 'הפרדה בין הוראות לנתונים',
      subhead:
        'הכלל הראשון והחשוב ביותר: מה שהסוכן קורא לעולם לא מקבל את אותו מעמד כמו מה שאתם מורים לו. הפרדה ברורה בין השניים מבטלת את רוב וקטורי התקיפה עוד לפני שהם מתחילים.',
      cards: [
        'הוראות המערכת נשארות ב-system prompt בלבד',
        'תוכן חיצוני נכנס תמיד מתויג כנתון, לא כפקודה',
        'אסור לשרשר תוכן שנקרא ישירות לתוך ההוראות',
      ],
    },
    {
      index: 2,
      headline: 'עקרון ההרשאה המזערית',
      subhead:
        'סוכן שיכול רק לקרוא לא יכול למחוק. לפני שמוסיפים כלי, שאלו מה הנזק המקסימלי אם התוקף ישתלט עליו — התשובה הזו היא ההרשאה שצריך לתת, לא יותר.',
      cards: [
        'כלי כתיבה ומחיקה דורשים אישור אנושי מפורש',
        'טוקנים בהיקף צר לכל אינטגרציה, לא מפתח־על אחד',
        'פעולות בלתי הפיכות תמיד מאחורי שער נוסף',
      ],
    },
    {
      index: 3,
      headline: 'ולידציה על הפלט, לא רק על הקלט',
      subhead:
        'סינון הקלט לבדו נשבר מול ניסוח יצירתי. השכבה שעובדת בפועל היא בדיקה של מה שהסוכן מנסה לעשות — רגע לפני שהפעולה יוצאת לדרך.',
      cards: [
        'בדקו את הפעולה המבוקשת מול רשימת פעולות מותרות',
        'חסמו יעדים שלא הוגדרו מראש (URL, נמען, endpoint)',
        'תעדו כל קריאת כלי כדי שאפשר יהיה לשחזר אירוע',
      ],
    },
    {
      index: 4,
      headline: 'מה ליישם השבוע',
      subhead:
        'שלושה צעדים שאפשר להריץ על מערכת קיימת בלי לשכתב אותה, ושמורידים את רוב הסיכון המעשי.',
      cards: [
        'מפו לאילו כלים יש לסוכן גישה ומה הנזק המקסימלי מכל אחד',
        'הוסיפו אישור אנושי לכל פעולה בלתי הפיכה',
        'הפעילו לוג מלא של קריאות כלים לפני שמרחיבים הרשאות',
      ],
    },
  ],
};
