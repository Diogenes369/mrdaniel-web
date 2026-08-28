import { Globe, Palette, Database, Workflow, ServerCog, type LucideIcon } from 'lucide-react';

/**
 * Data-driven pricing + plain-language services for the homepage <PricingSection>. Editing the
 * numbers/features here is the only change needed to re-tune the section — no JSX edits.
 */

/** Jargon → business benefit, so a client instantly gets the value. */
export interface PlainService {
  icon: LucideIcon;
  term: string;
  benefit: string;
}

export const PLAIN_SERVICES: PlainService[] = [
  {
    icon: Globe,
    term: 'פיתוח אתרים ואפליקציות',
    benefit: 'אתר או מערכת שנטענים מהר, עובדים בכל מכשיר וקל לתחזק — קוד שנכתב עבורכם, לא תבנית מהמדף.',
  },
  {
    icon: Palette,
    term: 'עיצוב חוויית משתמש (UI/UX)',
    benefit: 'מסכים שברור בהם מה לעשות. פחות נטישה, יותר פניות — עיצוב שמוביל את המשתמש אל המטרה.',
  },
  {
    icon: Database,
    term: 'ארכיטקטורת דאטה',
    benefit: 'המידע שלכם מסודר נכון מהיום הראשון: דוחות מיידיים והחלטות מהר, בלי בלגן של גיליונות אקסל.',
  },
  {
    icon: Workflow,
    term: 'אוטומציה',
    benefit: 'משימות חוזרות שקורות לבד. פחות עבודה ידנית, פחות טעויות, וצוות שמתפנה למה שבאמת חשוב.',
  },
  {
    icon: ServerCog,
    term: 'מעטפת IT ארגונית (Full-Stack)',
    benefit: 'גורם אחד אחראי על הכל — פיתוח, שרתים, אבטחה ואינטגרציות — במקום לתאם בין חמישה ספקים.',
  },
];

export interface PricingPackage {
  id: string;
  name: string;
  tagline: string;
  priceLabel: string;
  priceNote: string;
  featured?: boolean;
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
    priceLabel: 'החל מ־₪18,000',
    priceNote: 'אפיון → פיתוח → הטמעה',
    featured: true,
    features: [
      'אפליקציית ווב Full-Stack (React + Node)',
      'לוח ניהול, משתמשים והרשאות',
      'אינטגרציות ל-CRM / תשלומים / API חיצוני',
      'ארכיטקטורת דאטה ודוחות מובנים',
      'אוטומציה של תהליכים חוזרים',
      'CI/CD, אבטחה ו-3 חודשי אחריות',
    ],
    cta: 'לאפיון פרויקט',
    leadSubject: 'חבילת מערכת עסקית — אפליקציה / פלטפורמה',
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

