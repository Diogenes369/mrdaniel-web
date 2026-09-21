import {
  Sparkles,
  User,
  Layers,
  Cpu,
  Database,
  Bot,
  ShieldAlert,
  Send,
  Check,
  Clapperboard,
  UserCog,
  ShoppingCart,
  Workflow,
  Network,
  ArrowLeft,
  type LucideIcon,
} from 'lucide-react';
import { PageHero, SectionHeading, ServiceGrid, UnifiedCta } from '../components/content/ContentPrimitives';
import AIPulseWidget from '../components/content/AIPulseWidget';
import AgentFinder from '../components/content/AgentFinder';
import VideoEmbed from '../components/content/VideoEmbed';
import WebButton from '../components/WebButton';
import { useAINewsFeed } from '../services/aiNewsService';

// Fallback content only — used while the live /api/ai-news feed is loading for the first time,
// or if it fails/returns nothing, so the video section is never empty or broken.
const CURATED_VIDEOS = [
  { youtubeId: 'PLyCki2K0Lg', title: 'Why we built—and donated—the Model Context Protocol (MCP)', channel: 'Anthropic' },
  { youtubeId: '5CcL6I3fdcA', title: 'What Is an AI Agent? (Assistant vs Workflow vs Agent)', channel: 'Zenphi' },
];

interface ShowcaseAgent {
  icon: LucideIcon;
  title: string;
  tagline: string;
  roi: string;
  features: string[];
  subject: string;
}

const SHOWCASE_AGENTS: ShowcaseAgent[] = [
  {
    icon: UserCog,
    title: 'עוזר AI למנהל',
    tagline: 'ניהול משימות ולו"ז',
    roi: 'מחזיר 8–12 שעות ניהול בשבוע',
    features: [
      'תיאום פגישות וניהול יומן אוטומטי',
      'סיכום מיילים נכנסים ותדריך בוקר יומי',
      'הכנת טיוטות מענה, מסמכים וסיכומים',
    ],
    subject: 'סוכן AI — עוזר אישי למנהל',
  },
  {
    icon: ShoppingCart,
    title: 'סוכן מכירות ושירות אוטונומי',
    tagline: 'מכירות ושירות 24/7',
    roi: 'זמן תגובה לליד — משעות לשניות',
    features: [
      'כשירות לידים ותיאום פגישות אוטומטי',
      'מענה מלא לפניות שירות מקצה לקצה',
      'follow-up יזום ועדכון ה-CRM בזמן אמת',
    ],
    subject: 'סוכן AI — מכירות ושירות אוטונומי',
  },
  {
    icon: Database,
    title: 'סוכן מחקר וניתוח נתונים (RAG)',
    tagline: 'ידע שאפשר לשאול',
    roi: 'תשובות מבוססות-מקור בשניות במקום שעות חיפוש',
    features: [
      'RAG על מסמכים, מיילים ובסיסי נתונים פנימיים',
      'הפקת דוחות ותובנות עסקיות לפי דרישה',
      'סביבה מבודדת ומוצפנת — ללא דליפת מידע',
    ],
    subject: 'סוכן AI — מחקר וניתוח נתונים',
  },
  {
    icon: Workflow,
    title: 'סוכן אוטומציה תפעולית',
    tagline: 'תהליכים שרצים לבד',
    roi: 'מבטל עבודה ידנית חוזרת ושגיאות אנוש',
    features: [
      'תזרימי עבודה רב-שלביים שמחברים בין מערכות',
      'לוגיקת החלטה מבוססת AI בתוך התהליך עצמו',
      'ניטור וטיפול בחריגות ללא התערבות שוטפת',
    ],
    subject: 'סוכן AI — אוטומציה תפעולית',
  },
];

function openAgentLead(subject: string) {
  window.dispatchEvent(
    new CustomEvent('open-lead-modal', { detail: { subject, sourceSection: 'AI Page · Agents Showcase' } })
  );
}

function ShowcaseCard({ agent }: { agent: ShowcaseAgent }) {
  const Icon = agent.icon;
  return (
    <div className="flex h-full flex-col glass-panel glass-panel--marketing rounded-2xl p-5 sm:p-6 lg:p-8">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-black/40 text-brand-400">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="font-display text-lg font-bold text-white leading-snug">{agent.title}</h3>
      <p className="mt-1 text-sm text-zinc-400">{agent.tagline}</p>

      <div className="mt-4 inline-flex items-start gap-2 rounded-lg border border-brand-500/25 bg-brand-500/[0.06] px-3 py-2 text-sm font-bold text-brand-300">
        <span className="font-mono text-[10px] uppercase tracking-widest text-brand-400/80 mt-0.5">ROI</span>
        {agent.roi}
      </div>

      <ul className="mt-5 space-y-2.5 flex-grow">
        {agent.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
            <Check className="mt-0.5 w-4 h-4 shrink-0 text-brand-400" />
            {f}
          </li>
        ))}
      </ul>

      <WebButton
        variant="glass"
        onClick={() => openAgentLead(agent.subject)}
        className="mt-6 w-full justify-center"
      >
        אני רוצה סוכן כזה
        <ArrowLeft className="w-4 h-4" />
      </WebButton>
    </div>
  );
}

export default function AIPage() {
  const { data: aiNews, isLoading: aiNewsLoading } = useAINewsFeed();

  const videos = aiNews && aiNews.videos.length > 0 ? aiNews.videos : CURATED_VIDEOS;

  return (
    <div id="page-top" className="min-h-screen pt-24 md:pt-28 pb-24">
      <div className="container-wide">
        <PageHero
          badgeIcon={Sparkles}
          badgeLabel="Custom AI Agents · Architecture & Deployment"
          title="סוכני AI מותאמים אישית — לעסק ולניהול האישי"
          subtitle="מ-Chatbot שעונה על שאלות לסוכן אוטונומי שמבצע משימות שלמות מקצה לקצה, מחובר לכלים שכבר יש לכם — עם בקרה אנושית."
          metaChips={[
            { icon: User, label: 'מאת: דניאל' },
            { icon: Layers, label: 'Agentic AI • RAG • MCP' },
            { icon: ShieldAlert, label: 'Guardian Agents & בקרה אנושית' },
          ]}
        />

        <div className="pt-8 md:pt-10">
          {/* ---- Conversion engine: pick a use case → get a tailored setup + CTA ---- */}
          <SectionHeading
            icon={Cpu}
            title="לא בטוחים איזה סוכן מתאים לכם? בואו נמצא ב-30 שניות"
            description="בחרו את התחום שהכי כואב לכם כרגע, וקבלו מיד המלצה ממוקדת: ארכיטקטורה, יכולות מפתח והפלטפורמות שהסוכן יתחבר אליהן."
          />
          <AgentFinder />

          {/* ---- Showcase grid ---- */}
          <SectionHeading
            icon={Bot}
            title="סוכני AI מותאמים אישית — לעסק ולשימוש אישי"
            description="כל סוכן נבנה סביב תהליך אחד שהוא עושה טוב יותר מכל כלי כללי — עם ROI ברור ונקודת כניסה ישירה."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 md:gap-6 mb-16">
            {SHOWCASE_AGENTS.map((agent) => (
              <ShowcaseCard key={agent.title} agent={agent} />
            ))}
          </div>

          {/* ---- Technical depth ---- */}
          <SectionHeading
            icon={Layers}
            title="עומק טכני: מהארכיטקטורה עד הפריסה"
            description="מה שמפריד בין דמו מרשים לסוכן שאפשר לסמוך עליו בייצור — ארבעה רכיבים שכל הטמעה רצינית נשענת עליהם."
          />
          <ServiceGrid
            items={[
              {
                icon: Database,
                title: 'ארכיטקטורת RAG וניהול ידע',
                description:
                  'חיבור מודלי שפה (LLMs) למסמכים, ל-PDFים ולמאגרי הנתונים שלכם בשיטות שליפה מתקדמות, עם מיסוך מידע רגיש (PII) בזמן ריצה.',
              },
              {
                icon: Network,
                title: 'תזמור רב-סוכני (Multi-Agent)',
                description:
                  'סוכן-על שמפרק משימה מורכבת לצעדים, מנתב אותם לסוכני-משנה ייעודיים, ומרכיב את התוצאה — עם retries ו-Rollback.',
              },
              {
                icon: Bot,
                title: 'אינטגרציה דרך MCP',
                description:
                  'חיבור הסוכן לכלים (יומן, מייל, מסמכים, APIs) דרך פרוטוקול MCP — סטנדרטי וקל לתחזוקה.',
              },
              {
                icon: ShieldAlert,
                title: 'Guardian Agents ובקרה',
                description:
                  'שכבת פיקוח שמאשרת, חוסמת ומתעדת כל פעולת סוכן — הגנה מפני Prompt Injection, הזיות ודליפת מידע.',
              },
            ]}
          />

          {/* ---- Live AI tools pulse ---- */}
          <SectionHeading
            icon={Sparkles}
            title="מה חדש בעולם ה-AI"
            description="כלים, מודלים ועדכונים רלוונטיים — מתעדכן אוטומטית."
          />
          <AIPulseWidget />

          {/* ---- Video showcase ---- */}
          <SectionHeading
            icon={Clapperboard}
            title="סוכני AI בפעולה: הצצה ליכולות האוטונומיות"
            description="הדגמות קצרות של סוכנים אוטונומיים מבצעים משימות אמיתיות מקצה לקצה."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-16">
            {aiNewsLoading && !aiNews
              ? Array.from({ length: 2 }).map((_, idx) => (
                  <div key={idx} className="aspect-video rounded-2xl bg-white/[0.03] border border-white/5 animate-pulse" />
                ))
              : videos.map((v) => <VideoEmbed key={v.youtubeId} youtubeId={v.youtubeId} title={v.title} channel={v.channel} />)}
          </div>

          {/* ---- Final CTA ---- */}
          <SectionHeading icon={Send} title="הצעד הבא" description="פגישת אפיון קצרה — ממפים את התהליך, בוחרים סוכן ומגדירים שלב ראשון עם מדד הצלחה ברור" />
          <UnifiedCta
            mailSubject="אפיון והטמעת סוכן AI מותאם אישית"
            whatsappMessage="שלום דניאל, אשמח לתאם פגישת אפיון לסוכן AI מותאם אישית לעסק / לשימוש האישי שלי."
          />
        </div>
      </div>
    </div>
  );
}
