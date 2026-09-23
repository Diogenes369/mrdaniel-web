import { Users, Headset, Share2, BrainCog, Rocket, UserCog, type LucideIcon } from 'lucide-react';

/** Who the agent is packaged for — drives the "לעסקים" / "לעצמאים" filter and the wizard. */
export type AgentAudience = 'business' | 'individual';

/** The problem the agent is built to solve — drives the wizard's goal question and the match. */
export type AgentGoal = 'lead-gen' | 'support' | 'social' | 'knowledge';

/** A frontier lab whose CURRENT model an agent uses. The name is resolved at render time from the
 *  live model catalog (ModelUpdateAgent → /api/news?action=models), never written here. */
export type ModelVendor = 'OpenAI' | 'Anthropic' | 'Google' | 'xAI';

export interface AgentModel {
  vendor: ModelVendor;
  /** What that model does inside this agent, in plain words. */
  role: string;
}

/**
 * Ready-made agents for sale, shown on /ai (moved from the guides page 2026-09-23).
 *
 * Copy rules (2026-09-23 rewrite, same as src/data/siteCopy.ts): plain Hebrew for a non-technical
 * business owner, no acronyms that need a glossary, and NO figures other than the price. The
 * previous version promised "+35% lead conversion", "70% of tickets", "90% less time", "8 hours a
 * week" and "under 30 seconds" — none of it sourced. `benefit` says what changes, not by how much.
 *
 * Models: `models` names the LAB and the job, not the model version. The previous hard-coded
 * "Claude Opus 4.5 + GPT-5.2 / Gemini 2.5 Flash" was a year out of date within months; the card
 * now shows each lab's newest model as the sync agent last found it.
 */
export interface AiAgent {
  id: string;
  name: string;
  tagline: string;
  audience: AgentAudience[];
  goals: AgentGoal[];
  tierLabel: string;
  icon: LucideIcon;
  accent: string;
  glow: string;
  models: AgentModel[];
  /** What the agent does, in one or two plain sentences. */
  coreCapability: string;
  /** What changes for the buyer. Qualitative on purpose — see the header. */
  benefit: string;
  integrations: string[];
  useCase: string;
  price: number;
  badge?: string;
}

export const GOAL_LABEL: Record<AgentGoal, string> = {
  'lead-gen': 'פניות ולקוחות חדשים',
  support: 'שירות ללקוחות',
  social: 'תוכן ורשתות',
  knowledge: 'תשובות מהמסמכים',
};

export const AUDIENCE_LABEL: Record<AgentAudience, string> = {
  business: 'עסקים',
  individual: 'עצמאים ופרילנסרים',
};

export const AI_AGENTS: AiAgent[] = [
  {
    id: 'agent-sales-autopilot',
    name: 'סוכן פניות ומכירות',
    tagline: 'עונה מיד לכל פנייה, מבין מי באמת רוצה לקנות, וקובע לו פגישה איתכם.',
    audience: ['business'],
    goals: ['lead-gen'],
    tierLabel: 'לעסקים',
    icon: Rocket,
    accent: 'text-brand-400',
    glow: 'group-hover:shadow-[0_20px_70px_rgba(0,255,102,0.2)]',
    models: [
      { vendor: 'Anthropic', role: 'מנהל את השיחה' },
      { vendor: 'OpenAI', role: 'עונה מהר על שאלות פשוטות' },
    ],
    coreCapability: 'מדבר עם הלקוח בוואטסאפ או באתר, אוסף את הפרטים, וקובע פגישה ישר ביומן שלכם.',
    benefit: 'אף פנייה לא מחכה לכם, ואתם מגיעים רק לשיחות עם מי שבאמת מתעניין.',
    integrations: ['וואטסאפ', 'צ׳אט באתר', 'יומן Google', 'מערכת הלקוחות שלכם'],
    useCase: 'עסקים שמקבלים הרבה פניות, כמו נדל״ן, שירותים ומשרדים, שבהם כל שעת המתנה מפסידה לקוח.',
    price: 7900,
    badge: 'הכי מבוקש',
  },
  {
    id: 'agent-support-247',
    name: 'סוכן שירות לקוחות',
    tagline: 'עונה על השאלות שחוזרות כל יום, ומעביר אליכם רק את מה שבאמת דורש אתכם.',
    audience: ['business'],
    goals: ['support'],
    tierLabel: 'לעסקים',
    icon: Headset,
    accent: 'text-brand-300',
    glow: 'group-hover:shadow-[0_20px_60px_rgba(159,232,112,0.15)]',
    models: [
      { vendor: 'Anthropic', role: 'עונה ללקוח' },
      { vendor: 'Google', role: 'ממיין את הפניות לפי נושא' },
    ],
    coreCapability: 'עונה מתוך המידע של העסק שלכם, וכשמשהו חריג הוא מעביר לכם את הפנייה עם סיכום קצר.',
    benefit: 'הלקוחות מקבלים תשובה גם בלילה ובשבת, ואתם מטפלים רק במקרים שצריכים אתכם.',
    integrations: ['וואטסאפ', 'צ׳אט באתר', 'מערכת פניות', 'מייל'],
    useCase: 'חנויות אונליין ונותני שירות שמקבלים את אותן שאלות שוב ושוב.',
    price: 9400,
  },
  {
    id: 'agent-knowledge-rag',
    name: 'סוכן שעונה מהמסמכים שלכם',
    tagline: 'שואלים אותו שאלה, והוא עונה מתוך הנהלים, המחירונים והמסמכים שלכם, ומראה מאיפה.',
    audience: ['business'],
    goals: ['knowledge'],
    tierLabel: 'לעסקים',
    icon: BrainCog,
    accent: 'text-brand-400',
    glow: 'group-hover:shadow-[0_20px_70px_rgba(0,255,102,0.2)]',
    models: [
      { vendor: 'Anthropic', role: 'קורא את המסמכים ועונה' },
      { vendor: 'Google', role: 'קורא גם קבצים סרוקים ותמונות' },
    ],
    coreCapability: 'עובר על כל המסמכים שלכם, ועונה רק מתוכם, עם הפניה למסמך המדויק. כשאין תשובה, הוא אומר את זה.',
    benefit: 'מפסיקים לחפש מסמכים ולשאול את אותו אדם את אותה שאלה.',
    integrations: ['Google Drive', 'Notion', 'קבצי PDF', 'Slack'],
    useCase: 'עצמאים, יועצים וצוותים קטנים שהמידע שלהם מפוזר בין הרבה קבצים ותיקיות.',
    price: 14900,
  },
  {
    id: 'agent-orchestration-flagship',
    name: 'צוות סוכנים לעסק',
    tagline: 'כמה סוכנים שעובדים יחד: פניות, שירות ומסמכים, עם מסך אחד שבו אתם רואים הכל.',
    audience: ['business'],
    goals: ['knowledge', 'lead-gen', 'support'],
    tierLabel: 'החבילה המלאה',
    icon: UserCog,
    accent: 'text-black',
    glow: 'group-hover:shadow-[0_20px_80px_rgba(0,255,102,0.3)]',
    models: [
      { vendor: 'Anthropic', role: 'מנהל את הצוות ובודק את העבודה' },
      { vendor: 'OpenAI', role: 'משימות מהירות ושגרתיות' },
      { vendor: 'Google', role: 'מסמכים, תמונות וקבצים' },
      { vendor: 'xAI', role: 'מה שקורה עכשיו ברשת' },
    ],
    coreCapability: 'כל סוכן עושה את התפקיד שלו, ושכבת בקרה אחת דואגת שאף אחד לא יעשה משהו בלי הרשאה, ושהעלויות בשליטה.',
    benefit: 'במקום כמה כלים נפרדים, מערכת אחת שאתם מבינים ורואים מה היא עושה.',
    integrations: ['וואטסאפ', 'מערכת הלקוחות', 'Slack', 'יומן ומייל'],
    useCase: 'עסקים שכבר מבינים שיש להם כמה משימות חוזרות, ורוצים לטפל בכולן במקום אחד.',
    price: 18500,
    badge: 'הכי מקיף',
  },
  {
    id: 'agent-freelancer-assistant',
    name: 'עוזר אישי לעצמאים',
    tagline: 'קובע פגישות, שולח תזכורות ועונה ללקוחות, כאילו יש לכם עוזר אישי.',
    audience: ['individual'],
    goals: ['lead-gen', 'support'],
    tierLabel: 'לעצמאים',
    icon: Users,
    accent: 'text-brand-300',
    glow: 'group-hover:shadow-[0_20px_60px_rgba(159,232,112,0.15)]',
    models: [
      { vendor: 'Google', role: 'עונה מהר ובזול' },
      { vendor: 'OpenAI', role: 'מנסח הודעות ותזכורות' },
    ],
    coreCapability: 'עונה ללקוחות בוואטסאפ, קובע פגישות ביומן ושולח תזכורות תשלום, בלי שתצטרכו לעצור באמצע העבודה.',
    benefit: 'פחות הודעות ותיאומים, יותר זמן לעבודה שמשלמים לכם עליה.',
    integrations: ['וואטסאפ', 'יומן Google', 'טופס באתר'],
    useCase: 'פרילנסרים, יועצים ועצמאים שמנהלים לבד את כל הקשר עם הלקוחות.',
    price: 4800,
    badge: 'הכי קל להתחיל',
  },
  {
    id: 'agent-content-social',
    name: 'סוכן תוכן לרשתות',
    tagline: 'מציע רעיונות, כותב פוסטים ומתזמן אותם, ואתם רק מאשרים.',
    audience: ['individual'],
    goals: ['social'],
    tierLabel: 'לעצמאים',
    icon: Share2,
    accent: 'text-brand-400',
    glow: 'group-hover:shadow-[0_20px_60px_rgba(0,255,102,0.15)]',
    models: [
      { vendor: 'Anthropic', role: 'כותב את הפוסטים' },
      { vendor: 'xAI', role: 'מזהה על מה מדברים עכשיו' },
      { vendor: 'Google', role: 'עובד עם תמונות' },
    ],
    coreCapability: 'בונה לוח תוכן שבועי שמתאים לסגנון שלכם, כותב את הפוסטים ומכין אותם לפרסום.',
    benefit: 'נוכחות קבועה ברשתות בלי לשבת על זה שעות כל שבוע.',
    integrations: ['Instagram', 'LinkedIn', 'וואטסאפ'],
    useCase: 'יוצרי תוכן, עצמאים ועסקים קטנים שרוצים להופיע ברשתות באופן קבוע.',
    price: 6200,
  },
];
