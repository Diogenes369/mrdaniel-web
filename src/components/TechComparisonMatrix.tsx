import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, X, ChevronDown } from 'lucide-react';
import WebButton from './WebButton';
import { useSectionDissolve } from '../hooks/useSectionDissolve';

interface ComparisonRow {
  label: string;
  legacy: string;
  daniel: string;
}

const CORE_ROWS: ComparisonRow[] = [
  {
    label: 'מנוע ה-AI',
    legacy: 'מודל שפה יחיד וגנרי, ללא ניתוב חכם',
    daniel: 'ניתוב רב-מודלי: Claude Opus 4.5 · Gemini 2.5 · GPT-5.2 לפי מורכבות המשימה',
  },
  {
    label: 'מקור הידע',
    legacy: 'תסריט שיחה קבוע מראש — FAQ סטטי שלא מתעדכן',
    daniel: 'Vector DB חי + RAG על תוכן עסקי אמיתי, עם ציטוט מקור לכל תשובה',
  },
  {
    label: 'אבטחת פרומפט',
    legacy: 'ללא הגנה — חשוף למניפולציה וחילוץ הוראות מערכת',
    daniel: 'הגנת Zero-Trust + Prompt Injection Protection על כל אינטראקציה',
  },
  {
    label: 'התאמה אישית',
    legacy: 'תסריט זהה, גנרי, לכל לקוח שנכנס לצ׳אט',
    daniel: 'מאומן על הטון, הידע והתהליכים הספציפיים של העסק שלכם',
  },
];

const DEEP_ROWS: ComparisonRow[] = [
  {
    label: 'זמינות ואינטגרציה',
    legacy: 'חלון צ׳אט באתר בלבד, לרוב ללא חיבור API אמיתי',
    daniel: 'WhatsApp Business API · CRM · Slack/Teams · REST/GraphQL',
  },
  {
    label: 'ממשל ובקרה',
    legacy: 'קופסה שחורה — אין נראות על ההחלטות שהתקבלו',
    daniel: 'Guardian Agents + Audit Trail מלא על כל פעולה ואישור',
  },
  {
    label: 'התנהגות במקרי קצה',
    legacy: 'נתקע או עונה תשובה שגויה בביטחון מלא',
    daniel: 'מזהה חוסר ודאות ומסלים לבן אדם בצורה מבוקרת',
  },
  {
    label: 'עלות תפעולית',
    legacy: 'מנוי חודשי קבוע, ללא קשר לניצול בפועל',
    daniel: 'Model Routing + Prompt Caching — תשלום לפי שימוש אמיתי',
  },
];

function ComparisonTableRow({ row, idx }: { row: ComparisonRow; idx: number }) {
  return (
    <div
      className={`grid grid-cols-[1fr_1fr_1fr] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1.4fr)] gap-3 md:gap-6 items-center px-4 md:px-6 py-5 transition-colors duration-300 hover:bg-white/[0.03] ${
        idx !== 0 ? 'border-t border-white/5' : ''
      }`}
    >
      <span className="font-display font-bold text-sm md:text-base text-white">{row.label}</span>
      <div className="flex items-start gap-2">
        <X className="w-4 h-4 text-red-400/70 shrink-0 mt-0.5" />
        <span className="text-xs md:text-sm text-zinc-500 leading-relaxed">{row.legacy}</span>
      </div>
      <div className="flex items-start gap-2">
        <Check className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
        <span className="text-xs md:text-sm text-zinc-200 leading-relaxed">{row.daniel}</span>
      </div>
    </div>
  );
}

type Side = 'legacy' | 'daniel';

export default function TechComparisonMatrix() {
  const [showDeep, setShowDeep] = useState(false);
  const [activeSide, setActiveSide] = useState<Side>('daniel');
  const sectionRef = useSectionDissolve<HTMLElement>();
  const mobileRows = showDeep ? [...CORE_ROWS, ...DEEP_ROWS] : CORE_ROWS;

  const handleCta = () => window.dispatchEvent(new CustomEvent('open-agent-qualifier'));

  return (
    <section id="tech-comparison" ref={sectionRef} data-field-form="rings" data-field-anchor="right" className="py-12 md:py-20 border-t border-white/5 relative overflow-hidden w-full">
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="text-center mb-12 md:mb-14 max-w-2xl mx-auto">
          <h2 className="font-display text-fluid-h2 font-black text-white mb-5">
            צ׳אטבוט גנרי <span className="text-zinc-600">מול</span> <span className="text-brand-500">ארכיטקטורה אוטונומית</span>
          </h2>
          <p className="text-fluid-body text-zinc-300 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">
            לא כל "סוכן AI" נבנה באותה צורה. כך נראה ההבדל בפועל בין תבנית מדף לבין מערכת שנבנתה סביב העסק שלכם.
          </p>
        </div>

        {/* Desktop: table with sticky-feel header row */}
        <div className="hidden md:block max-w-5xl mx-auto bg-[#0D0E12] border border-white/10 rounded-[1.75rem] overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1.4fr)] gap-6 px-6 py-4 bg-black/40 border-b border-white/10">
            <span className="text-xs font-mono font-bold text-zinc-500 uppercase tracking-widest">קריטריון</span>
            <span className="text-xs font-mono font-bold text-zinc-500 uppercase tracking-widest">צ׳אטבוט גנרי</span>
            <span className="text-xs font-mono font-bold text-brand-400 uppercase tracking-widest">הארכיטקטורה של דניאל</span>
          </div>

          {CORE_ROWS.map((row, idx) => (
            <ComparisonTableRow key={row.label} row={row} idx={idx} />
          ))}

          <AnimatePresence initial={false}>
            {showDeep && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                {DEEP_ROWS.map((row, idx) => (
                  <ComparisonTableRow key={row.label} row={row} idx={idx + 1} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={() => setShowDeep((v) => !v)}
            className="w-full flex items-center justify-center gap-2 py-4 border-t border-white/10 text-sm font-bold text-brand-400 hover:text-brand-300 hover:bg-white/[0.03] transition-colors cursor-pointer"
          >
            {showDeep ? 'הצג פחות' : 'הצג השוואה טכנית מלאה'}
            <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${showDeep ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Mobile: segmented control flips a single stable-height card in place — no swipe track,
            no per-row height variance, so nothing "jumps" when switching sides. */}
        <div className="md:hidden max-w-md mx-auto">
          <div className="relative flex items-center bg-black/40 border border-white/10 rounded-full p-1 mb-5">
            <button
              type="button"
              onClick={() => setActiveSide('legacy')}
              className={`relative flex-1 py-2.5 text-xs font-bold rounded-full transition-colors cursor-pointer ${
                activeSide === 'legacy' ? 'text-red-300' : 'text-zinc-500'
              }`}
            >
              {activeSide === 'legacy' && (
                <motion.span
                  layoutId="comparison-toggle-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-full border bg-gradient-to-r from-red-500/25 to-zinc-500/15 border-red-500/40 -z-10"
                />
              )}
              צ׳אטבוט גנרי
            </button>
            <button
              type="button"
              onClick={() => setActiveSide('daniel')}
              className={`relative flex-1 py-2.5 text-xs font-bold rounded-full transition-colors cursor-pointer ${
                activeSide === 'daniel' ? 'text-brand-300' : 'text-zinc-500'
              }`}
            >
              {activeSide === 'daniel' && (
                <motion.span
                  layoutId="comparison-toggle-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-full border bg-gradient-to-r from-brand-500/30 to-neon-cyan/25 border-brand-400/50 shadow-[0_0_18px_rgba(0,255,102,0.35)] -z-10"
                />
              )}
              הארכיטקטורה של דניאל
            </button>
          </div>

          <div
            className={`rounded-2xl border overflow-hidden transition-colors duration-300 ${
              activeSide === 'legacy' ? 'border-red-500/25 bg-red-500/[0.03]' : 'border-brand-500/30 bg-brand-500/[0.04]'
            }`}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSide}
                initial={{ opacity: 0, x: activeSide === 'legacy' ? -14 : 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: activeSide === 'legacy' ? 14 : -14 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                {mobileRows.map((row, idx) => (
                  <div key={row.label} className={`flex items-start gap-3 p-4 ${idx !== 0 ? 'border-t border-white/5' : ''}`}>
                    {activeSide === 'legacy' ? (
                      <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    ) : (
                      <Check className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <span className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wide mb-1">{row.label}</span>
                      <span className={`block text-sm leading-relaxed ${activeSide === 'legacy' ? 'text-zinc-500' : 'text-zinc-100'}`}>
                        {activeSide === 'legacy' ? row.legacy : row.daniel}
                      </span>
                    </div>
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>

          <button
            type="button"
            onClick={() => setShowDeep((v) => !v)}
            className="mt-3 w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-white/10 text-sm font-bold text-brand-400 cursor-pointer"
          >
            {showDeep ? 'הצג פחות' : 'הצג השוואה טכנית מלאה'}
            <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${showDeep ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className="text-center mt-12">
          <WebButton variant="primary" onClick={handleCta} className="!px-8">
            בדקו איך זה נראה עבור העסק שלכם
          </WebButton>
        </div>
      </div>
    </section>
  );
}
