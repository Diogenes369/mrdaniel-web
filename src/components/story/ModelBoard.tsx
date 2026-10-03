import { useMemo, useState, type ReactNode, type Ref } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { STORY_COPY } from '../../data/siteCopy';
import { formatRelativeTime } from '../../services/newsService';
import type { ModelCap, ModelCatalog, ModelEntry } from '../../services/modelCatalogService';
import { rtl } from '../../lib/rtl';

/** 2 × 3 on phones, 3 × 2 from `sm` — the same six cards fill both grids with no orphan row. */
const LIMIT = 6;
/** A release this recent gets the "חדש" badge. */
const NEW_DAYS = 14;
/**
 * Filter order: the tags that actually split the list first. Nearly every current frontier model
 * has a thinking mode, so "reasoning" goes last — it narrows little, and a chip that would keep
 * every card is hidden outright (see `capCounts`).
 */
const CAP_ORDER: ModelCap[] = ['code', 'fast', 'video', 'open', 'reasoning'];
const SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } as const;
const DAY = 86_400_000;

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));

function daysSince(isoDate: string, now: number): number {
  const t = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isNaN(t) ? Infinity : Math.max(0, Math.floor((now - t) / DAY));
}

function releaseLabel(isoDate: string, now: number): string {
  const c = STORY_COPY.noise;
  const days = daysSince(isoDate, now);
  if (!Number.isFinite(days)) return '';
  if (days === 0) return c.releasedToday;
  if (days === 1) return c.releasedYesterday;
  if (days <= 45) return fill(c.releasedDaysAgo, { n: days });
  const month = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${isoDate}T00:00:00Z`));
  return fill(c.releasedIn, { month });
}

/** 1050000 → "1M", 262144 → "262K". Floors, so a card never rounds a window up. */
function contextLabel(n: number | undefined): string {
  if (!n || n < 1000) return '';
  if (n >= 1_000_000) return `${Math.floor(n / 100_000) / 10}M`;
  return `${Math.round(n / 1000)}K`;
}

/**
 * "המודלים העדכניים" — every model the catalog tracks (up to three per lab, ten labs), newest first,
 * filterable by lab and by what the model is good at. Nothing here is written by hand: names, dates,
 * context windows and tags all come from OpenRouter's index via ModelUpdateAgent, so the board
 * re-curates itself the day a lab ships.
 *
 * Interaction is a filter, not a ticker: a learner comparing "which one writes code" needs the list
 * to hold still. Filtering animates with a spring layout pass (cards slide into their new cells);
 * `MotionConfig reducedMotion="user"` turns that into an instant swap for anyone who asked.
 */
export default function ModelBoard({ catalog }: { catalog: ModelCatalog | undefined }) {
  const c = STORY_COPY.noise;
  const [lab, setLab] = useState<string>('all');
  const [capChoice, setCapChoice] = useState<ModelCap | 'all'>('all');
  const [expanded, setExpanded] = useState(false);
  // Captured once per mount: release badges must not flip mid-session on a re-render.
  const [now] = useState(() => Date.now());

  const all = useMemo(() => {
    const list = catalog?.models?.length ? catalog.models : (catalog?.frontier ?? []);
    return [...list].sort((a, b) => b.releasedAt.localeCompare(a.releasedAt) || a.name.localeCompare(b.name));
  }, [catalog]);

  // Labs in the catalog's own order (the agent's VENDORS order), with totals.
  const labs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of catalog?.models ?? all) counts.set(m.vendor, (counts.get(m.vendor) ?? 0) + 1);
    return [...counts.entries()];
  }, [catalog, all]);

  const inLab = lab === 'all' ? all : all.filter((m) => m.vendor === lab);
  const capCounts = CAP_ORDER.map((k) => [k, inLab.filter((m) => m.caps?.includes(k)).length] as const).filter(
    ([, n]) => n < inLab.length,
  );
  // No row at all when no chip could narrow this lab (an old snapshot without caps, or a lab whose
  // models all share the same tags) — a row of disabled chips reads as broken.
  const capRow = capCounts.some(([, n]) => n > 0);
  // A cap the chosen lab has no model for falls back to "all" — derived, so no empty grid and no
  // effect that fires after the fact.
  const cap = capChoice !== 'all' && capCounts.some(([k, n]) => k === capChoice && n > 0) ? capChoice : 'all';
  const shown = cap === 'all' ? inLab : inLab.filter((m) => m.caps?.includes(cap));
  const visible = expanded ? shown : shown.slice(0, LIMIT);

  return (
    <MotionConfig reducedMotion="user">
      <div>
        <h3 className="story-h3">{rtl(c.modelsTitle)}</h3>

        <div role="group" aria-label={rtl(c.filterLabs)} className="model-filter mt-3">
          <FilterChip pressed={lab === 'all'} onClick={() => setLab('all')} label={rtl(c.allLabs)} count={all.length} />
          {labs.map(([vendor, n]) => (
            <FilterChip key={vendor} pressed={lab === vendor} onClick={() => setLab(vendor)} label={<bdi>{vendor}</bdi>} count={n} />
          ))}
        </div>

        {capRow && (
          <div role="group" aria-label={rtl(c.filterCaps)} className="model-filter mt-2">
            <FilterChip pressed={cap === 'all'} onClick={() => setCapChoice('all')} label={rtl(c.allCaps)} count={inLab.length} />
            {capCounts.map(([k, n]) => (
              <FilterChip key={k} pressed={cap === k} disabled={n === 0} onClick={() => setCapChoice(k)} label={rtl(c.caps[k])} count={n} />
            ))}
          </div>
        )}

        <p className="sr-only" aria-live="polite">
          {rtl(fill(c.shownStatus, { n: shown.length }))}
        </p>

        <motion.ul layout className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <AnimatePresence mode="popLayout" initial={false}>
            {visible.map((m) => (
              <ModelCard key={m.id} model={m} now={now} />
            ))}
          </AnimatePresence>
        </motion.ul>

        {shown.length > LIMIT && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="story-link mt-3 w-full justify-center border border-dotted border-[var(--color-rule)] py-3 text-[13px]"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
            {expanded ? rtl(c.collapse) : (
              <>
                {rtl(c.moreModels)}
                <span className="model-chip__count">{shown.length}</span>
              </>
            )}
          </button>
        )}

        <p className="mt-3 text-[12px] text-ink-faint">
          {rtl(c.modelsSource)}
          {catalog?.syncedAt && catalog.source !== 'seed' ? (
            <>
              <span aria-hidden="true"> · </span>
              {rtl(fill(c.modelsSynced, { when: formatRelativeTime(new Date(catalog.syncedAt).toISOString()) }))}
            </>
          ) : null}
        </p>
      </div>
    </MotionConfig>
  );
}

function FilterChip({
  pressed,
  onClick,
  label,
  count,
  disabled = false,
}: {
  pressed: boolean;
  onClick: () => void;
  label: ReactNode;
  count: number;
  disabled?: boolean;
}) {
  return (
    <button type="button" aria-pressed={pressed} disabled={disabled} onClick={onClick} className="model-chip">
      {label}
      <span className="model-chip__count">{count}</span>
    </button>
  );
}

/** Takes `ref` as a prop (React 19) — AnimatePresence's popLayout measures the exiting card through it. */
function ModelCard({ model: m, now, ref }: { model: ModelEntry; now: number; ref?: Ref<HTMLLIElement> }) {
  const c = STORY_COPY.noise;
  const isNew = daysSince(m.releasedAt, now) <= NEW_DAYS;
  const ctx = contextLabel(m.contextLength);
  const caps = m.caps ?? [];
  return (
    <motion.li
      ref={ref}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={SPRING}
      className="model-card glyph-frame"
    >
      <div className="flex items-start justify-between gap-2">
        <bdi className="min-w-0 truncate text-[11px] text-ink-faint">{m.vendor}</bdi>
        {isNew && <span className="model-card__new">{rtl(c.newBadge)}</span>}
      </div>
      <bdi dir="ltr" className="mt-1 block break-words text-right font-type text-[15px] font-bold leading-snug text-ink-paper">
        {m.name}
      </bdi>
      <p className="mt-1.5 flex flex-wrap gap-x-2 text-[11.5px] leading-relaxed text-ink-faint">
        <span>{rtl(releaseLabel(m.releasedAt, now))}</span>
        {ctx && (
          <span>
            {rtl(c.context)} <bdi dir="ltr" className="font-type">{ctx}</bdi>
          </span>
        )}
      </p>
      {caps.length > 0 && (
        <ul className="mt-auto flex flex-wrap gap-1.5 pt-3">
          {caps.map((k, i) => (
            <li key={k} className={`model-tag${i === 0 ? ' model-tag--primary' : ''}`}>
              {rtl(c.caps[k])}
            </li>
          ))}
        </ul>
      )}
    </motion.li>
  );
}
