import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Check,
  User,
  Building2,
  Rocket,
  Landmark,
  Ban,
  Network,
  MessagesSquare,
  Server,
  Wallet,
  Target,
  Headset,
  Share2,
  BrainCog,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react';
import WebButton from './WebButton';
import ModalHeaderBanner from './ModalHeaderBanner';
import { buildWhatsAppUrl } from './SocialLinks';
import { AI_AGENTS, GOAL_LABEL, type AiAgent, type AgentGoal, type AgentAudience } from '../data/aiAgents';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { loadTracker } from '../lib/loadTracker';

type BusinessType = 'solo' | 'smb' | 'startup' | 'enterprise';
const BUSINESS_TYPE_OPTIONS: { id: BusinessType; label: string; icon: LucideIcon; audience: AgentAudience }[] = [
  { id: 'solo', label: 'עצמאי / פרילנסר', icon: User, audience: 'individual' },
  { id: 'smb', label: 'עסק קטן-בינוני', icon: Building2, audience: 'business' },
  { id: 'startup', label: 'סטארטאפ / חברת טכנולוגיה', icon: Rocket, audience: 'business' },
  { id: 'enterprise', label: 'ארגון / חברה גדולה', icon: Landmark, audience: 'business' },
];

type TechStack = 'none' | 'manual' | 'crm' | 'custom';
const TECH_STACK_OPTIONS: { id: TechStack; label: string; icon: LucideIcon }[] = [
  { id: 'none', label: 'אין עדיין מערכת מסודרת', icon: Ban },
  { id: 'manual', label: 'ניהול ידני ב-WhatsApp / מייל', icon: MessagesSquare },
  { id: 'crm', label: 'CRM קיים (HubSpot / Salesforce / Priority)', icon: Network },
  { id: 'custom', label: 'מערכת פנימית מותאמת אישית', icon: Server },
];

type BudgetTier = 'starter' | 'growth' | 'enterprise' | 'unsure';
const BUDGET_OPTIONS: { id: BudgetTier; label: string; hint: string; target: number }[] = [
  { id: 'starter', label: 'עד ₪7,000', hint: 'נקודת כניסה', target: 5500 },
  { id: 'growth', label: '₪7,000–12,000', hint: 'צמיחה', target: 9500 },
  { id: 'enterprise', label: '₪12,000+', hint: 'ארגוני', target: 16000 },
  { id: 'unsure', label: 'עדיין לא ברור', hint: 'נשמח לעזור להעריך', target: 9000 },
];

const GOAL_OPTIONS: { id: AgentGoal; label: string; icon: LucideIcon }[] = [
  { id: 'lead-gen', label: GOAL_LABEL['lead-gen'], icon: Target },
  { id: 'support', label: GOAL_LABEL.support, icon: Headset },
  { id: 'social', label: GOAL_LABEL.social, icon: Share2 },
  { id: 'knowledge', label: GOAL_LABEL.knowledge, icon: BrainCog },
];

/** Same defensive fallback chain used across this codebase's other matchers (never dead-ends),
 * then picks the agent whose price sits closest to the stated budget tier's target — a closer fit
 * to "what can I actually spend" than a flat cheapest/most-expensive pick. */
function recommendAgent(goal: AgentGoal, audience: AgentAudience, budget: BudgetTier): AiAgent {
  const byGoalAndAudience = AI_AGENTS.filter((a) => a.goals.includes(goal) && a.audience.includes(audience));
  const byGoal = AI_AGENTS.filter((a) => a.goals.includes(goal));
  const byAudience = AI_AGENTS.filter((a) => a.audience.includes(audience));
  const pool = byGoalAndAudience.length > 0 ? byGoalAndAudience : byGoal.length > 0 ? byGoal : byAudience.length > 0 ? byAudience : AI_AGENTS;

  const target = BUDGET_OPTIONS.find((b) => b.id === budget)?.target ?? 9000;
  return [...pool].sort((a, b) => Math.abs(a.price - target) - Math.abs(b.price - target))[0];
}

function buildWhatsAppMessage(opts: {
  businessType: BusinessType;
  techStack: TechStack;
  budget: BudgetTier;
  goal: AgentGoal;
  agent: AiAgent;
}): string {
  const businessLabel = BUSINESS_TYPE_OPTIONS.find((o) => o.id === opts.businessType)?.label ?? '';
  const techLabel = TECH_STACK_OPTIONS.find((o) => o.id === opts.techStack)?.label ?? '';
  const budgetLabel = BUDGET_OPTIONS.find((o) => o.id === opts.budget)?.label ?? '';
  const goalLabel = GOAL_LABEL[opts.goal];

  return [
    'שלום דניאל! עברתי עכשיו את שאלון ההתאמה האישית באתר וקיבלתי המלצה על סוכן AI.',
    '',
    `סוג העסק: ${businessLabel}`,
    `איך זה מתנהל היום: ${techLabel}`,
    `תקציב משוער: ${budgetLabel}`,
    `המטרה העיקרית: ${goalLabel}`,
    '',
    `הסוכן המומלץ: ${opts.agent.name} (${opts.agent.tierLabel}, ₪${opts.agent.price.toLocaleString('he-IL')})`,
    '',
    'אשמח להמשיך משם ולתאם שיחת אפיון קצרה.',
  ].join('\n');
}

function OptionGrid<T extends string>({
  options,
  value,
  onSelect,
  columns = 2,
}: {
  options: { id: T; label: string; icon?: LucideIcon; hint?: string }[];
  value: T | '';
  onSelect: (id: T) => void;
  columns?: 1 | 2;
}) {
  return (
    <div className={`grid gap-3 ${columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
      {options.map((opt) => (
        <motion.button
          key={opt.id}
          type="button"
          onClick={() => onSelect(opt.id)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          className={`flex items-center gap-3 p-4 rounded-2xl border text-right transition-colors min-h-11 cursor-pointer ${
            value === opt.id
              ? 'border-brand-400/60 bg-brand-500/10 shadow-[0_0_20px_rgba(0,255,102,0.15)]'
              : 'border-white/10 bg-white/[0.02] hover:border-white/25'
          }`}
        >
          {opt.icon && (
            <span className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center transition-colors ${value === opt.id ? 'bg-brand-400/20 text-brand-300' : 'bg-white/5 text-zinc-400'}`}>
              <opt.icon size={17} />
            </span>
          )}
          <span className="min-w-0">
            <span className="block text-sm font-bold text-zinc-200">{opt.label}</span>
            {opt.hint && <span className="block text-[11px] text-zinc-500 mt-0.5">{opt.hint}</span>}
          </span>
        </motion.button>
      ))}
    </div>
  );
}

/** Numbered circular stepper with a fill-as-you-go connecting line — deliberately different from
 * the plain progress bars every other modal on the site uses (LeadForm.tsx), so this flow reads as
 * its own distinct thing rather than "one more lead form." */
function Stepper({ labels, step }: { labels: string[]; step: number }) {
  const progressPct = (step / (labels.length - 1)) * 100;
  return (
    <div className="relative mt-6 px-2">
      <div className="absolute top-3.5 inset-x-6 h-0.5 bg-white/10 rounded-full" aria-hidden="true" />
      <motion.div
        className="absolute top-3.5 right-6 h-0.5 bg-brand-500 rounded-full shadow-[0_0_8px_rgba(0,255,102,0.6)]"
        initial={false}
        animate={{ width: `calc(${progressPct}% - ${(progressPct / 100) * 3}rem)` }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        aria-hidden="true"
      />
      <div className="relative flex justify-between">
        {labels.map((label, idx) => (
          <div key={label} className="flex flex-col items-center gap-1.5 w-16">
            <motion.div
              animate={{ scale: idx === step ? 1.15 : 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              className={`w-7 h-7 rounded-full border flex items-center justify-center text-[11px] font-bold shrink-0 transition-colors ${
                idx < step
                  ? 'bg-brand-500 border-brand-500 text-black'
                  : idx === step
                    ? 'bg-brand-500/20 border-brand-400 text-brand-300 shadow-[0_0_10px_rgba(0,255,102,0.5)]'
                    : 'bg-white/5 border-white/15 text-zinc-500'
              }`}
            >
              {idx < step ? <Check size={13} strokeWidth={3} /> : idx + 1}
            </motion.div>
            <span className={`text-[10px] text-center leading-tight ${idx <= step ? 'text-zinc-300' : 'text-zinc-600'}`}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const QUESTION_LABELS = ['העסק שלכם', 'איך זה היום', 'התקציב', 'המטרה'];

export default function AgentQualificationModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [businessType, setBusinessType] = useState<BusinessType | ''>('');
  const [techStack, setTechStack] = useState<TechStack | ''>('');
  const [budget, setBudget] = useState<BudgetTier | ''>('');
  const [goal, setGoal] = useState<AgentGoal | ''>('');

  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('open-agent-qualifier', handleOpen);
    return () => window.removeEventListener('open-agent-qualifier', handleOpen);
  }, []);

  // Shared, reference-counted — see useBodyScrollLock for why a local
  // save/restore of body.style.overflow permanently locked the page when overlays
  // overlapped.
  useBodyScrollLock(isOpen);

  const result = useMemo(() => {
    if (!businessType || !techStack || !budget || !goal) return null;
    const audience = BUSINESS_TYPE_OPTIONS.find((o) => o.id === businessType)!.audience;
    return recommendAgent(goal, audience, budget);
  }, [businessType, techStack, budget, goal]);

  // Records the completed qualification in the dashboard's `leads` list as soon as a result is
  // reached. It goes through `/api/leads` because `leads` is being closed to browsers, but as its own
  // action: this flow never collects a name or email, so there is no owner email and no welcome
  // email to send. The WhatsApp handoff below is the actual contact channel. This record only
  // keeps the qualification visible to the business owner, so it stays fire-and-forget.
  useEffect(() => {
    if (!result || !businessType || !techStack || !budget || !goal) return;
    const businessLabel = BUSINESS_TYPE_OPTIONS.find((o) => o.id === businessType)?.label;
    const techLabel = TECH_STACK_OPTIONS.find((o) => o.id === techStack)?.label;
    const budgetLabel = BUDGET_OPTIONS.find((o) => o.id === budget)?.label;
    fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'qualification',
        selectedProduct: result.name,
        price: result.price,
        userCompanySize: businessLabel,
        notes: `מערכות קיימות: ${techLabel}\nתקציב: ${budgetLabel}\nמטרה: ${GOAL_LABEL[goal]}`,
      }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const close = () => {
    setIsOpen(false);
    window.setTimeout(reset, 400);
  };

  function reset() {
    setStep(0);
    setBusinessType('');
    setTechStack('');
    setBudget('');
    setGoal('');
  }

  const canProceed =
    step === 0 ? businessType !== '' : step === 1 ? techStack !== '' : step === 2 ? budget !== '' : goal !== '';

  const whatsappHref =
    result && businessType && techStack && budget && goal
      ? buildWhatsAppUrl(buildWhatsAppMessage({ businessType, techStack, budget, goal, agent: result }))
      : buildWhatsAppUrl();

  // NOTE: deliberately NOT wrapped in <AnimatePresence>. This modal has a nested
  // <AnimatePresence mode="wait"> for its step transitions, and `close()` resets `step` — the
  // combination used to deadlock an outer exit animation, leaving a stuck, invisible,
  // pointer-events:auto full-screen overlay after close (page unclickable on mobile). Plain
  // conditional render = the whole overlay unmounts instantly and reliably on close.
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-center items-end md:items-center px-4 md:px-0 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-0">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        onClick={close}
        className="absolute inset-0 bg-black/90"
      />

      {/* Signature breathing glow around the card — a plain div with a CSS `animate-pulse`. */}
      <div className="relative w-full max-w-lg">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1 rounded-[2rem] bg-brand-500/20 blur-2xl animate-pulse"
        />

        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', damping: 26, stiffness: 220 }}
          className="relative w-full max-h-[85dvh] md:max-h-[90dvh] flex flex-col bg-[#0b0c10] border border-brand-500/30 shadow-[0_30px_80px_rgba(0,0,0,0.9)] rounded-3xl overflow-hidden"
        >
              <div className="relative bg-[#0D0E12] border-b border-white/10">
                <ModalHeaderBanner pulse />

                <button
                  onClick={close}
                  className="absolute top-4 left-4 w-11 h-11 flex items-center justify-center bg-black/40 backdrop-blur-sm text-zinc-300 hover:text-white rounded-full hover:bg-black/60 transition-colors"
                  aria-label="סגירה"
                >
                  <X size={18} />
                </button>

                <div className="relative -mt-7 md:-mt-8 px-6 md:px-8 pb-4">
                  <div className="flex items-center gap-2.5 mb-1 pl-14">
                    <span className="w-2 h-2 rounded-full bg-brand-400 shadow-[0_0_8px_rgba(0,255,102,0.8)] shrink-0" aria-hidden="true" />
                    <h3 className="font-display font-black text-xl md:text-2xl text-white">
                      בואו נמצא לכם <span className="text-brand-500">את הסוכן המושלם</span>
                    </h3>
                  </div>
                  <p className="text-sm text-zinc-500 mt-1">כמה שאלות קצרות — ותוך פחות מדקה תדעו בדיוק מה הכי מתאים לכם, עם מעבר ישיר לשיחה עם דניאל ב-WhatsApp.</p>

                  {!result && <Stepper labels={QUESTION_LABELS} step={step} />}
                </div>
              </div>

              <div className="p-6 pb-10 md:p-8 overflow-y-auto flex-1 momentum-scroll">
                <AnimatePresence mode="wait">
                  {!result ? (
                    <motion.div key={`step-${step}`} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.25 }}>
                      {step === 0 && (
                        <>
                          <p className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4">ספרו לי קצת על העסק שלכם</p>
                          <OptionGrid options={BUSINESS_TYPE_OPTIONS} value={businessType} onSelect={setBusinessType} />
                        </>
                      )}
                      {step === 1 && (
                        <>
                          <p className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4">איך מתנהלים היום מול לקוחות ופניות?</p>
                          <OptionGrid options={TECH_STACK_OPTIONS} value={techStack} onSelect={setTechStack} />
                        </>
                      )}
                      {step === 2 && (
                        <>
                          <p className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4 flex items-center gap-1.5">
                            <Wallet size={14} />
                            כמה תקציב חודשי מרגיש נכון?
                          </p>
                          <OptionGrid options={BUDGET_OPTIONS} value={budget} onSelect={setBudget} />
                        </>
                      )}
                      {step === 3 && (
                        <>
                          <p className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4">במה הכי הייתם רוצים שהסוכן יעזור?</p>
                          <OptionGrid options={GOAL_OPTIONS} value={goal} onSelect={setGoal} />
                        </>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div key="result" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', damping: 22, stiffness: 220 }}>
                      <div className="text-center mb-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-brand-400 uppercase tracking-widest">
                          <Sparkles className="w-3.5 h-3.5" />
                          מצאנו את ההתאמה בשבילכם
                        </span>
                      </div>
                      <div className="bg-black/40 border border-brand-500/30 rounded-2xl p-6 text-center">
                        <result.icon className={`w-10 h-10 mx-auto mb-3 ${result.accent === 'text-black' ? 'text-brand-400' : result.accent}`} />
                        <h4 className="font-display text-xl md:text-2xl font-black text-white mb-2">{result.name}</h4>
                        <p className="text-zinc-400 text-sm leading-relaxed mb-4">{result.tagline}</p>
                        <div className="text-3xl font-black text-brand-400 mb-6">₪{result.price.toLocaleString('he-IL')}</div>

                        <a
                          href={whatsappHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => loadTracker().then((t) => t.trackConversion('Agent Qualification → WhatsApp'))}
                          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-brand-500 text-black font-bold text-sm hover:bg-brand-400 transition-colors shadow-[0_0_20px_rgba(0,255,102,0.25)]"
                        >
                          <MessageCircle size={17} />
                          בואו נדבר על זה ב-WhatsApp
                        </a>

                        <button
                          type="button"
                          onClick={reset}
                          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mx-auto mt-5 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          התחלה מחדש
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {!result && (
                <div className="p-6 md:p-8 pt-2 flex items-center justify-between gap-4 border-t border-white/10">
                  {step > 0 ? (
                    <button
                      onClick={() => setStep((s) => s - 1)}
                      className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors font-medium"
                    >
                      <ArrowRight size={16} />
                      חזרה
                    </button>
                  ) : (
                    <span />
                  )}
                  <WebButton variant="primary" disabled={!canProceed} onClick={() => setStep((s) => Math.min(3, s + 1))}>
                    הבא
                  </WebButton>
                </div>
              )}
        </motion.div>
      </div>
    </div>
  );
}
