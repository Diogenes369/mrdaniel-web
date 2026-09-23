import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Rocket, ArrowLeft, PhoneCall, Cpu, CheckCircle2, RefreshCw } from 'lucide-react';
import WebButton from './WebButton';
import TiltCard from './TiltCard';
import { AI_AGENTS, type AiAgent, type AgentAudience } from '../data/aiAgents';
import { useModelCatalog, currentModel, type ModelCatalog } from '../services/modelCatalogService';
import { formatRelativeTime } from '../services/newsService';

/**
 * Ready-made agents for sale. Lives on /ai since 2026-09-23 (it used to sit at the bottom of the
 * guides page, where nobody shopping for an agent looks).
 *
 * The model names on every card come from the live catalog (ModelUpdateAgent), so "runs on the
 * newest models" stays true without anyone editing this file: each agent names a LAB and a job
 * (src/data/aiAgents.ts), and the card prints that lab's newest model.
 */

/** Three plain CTA phrasings, one per moment in the funnel. Passing `agent` attaches the product
 *  context (name/price/tier) to the lead modal. */
type CtaKind = 'fit-check' | 'consult' | 'order';
const CTA_SUBJECT: Record<CtaKind, (name: string) => string> = {
  'fit-check': (name) => `שאלה על: ${name}`,
  consult: (name) => `שיחת היכרות: ${name}`,
  order: (name) => `אני רוצה את: ${name}`,
};

function openAgentLead(kind: CtaKind, agent?: AiAgent) {
  window.dispatchEvent(
    new CustomEvent('open-lead-modal', {
      detail: {
        subject: agent ? CTA_SUBJECT[kind](agent.name) : 'שיחת היכרות על סוכן AI',
        sourceSection: 'AI Agents Store',
        product: agent ? { name: agent.name, price: agent.price, tierLabel: agent.tierLabel, category: 'ai-agent' } : undefined,
      },
    })
  );
}

// ---------------------------------------------------------------------------
// Live model strip — what "the newest models" means today, straight from the sync agent.
// ---------------------------------------------------------------------------

function LiveModels({ catalog }: { catalog: ModelCatalog | undefined }) {
  const frontier = catalog?.frontier ?? [];
  if (!frontier.length) return null;
  const live = catalog?.source === 'openrouter' || catalog?.source === 'snapshot';
  return (
    <div className="glass-panel glass-panel--info mx-auto mb-12 max-w-4xl rounded-2xl p-5 sm:p-6" dir="rtl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-lg font-extrabold text-white">
          <Cpu className="h-5 w-5 text-brand-400" aria-hidden="true" />
          הסוכנים עובדים עם המודלים הכי חדשים
        </h3>
        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
          <RefreshCw className="h-3.5 w-3.5 text-brand-400/80" aria-hidden="true" />
          {live ? `מתעדכן אוטומטית · עודכן ${formatRelativeTime(new Date(catalog!.syncedAt).toISOString())}` : 'מתעדכן אוטומטית'}
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {frontier.map((m) => (
          <li key={m.id} className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
            <span className="block text-[11px] font-bold text-zinc-500">{m.vendor}</span>
            <bdi dir="ltr" className="block font-display text-base font-extrabold text-white">
              {m.name}
            </bdi>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm leading-relaxed text-zinc-400">
        כשיוצא מודל חדש, הרשימה מתעדכנת לבד, ולכל סוכן בוחרים את המודל שעושה את העבודה שלו הכי טוב.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Qualification wizard trigger — the wizard itself is the global AgentQualificationModal
// (mounted once in App.tsx, opened via the `open-agent-qualifier` event).
// ---------------------------------------------------------------------------

function AgentWizardTrigger() {
  return (
    <div className="glass-panel glass-panel--info max-w-2xl mx-auto rounded-[1.75rem] p-6 sm:p-8 mb-14 text-center">
      <div className="flex items-center gap-2.5 mb-2 justify-center">
        <Sparkles className="w-5 h-5 text-brand-400" />
        <h3 className="font-display font-black text-2xl text-white">לא בטוחים איזה מתאים לכם</h3>
      </div>
      <p className="text-zinc-400 text-sm mb-6 max-w-xl mx-auto">
        ארבע שאלות קצרות, ותקבלו המלצה על הסוכן שמתאים לכם, עם אפשרות להמשיך איתי ישר בוואטסאפ.
      </p>
      <WebButton
        variant="primary"
        onClick={() => window.dispatchEvent(new CustomEvent('open-agent-qualifier'))}
        className="!px-8 mx-auto"
      >
        <Sparkles size={16} />
        עזרו לי לבחור
      </WebButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent card
// ---------------------------------------------------------------------------

function AgentCard({ agent, catalog }: { agent: AiAgent; catalog: ModelCatalog | undefined }) {
  return (
    <motion.div data-search-target={agent.id} data-track-interest={`ai-agent:${agent.id}`} className="group h-full">
      <TiltCard strength={5} className="h-full">
        <div className={`glass-panel glass-panel--marketing h-full flex flex-col rounded-2xl p-6 ${agent.glow}`}>
          <div className="flex items-start gap-4 mb-4">
            <div className={`w-14 h-14 shrink-0 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center ${agent.accent === 'text-black' ? 'text-brand-400' : agent.accent}`}>
              <agent.icon className="w-7 h-7" />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <span className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-[11px] font-bold text-brand-400">{agent.tierLabel}</span>
                {agent.badge && (
                  <span className="rounded-full border border-brand-500/40 bg-brand-500/10 px-2 py-0.5 text-[10px] font-bold text-brand-300">{agent.badge}</span>
                )}
              </span>
              <h3 className="font-display text-lg font-bold text-[#F1F5F9] leading-snug">{agent.name}</h3>
            </div>
          </div>

          <p className="text-zinc-300 text-sm leading-relaxed mb-4">{agent.tagline}</p>

          <div className="flex items-start gap-2 text-sm text-zinc-200 bg-brand-500/5 border border-brand-500/20 rounded-xl px-3 py-2.5 mb-4">
            <CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
            <span>{agent.benefit}</span>
          </div>

          {/* Which model does what — names resolved live from the catalog. */}
          <ul className="mb-4 space-y-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-zinc-400">
            {agent.models.map((m) => (
              <li key={`${m.vendor}-${m.role}`} className="flex items-start gap-2">
                <Cpu className="w-3.5 h-3.5 text-brand-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <bdi dir="ltr" className="font-bold text-zinc-200">{currentModel(catalog, m.vendor)}</bdi> · {m.role}
                </span>
              </li>
            ))}
          </ul>

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

          {/* Price on its own row so the CTA can wrap instead of clipping on narrow cards. */}
          <div className="pt-4 border-t border-white/10 space-y-3">
            <div>
              <span className="text-2xl font-black text-brand-400">₪{agent.price.toLocaleString('he-IL')}</span>
              <span className="block text-[11px] text-zinc-500 font-normal mt-0.5">כולל התאמה לעסק שלכם והפעלה ראשונה</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openAgentLead('fit-check', agent)}
                title="יש לי שאלה"
                aria-label="יש לי שאלה על הסוכן הזה"
                className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full border border-white/15 text-zinc-300 hover:text-brand-400 hover:border-brand-400/50 transition-colors"
              >
                <PhoneCall className="w-4 h-4" />
              </button>
              <WebButton variant="primary" onClick={() => openAgentLead('order', agent)} className="flex-1 justify-center !px-4 !text-sm">
                <Rocket size={16} className="shrink-0" />
                אני רוצה את הסוכן הזה
              </WebButton>
            </div>
          </div>
        </div>
      </TiltCard>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Mobile carousel — horizontal snap track with dot indicators below `md`. Active-dot tracking uses
// IntersectionObserver rather than `scrollLeft`, whose sign/origin differ across browsers in RTL.
// ---------------------------------------------------------------------------

function AgentCarousel({ agents, catalog }: { agents: AiAgent[]; catalog: ModelCatalog | undefined }) {
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
      <div
        ref={trackRef}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-none -mx-4 px-4 pb-2 [touch-action:pan-x_pan-y] [-webkit-overflow-scrolling:touch] [overscroll-behavior-x:contain]"
      >
        {agents.map((agent, idx) => (
          <div
            key={agent.id}
            ref={(el) => {
              cardRefs.current[idx] = el;
            }}
            className="snap-center shrink-0 w-[86%] sm:w-[70%]"
          >
            <AgentCard agent={agent} catalog={catalog} />
          </div>
        ))}
      </div>
      {agents.length > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5" role="tablist" aria-label="מעבר בין הסוכנים">
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
  { id: 'individual', label: 'לעצמאים' },
  { id: 'price', label: 'מהזול ליקר' },
];

export default function AiAgentsSection() {
  const [filter, setFilter] = useState<FilterId>('all');
  const { data: catalog } = useModelCatalog();

  const visibleAgents = useMemo(() => {
    let list = AI_AGENTS;
    if (filter === 'business' || filter === 'individual') list = list.filter((a) => a.audience.includes(filter));
    if (filter === 'price') list = [...list].sort((a, b) => a.price - b.price);
    return list;
  }, [filter]);

  return (
    <section id="ai-agents" className="py-16 md:py-24 relative overflow-x-clip">
      <div className="relative z-10">
        <div className="text-center mb-10 max-w-3xl mx-auto">
          <h2 className="font-display text-fluid-h2 font-black text-white mb-6">
            סוכנים <span className="text-brand-500">מוכנים לעבודה</span>
          </h2>
          <p className="font-sans text-fluid-body text-zinc-300 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">
            בחרו סוכן, ואני מתאים אותו לעסק שלכם ומחבר אותו לכלים שכבר יש לכם. מחיר ברור מראש, בלי הפתעות.
          </p>
        </div>

        <LiveModels catalog={catalog} />
        <AgentWizardTrigger />

        <div className="flex items-center justify-center gap-3 flex-wrap mb-10">
          {FILTERS.map((f) => {
            const isActive = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={isActive}
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
            <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 gap-6 md:gap-7 max-w-[1600px] mx-auto">
              {visibleAgents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} catalog={catalog} />
              ))}
            </div>
            <AgentCarousel agents={visibleAgents} catalog={catalog} />
          </motion.div>
        </AnimatePresence>

        <div className="text-center mt-14">
          <p className="text-zinc-400 text-sm mb-5">כל סוכן כולל שיחת היכרות, התאמה לעסק שלכם וליווי בהפעלה הראשונה.</p>
          <WebButton variant="primary" onClick={() => openAgentLead('consult')} className="!px-8">
            <PhoneCall size={16} />
            בואו נדבר
            <ArrowLeft className="w-4 h-4" />
          </WebButton>
        </div>
      </div>
    </section>
  );
}
