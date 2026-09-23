import type { SeoProps } from '../../components/seo/Seo';
import { organizationLd, serviceLd, breadcrumbLd } from '../structuredData';

/**
 * Per-route SEO config, keyed by exact pathname. `<RouteSeo>` (mounted once in App.tsx) looks the
 * current pathname up here and renders <Seo> with it. Dynamic routes (/news/:slug) don't have a key
 * — they fall through to DEFAULT_SEO and the page component renders its own richer <Seo> on top
 * once the data loads.
 *
 * Copy is tuned for Hebrew + English search intent around: AI news (חדשות AI), new LLMs
 * (מודלי שפה), and building autonomous AI agents (סוכני AI אוטונומיים). AI-only since 2026-09-21.
 */

export type PageSeoConfig = Omit<SeoProps, 'noindex'> & { noindex?: boolean };

export const PAGE_SEO: Record<string, PageSeoConfig> = {
  '/': {
    title: 'דניאל בן ברוך — סוכני AI שעושים את העבודה החוזרת',
    description:
      'סוכני AI שעונים ללקוחות, קובעים פגישות ומכינים מסמכים, בעברית ובמחובר לכלים שכבר יש לכם. וגם חדשות, טיפים ומדריכי AI בעברית פשוטה.',
    path: '/',
    // Organization + WebSite JSON-LD is already emitted statically in index.html (survives client
    // navigation) — no managed block needed here.
  },
  '/ai': {
    title: 'סוכן AI לעסק: מה זה, מה צריך להכין ואיך בונים | דניאל בן ברוך',
    description:
      'מדריך פשוט לסוכני AI: מה סוכן עושה, מה כדאי להכין לפני שמתחילים, ואיך בונים אותו יחד שלב אחרי שלב. וואטסאפ, יומן, מייל ומסמכים.',
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
  '/jarvis': {
    title: 'JARVIS: עוזר AI אישי בעברית | דניאל בן ברוך',
    description:
      'עוזר AI אישי בעברית שקובע פגישות, עונה למיילים, מזכיר מה פתוח ושולט במכשירים בבית ובמשרד. בקול או בהודעה, בענן או על מחשב אצלכם.',
    path: '/jarvis',
    jsonLd: [
      serviceLd({
        name: 'מערכת JARVIS — עוזר AI לעסקים ולבית חכם',
        serviceType: 'AI Assistant & Automation System',
        description:
          'תכנון והטמעה של מערכת JARVIS: ממשק קולי טבעי (NLP), אוטומציה וניהול עסקי, שליטה במכשירי IoT בבית ובמשרד, מבוססת LLM, RAG וזיכרון וקטורי.',
        path: '/jarvis',
      }),
      breadcrumbLd([{ name: 'בית', path: '/' }, { name: 'מערכת JARVIS', path: '/jarvis' }]),
    ],
  },
  '/news': {
    title: 'חדשות AI בעברית — מודלי שפה, סוכנים וכלים חדשים | דניאל בן ברוך',
    description:
      'לוח חדשות AI בזמן אמת: מודלי שפה חדשים, סוכנים אוטונומיים, כלים ומחקר, ממקורות מובילים בעולם ובישראל, עם פירוק בעברית.',
    path: '/news',
    jsonLd: breadcrumbLd([{ name: 'בית', path: '/' }, { name: 'חדשות', path: '/news' }]),
  },
  '/about': {
    title: 'אודות — דניאל בן ברוך | סוכני AI ומודלי שפה',
    description:
      'דניאל בן ברוך — בונה סוכני AI ומפרק מודלי שפה בעברית. גישה אישית, ישירה ומקצועית, ללא בוטים וללא מוקדי שירות.',
    path: '/about',
    jsonLd: organizationLd(),
  },
  '/magazines': {
    title: 'לומדים AI: מדריכים ומגזינים בקרוב | דניאל בן ברוך',
    description: 'בקרוב: מדריכים ומגזינים שמסבירים בגובה העיניים את מודלי ה-AI החדשים, כדי שתוכלו להוביל את העסק שלכם קדימה.',
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
    title: 'דניאל בן ברוך — חדשות AI, מודלי שפה וסוכני AI',
    description:
      'חדשות AI בעברית, פירוק מודלי השפה החדשים ובניית סוכני AI אוטונומיים.',
    path: pathname || '/',
  };
}
