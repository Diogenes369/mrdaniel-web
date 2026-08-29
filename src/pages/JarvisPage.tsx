import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic,
  Briefcase,
  Home,
  BrainCircuit,
  Database,
  Radio,
  AudioLines,
  Lock,
  Check,
  Layers,
  BarChart3,
  FileText,
  HelpCircle,
  ChevronDown,
} from 'lucide-react';
import { SectionHeading, ServiceGrid, InfoBox } from '../components/content/ContentPrimitives';
import JarvisShowcaseVideo from '../components/content/JarvisShowcaseVideo';
import WebButton from '../components/WebButton';

const LEAD_SUBJECT = 'JARVIS System Inquiry';

function openJarvisLead(sourceSection: string) {
  window.dispatchEvent(
    new CustomEvent('open-lead-modal', { detail: { subject: LEAD_SUBJECT, sourceSection } })
  );
}

/** Custom cyber badge/logo element — an arc-reactor style ring with the JARVIS wordmark, pure
 * SVG + CSS glow, tuned to the dark site palette. */
function JarvisBadge() {
  return (
    <div className="relative inline-flex items-center justify-center">
      <div className="absolute inset-0 rounded-full bg-brand-500/25 blur-2xl" aria-hidden="true" />
      <svg viewBox="0 0 120 120" className="relative w-28 h-28 md:w-32 md:h-32" role="img" aria-label="JARVIS">
        <defs>
          <linearGradient id="jarvisRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#9FE870" />
            <stop offset="100%" stopColor="#4d7c0f" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="52" fill="none" stroke="url(#jarvisRing)" strokeWidth="2" opacity="0.5" />
        <circle
          cx="60"
          cy="60"
          r="44"
          fill="none"
          stroke="#76B900"
          strokeWidth="3"
          strokeDasharray="6 10"
          strokeLinecap="round"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 60 60"
            to="360 60 60"
            dur="18s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="60" cy="60" r="30" fill="none" stroke="url(#jarvisRing)" strokeWidth="1.5" opacity="0.7" />
        <circle cx="60" cy="60" r="6" fill="#9FE870" />
      </svg>
      <span className="absolute font-mono text-[11px] md:text-xs font-bold tracking-[0.35em] text-brand-200 translate-y-10 md:translate-y-11">
        JARVIS
      </span>
    </div>
  );
}

interface CapabilityGroup {
  icon: typeof Mic;
  title: string;
  points: { lead: string; text: string }[];
}

const CAPABILITIES: CapabilityGroup[] = [
  {
    icon: Mic,
    title: '🎙️ ממשק קולי טבעי ואינטראקטיבי',
    points: [
      {
        lead: 'הבנת שפה טבעית (NLP)',
        text: 'אין צורך בפקודות קוליות קשיחות. המערכת מבינה סלנג, כוונת משתמש והקשר מורכב.',
      },
      {
        lead: 'תקשורת דו-כיוונית',
        text: 'המערכת משיבה בקול אנושי, זורם וטבעי, ומסוגלת לנהל דיון ולשאול שאלות הבהרה.',
      },
    ],
  },
  {
    icon: Briefcase,
    title: '💼 ניהול ואוטומציה עסקית מתקדמת',
    points: [
      {
        lead: 'אינטגרציה מלאה לתוכנות (APIs)',
        text: 'המערכת מתממשקת ליומנים, תיבות מייל, מערכות CRM, ומנהלי משימות.',
      },
      {
        lead: 'ניהול לו"ז חכם',
        text: 'תיאום פגישות אוטומטי, שליחת תזכורות וסיכום מיילים נכנסים.',
      },
      {
        lead: 'ניתוח נתונים',
        text: 'הפקת דוחות, מעקב אחר ביצועים ומתן תובנות עסקיות בזמן אמת.',
      },
    ],
  },
  {
    icon: Home,
    title: '🏡 שליטה מוחלטת בבית ובמשרד חכם',
    points: [
      {
        lead: 'מערכת בקרה מרכזית',
        text: 'חיבור לכל מכשירי ה-IoT (תאורה, מיזוג, אבטחה, ומולטימדיה).',
      },
      {
        lead: 'תרחישים חכמים',
        text: 'הפעלת פרופילים מותאמים אישית (למשל: "מצב פגישה" שמחשיך אורות ומפעיל מקרן).',
      },
    ],
  },
];

const CUSTOMER_BENEFITS = [
  'חיסכון של שעות עבודה (אוטומציה אדמיניסטרטיבית).',
  'זמינות של 24/7 (עוזר שלא מפספס משימה).',
  'התאמה אישית מלאה (נתפר בדיוק לפי הצרכים).',
  'אבטחת מידע מתקדמת.',
];

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'מה זו בעצם מערכת JARVIS ואיך היא שונה מ-ChatGPT רגיל?',
    a: "JARVIS היא לא רק צ'אט מענה על שאלות, אלא סוכן בינה מלאכותית אוטונומי (Agentic AI) שפועל ומבצע פעולות בפועל. המערכת מתחברת למערכות הליבה של העסק שלך (CRM, מיילים, יומנים, בסיסי נתונים ו-APIs) ויודעת להוציא לפועל משימות מורכבות מקצה לקצה בצורה עצמאית לחלוטין.",
  },
  {
    q: 'האם המערכת תומכת בתקשורת מלאה בעברית ובדיבור קולי?',
    a: 'כן, באופן מלא! JARVIS מונעת על ידי מודלי השפה המתקדמים בעולם (GPT-4o, Claude 3.5, Gemini) התומכים בעברית טבעית ברמה אנושית. בנוסף, ניתן לשלב במערכת מנועי קול מתקדמים (TTS/STT) המאפשרים לנהל איתה שיחה קולית רציפה וטבעית בעברית לניהול ותפעול העסק.',
  },
  {
    q: 'לאיזה סוגי עסקים המערכת מתאימה?',
    a: 'JARVIS נבנית ומותאמת אישית לכל עסק - החל מחברות הייטק, משרדי נדל"ן, סוכנויות דיגיטל ועד לעסקים קטנים ובינוניים. המערכת מייעלת תהליכי שירות לקוחות, ניהול לידים, אוטומציה של משימות אדמיניסטרטיביות, ניתוח דאטה וניהול פרויקטים.',
  },
  {
    q: 'עד כמה המידע העסקי שלי שמור ומאובטח?',
    a: 'אבטחת המידע והפרטיות של העסק שלך נמצאות בראש סדר העדיפויות. JARVIS עובדת בתוך סביבה מאובטחת, מוצפנת ומבודדת (Enterprise-grade Security). המידע העסקי שלך לא משמש לאימון מודלים ציבוריים ונשאר בשליטתך מלאה.',
  },
  {
    q: 'איך מתבצע תהליך ההטמעה בעסק שלי?',
    a: 'התהליך מתחיל בפגישת אפיון מקיפה שבה אנו ממפים את הצורכים והאוטומציות הדרושות לעסק. לאחר מכן, אנו בונים, מגדירים ומחברים את JARVIS למערכות שלכם, מבצעים בדיקות איכות (QA) ומספקים הדרכה מלאה לצוות.',
  },
];

function FaqAccordion({ items }: { items: { q: string; a: string }[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="mx-auto max-w-4xl divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-carbon-900/40">
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div key={item.q}>
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-5 py-5 text-right transition-colors hover:bg-white/[0.04] md:px-7"
            >
              <span className="font-display text-base md:text-lg font-bold text-white">{item.q}</span>
              <ChevronDown
                className={`w-5 h-5 shrink-0 text-brand-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <p className="px-5 pb-6 text-sm md:text-base leading-[1.9] text-zinc-300 md:px-7">
                    {item.a}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

export default function JarvisPage() {
  return (
    <div id="page-top" className="min-h-screen pt-24 md:pt-28 pb-24">
      <div className="container-wide">
        {/* ---- Hero ---- */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col items-center text-center pt-8 pb-12 md:pt-12 md:pb-16"
        >
          <JarvisBadge />
          <h1 className="mt-8 font-display font-black text-3xl md:text-5xl lg:text-6xl leading-[1.15] text-white max-w-4xl">
            מערכת JARVIS לעסקים ולבית חכם: העוזר האישי של העתיד, כבר היום
          </h1>
          <p className="mt-6 text-base md:text-lg text-zinc-300 leading-[1.9] max-w-3xl">
            מערכת JARVIS (Just A Rather Very Intelligent System) היא תפיסה מהפכנית של ניהול סביבה, פרויקטים
            ואוטומציות, המבוססת על בינה מלאכותית מתקדמת (AI). המערכת משמשת כמוח מרכזי שמחבר, מתאם ומנהל את כל
            המערכות הדיגיטליות והפיזיות שלכם, ומספקת חוויית משתמש חלקה, מותאמת אישית ומונעת בקול או בטקסט.
          </p>
        </motion.div>

        <div className="pt-4">
          {/* ---- Concept card — broad, full-width, centered text ---- */}
          <div className="bg-carbon-900/60 border border-white/10 rounded-2xl p-6 md:p-10 mb-16 text-center">
            <h2 className="font-display font-black text-xl md:text-2xl text-white mb-4">🤖 מהי מערכת JARVIS?</h2>
            <p className="text-base md:text-lg text-zinc-300 leading-[1.85] max-w-full">
              JARVIS אינה סתם עוד תוכנה או צ'אטבוט רגיל. זהו סוכן בינה מלאכותית פרואקטיבי (AI Agent). בעוד
              שתוכנות רגילות מחכות לפקודות קשיחות, JARVIS מבינה הקשר, לומדת את הרגלי המשתמש ומסוגלת לקבל החלטות
              ולבצע משימות מורכבות מקצה לקצה באופן עצמאי.
            </p>
          </div>

          {/* ---- Video showcase — cover grid + centered lightbox modal ---- */}
          <div className="mt-16 mb-6 text-center">
            <h2 className="font-display font-black text-2xl md:text-3xl text-white mb-3">משתמשי מערכת JARVIS</h2>
            <p className="text-zinc-400 text-base md:text-lg leading-relaxed max-w-3xl mx-auto">
              אלו משתמשים שעובדים כיום עם מערכת JARVIS שיכולה לנהל לכם את כל העסק/רעיון שלכם
            </p>
          </div>
          <JarvisShowcaseVideo />

          {/* ---- Core capabilities ---- */}
          <SectionHeading
            icon={Layers}
            title="🚀 יכולות הליבה של המערכת"
            description="שלושה תחומי ליבה שבהם JARVIS פועלת כמוח מרכזי אחד — קול, עסק ובית/משרד חכם."
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6 mb-16">
            {CAPABILITIES.map((group) => {
              const Icon = group.icon;
              return (
                <div
                  key={group.title}
                  className="flex h-full flex-col rounded-2xl border border-white/10 bg-carbon-fiber p-6 hover:border-brand-500/40 transition-colors"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-black/40 text-brand-400">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-display text-lg font-bold text-white leading-snug mb-4">{group.title}</h3>
                  <ul className="space-y-4">
                    {group.points.map((p) => (
                      <li key={p.lead} className="text-sm leading-relaxed text-zinc-400">
                        <strong className="block text-zinc-100 mb-0.5">{p.lead}:</strong>
                        {p.text}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* ---- Technical architecture ---- */}
          <SectionHeading
            icon={BrainCircuit}
            title="הארכיטקטורה הטכנולוגית של מערכת JARVIS"
            description="חמש תשתיות טכנולוגיות שפועלות במקביל תחת 'מוח מרכזי' אחד."
          />
          <InfoBox>
            <p>
              מאחורי חוויית המשתמש החלקה והאינטראקטיבית של מערכת JARVIS עומד שילוב של טכנולוגיות הבינה
              המלאכותית, האוטומציה ואבטחת המידע המתקדמות ביותר בעולם. המערכת אינה פועלת כתוכנה סגורה, אלא כ'מוח
              מרכזי' המשלב מספר תשתיות טכנולוגיות במקביל כדי להשיג מהירות תגובה מקסימלית, יציבות מלאה ודיוק גבוה.
            </p>
          </InfoBox>
          <ServiceGrid
            items={[
              {
                icon: BrainCircuit,
                title: '🧠 מנועי LLM (Large Language Models) מובילים',
                description: 'מבוסס על GPT-4, Claude ו-Gemini להבנת הקשר עמוקה וניהול שיחה דינמית.',
              },
              {
                icon: Database,
                title: '💾 טכנולוגיית RAG וזיכרון וקטורי',
                description:
                  'Retrieval-Augmented Generation — זיכרון לטווח ארוך של העדפות ונהלים, ושילוב מידע פנימי בזמן אמת ממסמכים ומיילים.',
              },
              {
                icon: Radio,
                title: '📡 ממשקי API וסנכרון רשת בזמן אמת',
                description: 'סוכן עצמאי (AI Agent) עם אוטומציה מקצה לקצה וזמן תגובה אפסי (Low Latency).',
              },
              {
                icon: AudioLines,
                title: '🎙️ עיבוד קול חכם (STT & TTS)',
                description: 'STT להמרת דיבור לטקסט עם סינון רעשים, ו-TTS להפקת קול אנושי וטבעי.',
              },
              {
                icon: Lock,
                title: '🔒 אבטחת מידע ופרטיות מקצה לקצה',
                description:
                  'הצפנת AES-256 (תקן צבאי/פיננסי), ניהול הרשאות OAuth 2.0, ואפשרות לסביבה מבודדת בשרתים פרטיים או On-Premise.',
              },
            ]}
          />

          {/* ---- Customer benefits ---- */}
          <SectionHeading
            icon={BarChart3}
            title="📊 היתרונות המרכזיים עבור הלקוח שלך"
            description="מה זה אומר בפועל, בשורה התחתונה."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-16">
            {CUSTOMER_BENEFITS.map((benefit) => (
              <div
                key={benefit}
                className="flex items-start gap-3 rounded-2xl border border-white/10 bg-carbon-900/60 p-5"
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
                  <Check className="w-4 h-4" />
                </span>
                <span className="text-base text-zinc-200 leading-relaxed">{benefit}</span>
              </div>
            ))}
          </div>

          {/* ---- Pricing framing (no public pricing) ---- */}
          <InfoBox title="פתרון בהתאמה אישית לפי מורכבות הארגון והדרישות">
            <p>
              מערכת JARVIS נתפרת סביב מפת התהליכים, המערכות והרגולציה של כל ארגון — מספר האינטגרציות, מקורות
              הדאטה, רמת ההרשאות ואופן הפריסה (ענן פרטי או On-Premise) נקבעים באפיון משותף.
            </p>
            <p>
              לכן <strong className="text-white">אין באתר זה מחירים ציבוריים או עלויות חבילה קבועות</strong>.
              ההיקף, לוחות הזמנים והתמחור נבנים לאחר פגישת אפיון ומוגשים כהצעה ארגונית מסודרת.
            </p>
          </InfoBox>

          {/* ---- FAQ ---- */}
          <SectionHeading
            icon={HelpCircle}
            title="שאלות ותשובות נפוצות"
            description="כל מה שצריך לדעת על מערכת האוטונומיה העסקית JARVIS"
          />
          <FaqAccordion items={FAQ_ITEMS} />

          {/* ---- Single bottom conversion section — the page's ONLY other CTA trigger ---- */}
          <section className="mt-20 md:mt-28 rounded-3xl border border-brand-500/30 bg-gradient-to-bl from-brand-500/15 via-carbon-900 to-carbon-900 p-10 md:p-16 text-center">
            <h2 className="font-display font-black text-2xl md:text-4xl text-white mb-4">
              נבנה את מערכת JARVIS סביב הצרכים שלכם
            </h2>
            <p className="text-zinc-300 text-base md:text-lg leading-relaxed max-w-2xl mx-auto mb-8">
              פגישת אפיון קצרה ממפה את התהליכים, המערכות והדרישות — ובסופה הצעה מסודרת עם היקף, לוחות זמנים
              ותמחור מותאם. פתרון בהתאמה אישית לפי מורכבות הארגון והדרישות, ללא מחירון מדף.
            </p>
            <WebButton variant="primary" onClick={() => openJarvisLead('JARVIS Page · Bottom Conversion')}>
              <FileText className="w-4 h-4" />
              בקשת הצעת מחיר לארגון
            </WebButton>
            <p className="mt-6 text-xs text-zinc-500">
              אין באתר זה מחירים ציבוריים או עלויות חבילה קבועות עבור מערכת JARVIS.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
