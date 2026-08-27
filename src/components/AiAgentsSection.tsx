import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Rocket, Gauge, ArrowLeft, PhoneCall, Cpu, TrendingUp } from 'lucide-react';
import WebButton from './WebButton';
import TiltCard from './TiltCard';
import { AI_AGENTS, type AiAgent, type AgentAudience } from '../data/aiAgents';

/** Three distinct consultative CTA phrasings used across this section's touchpoints — deliberately
 * not one generic "order now" verb, so each moment in the funnel reads as its own purposeful ask:
 * a quick fit-check, a scoping consultation, or committing to an architecture engagement. Passing
 * `agent` attaches full product context (name/price/tier) to the modal, which renders a dynamic
 * "אפיון וחיבור: {name} - ₪{price}" header and carries the same context through to the lead payload. */
type CtaKind = 'fit-check' | 'consult' | 'order';
const CTA_SUBJECT: Record<CtaKind, (name: string) => string> = {
  'fit-check': (name) => `בדיקת התאמה לארגון: ${name}`,
  consult: (name) => `תיאום אפיון טכנולוגי: ${name}`,
  order: (name) => `הזמנת אפיון ארכיטקטורה: ${name}`,
};

function openAgentLead(kind: CtaKind, agent?: AiAgent) {
  window.dispatchEvent(
    new CustomEvent('open-lead-modal', {
      detail: {
        subject: agent ? CTA_SUBJECT[kind](agent.name) : 'תיאום אפיון טכנולוגי — סוכני AI מותאמים',
        sourceSection: 'AI Agents Store',
        product: agent ? { name: agent.name, price: agent.price, tierLabel: agent.tierLabel, category: 'ai-agent' } : undefined,
      },
    })
  );
}

// ---------------------------------------------------------------------------
// Qualification wizard trigger — the actual multi-step wizard now lives in the global
// AgentQualificationModal (mounted once in App.tsx, opened via the `open-agent-qualifier` event),
// so it's reachable from the header CTA on every page, not just this section. This keeps exactly
// one qualification-flow implementation rather than two divergent ones.
// ---------------------------------------------------------------------------

function AgentWizardTrigger() {
  return (
    <div className="max-w-2xl mx-auto bg-carbon-900/60 border border-white/10 rounded-[1.75rem] p-6 md:p-9 mb-14 text-center">
      <div className="flex items-center gap-2.5 mb-2 justify-center">
        <Sparkles className="w-5 h-5 text-brand-400" />
        <h3 className="font-display font-black text-2xl text-white">שאלון התאמת סוכן AI</h3>
      </div>
      <p className="text-zinc-400 text-sm mb-6 max-w-xl mx-auto">
        ארבע שאלות קצרות על העסק, המערכות והתקציב שלכם — ומעבר ישיר לשיחה עם דניאל ב-WhatsApp עם ההתאמה המדויקת.
      </p>
      <WebButton
        variant="primary"
        onClick={() => window.dispatchEvent(new CustomEvent('open-agent-qualifier'))}
        className="!px-8 mx-auto"
      >
        <Sparkles size={16} />
        פתיחת שאלון ההתאמה
      </WebButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent card
// ---------------------------------------------------------------------------

function AgentCard({ agent }: { agent: AiAgent }) {
  return (
    <motion.div
      data-search-target={agent.id}
      data-track-interest={`ai-agent:${agent.id}`}
      className="group h-full"
    >
      <TiltCard strength={5} className="h-full">
        <div
          className={`relative h-full flex flex-col overflow-hidden bg-[#0D0E12] border border-white/10 rounded-2xl p-6 transition-all duration-500 hover:border-[#76B900]/50 hover:-translate-y-1.5 ${agent.glow}`}
        >
          {agent.badge && (
            <span className="absolute top-4 left-4 z-10 text-[10px] font-mono font-bold tracking-widest uppercase bg-brand-500 text-black px-2.5 py-1 rounded-full shadow-[0_0_12px_rgba(0,255,102,0.5)]">
              {agent.badge}
            </span>
          )}

          <div className="flex items-start gap-4 mb-4">
            <div className={`w-14 h-14 shrink-0 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center ${agent.accent === 'text-black' ? 'text-brand-400' : agent.accent}`}>
              <agent.icon className="w-7 h-7" />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <span className="block font-mono text-[10px] font-bold text-brand-400 uppercase tracking-widest mb-1">{agent.tierLabel}</span>
              <h3 className="font-display text-lg font-bold text-[#F1F5F9] leading-snug">{agent.name}</h3>
            </div>
          </div>

          <p className="text-zinc-400 text-sm leading-relaxed mb-4">{agent.tagline}</p>

          <div className="flex items-start gap-2 text-xs text-zinc-400 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 mb-3">
            <Cpu className="w-3.5 h-3.5 text-brand-400 shrink-0 mt-0.5" />
            <span dir="auto">{agent.modelFoundation}</span>
          </div>

          <div className="flex items-start gap-2 text-xs text-zinc-300 bg-brand-500/5 border border-brand-500/20 rounded-xl px-3 py-2.5 mb-4">
            <TrendingUp className="w-3.5 h-3.5 text-brand-400 shrink-0 mt-0.5" />
            <span>{agent.roiEstimate}</span>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {agent.integrations.map((i) => (
              <span key={i} className="text-[11px] text-zinc-400 bg-white/5 border border-white/10 rounded-full px-2.5 py-1">
                {i}
              </span>
            ))}
          </div>

          <p className="text-xs text-zinc-500 leading-relaxed mb-5 flex-grow">
            <span className="text-zinc-400 font-bold">מתאים ל: </span>
            {agent.useCase}
          </p>

          {/* Price gets its own full-width row — cramming it alongside both buttons in one row is
              what was clipping the CTA button against the card's `overflow-hidden` edge on
              narrower cards. The CTA below uses `flex-1` (not a fixed/nowrap width) so its label
              can wrap onto a second line instead of overflowing when space is tight. */}
          <div className="pt-4 border-t border-white/10 space-y-3">
            <div>
              <span className="text-2xl font-black text-brand-400">₪{agent.price.toLocaleString('he-IL')}</span>
              <span className="block text-[11px] text-zinc-500 font-normal mt-0.5">התאמה ראשונית כלולה</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openAgentLead('fit-check', agent)}
                title="בדיקת התאמה לארגון"
                aria-label="בדיקת התאמה לארגון"
                className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full border border-white/15 text-zinc-300 hover:text-brand-400 hover:border-brand-400/50 transition-colors"
              >
                <PhoneCall className="w-4 h-4" />
              </button>
              <WebButton variant="primary" onClick={() => openAgentLead('order', agent)} className="flex-1 justify-center !px-4 !text-sm">
                <Rocket size={16} className="shrink-0" />
                הזמנת אפיון ארכיטקטורה
              </WebButton>
            </div>
          </div>
        </div>
      </TiltCard>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Mobile carousel — a horizontal snap-scroll track with dot indicators, shown only below `md`
// (the desktop multi-column grid renders separately, see AiAgentsSection). Active-dot tracking
// uses IntersectionObserver rather than reading `scrollLeft` directly — `scrollLeft`'s sign/origin
// conventions differ across browsers in RTL contexts, while intersection ratios are purely
// viewport-relative and unaffected by scroll direction.
// ---------------------------------------------------------------------------

function AgentCarousel({ agents }: { agents: AiAgent[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    setActiveIndex(0);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const idx = cardRefs.current.indexOf(entry.target as HTMLDivElement);
          if (idx !== -1) setActiveIndex(idx);
        });
      },
      { root: track, threshold: 0.6 }
    );
    cardRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [agents]);

  const scrollToIndex = (idx: number) => {
    cardRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  return (
    <div className="md:hidden">
      <div ref={trackRef} className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-none momentum-scroll -mx-4 px-4 pb-2">
        {agents.map((agent, idx) => (
          <div
            key={agent.id}
            ref={(el) => {
              cardRefs.current[idx] = el;
            }}
            className="snap-center shrink-0 w-[86%] sm:w-[70%]"
          >
            <AgentCard agent={agent} />
          </div>
        ))}
      </div>
      {agents.length > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5" role="tablist" aria-label="ניווט בין סוכני AI">
          {agents.map((agent, idx) => (
            <button
              key={agent.id}
              type="button"
              role="tab"
              aria-selected={idx === activeIndex}
              aria-label={`מעבר ל${agent.name}`}
              onClick={() => scrollToIndex(idx)}
              className={`h-2 rounded-full transition-all cursor-pointer ${idx === activeIndex ? 'w-6 bg-brand-500' : 'w-2 bg-white/20 hover:bg-white/35'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

type FilterId = 'all' | AgentAudience | 'price';

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'הכל' },
  { id: 'business', label: 'לעסקים' },
  { id: 'individual', label: 'אישיים' },
  { id: 'price', label: 'לפי מחיר' },
];

export default function AiAgentsSection() {
  const [filter, setFilter] = useState<FilterId>('all');

  const visibleAgents = useMemo(() => {
    let list = AI_AGENTS;
    if (filter === 'business' || filter === 'individual') {
      list = list.filter((a) => a.audience.includes(filter));
    }
    if (filter === 'price') {
      list = [...list].sort((a, b) => a.price - b.price);
    }
    return list;
  }, [filter]);

  return (
    <section id="ai-agents" className="py-20 md:py-32 border-t border-white/5 relative overflow-hidden cv-auto">
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="text-center mb-10 max-w-3xl mx-auto">
          <motion.h2
            className="font-display text-fluid-h2 font-black text-white mb-6"
          >
            סוכני <span className="text-brand-500">AI מותאמים אישית</span>
          </motion.h2>
          <motion.p
            className="font-sans text-fluid-body text-zinc-300 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]"
          >
            לא עוד "צ׳אטבוט" — סוכן AI אוטונומי אמיתי, בנוי על ארכיטקטורת רב-מודלים (Claude, Gemini, GPT), שמתחבר ישירות ל-WhatsApp, ה-CRM והמערכות שלכם ועובד עבורכם 24/7. כל סוכן נבנה ומותאם אישית לתהליך העסקי הספציפי שלכם — עם החזר השקעה (ROI) ברור וזמן הטמעה קצר, לא פרויקט חצי שנתי.
          </motion.p>
        </div>

        <AgentWizardTrigger />

        <div className="flex items-center justify-center gap-3 flex-wrap mb-10">
          {FILTERS.map((f) => {
            const isActive = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`px-5 py-2.5 rounded-full border text-sm font-bold transition-colors min-h-11 cursor-pointer ${
                  isActive ? 'bg-brand-500 border-brand-500 text-black' : 'bg-carbon-900/60 border-white/10 text-zinc-300 hover:border-brand-500/40'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={filter} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }}>
            {/* Desktop / tablet: responsive multi-column grid. */}
            <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 gap-6 md:gap-7 max-w-6xl mx-auto">
              {visibleAgents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>

            {/* Mobile: horizontal snap-carousel with dot indicators, instead of one long stacked
                scroll — see AgentCarousel above. */}
            <AgentCarousel agents={visibleAgents} />
          </motion.div>
        </AnimatePresence>

        <div className="text-center mt-14">
          <div className="flex items-center justify-center gap-2 text-zinc-400 text-sm mb-5">
            <Gauge className="w-4 h-4 text-brand-400" />
            כל סוכן כולל שיחת אפיון, תוכנית אינטגרציה מותאמת ותמיכה בהטמעה הראשונית
          </div>
          <WebButton variant="primary" onClick={() => openAgentLead('consult')} className="!px-8">
            <PhoneCall size={16} />
            תיאום אפיון טכנולוגי
            <ArrowLeft className="w-4 h-4" />
          </WebButton>
        </div>
      </div>
    </section>
  );
}
