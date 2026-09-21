import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpLeft, Check } from 'lucide-react';
import Reveal from '../Reveal';
import WebButton from '../WebButton';
import TiltCard from '../TiltCard';
import DepthSection from './DepthSection';
import PopHeadline from './PopHeadline';
import { SERVICES, type ServiceEntry } from '../../data/homeServices';
import { SERVICES_COPY } from '../../data/siteCopy';
import { rtl } from '../../lib/rtl';

function openLead(subject: string) {
  window.dispatchEvent(
    new CustomEvent('open-lead-modal', { detail: { subject, sourceSection: 'Home · Services' } })
  );
}

/** Feature chips — small brand-tinted pills that gently light up with the card's hover state. */
function FeatureChips({ chips, compact }: { chips: string[]; compact?: boolean }) {
  return (
    <div className={`flex flex-wrap ${compact ? 'mt-2.5 gap-1.5' : 'mt-4 gap-2 lg:mt-5'}`}>
      {chips.map((c) => (
        <span
          key={c}
          className={`inline-flex items-center rounded-full border border-brand-500/25 bg-brand-500/[0.07] font-medium text-brand-200 transition-all duration-300 group-hover:border-brand-500/45 group-hover:bg-brand-500/[0.12] group-hover:shadow-[0_0_14px_-4px_rgba(118,185,0,0.5)] ${
            compact ? 'px-2.5 py-1 text-[11px] leading-none' : 'px-3 py-1 text-[11px] lg:text-xs'
          }`}
        >
          {rtl(c)}
        </span>
      ))}
    </div>
  );
}

/** Key-takeaway metric — a headline figure (always an estimate/range or a qualitative shift) +
 * what it means, in a small glowing callout. */
function MetricBadge({ metric, compact }: { metric: NonNullable<ServiceEntry['metric']>; compact?: boolean }) {
  return (
    <div
      className={`flex items-center rounded-2xl border border-brand-500/20 bg-black/30 transition-colors duration-300 group-hover:border-brand-500/40 ${
        compact ? 'mt-2.5 gap-2 rounded-xl px-3 py-2' : 'mt-4 gap-3 px-4 py-3 lg:mt-5'
      }`}
    >
      <span
        className={`font-display font-black leading-none text-brand-400 [text-shadow:0_0_18px_rgba(0,255,102,0.35)] ${
          compact ? 'shrink-0 text-base' : 'text-2xl lg:text-3xl'
        }`}
      >
        {metric.value}
      </span>
      <span className={`text-zinc-400 ${compact ? 'text-[11px] leading-snug' : 'text-xs leading-snug lg:text-[13px]'}`}>
        {rtl(metric.label)}
      </span>
    </div>
  );
}

/** A proof-point list (mini feature list). Two columns on the full-row `wide` tile, one otherwise. */
function ProofPoints({ points, wide, compact }: { points: string[]; wide?: boolean; compact?: boolean }) {
  return (
    <ul
      className={`border-t border-white/10 ${
        compact
          ? 'mt-2.5 space-y-1.5 pt-2.5'
          : `mt-4 space-y-2 pt-4 lg:mt-5 lg:space-y-2.5 lg:pt-5 ${
              wide ? 'lg:grid lg:grid-cols-2 lg:gap-x-10 lg:gap-y-2.5 lg:space-y-0' : ''
            }`
      }`}
    >
      {points.map((p) => (
        <li
          key={p}
          className={`flex items-start text-zinc-200 ${
            compact ? 'gap-2 text-xs leading-normal' : 'gap-2.5 text-sm leading-relaxed lg:text-base'
          }`}
        >
          <Check
            className={`shrink-0 text-brand-400 ${compact ? 'mt-px h-3.5 w-3.5' : 'mt-0.5 h-4 w-4 lg:h-[18px] lg:w-[18px]'}`}
          />
          <span>{rtl(p)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One bento tile — the unified `.glass-panel` surface (`--marketing`, `--flagship` for the large
 * tiles). Icon + giant title + blurb, then (when the data carries them) feature chips, a proof-point
 * list and a metric badge — sized so the copy fills the tile instead of leaving dead space. The
 * whole tile is a <Link> to the matching service page. `wide` splits the inner content into two
 * columns on desktop so the full-row tile reads as one balanced block.
 */
function ServiceTile({ s, compact }: { s: ServiceEntry; compact?: boolean }) {
  const Icon = s.icon;

  const head = (
    <>
      <div className={`flex items-center gap-3 ${compact ? 'mb-2.5' : 'mb-4'}`}>
        <span
          className={`flex shrink-0 items-center justify-center rounded-xl border transition-colors ${
            compact ? 'h-9 w-9' : 'h-11 w-11 lg:h-12 lg:w-12'
          } ${
            s.flagship
              ? 'border-brand-500/45 bg-brand-500/20 text-brand-300'
              : 'border-white/12 bg-black/30 text-brand-300 group-hover:border-brand-500/45'
          }`}
        >
          <Icon className={compact ? 'h-4 w-4' : 'h-5 w-5 lg:h-6 lg:w-6'} />
        </span>
        <ArrowUpLeft
          className={`ml-auto text-zinc-500 transition-colors group-hover:text-brand-400 ${
            compact ? 'h-3.5 w-3.5' : 'h-4 w-4 lg:h-5 lg:w-5'
          }`}
          aria-hidden="true"
        />
      </div>

      <h3
        className={`font-display font-extrabold text-white ${
          compact
            ? 'text-lg leading-tight'
            : s.flagship
              ? 'text-2xl lg:text-4xl lg:leading-tight'
              : 'text-xl lg:text-2xl'
        }`}
      >
        {rtl(s.title)}
      </h3>
      <p
        className={`text-zinc-300 ${
          compact
            ? // Clamped: this is a teaser that links to the full service page, and an unclamped
              // blurb ran 7 lines / 133px on a 390px phone — the single biggest contributor to the
              // card overflowing a short viewport.
              'mt-1.5 line-clamp-3 text-xs leading-normal'
            : 'mt-2 text-sm leading-relaxed md:text-base lg:mt-2.5 lg:text-lg lg:leading-relaxed'
        }`}
      >
        {rtl(s.blurb)}
      </p>
      {s.chips && s.chips.length > 0 && (
        // Compact caps at 3 chips: a 4th wrapped the row and cost 34px on exactly the two cards
        // that were already the tallest.
        <FeatureChips chips={compact ? s.chips.slice(0, 3) : s.chips} compact={compact} />
      )}
    </>
  );

  const detail = (
    <>
      {s.points && s.points.length > 0 && (
        // Compact shows at most 3 proof points — the two 4-point cards were the height drivers,
        // and the full list is one tap away on the service page.
        <ProofPoints points={compact ? s.points.slice(0, 3) : s.points} wide={s.wide} compact={compact} />
      )}
      {s.metric && <MetricBadge metric={s.metric} compact={compact} />}
    </>
  );

  return (
    <Link
      to={s.to}
      className={`glass-panel glass-panel--marketing group flex h-full flex-col ${
        compact
          ? // Safety ceiling only — the compact scale above is tuned so a card's natural height
            // lands well under this, so it never actually engages (`.glass-panel` is
            // `overflow: hidden`, so a max-height that DID bite would clip rather than scroll).
            'max-h-[calc(100dvh-11rem)] rounded-2xl p-4'
          : 'rounded-3xl p-7 md:p-8 lg:p-12'
      } ${s.flagship ? 'glass-panel--flagship' : ''}`}
    >
      <div className="flex h-full flex-col">
        {s.wide && !compact ? (
          <div className="flex flex-col gap-2 lg:flex-row lg:gap-14">
            <div className="lg:w-[42%] lg:shrink-0">{head}</div>
            <div className="flex flex-1 flex-col">{detail}</div>
          </div>
        ) : (
          <>
            {head}
            {detail}
          </>
        )}

        {/* Hover-reveal affordance. Dropped entirely in compact mode: touch has no hover, so on
            phones this was permanently `opacity-0` and contributed nothing but ~32px of the dead
            bottom gap that made these cards feel cut off. */}
        {!compact && (
          <span className="mt-auto pt-5 text-sm font-bold text-brand-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100 lg:pt-6 lg:text-[15px]">
            לפרטים על השירות ←
          </span>
        )}
      </div>
    </Link>
  );
}

/** Paging dots for the mobile carousel — driven purely by the track's scroll position. */
function CarouselDots({ count, active, onDot }: { count: number; active: number; onDot: (i: number) => void }) {
  return (
    <div className="mt-4 flex justify-center gap-2 md:hidden">
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`מעבר לשירות ${i + 1}`}
          onClick={() => onDot(i)}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === active ? 'w-6 bg-brand-500' : 'w-1.5 bg-white/20'
          }`}
        />
      ))}
    </div>
  );
}

export default function ServicesSection() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  // The track lives inside `dir="rtl"`, where `scrollLeft` runs 0 → negative as you page through.
  // `Math.abs` reads the offset regardless of the browser's RTL convention; `scrollToDot` writes a
  // negative offset so paging works in RTL (and positive in the unlikely LTR case).
  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const itemW = el.scrollWidth / SERVICES.length;
    const idx = Math.round(Math.abs(el.scrollLeft) / itemW);
    setActive(Math.max(0, Math.min(SERVICES.length - 1, idx)));
  }, []);

  const scrollToDot = useCallback((i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    const target = (el.scrollWidth / SERVICES.length) * i * (rtl ? -1 : 1);
    el.scrollTo({ left: target, behavior: 'smooth' });
  }, []);

  return (
    <section id="services" className="relative py-20 md:py-28 overflow-x-clip cv-auto">
      <div className="container-wide relative z-10">
        <div className="mx-auto mb-12 max-w-4xl text-center md:mb-16">
          <PopHeadline lead={rtl(SERVICES_COPY.lead)} accent={rtl(SERVICES_COPY.accent)} />
          <p className="font-sans text-fluid-body text-zinc-300 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">
            {rtl(SERVICES_COPY.sub)}
          </p>
        </div>
      </div>

      <DepthSection className="container-wide relative z-10">
        {/* Desktop / tablet: asymmetric bento. lg = 6-col with per-tile spans; md = plain 2-col.
            Each tile carries a gentle mouse-tilt over the section's scroll-depth plane. */}
        <Reveal>
          <div className="mx-auto hidden max-w-[1600px] gap-5 md:grid md:grid-cols-2 lg:grid-cols-6 lg:auto-rows-[minmax(240px,1fr)] lg:gap-6">
            {SERVICES.map((s) => (
              <div key={s.id} className={s.span}>
                <TiltCard strength={3} className="h-full">
                  <ServiceTile s={s} />
                </TiltCard>
              </div>
            ))}
          </div>
        </Reveal>

        {/* Mobile: snap carousel + paging dots. */}
        <div className="md:hidden">
          <div
            ref={trackRef}
            onScroll={onScroll}
            className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain', touchAction: 'pan-x pan-y' }}
            role="group"
            aria-label="גללו לצדדים לעוד שירותים"
          >
            {SERVICES.map((s) => (
              <div key={s.id} className="w-[86%] max-w-[20rem] shrink-0 snap-center">
                <ServiceTile s={s} compact />
              </div>
            ))}
          </div>
          <CarouselDots count={SERVICES.length} active={active} onDot={scrollToDot} />
        </div>

        <div className="mx-auto mt-12 max-w-2xl text-center md:mt-16">
          <p className="mb-5 text-sm text-zinc-400">{rtl(SERVICES_COPY.closing)}</p>
          <WebButton
            variant="primary"
            onClick={() => openLead('אפיון פתרון טכנולוגי מותאם — שירותים')}
            className="cta-sheen !px-8"
          >
            {rtl(SERVICES_COPY.cta)}
          </WebButton>
        </div>
      </DepthSection>
    </section>
  );
}
