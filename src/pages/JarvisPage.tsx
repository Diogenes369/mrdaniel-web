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

// Copy rewritten 2026-09-23 in the plain client voice (see src/data/siteCopy.ts). Removed with it:
// claims the page could not back up ("זמן תגובה אפסי", "הצפנת AES-256 תקן צבאי", "משתמשים שעובדים
// כיום עם JARVIS", "100% פרטיות") and the acronym layer (NLP, STT/TTS, RAG, OAuth, Agentic AI).
const CAPABILITIES: CapabilityGroup[] = [
  {
    icon: Mic,
    title: 'מדברים איתו כמו עם אדם',
    points: [
      { lead: 'בלי פקודות מיוחדות', text: 'מבקשים במילים שלכם, גם בסלנג, והוא מבין מה התכוונתם.' },
      { lead: 'עונה בקול', text: 'אפשר לדבר איתו ולשמוע תשובה, והוא שואל כשמשהו לא ברור לו.' },
    ],
  },
  {
    icon: Briefcase,
    title: 'מסדר לכם את העבודה',
    points: [
      { lead: 'מחובר לכלים שלכם', text: 'יומן, מייל, רשימת הלקוחות ורשימת המשימות.' },
      { lead: 'פגישות ותזכורות', text: 'קובע פגישות, שולח תזכורות ומסכם את המיילים שהגיעו.' },
      { lead: 'תמונת מצב', text: 'אומר לכם בכל רגע מה פתוח, מה מחכה לכם ומה כבר טופל.' },
    ],
  },
  {
    icon: Home,
    title: 'גם בבית ובמשרד',
    points: [
      { lead: 'שליטה במכשירים', text: 'תאורה, מיזוג ומסכים, כשהם מחוברים לרשת.' },
      { lead: 'מצבים מוכנים', text: 'למשל "מצב פגישה": מחשיך את האור ומדליק את המקרן בבקשה אחת.' },
    ],
  },
];

const CUSTOMER_BENEFITS = [
  'פחות מטלות קטנות שגוזלות לכם את היום.',
  'עובד גם כשאתם לא ליד המחשב.',
  'נבנה סביב הדרך שבה אתם עובדים, לא להפך.',
  'המידע שלכם נשאר בשליטה שלכם.',
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
    title: 'בענן: הכי פשוט להתחיל',
    description: 'JARVIS רץ על שרת בענן. לא צריך לקנות מחשב מיוחד, והעדכונים מגיעים לבד.',
    featured: true,
    points: [
      { label: 'מחשב', value: 'כל מחשב, טאבלט או טלפון.' },
      { label: 'אינטרנט', value: 'חיבור יציב.' },
      { label: 'לשיחה קולית', value: 'מיקרופון ורמקולים, או אוזניות.' },
    ],
  },
  {
    icon: Cpu,
    title: 'אצלכם במשרד: פרטיות מקסימלית',
    description: 'JARVIS מותקן על מחשב אצלכם, והמידע לא יוצא החוצה. דורש מחשב חזק במיוחד.',
    points: [
      { label: 'מעבד', value: 'Intel Core i7 או AMD Ryzen 7 מדור עדכני ומעלה.' },
      { label: 'זיכרון', value: 'לפחות 32GB, עדיף 64GB.' },
      { label: 'כרטיס מסך', value: 'NVIDIA חזק (RTX 3090 או 4090 ומעלה). בלעדיו המודל לא ירוץ אצלכם.' },
      { label: 'אחסון', value: 'כונן SSD מהיר עם לפחות 1TB פנוי.' },
    ],
  },
];

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'במה JARVIS שונה מ-ChatGPT?',
    a: 'ChatGPT עונה לכם. JARVIS גם עושה: הוא מחובר ליומן, למייל ולשאר הכלים שלכם, ויכול לקבוע פגישה, לשלוח מייל או לעדכן רשימה, ולעצור לאישור שלכם כשצריך.',
  },
  {
    q: 'הוא מבין עברית ומדבר בקול',
    a: 'כן. הוא עובד בעברית טבעית, בכתב ובקול. אפשר לבקש ממנו דברים בדיבור ולקבל תשובה בקול.',
  },
  {
    q: 'למי זה מתאים',
    a: 'לעצמאים ולעסקים קטנים שמבזבזים זמן על יומן, מיילים, תזכורות ומעקב אחרי לקוחות. בשיחה הראשונה נבדוק יחד אם זה באמת מתאים לכם.',
  },
  {
    q: 'מה קורה עם המידע שלי',
    a: 'המידע נשאר שלכם. אפשר להריץ את JARVIS על מחשב אצלכם, כך שהמידע לא יוצא החוצה בכלל. בענן, הוא לא משמש לאימון מודלים ציבוריים.',
  },
  {
    q: 'איך מתחילים',
    a: 'בשיחה קצרה אנחנו מבינים מה הכי מעמיס עליכם. אחר כך אני בונה ומחבר את JARVIS לכלים שלכם, בודק שהכל עובד, ומראה לכם איך להשתמש בו.',
  },
];

function CapCard({ group }: { group: CapabilityGroup }) {
  const Icon = group.icon;
  return (
    <div className="glass-panel glass-panel--marketing flex h-full flex-col rounded-2xl p-5 sm:p-6 lg:p-8">
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
    <div className="mx-auto max-w-4xl divide-y divide-white/10 overflow-hidden rounded-2xl glass-panel glass-panel--info">
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
      {/* ---- Hero: the full-width JARVIS graphic is pinned to the ABSOLUTE top of the viewport
             (behind the news ticker + nav — the section is pulled up by the desktop ticker's
             height so `top-0` really is the page top, no break line). The image carries NO top
             padding/margin; the inner content wrapper carries the top padding that pushes the
             circle clear of the sticky header and drops the H1 into a clean gap below it. The
             bottom of the image keeps its mask fade into the particle background. ---- */}
      <section className="relative -mt-[34px] min-h-[95dvh] overflow-hidden">
        <img
          src="/images/jarvis-hero-bg.png"
          alt="מערכת JARVIS"
          fetchPriority="high"
          loading="eager"
          decoding="async"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[50dvh] sm:h-[56dvh] md:h-[62dvh] w-full object-cover object-center [mask-image:linear-gradient(to_bottom,black_55%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_55%,transparent_100%)]"
        />

        {/* Inner content wrapper — the ONLY place with top padding. */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="container-wide relative z-[1] flex flex-col items-center text-center pt-[46dvh] sm:pt-[50dvh] md:pt-[54dvh] pb-10 md:pb-14"
        >
          <h1 className="font-display font-black text-3xl sm:text-4xl md:text-5xl lg:text-6xl leading-[1.15] text-white max-w-4xl [text-shadow:0_2px_24px_rgba(0,0,0,0.85)]">
            JARVIS: עוזר אישי בעברית שבאמת עושה דברים
          </h1>
          <p className="mt-5 md:mt-6 text-sm sm:text-base md:text-lg text-zinc-200 leading-[1.8] md:leading-[1.9] max-w-2xl [text-shadow:0_1px_16px_rgba(0,0,0,0.8)]">
            מבקשים ממנו בהודעה או בקול, והוא מסדר: קובע פגישות, עונה למיילים, מזכיר מה פתוח ומעדכן את
            הרשימות שלכם. אתם מחליטים, הוא עושה.
          </p>
        </motion.div>
      </section>

      <div className="container-wide">
        <div className="pt-6 md:pt-12">
          {/* ---- Concept card — broad, full-width, centered text ---- */}
          <Reveal className="glass-panel glass-panel--marketing rounded-2xl p-6 sm:p-8 lg:p-10 mb-16 md:mb-24 text-center">
            <h2 className="font-display font-black text-xl md:text-2xl text-white mb-4">מה זה JARVIS</h2>
            <p className="text-base md:text-lg text-zinc-300 leading-[1.85] max-w-full">
              צ׳אטבוט רגיל רק עונה לכם. JARVIS הוא{' '}
              <TermTooltip term="AI Agent">סוכן AI</TermTooltip>: הוא מחובר לכלים שלכם, זוכר איך אתם עובדים,
              ועושה את הפעולה עצמה. כשמשהו חשוב, הוא עוצר ושואל אתכם לפני שהוא ממשיך.
            </p>
          </Reveal>

          {/* ---- Video showcase — cover grid + centered lightbox modal ---- */}
          <Reveal>
            <div className="mt-16 mb-6 text-center">
              <h2 className="font-display font-black text-2xl md:text-3xl text-white mb-3">JARVIS בפעולה</h2>
              <p className="text-zinc-400 text-base md:text-lg leading-relaxed max-w-3xl mx-auto">
                סרטונים קצרים שמראים איך זה נראה כשמדברים איתו ומבקשים ממנו לעשות משהו.
              </p>
            </div>
            <JarvisShowcaseVideo />
          </Reveal>

          {/* ---- Core capabilities ---- */}
          <SectionHeading
            icon={Layers}
            title="מה הוא יודע לעשות"
            description="שלושה דברים עיקריים: לדבר איתכם, לסדר לכם את העבודה, ולשלוט במכשירים בבית ובמשרד."
          />
          <div className="hidden md:grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6 mb-16 md:mb-24">
            {CAPABILITIES.map((group) => (
              <CapCard key={group.title} group={group} />
            ))}
          </div>
          <SwipeRow className="mb-14" itemClassName="w-[85%]">
            {CAPABILITIES.map((group) => (
              <CapCard key={group.title} group={group} />
            ))}
          </SwipeRow>

          {/* ---- What's inside, in plain words (replaced the "technical architecture" block and its
                 acronym glossary on 2026-09-23) ---- */}
          <SectionHeading
            icon={BrainCircuit}
            title="מה יש בפנים, בפשטות"
            description="ארבעה חלקים שעובדים יחד. לא צריך להבין אותם כדי להשתמש, אבל טוב לדעת מה קורה מאחורי הקלעים."
          />
          <ServiceGrid
            items={[
              {
                icon: BrainCircuit,
                title: 'המוח',
                description: 'מודלי ה-AI המובילים, כמו Claude, Gemini, GPT ו-Grok. לכל משימה נבחר המודל שעושה אותה הכי טוב.',
              },
              {
                icon: Database,
                title: 'הזיכרון',
                description: 'זוכר מה אתם מעדיפים ואיך אתם עובדים, ויודע לחפש תשובות בתוך המסמכים והמיילים שלכם.',
              },
              {
                icon: AudioLines,
                title: 'הקול',
                description: 'מבין דיבור בעברית גם כשיש רעש ברקע, ועונה בקול טבעי.',
              },
              {
                icon: Lock,
                title: 'הפרטיות',
                description: 'אתם קובעים לאילו כלים יש לו גישה. אפשר להריץ אותו אצלכם במשרד, כך שהמידע לא יוצא החוצה.',
              },
            ]}
          />

          {/* ---- Customer benefits ---- */}
          <SectionHeading
            icon={BarChart3}
            title="מה זה נותן לכם"
            description="בשורה התחתונה: יותר זמן לדברים שרק אתם יכולים לעשות."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-16 md:mb-24">
            {CUSTOMER_BENEFITS.map((benefit) => (
              <div
                key={benefit}
                className="flex items-start gap-3 glass-panel glass-panel--info rounded-2xl p-5"
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
                  <Check className="w-4 h-4" />
                </span>
                <span className="text-base text-zinc-200 leading-relaxed">{benefit}</span>
              </div>
            ))}
          </div>

          {/* ---- Pricing framing (no public pricing) ---- */}
          <InfoBox title="כמה זה עולה">
            <p>
              תלוי במה שאתם צריכים: לכמה כלים הוא מתחבר, כמה דברים הוא עושה, ואם הוא רץ בענן או אצלכם.
            </p>
            <p>
              לכן <strong className="text-white">אין כאן מחירון קבוע</strong>. אחרי שיחה קצרה אתם מקבלים הצעה
              ברורה בכתב, עם מחיר ולוח זמנים.
            </p>
          </InfoBox>

          {/* ---- System & hardware requirements ---- */}
          <SectionHeading
            icon={Server}
            title="איפה הוא רץ"
            description="שתי אפשרויות. רוב האנשים מתחילים בענן."
          />
          <div className="hidden md:grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6 mb-16 md:mb-24">
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
            icon={HelpCircle}
            title="שאלות שאנשים שואלים"
            description="התשובות הקצרות. על כל השאר מדברים בשיחה."
          />
          <FaqAccordion items={FAQ_ITEMS} />

          {/* ---- Single bottom conversion section — the page's ONLY other CTA trigger ---- */}
          <section className="mt-20 md:mt-28 rounded-3xl border border-brand-500/30 bg-gradient-to-bl from-brand-500/15 via-carbon-900 to-carbon-900 p-10 md:p-16 text-center">
            <h2 className="font-display font-black text-2xl md:text-4xl text-white mb-4">
              בואו נבנה לכם JARVIS
            </h2>
            <p className="text-zinc-300 text-base md:text-lg leading-relaxed max-w-2xl mx-auto mb-8">
              שיחה קצרה: אתם מספרים מה מעמיס עליכם, ואני חוזר עם הצעה ברורה, מחיר ולוח זמנים.
            </p>
            <WebButton variant="primary" onClick={() => openJarvisLead('JARVIS Page · Bottom Conversion')}>
              <FileText className="w-4 h-4" />
              לקבלת הצעה
            </WebButton>
          </section>
        </div>
      </div>
    </div>
  );
}
