import { Bot, BrainCircuit, Globe, Palette, Database, Workflow, ServerCog, type LucideIcon } from 'lucide-react';

/**
 * Data model for the homepage <ServicesSection> bento grid. Editing an entry here is the only
 * change needed to re-tune the section — no JSX edits.
 *
 * `span` carries the desktop (lg+) bento placement as Tailwind classes; below `lg` every tile
 * falls back to a plain 1-col / 2-col cell, and on phones the whole grid becomes a snap carousel.
 * `flagship` tiles get the neon border, glow, mesh texture, a badge and the bullet list.
 */
export interface ServiceEntry {
  id: string;
  icon: LucideIcon;
  title: string;
  blurb: string;
  /** Shown only on flagship tiles — the larger cells have room for 3 proof points. */
  points?: string[];
  to: string;
  flagship?: boolean;
  badge?: string;
  /** lg+ bento span. Grid is `lg:grid-cols-6`, rows `auto-rows-[minmax(184px,1fr)]`. */
  span: string;
}

export const SERVICES: ServiceEntry[] = [
  {
    id: 'jarvis',
    icon: Bot,
    title: 'מערכת JARVIS',
    blurb:
      'עוזר AI אוטונומי בעברית מלאה שמתחבר למיילים, ליומן ול-CRM ומריץ תהליכים שלמים — בפקודה קולית או בטקסט. כמו שכיר בכיר, בלי המשכורת.',
    points: ['מבצע פעולות אמת מול המערכות שלכם', 'זוכר הקשר ולומד את דפוסי העבודה', 'הרשאות, לוגים ובקרת גישה מלאה'],
    to: '/jarvis',
    flagship: true,
    badge: 'מערכת דגל',
    span: 'lg:col-span-3 lg:row-span-2',
  },
  {
    id: 'ai-agents',
    icon: BrainCircuit,
    title: 'סוכני AI ואוטומציה חכמה',
    blurb:
      'סוכן ייעודי לכל תהליך — מכירות, שירות, תפעול — שרץ 24/7, לומד איך אתם עובדים, ומקצר משימות משעות לדקות.',
    points: ['מתחבר למקורות הנתונים שלכם', 'Human-in-the-loop בנקודות ההכרעה', 'ROI נמדד לכל תהליך'],
    to: '/ai',
    flagship: true,
    badge: 'הכי מבוקש',
    span: 'lg:col-span-3',
  },
  {
    id: 'enterprise-it',
    icon: ServerCog,
    title: 'מעטפת IT ארגונית (Full-Stack)',
    blurb:
      'גורם אחד אחראי על כל הסטאק — פיתוח, ענן, סייבר ואינטגרציות — במקום לתאם בין חמישה ספקים שמאשימים זה את זה.',
    points: ['ארכיטקטורת ענן ותשתית-כקוד', 'אבטחת Zero-Trust מקצה לקצה', 'DevOps, ניטור ו-SLA'],
    to: '/cyber',
    flagship: true,
    badge: 'Enterprise',
    span: 'lg:col-span-3',
  },
  {
    id: 'web-apps',
    icon: Globe,
    title: 'פיתוח אתרים ואפליקציות',
    blurb: 'קוד שנכתב עבורכם, לא תבנית מהמדף — נטען מהר, עובד בכל מכשיר, בנוי להמיר ולהתחזק בקלות.',
    to: '/digital',
    span: 'lg:col-span-2',
  },
  {
    id: 'ux-ui',
    icon: Palette,
    title: 'עיצוב חוויית משתמש (UI/UX)',
    blurb: 'עיצוב שמוביל את המשתמש בול לפעולה שאתם רוצים — פחות נטישה, יותר פניות.',
    to: '/digital',
    span: 'lg:col-span-2',
  },
  {
    id: 'data-arch',
    icon: Database,
    title: 'ארכיטקטורת דאטה',
    blurb: 'מקור אמת אחד, דוחות בזמן אמת והחלטות מהירות — במקום בלגן של עשרות גיליונות אקסל.',
    to: '/architecture',
    span: 'lg:col-span-2',
  },
  {
    id: 'process-automation',
    icon: Workflow,
    title: 'אוטומציה של תהליכים',
    blurb:
      'תזכורות, סנכרונים ועדכוני סטטוס שקורים לבד. פחות עבודה ידנית, פחות טעויות, וצוות שמתפנה למה שבאמת מזיז את המחט.',
    to: '/ai',
    span: 'lg:col-span-6',
  },
];
