import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Building2, User, Layout, LayoutGrid, ShoppingCart, Network, Check, Calculator, Send } from 'lucide-react';
import WebButton from '../WebButton';

type ClientType = 'business' | 'individual';
type ProjectType = 'landing' | 'webapp' | 'ecommerce' | 'web3';
type FeatureId = 'auth' | 'admin' | 'payments' | 'multilang' | 'security' | 'integration';

const CLIENT_TYPES: { id: ClientType; label: string; icon: typeof Building2; hint: string }[] = [
  { id: 'business', label: 'עסק / ארגון', icon: Building2, hint: 'פלטפורמה ברמה עסקית-ארגונית' },
  { id: 'individual', label: 'פרטי / עצמאי', icon: User, hint: 'פרויקט אישי או יזמות עצמאית' },
];

// Base illustrative ranges per project type (ILS) — the individual multiplier below reflects that
// a personal/freelance project is typically smaller in scope than the same category for a
// business, not a discount promise.
const PROJECT_TYPES: { id: ProjectType; label: string; icon: typeof Layout; base: [number, number] }[] = [
  { id: 'landing', label: 'אתר תדמית / Landing Page', icon: Layout, base: [2500, 4500] },
  { id: 'webapp', label: 'פלטפורמה / אפליקציית ווב', icon: LayoutGrid, base: [6000, 9500] },
  { id: 'ecommerce', label: 'חנות / מסחר אלקטרוני', icon: ShoppingCart, base: [7500, 11000] },
  { id: 'web3', label: 'Web3 / חוזה חכם', icon: Network, base: [9000, 13500] },
];

const INDIVIDUAL_MULTIPLIER = 0.85;

const FEATURES: { id: FeatureId; label: string; add: number }[] = [
  { id: 'auth', label: 'מערכת התחברות והרשאות משתמשים', add: 900 },
  { id: 'admin', label: 'לוח ניהול (Admin Dashboard)', add: 1400 },
  { id: 'payments', label: 'סליקת תשלומים מקוונת', add: 1200 },
  { id: 'multilang', label: 'ריבוי שפות (i18n)', add: 700 },
  { id: 'security', label: 'הקשחת אבטחה מוגברת', add: 1600 },
  { id: 'integration', label: 'אינטגרציה למערכת חיצונית / CRM', add: 1300 },
];

function roundTo100(n: number): number {
  return Math.round(n / 100) * 100;
}

function formatIls(n: number): string {
  return `₪${n.toLocaleString('he-IL')}`;
}

/**
 * Inline, no-backend estimator — replaces the previous static 3-tier price grid with a genuinely
 * interactive tool: the shown range only exists because of the visitor's own selections, which is
 * more honest than a blanket page-wide number. Result is explicitly framed as a rough estimate,
 * never a binding quote, matching the rest of the site's tone (see AgentQualificationModal's
 * BUDGET_OPTIONS for the same convention). The final CTA hands off to the existing
 * `open-lead-modal` flow (already wired site-wide, see LeadForm.tsx) with the computed range baked
 * into the subject line, so a real conversation still confirms the exact number.
 */
export default function ProjectEstimator() {
  const [clientType, setClientType] = useState<ClientType>('business');
  const [projectType, setProjectType] = useState<ProjectType>('webapp');
  const [features, setFeatures] = useState<Set<FeatureId>>(new Set());

  const toggleFeature = (id: FeatureId) => {
    setFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [min, max] = useMemo(() => {
    const project = PROJECT_TYPES.find((p) => p.id === projectType)!;
    const multiplier = clientType === 'individual' ? INDIVIDUAL_MULTIPLIER : 1;
    const featureAdd = FEATURES.filter((f) => features.has(f.id)).reduce((sum, f) => sum + f.add, 0);
    return [roundTo100(project.base[0] * multiplier + featureAdd), roundTo100(project.base[1] * multiplier + featureAdd)];
  }, [clientType, projectType, features]);

  const requestQuote = () => {
    const projectLabel = PROJECT_TYPES.find((p) => p.id === projectType)?.label ?? '';
    const clientLabel = CLIENT_TYPES.find((c) => c.id === clientType)?.label ?? '';
    window.dispatchEvent(
      new CustomEvent('open-lead-modal', {
        detail: {
          subject: `הצעת מחיר מדויקת — ${projectLabel} (${clientLabel}, הערכה ${formatIls(min)}–${formatIls(max)})`,
          sourceSection: 'Project Estimator',
        },
      })
    );
  };

  return (
    <div className="bg-carbon-900/60 border border-white/10 rounded-2xl p-6 md:p-8 mb-8">
      <div className="flex items-center gap-2.5 mb-6">
        <Calculator className="w-5 h-5 text-brand-400" />
        <h3 className="font-display font-bold text-xl text-white">מחשבון הערכת עלות פרויקט</h3>
      </div>

      <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">עבורכם:</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {CLIENT_TYPES.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setClientType(opt.id)}
            className={`flex items-center gap-3 p-4 rounded-xl border text-right transition-colors min-h-11 cursor-pointer ${
              clientType === opt.id ? 'border-brand-400/60 bg-brand-500/10' : 'border-white/10 bg-white/[0.02] hover:border-white/25'
            }`}
          >
            <span className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${clientType === opt.id ? 'bg-brand-400/20 text-brand-300' : 'bg-white/5 text-zinc-400'}`}>
              <opt.icon size={17} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-zinc-200">{opt.label}</span>
              <span className="block text-[11px] text-zinc-500 mt-0.5">{opt.hint}</span>
            </span>
          </button>
        ))}
      </div>

      <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">סוג הפרויקט:</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {PROJECT_TYPES.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setProjectType(opt.id)}
            className={`flex items-center gap-3 p-4 rounded-xl border text-right transition-colors min-h-11 cursor-pointer ${
              projectType === opt.id ? 'border-brand-400/60 bg-brand-500/10' : 'border-white/10 bg-white/[0.02] hover:border-white/25'
            }`}
          >
            <span className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${projectType === opt.id ? 'bg-brand-400/20 text-brand-300' : 'bg-white/5 text-zinc-400'}`}>
              <opt.icon size={17} />
            </span>
            <span className="text-sm font-bold text-zinc-200">{opt.label}</span>
          </button>
        ))}
      </div>

      <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">רכיבים נוספים (אופציונלי):</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-8">
        {FEATURES.map((f) => {
          const active = features.has(f.id);
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => toggleFeature(f.id)}
              className={`flex items-center gap-3 p-3.5 rounded-xl border text-right transition-colors min-h-11 cursor-pointer ${
                active ? 'border-brand-400/50 bg-brand-500/5' : 'border-white/10 bg-white/[0.02] hover:border-white/25'
              }`}
            >
              <span className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center transition-colors ${active ? 'bg-brand-500 border-brand-500 text-black' : 'border-white/20 text-transparent'}`}>
                <Check size={13} strokeWidth={3} />
              </span>
              <span className="text-sm text-zinc-300">{f.label}</span>
              <span className="mr-auto text-xs font-mono text-zinc-500 shrink-0" dir="ltr">
                +₪{f.add.toLocaleString('he-IL')}
              </span>
            </button>
          );
        })}
      </div>

      <motion.div
        key={`${min}-${max}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="bg-gradient-to-br from-brand-500/15 to-carbon-900 border border-brand-500/30 rounded-xl p-5 md:p-6 flex flex-col sm:flex-row items-center justify-between gap-4"
      >
        <div>
          <div className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest mb-1">טווח משוער</div>
          <div className="text-2xl md:text-3xl font-black text-brand-400" dir="ltr">
            {formatIls(min)}–{formatIls(max)}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1.5">הערכה ראשונית בלבד — המחיר הסופי נקבע בשיחת אפיון קצרה, בהתאם להיקף המדויק.</p>
        </div>
        <WebButton variant="primary" onClick={requestQuote} className="shrink-0 w-full sm:w-auto justify-center">
          <Send className="w-4 h-4" />
          קבלת הצעת מחיר מדויקת
        </WebButton>
      </motion.div>
    </div>
  );
}
