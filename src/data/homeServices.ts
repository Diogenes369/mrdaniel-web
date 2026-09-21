import { Bot, BrainCircuit, Cpu, Database, MessageSquare, Sparkles, Workflow, type LucideIcon } from 'lucide-react';

/**
 * Data model for the homepage <ServicesSection> bento grid. Editing an entry here is the only
 * change needed to re-tune the section — no JSX edits.
 *
 * `span` carries the desktop (lg+) bento placement as Tailwind classes; below `lg` every tile
 * falls back to a plain 1-col / 2-col cell, and on phones the whole grid becomes a snap carousel.
 * `flagship` tiles get the stronger glass-panel bloom; `wide` is the full-row tile whose inner
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
    id: 'rag-knowledge',
    icon: Database,
    title: 'RAG: AI שעונה מהמסמכים שלכם',
    blurb:
      'מודל שפה שמחובר למסמכים, להערות ולידע שלכם, ועונה עם הפניה למקור במקום להמציא.',
    points: [
      'שליפה מדויקת מתוך PDF, מסמכים והערות',
      'כל תשובה עם הפניה למקור',
      'עובד עם המודל שמתאים למשימה',
    ],
    chips: ['תשובות עם מקור', 'חיפוש סמנטי', 'בלי הזיות'],
    to: '/ai',
    flagship: true,
    span: 'lg:col-span-3',
  },
  {
    id: 'llm-selection',
    icon: Cpu,
    title: 'בחירת מודל LLM',
    blurb:
      'Grok, Claude, Gemini, GPT או מודל מקומי. בודקים על המשימה שלכם ובוחרים לפי איכות, מהירות ועלות.',
    points: [
      'השוואה על דוגמאות אמיתיות שלכם',
      'ניתוב בין מודלים לפי סוג המשימה',
      'מודל מקומי כשהמידע לא יוצא מהמחשב',
    ],
    chips: ['השוואה מעשית', 'ניתוב מודלים', 'מודלים מקומיים'],
    to: '/news',
    span: 'lg:col-span-2',
  },
  {
    id: 'content-agents',
    icon: Sparkles,
    title: 'סוכני תוכן',
    blurb:
      'סוכן שקורא חדשות, מסכם ומנסח פוסטים, קרוסלות ושרשורים. אתם מאשרים לפני כל פרסום.',
    points: [
      'סריקת מקורות ומיון לפי רלוונטיות',
      'טיוטות מותאמות לכל פלטפורמה',
      'אישור אנושי לפני פרסום',
    ],
    chips: ['חדשות לתוכן', 'רב-פלטפורמי', 'אישור אנושי'],
    to: '/ai',
    span: 'lg:col-span-2',
  },
  {
    id: 'voice-agents',
    icon: MessageSquare,
    title: 'סוכני שיחה',
    blurb:
      'סוכן שעונה ב-WhatsApp או באתר, בעברית טבעית, ומעביר אליכם רק את מה שדורש החלטה.',
    points: [
      'מענה בעברית טבעית',
      'העברה אליכם כשצריך החלטה',
      'היסטוריית שיחה מלאה',
    ],
    chips: ['WhatsApp', 'צ׳אט אתר', 'עברית מלאה'],
    to: '/ai',
    span: 'lg:col-span-2',
  },
  {
    id: 'process-automation',
    icon: Workflow,
    title: 'אוטומציות שחוסכות זמן',
    blurb:
      'סנכרון בין יומן, מייל ומסמכים, בין הכלים שכבר יש לכם, עם מודל שפה באמצע. פחות העתק-הדבק, פחות טעויות.',
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
