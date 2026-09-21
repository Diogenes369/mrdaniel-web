import {
  Bot,
  ShieldCheck,
  Newspaper,
  TrendingUp,
  MessageCircle,
  Workflow,
  Sparkles,
  Fingerprint,
  Network,
  ScanSearch,
  PlugZap,
  Radio,
  BookOpen,
  BookMarked,
  Share2,
  type LucideIcon,
} from 'lucide-react';

/**
 * The three value pillars the homepage funnels toward, in a fixed order: (1) custom AI agents +
 * automation for small businesses and individuals, (2) enterprise cyber + AI integrations into
 * SaaS, (3) the 2026 hub for AI tutorials, news and guides. Copy drafted with Groq
 * (`openai/gpt-oss-120b`) and hand-tightened; guarded by scripts/__tests__/site-copy.test.mjs.
 * Each renders as an <OfferSection>
 * — a minimalist heading + a short scroll-lock rail of supporting points + a primary CTA to the
 * route and a secondary CTA (lead modal, or the community grid for the hub).
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
  /** Second CTA: 'lead' opens the lead modal, 'community' scrolls to the channels grid. */
  secondary: 'lead' | 'community';
  secondaryLabel: string;
}

export const HOME_OFFERS: HomeOffer[] = [
  {
    id: 'offer-ai-agents',
    icon: Bot,
    eyebrow: 'סוכני AI ואוטומציה',
    title: 'סוכני AI',
    accent: 'לעסקים קטנים ולאנשים פרטיים',
    intro: 'אני בונה סוכני AI שמתחברים ל-WhatsApp, ל-CRM, למייל וליומן. הם עונים, מסננים ומריצים את העבודה החוזרת, ואתם מאשרים רק את מה שחשוב.',
    bullets: [
      { icon: TrendingUp, title: 'מכירות ולידים', body: 'הסוכן מסנן פניות ב-WhatsApp ומעביר אליכם רק לידים רלוונטיים.' },
      { icon: MessageCircle, title: 'שירות', body: 'מענה מיידי מסביב לשעון על השאלות שחוזרות כל יום.' },
      { icon: Workflow, title: 'תפעול ומסמכים', body: 'הצעות מחיר, הזמנות ומסמכים שנוצרים ונשלחים בלי העתק-הדבק.' },
      { icon: Sparkles, title: 'עוזר אישי', body: 'מערכת JARVIS: עוזר AI בעברית שמנהל מייל, יומן ומשימות.' },
    ],
    route: '/ai',
    ctaLabel: 'לסוכני ה-AI',
    leadSubject: 'אפיון סוכן AI מותאם',
    sourceSection: 'Home · Custom AI Agents',
    secondary: 'lead',
    secondaryLabel: 'קבעו שיחת אפיון',
  },
  {
    id: 'offer-cyber-saas',
    icon: ShieldCheck,
    eyebrow: 'סייבר Enterprise',
    title: 'סייבר ואינטגרציות AI',
    accent: 'ברמת Enterprise',
    intro: 'Zero-Trust, הקשחת רשת והגנה על מודלי AI, מתוך ניהול IT בפועל. וכשמחברים AI למערכות ה-SaaS שלכם, זה קורה עם SSO והרשאות.',
    bullets: [
      { icon: Fingerprint, title: 'זהויות ו-Zero-Trust', body: 'ניהול זהויות ב-Active Directory וב-Entra ID, וגישה לפי צורך בלבד.' },
      { icon: Network, title: 'הקשחת רשת', body: 'תצורת FortiGate ו-FortiSwitch עם VLAN ו-VPN, מתועדת ונבדקת.' },
      { icon: ScanSearch, title: 'אבטחת מודלי AI', body: 'הגנה מפני Prompt Injection ודליפת מידע דרך הסוכנים עצמם.' },
      { icon: PlugZap, title: 'AI בתוך ה-SaaS', body: 'חיבור מודלים למערכות הקיימות עם SSO, הרשאות ולוגים.' },
    ],
    route: '/cyber',
    ctaLabel: 'לפתרונות הסייבר',
    leadSubject: 'ייעוץ סייבר ואינטגרציית AI לארגון',
    sourceSection: 'Home · Enterprise Cyber & SaaS AI',
    secondary: 'lead',
    secondaryLabel: 'קבעו שיחת אפיון',
  },
  {
    id: 'offer-ai-hub',
    icon: Newspaper,
    eyebrow: 'האב 2026',
    title: 'מדריכי AI וחדשות',
    accent: 'בזמן אמת',
    intro: 'חדשות AI וסייבר שמתעדכנות כל יום, מדריכים צעד אחר צעד ומגזינים מקצועיים. בלי רעש, רק מה שעובד בשטח.',
    bullets: [
      { icon: Radio, title: 'חדשות חיות', body: 'עדכוני AI וסייבר ממקורות מובילים, מתעדכנים לאורך היום.' },
      { icon: BookOpen, title: 'מדריכים מעשיים', body: 'הוראות צעד אחר צעד להפעלת כלי AI בעצמכם.' },
      { icon: BookMarked, title: 'מגזינים וחוברות', body: 'חוברות עבודה מקצועיות על AI, סייבר ורשתות.' },
      { icon: Share2, title: 'תוכן יומי ברשתות', body: 'טיפים ופירוקים קצרים ב-Instagram, Threads, TikTok ו-X.' },
    ],
    route: '/news',
    ctaLabel: 'לחדשות ולמדריכים',
    leadSubject: 'האב AI 2026',
    sourceSection: 'Home · 2026 AI Hub',
    secondary: 'community',
    secondaryLabel: 'עקבו ברשתות',
  },
];
