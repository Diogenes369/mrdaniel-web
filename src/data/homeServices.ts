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
 * Content rules (rewritten 2026-09-23 in the plain client voice — see siteCopy.ts):
 *   • `metric.value` is a QUALITATIVE shift ("משעות לדקות"), never a figure. The previous
 *     "כ-15 שעות" and "כ-70%" had no source, and "~" in front of a made-up number is still made up.
 *   • No acronym the client has to look up: RAG, LLM, CRM and API were translated into what they
 *     do for the reader.
 */
export interface ServiceEntry {
  id: string;
  icon: LucideIcon;
  title: string;
  blurb: string;
  /** 2–4 short proof points — a mini feature list, shown on every tile that has them. */
  points?: string[];
  /** 2–3 feature chips (e.g. "בעברית", "חוסך זמן"). */
  chips?: string[];
  /** Key-takeaway badge — a qualitative shift + what it means. */
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
    title: 'JARVIS: עוזר אישי',
    blurb: 'עוזר AI בעברית שמחובר למייל, ליומן ולרשימת הלקוחות שלכם. מבקשים ממנו בהודעה או בקול, והוא עושה.',
    points: [
      'עושה את הפעולה בעצמו, לא רק ממליץ',
      'לקוח חדש: מסמכים, הרשאות ומייל פתיחה',
      'זוכר איך אתם עובדים ולומד את השגרה',
      'אתם רואים כל פעולה שהוא עשה',
    ],
    chips: ['בעברית', 'עושה, לא רק עונה', 'אתם בשליטה'],
    metric: { value: 'פחות מטלות קטנות', label: 'יותר זמן לעבודה שרק אתם יכולים לעשות' },
    to: '/jarvis',
    flagship: true,
    span: 'lg:col-span-3 lg:row-span-2',
  },
  {
    id: 'ai-agents',
    icon: BrainCircuit,
    title: 'סוכני AI לעבודה חוזרת',
    blurb: 'סוכן אחד לכל משימה: פניות, מכירות או סידורים משרדיים. אתם מאשרים את ההחלטות, הוא עושה את השאר.',
    points: [
      'עובד בתוך הכלים שכבר יש לכם',
      'עוצר ושואל לפני כל החלטה רגישה',
      'רואים כמה זמן הוא חסך לכם',
    ],
    chips: ['עובד גם בלילה', 'מותאם אליכם', 'חוסך זמן'],
    metric: { value: 'משעות לדקות', label: 'זמן הטיפול במשימה שחוזרת כל יום' },
    to: '/ai',
    flagship: true,
    span: 'lg:col-span-3',
  },
  {
    id: 'rag-knowledge',
    icon: Database,
    title: 'AI שעונה מהמסמכים שלכם',
    blurb: 'מחברים את ה-AI למסמכים, למחירונים ולנהלים שלכם. הוא עונה רק מתוכם, ומראה מאיפה לקח את התשובה.',
    points: [
      'מוצא את התשובה בתוך קבצים ומסמכים',
      'כל תשובה עם הפניה למסמך',
      'אומר "לא יודע" במקום להמציא',
    ],
    chips: ['תשובות עם מקור', 'בלי המצאות', 'המסמכים שלכם'],
    to: '/ai',
    flagship: true,
    span: 'lg:col-span-3',
  },
  {
    id: 'llm-selection',
    icon: Cpu,
    title: 'בחירת המודל הנכון',
    blurb: 'Grok, Claude, Gemini, GPT או מודל שרץ אצלכם במחשב. בודקים על העבודה שלכם ובוחרים לפי איכות, מהירות ומחיר.',
    points: [
      'השוואה על דוגמאות אמיתיות שלכם',
      'מודל זול למשימות פשוטות, חזק לקשות',
      'מודל פרטי כשהמידע לא יוצא מהמחשב',
    ],
    chips: ['השוואה מעשית', 'חוסך כסף', 'פרטיות'],
    to: '/news',
    span: 'lg:col-span-2',
  },
  {
    id: 'content-agents',
    icon: Sparkles,
    title: 'סוכני תוכן',
    blurb: 'סוכן שקורא חדשות מהתחום שלכם, מסכם, ומכין טיוטות לפוסטים. אתם מאשרים לפני שמשהו עולה.',
    points: [
      'מוצא מה חדש ורלוונטי אליכם',
      'טיוטה מותאמת לכל רשת',
      'שום דבר לא עולה בלי אישור שלכם',
    ],
    chips: ['חדשות לתוכן', 'כל הרשתות', 'באישור שלכם'],
    to: '/ai',
    span: 'lg:col-span-2',
  },
  {
    id: 'voice-agents',
    icon: MessageSquare,
    title: 'סוכן לוואטסאפ ולאתר',
    blurb: 'עונה ללקוחות בוואטסאפ או בצ׳אט באתר, בעברית טבעית, ומעביר אליכם רק את מה שצריך החלטה שלכם.',
    points: [
      'עברית טבעית, לא רובוטית',
      'מעביר אליכם כשצריך אתכם',
      'כל השיחה שמורה ומסודרת',
    ],
    chips: ['WhatsApp', 'צ׳אט באתר', 'עברית'],
    to: '/ai',
    span: 'lg:col-span-2',
  },
  {
    id: 'process-automation',
    icon: Workflow,
    title: 'אוטומציות שחוסכות זמן',
    blurb: 'היומן, המייל והמסמכים מדברים זה עם זה, עם AI באמצע שמבין מה לעשות. פחות העתק-הדבק, פחות טעויות.',
    points: [
      'חשבוניות והצעות מחיר שנשלחות לבד',
      'היומן, המייל ורשימת הלקוחות מסונכרנים',
      'תזכורות ומעקבים שלא נשכחים',
      'מתחבר לכלים שכבר יש לכם',
    ],
    chips: ['חיבור פשוט', 'חוסך זמן', 'פחות טעויות'],
    metric: { value: 'פחות עבודה ידנית', label: 'המשימות החוזרות קורות לבד, ואתם רק בודקים' },
    to: '/ai',
    wide: true,
    span: 'lg:col-span-6',
  },
];
