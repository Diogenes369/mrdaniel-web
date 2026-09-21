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
    title: 'סוכני AI אוטונומיים',
    accent: 'שעושים את העבודה בשבילכם',
    intro: 'אני בונה סוכני AI אוטונומיים שמתחברים ל-WhatsApp, למייל, ליומן ולמסמכים. הם עונים, מסננים ומריצים את העבודה החוזרת, ואתם מאשרים רק את מה שחשוב.',
    bullets: [
      { icon: TrendingUp, title: 'סינון פניות', body: 'הסוכן מסנן הודעות ב-WhatsApp ומעביר אליכם רק את מה שרלוונטי.' },
      { icon: MessageCircle, title: 'מענה מיידי', body: 'תשובה מיידית על השאלות שחוזרות כל יום, גם כשאתם לא ליד המחשב.' },
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
    id: 'offer-llm-lab',
    icon: Cpu,
    eyebrow: 'מעבדת LLM',
    title: 'מודלי השפה החדשים',
    accent: 'מפורקים לגורמים',
    intro: 'כל מודל חדש עובר אצלי בדיקה מעשית: מה הוא עושה טוב, איפה הוא נופל ומתי כדאי לבחור בו. בלי הייפ, עם דוגמאות שאפשר להריץ.',
    bullets: [
      { icon: Scale, title: 'השוואות מודלים', body: 'Grok, Claude, Gemini ו-GPT על אותה משימה, זה מול זה.' },
      { icon: FlaskConical, title: 'בדיקות בשטח', body: 'פרומפטים אמיתיים, תוצאות אמיתיות, ומה למדתי מכל ריצה.' },
      { icon: Route, title: 'בחירת מודל', body: 'איזה מודל מתאים לאיזו משימה, ומתי מודל קטן מספיק.' },
      { icon: Database, title: 'RAG בפועל', body: 'לחבר מודל שפה למסמכים שלכם בלי שימציא תשובות.' },
    ],
    route: '/news',
    ctaLabel: 'לפירוקי המודלים',
    leadSubject: 'ייעוץ בחירת מודל LLM',
    sourceSection: 'Home · LLM Lab',
    secondary: 'x',
    secondaryLabel: 'עקבו ב-X',
  },
  {
    id: 'offer-ai-hub',
    icon: Newspaper,
    eyebrow: 'חדשות AI',
    title: 'מדריכי AI וחדשות',
    accent: 'בזמן אמת',
    intro: 'חדשות AI שמתעדכנות כל יום, מדריכים צעד אחר צעד ומגזינים מקצועיים. בלי רעש, רק מה שעובד בשטח.',
    bullets: [
      { icon: Radio, title: 'חדשות חיות', body: 'עדכוני AI ממקורות מובילים, מתעדכנים לאורך היום.' },
      { icon: BookOpen, title: 'מדריכים מעשיים', body: 'הוראות צעד אחר צעד להפעלת כלי AI בעצמכם.' },
      { icon: BookMarked, title: 'מגזינים וחוברות', body: 'חוברות עבודה מקצועיות על סוכני AI ומודלי שפה.' },
      { icon: Share2, title: 'תוכן יומי ברשתות', body: 'טיפים ופירוקים קצרים ב-Instagram, Threads, TikTok ו-X.' },
    ],
    route: '/news',
    ctaLabel: 'לחדשות ולמדריכים',
    leadSubject: 'האב AI 2026',
    sourceSection: 'Home · 2026 AI Hub',
    secondary: 'linktree',
    secondaryLabel: 'עקבו ברשתות',
  },
];
