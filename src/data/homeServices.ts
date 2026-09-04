import { Bot, BrainCircuit, Globe, Palette, Database, Workflow, ServerCog, type LucideIcon } from 'lucide-react';

/**
 * Data model for the homepage <ServicesSection> bento grid. Editing an entry here is the only
 * change needed to re-tune the section — no JSX edits.
 *
 * `span` carries the desktop (lg+) bento placement as Tailwind classes; below `lg` every tile
 * falls back to a plain 1-col / 2-col cell, and on phones the whole grid becomes a snap carousel.
 * `flagship` tiles get the stronger cyber-glass bloom; `wide` is the full-row tile whose inner
 * content lays out in two columns on desktop.
 *
 * Content rule: `metric.value` is always an ESTIMATE / range (prefixed "~" or "כ-") or a
 * qualitative shift ("משעות → דקות") — never a hard, unverified number.
 */
export interface ServiceEntry {
  id: string;
  icon: LucideIcon;
  title: string;
  blurb: string;
  /** 2–4 short proof points — a mini feature list, shown on every tile that has them. */
  points?: string[];
  /** 2–3 feature chips (e.g. "אוטומציה מלאה", "חיסכון בזמן"). */
  chips?: string[];
  /** Key-takeaway metric badge — a headline figure + what it means. */
  metric?: { value: string; label: string };
  to: string;
  flagship?: boolean;
  /** The single full-row tile — inner content splits into two columns on desktop. */
  wide?: boolean;
  /** lg+ bento span. Grid is `lg:grid-cols-6`, rows `auto-rows-[minmax(240px,1fr)]`. */
  span: string;
}

export const SERVICES: ServiceEntry[] = [
  {
    id: 'jarvis',
    icon: Bot,
    title: 'מערכת JARVIS',
    blurb:
      'עוזר AI אוטונומי בעברית מלאה שמתחבר למיילים, ליומן ול-CRM ומריץ תהליכים שלמים מקצה לקצה — בפקודה קולית או בטקסט. הוא לא רק עונה: הוא קורא מסמכים, מסכם פגישות, מכין הצעות מחיר ושולח מעקבים ללקוחות בזמן. כמו עובד בכיר, בלי המשכורת ובלי ההכשרה.',
    points: [
      'מבצע פעולות אמת מול המערכות שלכם — לא רק ממליץ',
      'קליטת לקוח חדש אוטומטית: מסמכים, חוזה, גישות ומייל פתיחה',
      'זוכר הקשר ולומד את דפוסי העבודה שלכם לאורך זמן',
      'הרשאות, לוגים ובקרת גישה מלאה — אתם תמיד יודעים מה נעשה',
    ],
    chips: ['בעברית מלאה', 'אוטומציה מקצה לקצה', 'הרשאות ובקרה', 'זיכרון והקשר'],
    metric: { value: 'כ-15 שעות', label: 'חיסכון שבועי טיפוסי לבעל תפקיד' },
    to: '/jarvis',
    flagship: true,
    span: 'lg:col-span-3 lg:row-span-2',
  },
  {
    id: 'ai-agents',
    icon: BrainCircuit,
    title: 'סוכני AI ואוטומציה חכמה',
    blurb:
      'סוכן ייעודי לכל תהליך — מכירות, שירות, תפעול — שרץ 24/7, לומד איך אתם עובדים, ומקצר משימות משעות לדקות. מתאים לעצמאי שרוצה להפסיק לענות לאותן שאלות, ולעסק קטן שצריך צוות תמיכה בלי לגייס אחד.',
    points: [
      'מתחבר למקורות הנתונים שלכם ופועל עליהם',
      'Human-in-the-loop בנקודות ההכרעה — שליטה נשארת אצלכם',
      'ROI נמדד לכל תהליך: כמה זמן וכסף נחסך בפועל',
    ],
    chips: ['רץ 24/7', 'מותאם אישית', 'ROI נמדד'],
    metric: { value: 'משעות → דקות', label: 'זמן טיפול במשימה חוזרת' },
    to: '/ai',
    flagship: true,
    span: 'lg:col-span-3',
  },
  {
    id: 'fullstack-it',
    icon: ServerCog,
    title: 'פיתוח ותשתית Full-Stack',
    blurb:
      'גורם אחד אחראי על כל הסטאק — פיתוח, ענן, סייבר ואינטגרציות — במקום לתאם בין חמישה ספקים שמאשימים זה את זה. אתם מקבלים ארכיטקטורה שנבנתה נכון מההתחלה, לא טלאים שמצטברים.',
    points: [
      'ארכיטקטורת ענן ותשתית-כקוד — משוחזרת ומתועדת',
      'אבטחה מקצה לקצה כברירת מחדל, לא כתוספת מאוחרת',
      'DevOps, ניטור ופריסה אוטומטית — פחות תקלות בלילה',
    ],
    chips: ['ספק אחד', 'אבטחה מובנית', 'תשתית-כקוד'],
    metric: { value: 'ספק אחד', label: 'במקום 4–5 גורמים שמתאמים ביניהם' },
    to: '/cyber',
    flagship: true,
    span: 'lg:col-span-3',
  },
  {
    id: 'web-apps',
    icon: Globe,
    title: 'פיתוח אתרים ואפליקציות',
    blurb:
      'קוד שנכתב עבורכם, לא תבנית מהמדף — נטען מהר, עובד בכל מכשיר, ובנוי להמיר ולהתחזק בקלות. בלי תוספים כבדים שמאטים את האתר ובלי תלות בפלטפורמה שתעלה לכם מחיר בעוד שנה.',
    points: [
      'קוד ייעודי — לא תבנית ג׳נרית עמוסת תוספים',
      'מהיר לטעינה וניקוד Core Web Vitals ירוק',
      'בנוי להמרה, ל-SEO ולתחזוקה עצמאית',
    ],
    chips: ['מהיר לטעינה', 'רספונסיבי', 'ללא קוד תבניתי'],
    to: '/digital',
    span: 'lg:col-span-2',
  },
  {
    id: 'ux-ui',
    icon: Palette,
    title: 'עיצוב חוויית משתמש (UI/UX)',
    blurb:
      'עיצוב שמוביל את המשתמש בול לפעולה שאתם רוצים — פחות נטישה, יותר פניות שנסגרות. כל מסך נבנה סביב שאלה אחת: מה הצעד הבא, ולמה שהמבקר יעשה אותו עכשיו.',
    points: [
      'מסע משתמש שממוקד לפעולה אחת ברורה',
      'פחות חיכוך בטפסים ובתהליך הרכישה',
      'נגישות ו-RTL תקינים כברירת מחדל',
    ],
    chips: ['ממוקד המרה', 'נגיש ו-RTL', 'מבוסס נתונים'],
    to: '/digital',
    span: 'lg:col-span-2',
  },
  {
    id: 'data-arch',
    icon: Database,
    title: 'ארכיטקטורת דאטה',
    blurb:
      'מקור אמת אחד, דוחות בזמן אמת והחלטות מהירות — במקום בלגן של עשרות גיליונות אקסל שאף אחד לא בטוח מי עדכן לאחרונה. הנתונים מתאחדים למקום אחד, נקי, שאפשר לשאול אותו שאלות.',
    points: [
      'מקור אמת אחד לכל הנתונים העסקיים',
      'דשבורדים ודוחות שמתעדכנים בזמן אמת',
      'חיפוש חכם במסמכים ובידע הפנימי',
    ],
    chips: ['מקור אמת אחד', 'בזמן אמת', 'חיפוש חכם'],
    to: '/architecture',
    span: 'lg:col-span-2',
  },
  {
    id: 'process-automation',
    icon: Workflow,
    title: 'אוטומציות חכמות שחוסכות זמן וכסף',
    blurb:
      'תזכורות, סנכרונים, הפקת מסמכים ועדכוני סטטוס שקורים לבד — בין הכלים שכבר יש לכם. פחות עבודה ידנית, פחות טעויות העתקה-הדבקה, ויותר זמן למה שבאמת מזיז את המחט בעסק.',
    points: [
      'חשבוניות, הצעות מחיר ומסמכים שמופקים ונשלחים אוטומטית',
      'סנכרון בין יומן, CRM, אימייל וגיליונות — בלי העתקה ידנית',
      'התראות ומעקבים חכמים שלא נופלים בין הכיסאות',
      'אינטגרציה קלה עם הכלים הקיימים — בלי להחליף מערכת',
    ],
    chips: ['אינטגרציה קלה', 'אוטומציה מלאה', 'חיסכון בזמן', 'פחות טעויות'],
    metric: { value: 'כ-70%', label: 'מהמשימות הידניות החוזרות — הופכות לאוטומטיות' },
    to: '/ai',
    wide: true,
    span: 'lg:col-span-6',
  },
];
