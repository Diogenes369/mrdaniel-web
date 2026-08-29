import { Globe, Palette, Database, Workflow, ServerCog, Bot, type LucideIcon } from 'lucide-react';

/**
 * Data-driven pricing + plain-language services for the homepage <PricingSection>. Editing the
 * numbers/features here is the only change needed to re-tune the section — no JSX edits.
 */

/** Jargon → business benefit, so a client instantly gets the value. `to` links the card to the
 *  matching service page so the section doubles as a navigation hub. */
export interface PlainService {
  icon: LucideIcon;
  term: string;
  benefit: string;
  to?: string;
}

export const PLAIN_SERVICES: PlainService[] = [
  {
    icon: Bot,
    term: 'מערכת JARVIS',
    benefit:
      'עוזר AI אוטונומי שמתחבר למיילים, ליומן ול-CRM ומבצע משימות מקצה לקצה בשבילכם — בקול או בטקסט, בעברית מלאה.',
    to: '/jarvis',
  },
  {
    icon: Bot,
    term: 'סוכני AI ואוטומציה חכמה',
    benefit:
      'סוכן ייעודי לכל תהליך — מכירות, שירות, תפעול — שרץ 24/7, לומד את הדרך שבה אתם עובדים ומקצר משימות משעות לדקות.',
    to: '/ai',
  },
  {
    icon: Globe,
    term: 'פיתוח אתרים ואפליקציות',
    benefit:
      'אתר או מערכת שנטענים מהר, עובדים בכל מכשיר וקל לתחזק — קוד שנכתב עבורכם ולא תבנית מהמדף, עם דגש על מהירות והמרות.',
    to: '/digital',
  },
  {
    icon: Palette,
    term: 'עיצוב חוויית משתמש (UI/UX)',
    benefit:
      'מסכים שברור בהם מה לעשות. פחות נטישה, יותר פניות — עיצוב שמוביל את המשתמש צעד-צעד אל הפעולה שאתם רוצים שיבצע.',
    to: '/digital',
  },
  {
    icon: Database,
    term: 'ארכיטקטורת דאטה',
    benefit:
      'המידע שלכם מסודר נכון מהיום הראשון: דוחות מיידיים, מקור אמת אחד והחלטות מהירות — בלי בלגן של עשרות גיליונות אקסל.',
    to: '/architecture',
  },
  {
    icon: Workflow,
    term: 'אוטומציה של תהליכים',
    benefit:
      'משימות חוזרות שקורות לבד: תזכורות, סנכרונים, עדכוני סטטוס. פחות עבודה ידנית, פחות טעויות, וצוות שמתפנה למה שבאמת חשוב.',
    to: '/ai',
  },
  {
    icon: ServerCog,
    term: 'מעטפת IT ארגונית (Full-Stack)',
    benefit:
      'גורם אחד אחראי על הכל — פיתוח, שרתים, אבטחת סייבר ואינטגרציות — במקום לתאם בין חמישה ספקים שכל אחד מאשים את השני.',
    to: '/cyber',
  },
];

export interface PricingPackage {
  id: string;
  name: string;
  tagline: string;
  /** The headline figure. Empty when `hidePrice` is set. */
  priceLabel: string;
  priceNote: string;
  featured?: boolean;
  /** Suppress the numeric price entirely and show a "custom quote" button in its place. */
  hidePrice?: boolean;
  features: string[];
  cta: string;
  leadSubject: string;
}

export const PACKAGES: PricingPackage[] = [
  {
    id: 'launch',
    name: 'השקה',
    tagline: 'נוכחות דיגיטלית מקצועית — מהר',
    priceLabel: 'החל מ־₪4,900',
    priceNote: 'אספקה תוך 2–3 שבועות',
    features: [
      'אתר תדמית / דף נחיתה בעיצוב מותאם',
      'מובייל-פרסט, מהיר וידידותי לגוגל',
      'טופס לידים + חיבור ישיר לוואטסאפ',
      'SEO בסיסי, מטא-תגיות ואנליטיקס',
      'חודש ליווי אחרי העלייה לאוויר',
    ],
    cta: 'מתאים לי',
    leadSubject: 'חבילת השקה — אתר תדמית / דף נחיתה',
  },
  {
    id: 'system',
    name: 'מערכת עסקית',
    tagline: 'אפליקציה / פלטפורמה שעובדת בשבילכם',
    priceLabel: '',
    priceNote: 'אפיון → פיתוח → הטמעה · תמחור לפי היקף',
    featured: true,
    hidePrice: true,
    features: [
      'אפליקציית ווב Full-Stack (React + Node)',
      'לוח ניהול, משתמשים והרשאות',
      'אינטגרציות ל-CRM / תשלומים / API חיצוני',
      'ארכיטקטורת דאטה ודוחות מובנים',
      'אוטומציה של תהליכים חוזרים',
      'CI/CD, אבטחה ו-3 חודשי אחריות',
    ],
    cta: 'לאפיון פרויקט',
    leadSubject: 'חבילת מערכת עסקית — אפליקציה / פלטפורמה (הצעת מחיר בהתאמה אישית)',
  },
  {
    id: 'enterprise',
    name: 'ארגוני',
    tagline: 'מעטפת IT מלאה — ספק אחד לכל הסטאק',
    priceLabel: 'הצעת מחיר מותאמת',
    priceNote: 'לפי היקף, SLA ותקציב',
    features: [
      'ארכיטקטורת ענן (AWS / Azure) ותשתית-כקוד',
      'אבטחת סייבר Zero-Trust מקצה לקצה',
      'סוכני AI ואוטומציה בקנה מידה',
      'ליווי DevOps, ניטור ו-SLA',
      'אינטגרציה למערכות פנימיות קיימות',
      'צוות ייעודי ותוכנית עבודה רב-שלבית',
    ],
    cta: 'לשיחת ייעוץ',
    leadSubject: 'חבילת Enterprise — מעטפת IT ארגונית',
  },
];
