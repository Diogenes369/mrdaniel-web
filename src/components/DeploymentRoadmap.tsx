import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Database, ShieldCheck, FlaskConical, Rocket, Check, type LucideIcon } from 'lucide-react';
import WebButton from './WebButton';
import { useSectionDissolve } from '../hooks/useSectionDissolve';

interface Phase {
  id: string;
  days: string;
  title: string;
  icon: LucideIcon;
  specs: string[];
  deliverables: string[];
}

const PHASES: Phase[] = [
  {
    id: 'phase-1',
    days: 'ימים 1–3',
    title: 'אפיון וארכיטקטורת RAG',
    icon: Database,
    specs: [
      'הקמת Vector DB ייעודי (Pinecone / Weaviate)',
      'צינור אינדוקס תוכן (Data Ingestion Pipeline)',
      'קונפיגורציית ניתוב מודלים בסיסית (Claude / Gemini)',
    ],
    deliverables: [
      'מיפוי תהליכים עסקיים ונקודות מגע עם לקוחות',
      'חיבור מאגרי ידע קיימים ואינדוקס תוכן ראשוני',
      'הגדרת מדיניות הרשאות, תמחור וטון שיחה',
    ],
  },
  {
    id: 'phase-2',
    days: 'ימים 4–7',
    title: 'שכבות סייבר ואבטחה',
    icon: ShieldCheck,
    specs: [
      'הצפנת AES-256 במנוחה, TLS 1.3 בתעבורה',
      'מסנני Prompt Injection ויומן ביקורת (Audit Trail)',
      'בידוד RPC/VLAN לכל סביבת לקוח',
    ],
    deliverables: [
      'הטמעת ארכיטקטורת Zero-Trust מלאה',
      'הפעלת Entra ID / MFA לכל גישה מנהלית',
      'הגדרת מדיניות Guardian Agent לפעולות רגישות',
    ],
  },
  {
    id: 'phase-3',
    days: 'ימים 8–11',
    title: 'בדיקות עומס וסימולציית מקרי קצה',
    icon: FlaskConical,
    specs: [
      'הרצת חבילת תרחישי תקיפה (Adversarial Prompt Suite)',
      'סימולציית עומס ובדיקת Rate-Limiting',
      'כיוונון זמן תגובה ליעד של פחות מ-2 שניות',
    ],
    deliverables: [
      'הרצת תרחישי Stress-Test בדיוק כמו אלו שמוצגים למעלה באתר',
      'כיוונון תגובות מול מדיניות עסקית בפועל',
      'בדיקות QA מלאות ומסלולי אסקלציה לבן אדם',
    ],
  },
  {
    id: 'phase-4',
    days: 'ימים 12–14',
    title: 'Go-Live ואינטגרציית WhatsApp',
    icon: Rocket,
    specs: [
      'חיבור WhatsApp Business API ו-Webhooks',
      'סנכרון דו-כיווני מול CRM קיים',
      'לוח מעקב Live לניטור בזמן אמת',
    ],
    deliverables: [
      'עליה לאוויר מלאה מול לקוחות אמיתיים',
      'הדרכת צוות קצרה על לוח הבקרה',
      'מעקב צמוד לאורך השבוע הראשון Live',
    ],
  },
];

export default function DeploymentRoadmap() {
  const [activeId, setActiveId] = useState<string>(PHASES[0].id);
  const sectionRef = useSectionDissolve<HTMLElement>();
  const activeIndex = PHASES.findIndex((p) => p.id === activeId);
  const active = PHASES[activeIndex];

  const handleCta = () => window.dispatchEvent(new CustomEvent('open-agent-qualifier'));

  return (
    <section id="deployment-roadmap" ref={sectionRef} data-field-form="scatter" className="py-12 md:py-20 border-t border-white/5 relative overflow-hidden w-full">
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="text-center mb-14 max-w-2xl mx-auto">
          <h2 className="font-display text-fluid-h2 font-black text-white mb-5">
            מהרעיון ל-<span className="text-brand-500">Live תוך 14 יום</span>
          </h2>
          <p className="text-fluid-body text-zinc-300 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">
            לא "נחזור אליכם" — מסלול פריסה מדויק ומתועד, שלב אחר שלב. לחצו על כל שלב לפרטים הטכניים המלאים.
          </p>
        </div>

        <div className="max-w-5xl mx-auto">
          {/* Node timeline */}
          <div className="relative mb-10">
            <div className="hidden md:block absolute top-7 inset-x-0 h-0.5 bg-white/10" aria-hidden="true">
              <motion.div
                className="h-full bg-brand-500"
                animate={{ width: `${(activeIndex / (PHASES.length - 1)) * 100}%` }}
                transition={{ duration: 0.4, ease: 'easeInOut' }}
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-3 relative">
              {PHASES.map((phase, idx) => {
                const isActive = phase.id === activeId;
                const isPast = idx < activeIndex;
                return (
                  <button
                    key={phase.id}
                    type="button"
                    onClick={() => setActiveId(phase.id)}
                    className="flex flex-col items-center gap-3 cursor-pointer group"
                  >
                    <span
                      className={`relative w-14 h-14 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                        isActive
                          ? 'bg-brand-500 border-brand-500 text-black shadow-[0_0_25px_rgba(118,185,0,0.5)] scale-110'
                          : isPast
                          ? 'bg-brand-500/20 border-brand-500/60 text-brand-400'
                          : 'bg-[#0D0E12] border-white/15 text-zinc-500 group-hover:border-brand-500/40'
                      }`}
                    >
                      {isPast && !isActive ? <Check className="w-5 h-5" /> : <phase.icon className="w-6 h-6" />}
                    </span>
                    <div className="text-center">
                      <span className={`block text-[10px] font-mono font-bold uppercase tracking-widest ${isActive ? 'text-brand-400' : 'text-zinc-500'}`}>
                        {phase.days}
                      </span>
                      <span className={`block text-xs md:text-sm font-bold mt-0.5 ${isActive ? 'text-white' : 'text-zinc-400'}`}>{phase.title}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Expanded detail panel */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
              className="bg-[#0D0E12] border border-white/10 rounded-[1.75rem] p-6 md:p-10"
            >
              <div className="flex items-start gap-4 mb-8">
                <div className="w-14 h-14 shrink-0 rounded-2xl bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-brand-400">
                  <active.icon className="w-7 h-7" />
                </div>
                <div>
                  <span className="block text-xs font-mono font-bold text-brand-400 uppercase tracking-widest mb-1">{active.days}</span>
                  <h3 className="font-display text-2xl font-black text-white">{active.title}</h3>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <span className="block text-xs font-mono font-bold text-zinc-500 uppercase tracking-widest mb-4">מפרט טכני</span>
                  <ul className="space-y-3">
                    {active.specs.map((spec) => (
                      <li key={spec} className="flex items-start gap-3 text-sm text-zinc-300 leading-relaxed">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0 mt-2" />
                        {spec}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="block text-xs font-mono font-bold text-zinc-500 uppercase tracking-widest mb-4">תוצרים ללקוח</span>
                  <ul className="space-y-3">
                    {active.deliverables.map((item) => (
                      <li key={item} className="flex items-start gap-3 text-sm text-zinc-300 leading-relaxed">
                        <Check className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="text-center mt-12">
          <WebButton variant="primary" onClick={handleCta} className="!px-8">
            רוצים לוח זמנים מדויק לעסק שלכם?
          </WebButton>
        </div>
      </div>
    </section>
  );
}
