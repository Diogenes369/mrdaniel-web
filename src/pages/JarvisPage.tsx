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
  Cloud,
  Cpu,
  Server,
} from 'lucide-react';
import { SectionHeading, ServiceGrid, InfoBox } from '../components/content/ContentPrimitives';
import JarvisShowcaseVideo from '../components/content/JarvisShowcaseVideo';
import WebButton from '../components/WebButton';
import TermTooltip from '../components/TermTooltip';
import Reveal from '../components/Reveal';
import SwipeRow from '../components/mobile/SwipeRow';

const LEAD_SUBJECT = 'JARVIS System Inquiry';

function openJarvisLead(sourceSection: string) {
  window.dispatchEvent(
    new CustomEvent('open-lead-modal', { detail: { subject: LEAD_SUBJECT, sourceSection } })
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

const DEPLOYMENT_OPTIONS: {
  icon: typeof Cloud;
  title: string;
  description: string;
  featured?: boolean;
  points: { label: string; value: string }[];
}[] = [
  {
    icon: Cloud,
    title: 'תצורת ענן (Cloud) - מומלץ לרוב העסקים',
    description:
      'המערכת רצה על השרתים המאובטחים שלנו. אין צורך ברכישת חומרה יקרה, והעדכונים מתבצעים אוטומטית.',
    featured: true,
    points: [
      { label: 'חומרה נדרשת', value: 'אין דרישות מיוחדות. עובד מכל מחשב (PC/Mac), טאבלט או סמארטפון.' },
      { label: 'חיבור רשת', value: 'אינטרנט יציב ומהיר (פס רחב).' },
      { label: 'ציוד היקפי', value: 'מיקרופון ורמקולים (או אוזניות) לאינטראקציה קולית.' },
      { label: 'זמן הקמה', value: 'מהיר מאוד.' },
    ],
  },
  {
    icon: Cpu,
    title: 'התקנה מקומית (On-Premise) - לארגונים',
    description:
      'המערכת מותקנת פיזית על השרתים או המחשבים בעסק שלך. מבטיח 100% פרטיות וניתוק מוחלט מהאינטרנט במידת הצורך.',
    points: [
      { label: 'מעבד (CPU)', value: 'דור עדכני של Intel Core i7 / AMD Ryzen 7 ומעלה.' },
      { label: 'זיכרון (RAM)', value: 'מינימום 32GB (מומלץ 64GB ומעלה).' },
      {
        label: 'כרטיס מסך (GPU)',
        value:
          'חובה כרטיס מסך חזק של NVIDIA (סדרת RTX 3090/4090 או סדרות RTX ADA / A100 לארגונים) להרצת מודלי השפה המקומיים.',
      },
      { label: 'אחסון', value: 'כונן SSD NVMe מהיר (לפחות 1TB פנוי).' },
    ],
  },
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

function CapCard({ group }: { group: CapabilityGroup }) {
  const Icon = group.icon;
  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-carbon-fiber p-6 hover:border-brand-500/40 transition-colors">
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
}

function ReqCard({ opt }: { opt: (typeof DEPLOYMENT_OPTIONS)[number] }) {
  const Icon = opt.icon;
  return (
    <div
      className={`flex h-full flex-col rounded-2xl border p-6 md:p-8 transition-colors ${
        opt.featured
          ? 'border-brand-500/40 bg-brand-500/[0.04] shadow-[0_0_40px_-12px_rgba(118,185,0,0.28)]'
          : 'border-white/10 bg-carbon-900/60 hover:border-brand-500/30'
      }`}
    >
      <div
        className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl border bg-black/40 ${
          opt.featured
            ? 'border-brand-500/40 text-brand-300 shadow-[0_0_20px_rgba(118,185,0,0.25)]'
            : 'border-white/10 text-brand-400'
        }`}
      >
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="font-display text-lg md:text-xl font-bold text-white leading-snug mb-2">{opt.title}</h3>
      <p className="text-sm md:text-base text-zinc-400 leading-relaxed mb-5">{opt.description}</p>
      <ul className="mt-auto space-y-3 border-t border-white/10 pt-5">
        {opt.points.map((p) => (
          <li key={p.label} className="text-sm md:text-[15px] leading-relaxed text-zinc-300">
            <strong className="text-white">{p.label}:</strong> {p.value}
          </li>
        ))}
      </ul>
    </div>
  );
}

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
    <div id="page-top" className="min-h-screen pb-24">
      {/* ---- Cinematic hero image band — full-bleed, ABOVE the headline. The bottom is faded
             with a CSS mask (not a solid overlay) so it dissolves into transparency and the
             site's global particle background stays visible behind the text below. ---- */}
      <div className="relative w-full h-[36vh] min-h-[240px] sm:h-[44vh] md:h-[52vh] overflow-hidden [mask-image:linear-gradient(to_bottom,black_0%,black_44%,transparent_92%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_44%,transparent_92%)]">
        <img
          src="/images/jarvis-hero-bg.png"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          loading="eager"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        {/* tiny top scrim so the fixed header stays legible over the image */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#08090C]/70 to-transparent"
        />
      </div>

      {/* Headline + intro, pulled up into the tail of the image fade for a continuous flow. */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="container-wide relative z-[2] -mt-14 sm:-mt-20 md:-mt-28 flex flex-col items-center text-center pb-12 md:pb-16"
      >
        <h1 className="font-display font-black text-3xl md:text-5xl lg:text-6xl leading-[1.15] text-white max-w-4xl [text-shadow:0_2px_24px_rgba(0,0,0,0.8)]">
          מערכת JARVIS לעסקים ולבית חכם: העוזר האישי של העתיד, כבר היום
        </h1>
        <p className="mt-6 text-base md:text-lg text-zinc-200 leading-[1.9] max-w-3xl [text-shadow:0_1px_16px_rgba(0,0,0,0.75)]">
          מערכת JARVIS (Just A Rather Very Intelligent System) היא תפיסה מהפכנית של ניהול סביבה, פרויקטים
          ואוטומציות, המבוססת על בינה מלאכותית מתקדמת (AI). המערכת משמשת כמוח מרכזי שמחבר, מתאם ומנהל את כל
          המערכות הדיגיטליות והפיזיות שלכם, ומספקת חוויית משתמש חלקה, מותאמת אישית ומונעת בקול או בטקסט.
        </p>
      </motion.div>

      <div className="container-wide">
        <div className="pt-4">
          {/* ---- Concept card — broad, full-width, centered text ---- */}
          <Reveal className="bg-carbon-900/60 border border-white/10 rounded-2xl p-6 md:p-10 mb-16 text-center">
            <h2 className="font-display font-black text-xl md:text-2xl text-white mb-4">🤖 מהי מערכת JARVIS?</h2>
            <p className="text-base md:text-lg text-zinc-300 leading-[1.85] max-w-full">
              JARVIS אינה סתם עוד תוכנה או צ'אטבוט רגיל. זהו סוכן בינה מלאכותית פרואקטיבי (
              <TermTooltip term="AI Agent">AI Agent</TermTooltip>). בעוד שתוכנות רגילות מחכות לפקודות קשיחות,
              JARVIS מבינה הקשר, לומדת את הרגלי המשתמש ומסוגלת לקבל החלטות ולבצע משימות מורכבות מקצה לקצה באופן
              עצמאי.
            </p>
          </Reveal>

          {/* ---- Video showcase — cover grid + centered lightbox modal ---- */}
          <Reveal>
            <div className="mt-16 mb-6 text-center">
              <h2 className="font-display font-black text-2xl md:text-3xl text-white mb-3">משתמשי מערכת JARVIS</h2>
              <p className="text-zinc-400 text-base md:text-lg leading-relaxed max-w-3xl mx-auto">
                אלו משתמשים שעובדים כיום עם מערכת JARVIS שיכולה לנהל לכם את כל העסק/רעיון שלכם
              </p>
            </div>
            <JarvisShowcaseVideo />
          </Reveal>

          {/* ---- Core capabilities ---- */}
          <SectionHeading
            sticky
            icon={Layers}
            title="🚀 יכולות הליבה של המערכת"
            description="שלושה תחומי ליבה שבהם JARVIS פועלת כמוח מרכזי אחד — קול, עסק ובית/משרד חכם. כל תחום מחליף שרשרת של כלים נפרדים בממשק אחד, קולי או טקסטואלי, שמדבר עם כל המערכות שכבר יש לכם."
          />
          <div className="hidden md:grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6 mb-16">
            {CAPABILITIES.map((group) => (
              <CapCard key={group.title} group={group} />
            ))}
          </div>
          <SwipeRow className="mb-14" itemClassName="w-[85%]">
            {CAPABILITIES.map((group) => (
              <CapCard key={group.title} group={group} />
            ))}
          </SwipeRow>

          {/* ---- Technical architecture ---- */}
          <SectionHeading
            sticky
            icon={BrainCircuit}
            title="הארכיטקטורה הטכנולוגית של מערכת JARVIS"
            description="חמש תשתיות טכנולוגיות שפועלות במקביל תחת 'מוח מרכזי' אחד — כל אחת אחראית על חלק אחר: הבנת שפה, זיכרון ארגוני, חיבור למערכות, קול ואבטחה."
          />
          <InfoBox>
            <p>
              מאחורי חוויית המשתמש החלקה והאינטראקטיבית של מערכת JARVIS עומד שילוב של טכנולוגיות הבינה
              המלאכותית, האוטומציה ואבטחת המידע המתקדמות ביותר בעולם. המערכת אינה פועלת כתוכנה סגורה, אלא כ'מוח
              מרכזי' המשלב מספר תשתיות טכנולוגיות במקביל כדי להשיג מהירות תגובה מקסימלית, יציבות מלאה ודיוק גבוה.
            </p>
          </InfoBox>

          {/* Beginner-friendly glossary chips — hover / tap each term for a plain-Hebrew explanation. */}
          <div className="mb-12 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-zinc-400">
            <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">מונחים בקצרה</span>
            <TermTooltip term="Agentic AI" />
            <TermTooltip term="LLM" />
            <TermTooltip term="RAG" />
            <TermTooltip term="STT" />
            <TermTooltip term="TTS" />
            <TermTooltip term="Zero-Trust" />
            <TermTooltip term="On-Premise" />
          </div>
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
            sticky
            icon={BarChart3}
            title="📊 היתרונות המרכזיים עבור הלקוח שלך"
            description="מה זה אומר בפועל, בשורה התחתונה — פחות עבודה ידנית, זמינות מלאה, התאמה מדויקת ואבטחה ברמה ארגונית."
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

          {/* ---- System & hardware requirements ---- */}
          <SectionHeading
            sticky
            icon={Server}
            title="דרישות מערכת וחומרה"
            description="מערכת JARVIS גמישה וניתנת להתקנה בשתי תצורות עיקריות, בהתאם לצרכי האבטחה והתקציב של העסק שלך:"
          />
          <div className="hidden md:grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6 mb-16">
            {DEPLOYMENT_OPTIONS.map((opt) => (
              <ReqCard key={opt.title} opt={opt} />
            ))}
          </div>
          <SwipeRow className="mb-14" itemClassName="w-[88%]">
            {DEPLOYMENT_OPTIONS.map((opt) => (
              <ReqCard key={opt.title} opt={opt} />
            ))}
          </SwipeRow>

          {/* ---- FAQ ---- */}
          <SectionHeading
            sticky
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
