import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Database, Network, KeyRound, ScanEye, Radar, RotateCcw, ShieldAlert, type LucideIcon } from 'lucide-react';
import TiltCard from './TiltCard';
import WebButton from './WebButton';
import { useSectionDissolve } from '../hooks/useSectionDissolve';

interface SecurityModule {
  id: string;
  label: string;
  icon: LucideIcon;
  activeDesc: string;
  riskDesc: string;
}

const MODULES: SecurityModule[] = [
  {
    id: 'zero-retention',
    label: 'Zero-Data Retention',
    icon: Database,
    activeDesc: 'שום נתון עסקי או שיחת לקוח לא משמש לאימון מודלים חיצוניים — אף פעם.',
    riskDesc: 'ללא שכבה זו: מידע עסקי רגיש עלול לזלוג למאגרי אימון של ספקי AI חיצוניים.',
  },
  {
    id: 'encrypted-rag',
    label: 'Encrypted RAG Pipeline',
    icon: ScanEye,
    activeDesc: 'כל שאילתת ידע מוצפנת מקצה לקצה — AES-256 במנוחה, TLS 1.3 בתעבורה.',
    riskDesc: 'ללא שכבה זו: תוכן מאגר הידע הארגוני חשוף במעבר בין שכבות המערכת.',
  },
  {
    id: 'isolated-vlan',
    label: 'Isolated RPC / VLAN',
    icon: Network,
    activeDesc: 'כל לקוח רץ ברשת וירטואלית מבודדת — אין שיתוף תשתית בין סביבות.',
    riskDesc: 'ללא שכבה זו: קיימת אפשרות תיאורטית לתנועה רוחבית בין סביבות לקוחות.',
  },
  {
    id: 'entra-mfa',
    label: 'Entra ID / MFA',
    icon: KeyRound,
    activeDesc: 'כל גישה מנהלית מאומתת בזיהוי מרובה-שלבים אדפטיבי, לא סיסמה בלבד.',
    riskDesc: 'ללא שכבה זו: חשבון עם סיסמה בודדת שנפרצה מספיק כדי לקבל גישה מלאה.',
  },
  {
    id: 'prompt-defense',
    label: 'Prompt Injection Defense',
    icon: ShieldAlert,
    activeDesc: 'כל קלט נבדק מול דפוסי תקיפה ידועים לפני שהוא מגיע למודל עצמו.',
    riskDesc: 'ללא שכבה זו: הסוכן חשוף למניפולציית פרומפט וחילוץ הוראות מערכת.',
  },
  {
    id: 'threat-monitoring',
    label: 'Continuous Threat Monitoring',
    icon: Radar,
    activeDesc: 'ניטור איומים פעיל 24/7 (EDR/XDR) עם תגובה אוטומטית לאירוע חריג.',
    riskDesc: 'ללא שכבה זו: פרצת אבטחה מתגלה רק בבדיקה ידנית מאוחרת, אם בכלל.',
  },
];

export default function CyberAuditMatrix() {
  const [activeIds, setActiveIds] = useState<Set<string>>(() => new Set(MODULES.map((m) => m.id)));
  const sectionRef = useSectionDissolve<HTMLElement>();

  const activeCount = activeIds.size;
  const allActive = activeCount === MODULES.length;

  const toggle = (id: string) => {
    setActiveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reset = () => setActiveIds(new Set(MODULES.map((m) => m.id)));

  const handleCta = () => window.dispatchEvent(new CustomEvent('open-agent-qualifier'));

  const statusColor = allActive ? 'text-brand-400' : activeCount >= MODULES.length / 2 ? 'text-amber-400' : 'text-red-400';
  const statusBorder = allActive ? 'border-brand-500/30 bg-brand-500/5' : activeCount >= MODULES.length / 2 ? 'border-amber-500/30 bg-amber-500/5' : 'border-red-500/30 bg-red-500/5';

  return (
    <section
      id="cyber-audit"
      ref={sectionRef}
      data-field-form="rings"
      data-field-anchor="left"
      className="py-12 md:py-20 border-t border-white/5 relative overflow-hidden w-full"
    >
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="text-center mb-10 max-w-2xl mx-auto">
          <h2 className="font-display text-fluid-h2 font-black text-white mb-5">
            מטריצת בקרה <span className="text-brand-500">סייבר ופרטיות</span>
          </h2>
          <p className="text-fluid-body text-zinc-300 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">
            כל סוכן AI שדניאל בונה נפרס עם שש שכבות הגנה פעילות כברירת מחדל. לחצו על כל מודול כדי לבדוק מה בדיוק הוא עוצר.
          </p>
        </div>

        <div className={`max-w-3xl mx-auto flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-6 py-4 mb-8 transition-colors duration-300 ${statusBorder}`}>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className={`w-5 h-5 ${statusColor}`} />
            <span className={`font-display font-bold text-sm md:text-base ${statusColor}`}>
              {activeCount}/{MODULES.length} שכבות הגנה פעילות
            </span>
          </div>
          {!allActive && (
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              שחזור לברירת מחדל
            </button>
          )}
        </div>

        {/* -mx-4/px-4 (mobile edge-bleed) vs. the desktop centering below both set margin-left/
            margin-right — they used to coexist unscoped on the same element (plus a stray
            `md:mx-0` that fought `mx-auto` for the same property at desktop too), which is exactly
            what caused both bugs at once: an off-center desktop grid, and mobile overflow/cropping
            from the edge-bleed margin fighting a simultaneously-applied `max-w-5xl mx-auto`. Now
            cleanly split: mobile owns -mx-4/px-4 with nothing competing, md: owns mx-auto/max-w-5xl
            with nothing competing. */}
        <div className="mobile-carousel-track -mx-4 px-4 pb-2 gap-4 md:px-0 md:pb-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-5 md:max-w-5xl md:mx-auto mb-12">
          {MODULES.map((mod) => {
            const isActive = activeIds.has(mod.id);
            return (
              <TiltCard key={mod.id} strength={6} className="mobile-carousel-item w-[78%] md:w-auto h-full">
                <button
                  type="button"
                  onClick={() => toggle(mod.id)}
                  aria-pressed={isActive}
                  className={`mobile-compact-card group relative w-full h-full text-right overflow-hidden rounded-2xl border p-6 transition-all duration-500 cursor-pointer ${
                    isActive
                      ? 'bg-[#0D0E12] border-brand-500/30 hover:border-brand-500/60 hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_rgba(118,185,0,0.25)]'
                      : 'bg-[#0D0E12] border-red-500/25 hover:border-red-500/50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-colors duration-300 ${
                        isActive ? 'bg-brand-500/10 border-brand-500/30 text-brand-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
                      }`}
                    >
                      <mod.icon className="w-6 h-6" />
                    </div>

                    {/* Toggle pill switch */}
                    <span
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-300 ${
                        isActive ? 'bg-brand-500/90 border-brand-400' : 'bg-white/10 border-white/15'
                      }`}
                    >
                      <motion.span
                        animate={{ x: isActive ? -22 : -2 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                        className="absolute right-0 h-[18px] w-[18px] rounded-full bg-white shadow-md"
                      />
                    </span>
                  </div>

                  <h3 className="font-display text-base font-bold text-white mb-2" dir="auto">
                    {mod.label}
                  </h3>

                  <AnimatePresence mode="wait" initial={false}>
                    <motion.p
                      key={isActive ? 'active' : 'risk'}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.25 }}
                      className={`text-sm leading-relaxed ${isActive ? 'text-zinc-400' : 'text-red-300/90'}`}
                    >
                      {isActive ? mod.activeDesc : mod.riskDesc}
                    </motion.p>
                  </AnimatePresence>
                </button>
              </TiltCard>
            );
          })}
        </div>

        <div className="text-center">
          <WebButton variant="primary" onClick={handleCta} className="!px-8">
            בקשו סקירת אבטחה מותאמת לעסק שלכם
          </WebButton>
        </div>
      </div>
    </section>
  );
}
