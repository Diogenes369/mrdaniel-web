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
      'עוזר AI אישי בעברית שמתחבר למייל, ליומן ול-CRM. מריץ תהליכים שלמים בפקודה קולית או בטקסט.',
    points: [
      'מבצע פעולות במערכות שלכם, לא רק ממליץ',
      'קליטת לקוח חדש: מסמכים, גישות ומייל פתיחה',
      'זוכר הקשר ולומד את שגרת העבודה שלכם',
      'הרשאות ולוגים מלאים על כל פעולה',
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
    title: 'סוכני AI ואוטומציה',
    blurb:
      'סוכן ייעודי לכל תהליך: מכירות, שירות ותפעול. אתם מאשרים בנקודות ההכרעה, הוא עושה את השאר.',
    points: [
      'מתחבר למקורות הנתונים שלכם ופועל עליהם',
      'בקרה אנושית בכל החלטה רגישה',
      'מדידה של הזמן שנחסך בכל תהליך',
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
      'פיתוח, ענן, סייבר ואינטגרציות אצל גורם אחד. בלי לתאם בין חמישה ספקים.',
    points: [
      'תשתית ענן כקוד, מתועדת ומשוחזרת',
      'אבטחה מובנית מהיום הראשון',
      'חיבור למערכות ה-SaaS הקיימות',
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
    title: 'אתרים ואפליקציות',
    blurb:
      'קוד ייעודי, לא תבנית. נטען מהר, עובד בכל מכשיר ובנוי ל-SEO ולהמרה.',
    points: [
      'בלי תוספים כבדים שמאטים את האתר',
      'ציון Core Web Vitals ירוק',
      'קל לתחזוקה ולהרחבה',
    ],
    chips: ['מהיר לטעינה', 'רספונסיבי', 'ללא קוד תבניתי'],
    to: '/digital',
    span: 'lg:col-span-2',
  },
  {
    id: 'ux-ui',
    icon: Palette,
    title: 'עיצוב UI/UX',
    blurb:
      'כל מסך בנוי סביב פעולה אחת ברורה. נגישות ו-RTL תקינים כברירת מחדל.',
    points: [
      'מסע משתמש שממוקד לפעולה אחת',
      'פחות חיכוך בטפסים ובתשלום',
      'עברית ו-RTL בלי שבירות',
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
      'מקור אמת אחד במקום עשרות גיליונות. דשבורדים בזמן אמת וחיפוש חכם במסמכים.',
    points: [
      'כל הנתונים העסקיים במקום אחד',
      'דשבורדים שמתעדכנים בזמן אמת',
      'חיפוש חכם במסמכים ובידע הפנימי',
    ],
    chips: ['מקור אמת אחד', 'בזמן אמת', 'חיפוש חכם'],
    to: '/architecture',
    span: 'lg:col-span-2',
  },
  {
    id: 'process-automation',
    icon: Workflow,
    title: 'אוטומציות שחוסכות זמן',
    blurb:
      'סנכרון בין CRM, יומן, מייל ומסמכים, בין הכלים שכבר יש לכם. פחות העתק-הדבק, פחות טעויות.',
    points: [
      'חשבוניות והצעות מחיר שנשלחות לבד',
      'סנכרון יומן, CRM ומייל בלי עבודה ידנית',
      'מעקבים והתראות שלא נופלים בין הכיסאות',
      'חיבור לכלים הקיימים דרך API',
    ],
    chips: ['אינטגרציה קלה', 'אוטומציה מלאה', 'חיסכון בזמן', 'פחות טעויות'],
    metric: { value: 'כ-70%', label: 'מהמשימות הידניות החוזרות — הופכות לאוטומטיות' },
    to: '/ai',
    wide: true,
    span: 'lg:col-span-6',
  },
];
