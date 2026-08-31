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
  Wallet,
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
    eyebrow: 'סוכני AI אוטונומיים',
    title: 'סוכן AI שרץ 24/7',
    accent: 'ולא מבקש העלאה',
    intro:
      'לא עוד צ׳אטבוט גנרי. סוכן אוטונומי שמתחבר ל-WhatsApp, ל-CRM ולמערכות שלכם, לומד איך אתם עובדים, ומריץ תהליכים שלמים לבד — מוגדר בדיוק לוורטיקל ולמשימה שלכם, עם זמן הטמעה קצר ו-ROI שרואים בדוח.',
    bullets: [
      { icon: Landmark, title: 'פיננסים', body: 'קורא מסמכים, מבצע התאמות ומפיק דוחות רגולטוריים — בזמן שאתם ישנים.' },
      { icon: Workflow, title: 'תפעול', body: 'מחבר בין המערכות, מריץ תהליכים חוזרים ומוחק את העבודה הידנית מהלו״ז.' },
      { icon: TrendingUp, title: 'מכירות', body: 'מסנן לידים, עוקב אחרי כל לקוח ועונה תוך שניות — בכל ערוץ, מסביב לשעון.' },
      { icon: Headphones, title: 'שירות ותמיכה', body: 'פותר לבד את הפניות הנפוצות ומעביר לצוות רק את מה שבאמת דורש אדם.' },
    ],
    route: '/ai',
    ctaLabel: 'גלו את סוכני ה-AI',
    leadSubject: 'תיאום אפיון — סוכן AI מותאם',
    sourceSection: 'Home · Custom AI Agents',
  },
  {
    id: 'offer-cyber',
    icon: ShieldCheck,
    eyebrow: 'הגנת סייבר',
    title: 'הגנת סייבר',
    accent: 'שלא מחכה לאירוע הראשון',
    intro:
      'הגנה בגישת Zero-Trust שנבנית מראש, לא אחרי הפריצה. מיפוי חשיפות, הקשחה וניטור איומים רציף — על התשתית, על הענן ועל מודלי ה-AI שלכם. אותה רמת הגנה, בין אם אתם עובדים לבד או צוות קטן.',
    bullets: [
      { icon: ScanSearch, title: 'מיפוי חשיפות', body: 'מאתרים את החורים בתשתית, בענן ובתהליכי ה-AI לפני שמישהו אחר עושה את זה.' },
      { icon: Lock, title: 'Zero-Trust והקשחה', body: 'בקרת גישה, הפרדת רשתות, MFA והצפנה מקצה לקצה — כברירת מחדל.' },
      { icon: ShieldCheck, title: 'ניטור 24/7', body: 'זיהוי חריגות בזמן אמת, הגנה מפני Prompt Injection והתראה לפני שזה מתלקח.' },
      { icon: Wallet, title: 'בהיקף ובתקציב שלכם', body: 'הגנה שמתאימה לעצמאי, לפרילנסר או לעסק קטן — לא חבילת ענק שלא צריכים ולא משלמים עליה.' },
    ],
    route: '/cyber',
    ctaLabel: 'לפתרונות ההגנה',
    leadSubject: 'ייעוץ אבטחת סייבר',
    sourceSection: 'Home · Cyber & Security',
  },
  {
    id: 'offer-web-marketing',
    icon: Rocket,
    eyebrow: 'פיתוח ושיווק',
    title: 'אתר יפה זה נחמד.',
    accent: 'אתר שממיר זה עסק.',
    intro:
      'עיצוב ופיתוח פול-סטאק ברמה גבוהה, חוויית משתמש שמובילה לפעולה, וקמפיינים שמביאים לידים איכותיים — לא רק טראפיק. כל שקל שיווקי נמדד, נבדק ומשופר.',
    bullets: [
      { icon: Palette, title: 'עיצוב ו-UX', body: 'ממשק מהיר, נגיש ומדויק למותג שמוביל את המשתמש בול לפעולה — לא תבנית.' },
      { icon: Code2, title: 'פיתוח פול-סטאק', body: 'אתרים ואפליקציות מקצה לקצה, ארכיטקטורה נקייה וזמני טעינה שלא מבריחים אף אחד.' },
      { icon: Megaphone, title: 'קמפיינים דיגיטליים', body: 'אסטרטגיה, פרסום ותוכן שמביאים לידים שסוגרים — לא רק לייקים.' },
      { icon: LineChart, title: 'אופטימיזציה ל-ROI', body: 'מדידה, בדיקות A/B ושיפור מתמשך של כל שלב במסע ההמרה.' },
    ],
    route: '/digital',
    ctaLabel: 'לפיתוח והשיווק',
    leadSubject: 'אפיון פרויקט פיתוח / שיווק',
    sourceSection: 'Home · Web & Marketing',
  },
];
