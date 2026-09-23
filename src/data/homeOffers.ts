import {
  Bot,
  Cpu,
  Newspaper,
  TrendingUp,
  MessageCircle,
  Workflow,
  Sparkles,
  Scale,
  FlaskConical,
  Route,
  Database,
  Radio,
  BookOpen,
  BookMarked,
  Share2,
  type LucideIcon,
} from 'lucide-react';

/**
 * The three pillars the homepage funnels toward, in a fixed order: (1) building autonomous AI
 * agents, (2) the LLM lab — new models broken down and compared, (3) the live AI news + guides
 * hub. AI-only since 2026-09-21; guarded by scripts/__tests__/site-copy.test.mjs.
 * Each renders as an <OfferSection>
 * — a minimalist heading + a short scroll-lock rail of supporting points + a primary CTA to the
 * route and a secondary CTA (lead modal, or an external channel link).
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
  /** Second CTA: 'lead' opens the lead modal, 'x' opens the X profile, 'linktree' opens every
   *  channel. (The on-page X feed and channels grid were removed from the homepage 2026-09-22.) */
  secondary: 'lead' | 'x' | 'linktree';
  secondaryLabel: string;
}

export const HOME_OFFERS: HomeOffer[] = [
  {
    id: 'offer-ai-agents',
    icon: Bot,
    eyebrow: 'סוכני AI',
    title: 'סוכני AI',
    accent: 'שעושים את העבודה בשבילכם',
    intro: 'סוכן AI הוא כמו עובד דיגיטלי עם משימה אחת. הוא עונה בוואטסאפ, קובע פגישות ומכין מסמכים, ואתם מאשרים רק את מה שחשוב.',
    bullets: [
      { icon: TrendingUp, title: 'סינון פניות', body: 'קורא את ההודעות ומעביר אליכם רק את מה שבאמת דורש אתכם.' },
      { icon: MessageCircle, title: 'מענה מיידי', body: 'עונה על השאלות שחוזרות כל יום, גם כשאתם לא ליד הטלפון.' },
      { icon: Workflow, title: 'מסמכים לבד', body: 'הצעות מחיר והזמנות שמוכנות לאישור, בלי העתק-הדבק.' },
      { icon: Sparkles, title: 'עוזר אישי', body: 'JARVIS: עוזר בעברית שמסדר לכם מייל, יומן ומשימות.' },
    ],
    route: '/ai',
    ctaLabel: 'איך זה עובד',
    leadSubject: 'שיחת היכרות על סוכן AI',
    sourceSection: 'Home · Custom AI Agents',
    secondary: 'lead',
    secondaryLabel: 'בואו נדבר',
  },
  {
    id: 'offer-llm-lab',
    icon: Cpu,
    eyebrow: 'מעבדת מודלים',
    title: 'כל מודל AI חדש',
    accent: 'נבדק לפני שאתם משתמשים',
    intro: 'כל כמה שבועות יוצא מודל חדש. אני מנסה אותו על משימות אמיתיות ומספר לכם בפשטות מה הוא עושה טוב ומתי כדאי לבחור בו.',
    bullets: [
      { icon: Scale, title: 'זה מול זה', body: 'Grok, Claude, Gemini ו-GPT על אותה משימה, ומי עשה אותה הכי טוב.' },
      { icon: FlaskConical, title: 'בדיקות אמיתיות', body: 'משימות מהחיים, לא מבחנים של מעבדה, ומה למדתי מכל ניסיון.' },
      { icon: Route, title: 'איזה לבחור', body: 'איזה מודל מתאים לאיזו עבודה, ומתי מודל זול מספיק לגמרי.' },
      { icon: Database, title: 'תשובות מהמסמכים', body: 'איך גורמים ל-AI לענות מהמסמכים שלכם בלי להמציא.' },
    ],
    route: '/news',
    ctaLabel: 'לסקירות המודלים',
    leadSubject: 'ייעוץ בבחירת מודל AI',
    sourceSection: 'Home · LLM Lab',
    secondary: 'x',
    secondaryLabel: 'עקבו ב-X',
  },
  {
    id: 'offer-ai-hub',
    icon: Newspaper,
    eyebrow: 'חדשות AI',
    title: 'חדשות ומדריכי AI',
    accent: 'בעברית פשוטה',
    intro: 'מה חדש ב-AI, כל יום, ומדריכים צעד אחר צעד שאפשר לעשות לבד. בלי רעש, רק מה שבאמת שימושי.',
    bullets: [
      { icon: Radio, title: 'חדשות כל יום', body: 'מה קרה ב-AI היום, בכמה שורות ובלי ז׳רגון.' },
      { icon: BookOpen, title: 'מדריכים מעשיים', body: 'הוראות צעד אחר צעד להפעלת כלי AI בעצמכם.' },
      { icon: BookMarked, title: 'חוברות להורדה', body: 'מדריכים מלאים על סוכני AI, להורדה חינם.' },
      { icon: Share2, title: 'טיפים ברשתות', body: 'טיפים קצרים כל יום ב-Instagram, Threads, TikTok ו-X.' },
    ],
    route: '/news',
    ctaLabel: 'לחדשות ולמדריכים',
    leadSubject: 'האב AI 2026',
    sourceSection: 'Home · 2026 AI Hub',
    secondary: 'linktree',
    secondaryLabel: 'עקבו ברשתות',
  },
];
