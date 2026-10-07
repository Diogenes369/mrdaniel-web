import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { ArrowLeft, Check, Compass, Cpu, PhoneCall } from 'lucide-react';
import GlyphButton from './ui/GlyphButton';
import { AI_AGENTS, type AiAgent, type AgentAudience } from '../data/aiAgents';
import { useModelCatalog, currentModel, type ModelCatalog } from '../services/modelCatalogService';
import { formatRelativeTime } from '../services/newsService';
import { useFieldQuiet } from './field/fieldState';

/**
 * Ready-made agents for sale. Lives on /ai since 2026-09-23 (it used to sit at the bottom of the
 * guides page, where nobody shopping for an agent looks).
 *
 * In the glyph world since 2026-10-07: each agent is a spec sheet in a dotted frame (the /jarvis
 * install sheets' language) instead of a tilting glass card with boxes nested inside it. The
 * filters are the model board's square chips, the "help me choose" wizard sits on the same line,
 * and one list serves both layouts: a native swipe rail on phones, a grid from md (the old version
 * rendered every card twice, once per layout, so each agent's search target existed twice).
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

const SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } as const;

// ---------------------------------------------------------------------------
// Agent sheet
// ---------------------------------------------------------------------------

function AgentSheet({ agent, catalog }: { agent: AiAgent; catalog: ModelCatalog | undefined }) {
  return (
    <article className="glyph-frame agent-sheet" data-search-target={agent.id} data-track-interest={`ai-agent:${agent.id}`}>
      <header className="agent-sheet__head">
        <span className="frame-cell__icon" aria-hidden="true">
          <agent.icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="agent-sheet__meta">
            <span>{agent.tierLabel}</span>
            {agent.badge && <span className="agent-sheet__badge">{agent.badge}</span>}
          </p>
          <h3 className="agent-sheet__title">{agent.name}</h3>
        </div>
      </header>

      <p className="agent-sheet__tagline">{agent.tagline}</p>
      <p className="agent-sheet__gain">
        <Check size={16} aria-hidden="true" />
        <span>{agent.benefit}</span>
      </p>

      <dl className="agent-sheet__rows">
        <div className="agent-sheet__row">
          <dt>המודלים</dt>
          <dd>
            {/* Which model does what — names resolved live from the catalog. */}
            {agent.models.map((m) => (
              <span key={`${m.vendor}-${m.role}`} className="agent-sheet__model">
                <bdi dir="ltr">{currentModel(catalog, m.vendor)}</bdi> · {m.role}
              </span>
            ))}
          </dd>
        </div>
        <div className="agent-sheet__row">
          <dt>עובד עם</dt>
          <dd>{agent.integrations.join(' · ')}</dd>
        </div>
        <div className="agent-sheet__row">
          <dt>מתאים ל</dt>
          <dd>{agent.useCase}</dd>
        </div>
      </dl>

      {/* Price on its own row so the actions never squeeze it on a narrow sheet. */}
      <footer className="agent-sheet__foot">
        <p className="agent-sheet__price">
          <b dir="ltr">₪{agent.price.toLocaleString('he-IL')}</b>
          <span>כולל התאמה לעסק שלכם והפעלה ראשונה</span>
        </p>
        {/* One primary per sheet; the question is a plain link under it, in words rather than a
            phone icon (it opens the same lead form, tagged as a question). */}
        <div className="agent-sheet__actions">
          <GlyphButton onClick={() => openAgentLead('order', agent)}>אני רוצה את הסוכן הזה</GlyphButton>
          <button
            type="button"
            onClick={() => openAgentLead('fit-check', agent)}
            aria-label={`יש לי שאלה על ${agent.name}`}
            className="story-link agent-sheet__ask"
          >
            יש לי שאלה קודם
          </button>
        </div>
      </footer>
    </article>
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
    <div className="glyph-frame agent-models" data-live="frame">
      <div className="agent-models__bar">
        <span className="agent-models__title">
          <Cpu className="h-4 w-4 text-brand-400" aria-hidden="true" />
          הסוכנים עובדים עם המודלים הכי חדשים
        </span>
        <span>{live ? `מתעדכן לבד · עודכן ${formatRelativeTime(new Date(catalog!.syncedAt).toISOString())}` : 'מתעדכן לבד'}</span>
      </div>
      <ul className="agent-models__list">
        {frontier.map((m) => (
          <li key={m.id}>
            <span className="agent-models__vendor">{m.vendor}</span>
            <bdi dir="ltr" className="agent-models__name">
              {m.name}
            </bdi>
          </li>
        ))}
      </ul>
      <p className="agent-models__note">כשיוצא מודל חדש, הרשימה מתעדכנת לבד, ולכל סוכן בוחרים את המודל שעושה את העבודה שלו הכי טוב.</p>
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
  const [active, setActive] = useState(0);
  const { data: catalog } = useModelCatalog();
  const quiet = useFieldQuiet();
  const railRef = useRef<HTMLUListElement>(null);

  const visibleAgents = useMemo(() => {
    let list = AI_AGENTS;
    if (filter === 'business' || filter === 'individual') list = list.filter((a) => a.audience.includes(filter));
    if (filter === 'price') list = [...list].sort((a, b) => a.price - b.price);
    return list;
  }, [filter]);

  // Phones: which sheet is in the middle of the rail. IntersectionObserver rather than scrollLeft,
  // whose sign and origin differ across browsers in RTL. From md the list is a grid and the ticks
  // are hidden, so the observer just idles.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || typeof IntersectionObserver === 'undefined') return;
    setActive(0);
    const items = [...rail.children] as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(items.indexOf(e.target as HTMLElement));
      },
      { root: rail, threshold: 0.6 }
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [visibleAgents]);

  const goTo = (i: number) =>
    (railRef.current?.children[i] as HTMLElement | undefined)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });

  return (
    <section id="ai-agents" aria-labelledby="ai-agents-title" className="relative">
      <div ref={quiet} className="max-w-3xl">
        <h2 id="ai-agents-title" className="story-h2">
          סוכנים <span className="text-brand-400">מוכנים לעבודה</span>
        </h2>
        <div className="mt-4 flex items-center gap-2" aria-hidden="true">
          <span className="story-statusbar__live" />
          <span className="h-px w-20 border-t border-dotted border-[var(--color-rule)]" />
        </div>
        <p className="story-body mt-5" data-live="rise">
          בחרו סוכן, ואני מתאים אותו לעסק שלכם ומחבר אותו לכלים שכבר יש לכם. מחיר ברור מראש, בלי הפתעות.
        </p>
      </div>

      <div className="agent-toolbar">
        <div role="group" aria-label="סינון הסוכנים" className="model-filter">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className="model-chip">
              {f.label}
            </button>
          ))}
        </div>
        <div className="agent-toolbar__help">
          <span>לא בטוחים איזה מתאים לכם</span>
          <GlyphButton
            variant="line"
            className="glyph-btn--compact"
            onClick={() => window.dispatchEvent(new CustomEvent('open-agent-qualifier'))}
          >
            <Compass className="h-4 w-4" aria-hidden="true" />
            עזרו לי לבחור
          </GlyphButton>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {`מוצגים ${visibleAgents.length} סוכנים`}
      </p>
      {/* Filtering re-flows the sheets on a spring (the model board's layout pass); reduced motion
          makes it an instant swap. */}
      <MotionConfig reducedMotion="user">
        <motion.ul ref={railRef} layout className="agent-grid">
          <AnimatePresence initial={false} mode="popLayout">
            {visibleAgents.map((agent) => (
              <motion.li
                key={agent.id}
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={SPRING}
              >
                <AgentSheet agent={agent} catalog={catalog} />
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      </MotionConfig>
      {visibleAgents.length > 1 && (
        <div className="agent-ticks" aria-label="מעבר בין הסוכנים">
          {visibleAgents.map((agent, i) => (
            <button
              key={agent.id}
              type="button"
              aria-label={`מעבר ל${agent.name}`}
              aria-current={i === active ? 'true' : undefined}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}

      <LiveModels catalog={catalog} />

      <div className="agent-close">
        <p>כל סוכן כולל שיחת היכרות, התאמה לעסק שלכם וליווי בהפעלה הראשונה.</p>
        <GlyphButton variant="line" onClick={() => openAgentLead('consult')}>
          <PhoneCall className="h-4 w-4" aria-hidden="true" />
          בואו נדבר
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </GlyphButton>
      </div>
    </section>
  );
}
