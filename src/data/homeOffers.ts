import {
  Bot,
  ShieldCheck,
  Rocket,
  Landmark,
  Workflow,
  TrendingUp,
  Headphones,
  ScanSearch,
  Lock,
  Building2,
  Palette,
  Code2,
  Megaphone,
  LineChart,
  type LucideIcon,
} from 'lucide-react';

/**
 * The three core offerings the streamlined homepage funnels toward. Each renders as an <OfferSection>
 * — a minimalist heading + a short scroll-lock rail of supporting points + a primary CTA to the
 * route and a secondary "talk to us" lead CTA.
 */
export interface OfferBullet {
  icon: LucideIcon;
  title: string;
  body: string;
}

export interface HomeOffer {
  id: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  accent: string;
  intro: string;
  bullets: OfferBullet[];
  route: string;
  ctaLabel: string;
  leadSubject: string;
  sourceSection: string;
}

export const HOME_OFFERS: HomeOffer[] = [
  {
    id: 'offer-ai-agents',
    icon: Bot,
    eyebrow: 'סוכני AI מותאמים אישית',
    title: 'סוכן AI שנבנה סביב',
    accent: 'התהליך העסקי שלכם',
    intro:
      'לא צ׳אטבוט גנרי — סוכן אוטונומי שמתחבר ל-WhatsApp, ל-CRM ולמערכות שלכם ועובד 24/7. כל סוכן מתוכנן לוורטיקל ולתהליך הספציפי שלכם, עם ROI ברור וזמן הטמעה קצר.',
    bullets: [
      { icon: Landmark, title: 'פיננסים', body: 'עיבוד מסמכים, התאמות, מענה רגולטורי והפקת דוחות אוטומטית.' },
      { icon: Workflow, title: 'תפעול', body: 'אוטומציה של תהליכים חוזרים, תיאום בין מערכות והפחתת עבודה ידנית.' },
      { icon: TrendingUp, title: 'מכירות', body: 'כשירות לידים, מעקב אחר לקוחות ותשובות מיידיות בכל ערוץ.' },
      { icon: Headphones, title: 'שירות ותמיכה', body: 'מענה ראשוני חכם, פתרון תקלות נפוצות והסלמה מדויקת לצוות.' },
    ],
    route: '/ai',
    ctaLabel: 'לסוכני ה-AI',
    leadSubject: 'תיאום אפיון — סוכן AI מותאם',
    sourceSection: 'Home · Custom AI Agents',
  },
  {
    id: 'offer-cyber',
    icon: ShieldCheck,
    eyebrow: 'סייבר ואבטחה',
    title: 'אבטחה שמתאימה',
    accent: 'לעסקים ולארגונים',
    intro:
      'הגנת סייבר בגישת Zero-Trust — מותאמת לעסקים קטנים ובינוניים בדיוק כמו לסביבות ארגוניות. הקשחה, ניטור איומים והגנה על הנתונים ועל מודלי ה-AI שלכם.',
    bullets: [
      { icon: ScanSearch, title: 'מיפוי וסקר סיכונים', body: 'זיהוי חשיפות בתשתית, בענן ובתהליכי ה-AI לפני שהן הופכות לאירוע.' },
      { icon: Lock, title: 'Zero-Trust והקשחה', body: 'בקרת גישה, הפרדת רשתות, MFA והצפנה מקצה לקצה.' },
      { icon: ShieldCheck, title: 'ניטור והגנה מתמשכת', body: 'זיהוי חריגות, הגנה מפני Prompt Injection וניטור איומים רציף.' },
      { icon: Building2, title: 'התאמה לגודל הארגון', body: 'אותה רמת הגנה, בהיקף ובתקציב שמתאימים ל-SMB או לאנטרפרייז.' },
    ],
    route: '/cyber',
    ctaLabel: 'לפתרונות הסייבר',
    leadSubject: 'ייעוץ אבטחת סייבר',
    sourceSection: 'Home · Cyber & Security',
  },
  {
    id: 'offer-web-marketing',
    icon: Rocket,
    eyebrow: 'פיתוח ושיווק',
    title: 'נוכחות דיגיטלית',
    accent: 'שמייצרת תוצאות',
    intro:
      'עיצוב ופיתוח ברמה גבוהה — פול-סטאק מקצה לקצה, חוויית משתמש מוקפדת וקמפיינים שיווקיים ממוקדי המרה עם החזר השקעה גבוה.',
    bullets: [
      { icon: Palette, title: 'עיצוב ו-UX', body: 'ממשקים מהירים, נגישים ומדויקים למותג — לא תבנית.' },
      { icon: Code2, title: 'פיתוח פול-סטאק', body: 'אתרים ואפליקציות מקצה לקצה, ארכיטקטורה נקייה וזמני טעינה מהירים.' },
      { icon: Megaphone, title: 'קמפיינים דיגיטליים', body: 'אסטרטגיה, פרסום ותוכן שמביאים לידים איכותיים.' },
      { icon: LineChart, title: 'אופטימיזציה ל-ROI', body: 'מדידה, בדיקות A/B ושיפור מתמשך של יחסי ההמרה.' },
    ],
    route: '/digital',
    ctaLabel: 'לפיתוח ושיווק',
    leadSubject: 'אפיון פרויקט פיתוח / שיווק',
    sourceSection: 'Home · Web & Marketing',
  },
];
