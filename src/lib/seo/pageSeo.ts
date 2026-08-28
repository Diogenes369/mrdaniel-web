import type { SeoProps } from '../../components/seo/Seo';
import { organizationLd, serviceLd, breadcrumbLd } from '../structuredData';

/**
 * Per-route SEO config, keyed by exact pathname. `<RouteSeo>` (mounted once in App.tsx) looks the
 * current pathname up here and renders <Seo> with it. Dynamic routes (/news/:slug) don't have a key
 * — they fall through to DEFAULT_SEO and the page component renders its own richer <Seo> on top
 * once the data loads.
 *
 * Copy is tuned for Hebrew + English search intent around: custom AI agents
 * (סוכני בינה מלאכותית מותאמים אישית), cyber security for SMBs, and web development + marketing.
 */

export type PageSeoConfig = Omit<SeoProps, 'noindex'> & { noindex?: boolean };

export const PAGE_SEO: Record<string, PageSeoConfig> = {
  '/': {
    title: 'דניאל בן ברוך — סוכני AI מותאמים אישית, סייבר ואבטחה, פיתוח ושיווק',
    description:
      'בניית סוכני בינה מלאכותית מותאמים אישית לעסקים ולפרטיים (פיננסים, תפעול, מכירות, שירות, אוטומציה), פתרונות אבטחת סייבר לעסקים קטנים ובינוניים ולארגונים, ופיתוח אתרים ואפליקציות עם קמפיינים דיגיטליים בעלי ROI גבוה.',
    path: '/',
    // Organization + WebSite JSON-LD is already emitted statically in index.html (survives client
    // navigation) — no managed block needed here.
  },
  '/ai': {
    title: 'סוכני AI מותאמים אישית לעסקים ולפרטיים | דניאל בן ברוך',
    description:
      'ארכיטקטורת סוכני בינה מלאכותית אוטונומיים, מותאמים אישית לתהליך העסקי שלכם — פיננסים, תפעול, מכירות, שירות לקוחות ואוטומציה. אינטגרציה ל-WhatsApp, CRM והמערכות הקיימות, עם ROI ברור וזמן הטמעה קצר.',
    path: '/ai',
    jsonLd: [
      serviceLd({
        name: 'סוכני AI מותאמים אישית',
        serviceType: 'Custom AI Agent Development',
        description:
          'תכנון ובניית סוכני בינה מלאכותית מותאמים אישית לעסקים ולפרטיים במגוון תחומים: פיננסים, תפעול, מכירות, שירות ואוטומציה.',
        path: '/ai',
      }),
      breadcrumbLd([{ name: 'בית', path: '/' }, { name: 'סוכני AI', path: '/ai' }]),
    ],
  },
  '/cyber': {
    title: 'אבטחת סייבר לעסקים קטנים ובינוניים ולארגונים | דניאל בן ברוך',
    description:
      'פתרונות אבטחת מידע וסייבר מותאמים לעסקים קטנים ובינוניים ולסביבות ארגוניות — ארכיטקטורת Zero-Trust, הקשחה, ניטור איומים והגנה על מערכות AI ונתונים.',
    path: '/cyber',
    jsonLd: [
      serviceLd({
        name: 'אבטחת סייבר לעסקים וארגונים',
        serviceType: 'Cyber Security Services',
        description:
          'אבטחת מידע וסייבר לעסקים קטנים ובינוניים ולארגונים: Zero-Trust, ניטור איומים, הקשחת מערכות והגנה על נתונים ומודלי AI.',
        path: '/cyber',
      }),
      breadcrumbLd([{ name: 'בית', path: '/' }, { name: 'סייבר ואבטחה', path: '/cyber' }]),
    ],
  },
  '/digital': {
    title: 'פיתוח אתרים ואפליקציות וקמפיינים דיגיטליים | דניאל בן ברוך',
    description:
      'עיצוב ופיתוח אתרים ואפליקציות ברמה גבוהה — פיתוח פול-סטאק מקצה לקצה, חוויית משתמש מתקדמת וקמפיינים שיווקיים ממוקדי המרה עם החזר השקעה גבוה.',
    path: '/digital',
    jsonLd: [
      serviceLd({
        name: 'פיתוח דיגיטלי ושיווק',
        serviceType: 'Web Development & Digital Marketing',
        description:
          'עיצוב ופיתוח אתרים ואפליקציות פול-סטאק מקצה לקצה, וקמפיינים דיגיטליים ממוקדי ROI.',
        path: '/digital',
      }),
      breadcrumbLd([{ name: 'בית', path: '/' }, { name: 'פיתוח ושיווק', path: '/digital' }]),
    ],
  },
  '/news': {
    title: 'חדשות סייבר, AI וטכנולוגיה — עדכון יומי בעברית | דניאל בן ברוך',
    description:
      'לוח חדשות אינטראקטיבי בזמן אמת: ריכוז הכתבות הטריות ביותר בסייבר, בינה מלאכותית וענן מגיקטיים, אנשים ומחשבים, Techtime ו-Israel Defense.',
    path: '/news',
    jsonLd: breadcrumbLd([{ name: 'בית', path: '/' }, { name: 'חדשות', path: '/news' }]),
  },
  '/about': {
    title: 'אודות — דניאל בן ברוך | ארכיטקטורת AI, סייבר ופיתוח',
    description:
      'דניאל בן ברוך — ארכיטקט סוכני AI, מומחה אבטחת סייבר ומפתח דיגיטלי. גישה אישית, ישירה ומקצועית, ללא בוטים וללא מוקדי שירות.',
    path: '/about',
    jsonLd: organizationLd(),
  },
  '/architecture': {
    title: 'ארכיטקטורת מערכות AI וסייבר | דניאל בן ברוך',
    description:
      'עקרונות הארכיטקטורה שמאחורי סוכני ה-AI ומערכות האבטחה — רב-מודליות, Zero-Trust, אינטגרציות מאובטחות וזמן הטמעה קצר.',
    path: '/architecture',
  },
  '/capabilities': {
    title: 'יכולות — מה אפשר לבנות | דניאל בן ברוך',
    description:
      'סקירת יכולות: סוכני AI לתהליכים עסקיים, אבטחת סייבר לעסקים וארגונים, פיתוח אתרים ואפליקציות וקמפיינים דיגיטליים.',
    path: '/capabilities',
  },
  '/magazines': {
    title: 'חנות ומגזינים מקצועיים | דניאל בן ברוך',
    description: 'מגזינים ותכנים מקצועיים בנושאי בינה מלאכותית, אבטחת סייבר וטכנולוגיה.',
    path: '/magazines',
  },
  '/privacy': {
    title: 'מדיניות פרטיות | דניאל בן ברוך',
    description: 'מדיניות הפרטיות של האתר — כיצד נאסף, נשמר ומעובד מידע.',
    path: '/privacy',
    noindex: true,
  },
  '/terms': {
    title: 'תנאי שימוש | דניאל בן ברוך',
    description: 'תנאי השימוש באתר ובשירותים.',
    path: '/terms',
    noindex: true,
  },
  '/accessibility': {
    title: 'הצהרת נגישות | דניאל בן ברוך',
    description: 'הצהרת הנגישות של האתר והתאמות הנגישות הזמינות.',
    path: '/accessibility',
  },
};

export function DEFAULT_SEO(pathname: string): PageSeoConfig {
  return {
    title: 'דניאל בן ברוך — סוכני AI, סייבר ופיתוח דיגיטלי',
    description:
      'סוכני בינה מלאכותית מותאמים אישית, אבטחת סייבר לעסקים ולארגונים, ופיתוח דיגיטלי ושיווק מתקדם.',
    path: pathname || '/',
  };
}
