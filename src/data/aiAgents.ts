import { Users, Headset, Share2, BrainCog, Rocket, UserCog, type LucideIcon } from 'lucide-react';

/** Who the agent is packaged for — drives the "עסקים" / "פרילנסרים ואנשים פרטיים"
 * filter and the wizard's audience question. */
export type AgentAudience = 'business' | 'individual';

/** The problem the agent is built to solve — drives the wizard's goal question and the
 * recommendation match. */
export type AgentGoal = 'lead-gen' | 'support' | 'social' | 'knowledge';

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
  /** The underlying multi-model architecture — deliberately named, not "AI-powered" hand-waving. */
  modelFoundation: string;
  coreCapability: string;
  roiEstimate: string;
  integrations: string[];
  useCase: string;
  price: number;
  badge?: string;
}

export const GOAL_LABEL: Record<AgentGoal, string> = {
  'lead-gen': 'ייצור וסינון לידים',
  support: 'שירות ותמיכת לקוחות',
  social: 'אוטומציית תוכן ורשתות',
  knowledge: 'ידע פנימי',
};

export const AUDIENCE_LABEL: Record<AgentAudience, string> = {
  business: 'עסקים ועצמאים',
  individual: 'פרילנסרים ואנשים פרטיים',
};

export const AI_AGENTS: AiAgent[] = [
  {
    id: 'agent-sales-autopilot',
    name: 'סוכן מכירות ולידים אוטונומי',
    tagline: 'עונה, מסנן ומתזמן פגישות עם כל ליד — תוך פחות מ-30 שניות, מסביב לשעון.',
    audience: ['business'],
    goals: ['lead-gen'],
    tierLabel: 'Business · Growth',
    icon: Rocket,
    accent: 'text-brand-400',
    glow: 'group-hover:shadow-[0_20px_70px_rgba(0,255,102,0.2)]',
    modelFoundation: 'Claude Opus 4.5 + GPT-5.2 — ניתוב רב-מודלי חכם לפי מורכבות הפנייה',
    coreCapability: 'מזהה כוונת רכישה בזמן אמת, אוסף פרטי ליד מלאים, ומזמן פגישה ישירות ביומן הצוות — ללא מגע יד אדם עד לשלב הסגירה.',
    roiEstimate: 'מקצר זמן תגובה ראשוני מ-4 שעות בממוצע ל-30 שניות, ומעלה שיעור המרת לידים ב-35% בממוצע.',
    integrations: ['WhatsApp Business API', 'CRM (HubSpot / Salesforce / Priority)', 'אתר ו-Web Chat', 'REST API'],
    useCase: 'עסקי B2B ו-B2C בעלי נפח פניות גבוה שבו כל דקת עיכוב בתגובה עולה כסף — נדל"ן, שירותים פיננסיים, סוכנויות דיגיטל.',
    price: 7900,
    badge: 'הכי מבוקש',
  },
  {
    id: 'agent-support-247',
    name: 'סוכן שירות לקוחות 24/7',
    tagline: 'פותר את רוב הפניות בעצמו, ומעביר לנציג אנושי רק כשבאמת נדרש.',
    audience: ['business'],
    goals: ['support'],
    tierLabel: 'Business · Growth',
    icon: Headset,
    accent: 'text-brand-300',
    glow: 'group-hover:shadow-[0_20px_60px_rgba(159,232,112,0.15)]',
    modelFoundation: 'Claude Sonnet 4.5 (מענה מהיר) + Gemini 2.5 Flash (ניתוב וסיווג פניות)',
    coreCapability: 'מבין את היסטוריית הלקוח, עונה מתוך בסיס הידע שלכם, ומסלים לנציג אנושי עם סיכום מלא כשמדובר במקרה חריג.',
    roiEstimate: 'חוסך כ-70% מנפח הפניות השגרתיות לנציגים אנושיים, וזמינות מלאה 24/7 ללא עלות משמרות לילה.',
    integrations: ['WhatsApp', 'Zendesk / Freshdesk', 'צ׳אט אתר', 'REST API'],
    useCase: 'חנויות אונליין ונותני שירות עם נפח פניות תמיכה גבוה וחוזר על עצמו.',
    price: 9400,
  },
  {
    id: 'agent-knowledge-rag',
    name: 'סוכן ידע פנימי (RAG)',
    tagline: 'כל הידע של העסק — מדיניות, נהלים, מסמכים — במקום אחד, עם תשובה מדויקת ומצוטטת תוך שניות.',
    audience: ['business'],
    goals: ['knowledge'],
    tierLabel: 'ידע',
    icon: BrainCog,
    accent: 'text-brand-400',
    glow: 'group-hover:shadow-[0_20px_70px_rgba(0,255,102,0.2)]',
    modelFoundation: 'Claude Opus 4.5 + Vector DB ייעודי (Pinecone / Weaviate) על בסיס הידע שלכם',
    coreCapability: 'מאנדקס את כל מאגרי הידע שלכם (Notion, Google Drive, Confluence, PDF-ים) ועונה עם ציטוט מקור מדויק — לא ניחוש.',
    roiEstimate: 'מקצר זמן איתור מידע מ-20 דקות בממוצע לפחות מדקה — עשרות שעות בחודש שחוזרות אליכם או לצוות הקטן.',
    integrations: ['Slack / Teams', 'Notion / Confluence', 'Google Drive / SharePoint', 'REST API'],
    useCase: 'עצמאים, יועצים וצוותים קטנים עם ידע מפוזר בין כלים שונים, שמבזבזים שעות בחיפוש מידע שכבר קיים.',
    price: 14900,
  },
  {
    id: 'agent-orchestration-flagship',
    name: 'צוות סוכנים מתואם (Multi-Agent)',
    tagline: 'כמה סוכנים ייעודיים — מכירות, תמיכה וידע — עובדים יחד תחת שכבת בקרה אחת.',
    audience: ['business'],
    goals: ['knowledge', 'lead-gen', 'support'],
    tierLabel: 'דגל',
    icon: UserCog,
    accent: 'text-black',
    glow: 'group-hover:shadow-[0_20px_80px_rgba(0,255,102,0.3)]',
    modelFoundation: 'Claude Opus 4.5 + Gemini 3 Pro + GPT-5.2 — Multi-Agent Orchestration עם Guardian Agents לבקרה',
    coreCapability: 'מתאם בין מספר סוכנים ייעודיים (מכירות, תמיכה, ידע) תחת שכבת Guardian Agents אחת שמפקחת על הרשאות, עלויות ואיכות תשובה.',
    roiEstimate: 'מחליף החזקה של כמה כלי אוטומציה נפרדים, ונותן לכם תמונה אחת על כל מה שרץ אוטומטית.',
    integrations: ['CRM / ERP', 'Slack / Teams', 'WhatsApp Business API', 'REST / GraphQL API'],
    useCase: 'עסקים קטנים עם כמה תהליכים אוטומטיים במקביל שרוצים שכבת ניהול ובקרת עלויות אחת, במקום פתרונות מבודדים.',
    price: 18500,
    badge: 'Flagship 2026',
  },
  {
    id: 'agent-freelancer-assistant',
    name: 'סוכן ניהול לקוחות לפרילנסרים',
    tagline: 'מתאם פגישות, שולח תזכורות ועונה על שאלות נפוצות של לקוחות — כאילו יש לכם עוזר/ת אישית.',
    audience: ['individual'],
    goals: ['lead-gen', 'support'],
    tierLabel: 'Individual · Starter',
    icon: Users,
    accent: 'text-brand-300',
    glow: 'group-hover:shadow-[0_20px_60px_rgba(159,232,112,0.15)]',
    modelFoundation: 'Gemini 2.5 Flash + Claude Haiku 4.5 — עלות הפעלה נמוכה במיוחד',
    coreCapability: 'עונה ללקוחות פוטנציאליים ב-WhatsApp, מתאם פגישות ביומן, ושולח תזכורות תשלום — כל זה בלי שתצטרכו לעצור באמצע עבודה.',
    roiEstimate: 'חוסך כ-8 שעות שבועיות בניהול תיאומים, תזכורות ומענה ללקוחות — זמן שחוזר ישירות לעבודה בתשלום.',
    integrations: ['WhatsApp', 'Google Calendar', 'טופס אתר', 'API'],
    useCase: 'פרילנסרים, יועצים ובעלי עסקים עצמאיים שמנהלים לבד את כל התקשורת מול לקוחות ורוצים להחזיר לעצמם שעות.',
    price: 4800,
    badge: 'נקודת כניסה',
  },
  {
    id: 'agent-content-social',
    name: 'סוכן אוטומציית תוכן ורשתות',
    tagline: 'מייצר, מעצב ומתזמן תוכן שבועי לרשתות החברתיות — מרעיון ראשוני ועד פרסום.',
    audience: ['individual'],
    goals: ['social'],
    tierLabel: 'Individual · Growth',
    icon: Share2,
    accent: 'text-brand-400',
    glow: 'group-hover:shadow-[0_20px_60px_rgba(0,255,102,0.15)]',
    modelFoundation: 'Claude Opus 4.5 (כתיבה ואסטרטגיית תוכן) + Gemini 3 Pro (ניתוח מגמות ותמונה)',
    coreCapability: 'בונה לוח תוכן שבועי מותאם למותג האישי שלכם, מנסח פוסטים ולוכד תזמון פרסום אוטומטי בפלטפורמות הרלוונטיות.',
    roiEstimate: 'מייצר ומתזמן תוכן שבועי מלא ב-90% פחות זמן לעומת כתיבה ותכנון ידניים.',
    integrations: ['Instagram / LinkedIn API', 'WhatsApp Business', 'לוח תזמון Web'],
    useCase: 'יוצרי תוכן, פרילנסרים ובעלי עסקים קטנים שרוצים נוכחות עקבית ברשתות בלי להקדיש לכך שעות מדי שבוע.',
    price: 6200,
  },
];
