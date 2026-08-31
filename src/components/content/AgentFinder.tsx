import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Briefcase,
  ShoppingCart,
  Headphones,
  TrendingUp,
  UserCog,
  ArrowLeft,
  Check,
  type LucideIcon,
} from 'lucide-react';
import WebButton from '../WebButton';

/**
 * Interactive "Agent Finder" — the page's conversion engine. Pick a use case, get a tailored
 * recommendation (architecture, key capabilities, integrated platforms) and a direct CTA that
 * opens the lead modal pre-qualified by the chosen use case.
 */
interface AgentProfile {
  id: string;
  icon: LucideIcon;
  useCase: string;
  headline: string;
  architecture: string;
  capabilities: string[];
  platforms: string[];
}

const PROFILES: AgentProfile[] = [
  {
    id: 'ops',
    icon: Briefcase,
    useCase: 'ניהול ותפעול העסק',
    headline: 'סוכן ניהול תפעולי מרכזי',
    architecture:
      'סוכן-על (Orchestrator) שמנתב משימות לסוכני-משנה ייעודיים, תחת שכבת Guardian לאישור ותיעוד כל פעולה רגישה.',
    capabilities: [
      'ריכוז משימות, לו"ז ותזכורות ממספר מקורות למקום אחד',
      'סיכומי פגישות ומיילים נכנסים באופן אוטומטי',
      'התראות על חריגות ותקיעות בתהליכים לפני שהן מתפוצצות',
    ],
    platforms: ['Google Workspace / Microsoft 365', 'Slack / WhatsApp', 'Notion / Monday / Asana'],
  },
  {
    id: 'sales',
    icon: ShoppingCart,
    useCase: 'מכירות אוטומטיות',
    headline: 'סוכן מכירות אוטונומי',
    architecture:
      'סוכן שיחה מבוסס RAG על קטלוג המוצרים והמחירון, עם חיבור דו-כיווני ל-CRM וללוח ההזמנות.',
    capabilities: [
      'כשירות לידים (Qualification) ותיאום פגישות אוטומטי',
      'מענה מיידי 24/7 בעברית טבעית, גם מחוץ לשעות העבודה',
      'מעקב ו-follow-up יזום על לידים קרים',
    ],
    platforms: ['HubSpot / Salesforce / Pipedrive', 'WhatsApp Business / טופס באתר', 'Calendly / Google Calendar'],
  },
  {
    id: 'support',
    icon: Headphones,
    useCase: 'שירות לקוחות',
    headline: 'סוכן שירות ותמיכה אוטונומי',
    architecture:
      'RAG על מאגר הידע, נהלי השירות וההיסטוריה של הלקוח; הסלמה לנציג אנושי רק כשבאמת צריך.',
    capabilities: [
      'פתרון פניות מקצה לקצה — לא רק ניתוב לנציג',
      'עדכון סטטוס הזמנות ופתיחת תקלות מול המערכות',
      'זיהוי לקוח בסיכון נטישה והתראה בזמן אמת',
    ],
    platforms: ['Zendesk / Freshdesk / Intercom', 'מייל / צ׳אט באתר', 'בסיס הנתונים / ERP'],
  },
  {
    id: 'finance',
    icon: TrendingUp,
    useCase: 'מסחר ופיננסים',
    headline: 'סוכן ניתוח ומסחר',
    architecture:
      'פייפליין דאטה בזמן אמת → סוכן ניתוח → סוכן ביצוע תחת חוקים וגבולות סיכון מוגדרים מראש (human-in-the-loop).',
    capabilities: [
      'ניטור שווקים, חדשות ואיתותים מסביב לשעון',
      'הרצת אסטרטגיות תחת בקרת סיכון קשיחה',
      'תיעוד מלא של כל פעולה ודוחות ביצועים',
    ],
    platforms: ['Broker API (IBKR / Binance וכו׳)', 'מקורות דאטה (מחירים, חדשות, on-chain)', 'לוח בקרה + התראות'],
  },
  {
    id: 'exec',
    icon: UserCog,
    useCase: 'עוזר אישי למנהל',
    headline: 'עוזר AI אישי (Executive Assistant)',
    architecture:
      'סוכן פרטי, מבודד וקולי, עם זיכרון וקטורי ארוך-טווח של ההעדפות ואופן העבודה שלך.',
    capabilities: [
      'ניהול לו"ז, מיילים ומשימות בפקודה קולית או טקסט',
      'תדריך בוקר יומי מותאם אישית',
      'הכנת טיוטות מענה, מסמכים וסיכומים',
    ],
    platforms: ['יומן ומייל אישי', 'מכשירי קול (רמקול חכם / אוזניות)', 'כלי ניהול המשימות שלך'],
  },
];

export default function AgentFinder() {
  const [active, setActive] = useState(0);
  const p = PROFILES[active];

  const openLead = () =>
    window.dispatchEvent(
      new CustomEvent('open-lead-modal', {
        detail: { subject: `אפיון סוכן AI — ${p.useCase}`, sourceSection: 'AI Page · Agent Finder' },
      })
    );

  return (
    <div className="mb-16 rounded-2xl cyber-glass cyber-glass--info p-6 md:p-8">
      <div className="mb-2 flex items-center gap-2.5">
        <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-brand-400">שלב 1</span>
        <h3 className="font-display text-lg md:text-xl font-bold text-white">מה הסוכן צריך לעשות עבורכם?</h3>
      </div>
      <p className="mb-5 text-sm text-zinc-400">בחרו תחום — ותקבלו מייד את הסט-אפ המומלץ לסוכן שמתאים לו.</p>

      <div className="mb-8 flex flex-wrap gap-2.5">
        {PROFILES.map((prof, i) => {
          const on = i === active;
          const Icon = prof.icon;
          return (
            <button
              key={prof.id}
              type="button"
              onClick={() => setActive(i)}
              aria-pressed={on}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition-colors ${
                on
                  ? 'border-brand-500 bg-brand-500 text-black'
                  : 'border-white/15 bg-carbon-900/60 text-zinc-300 hover:border-brand-500/40'
              }`}
            >
              <Icon className="w-4 h-4" />
              {prof.useCase}
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex items-center gap-2.5">
        <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-brand-400">שלב 2</span>
        <h3 className="font-display text-lg md:text-xl font-bold text-white">הסט-אפ המומלץ</h3>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={p.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="rounded-xl border border-brand-500/25 bg-brand-500/[0.04] p-5 md:p-6"
        >
          <h4 className="mb-2 font-display text-xl font-black text-white">{p.headline}</h4>
          <p className="mb-5 text-sm leading-relaxed text-zinc-300">
            <span className="font-bold text-brand-300">ארכיטקטורה: </span>
            {p.architecture}
          </p>

          <div className="mb-6 grid gap-5 sm:grid-cols-2">
            <div>
              <div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-zinc-500">יכולות מפתח</div>
              <ul className="space-y-2">
                {p.capabilities.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-sm text-zinc-300">
                    <Check className="mt-0.5 w-4 h-4 shrink-0 text-brand-400" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-zinc-500">פלטפורמות משולבות</div>
              <ul className="space-y-2">
                {p.platforms.map((pl) => (
                  <li key={pl} className="flex items-start gap-2 text-sm text-zinc-400" dir="auto">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    {pl}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <WebButton variant="primary" onClick={openLead}>
            תאם שיחת אפיון לסוכן זה
            <ArrowLeft className="w-4 h-4" />
          </WebButton>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
