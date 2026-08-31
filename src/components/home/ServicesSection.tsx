import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpLeft, Check } from 'lucide-react';
import Reveal from '../Reveal';
import WebButton from '../WebButton';
import TiltCard from '../TiltCard';
import DepthSection from './DepthSection';
import SectionBackdrop from './SectionBackdrop';
import PopHeadline from './PopHeadline';
import { SERVICES, type ServiceEntry } from '../../data/homeServices';

function openLead(subject: string) {
  window.dispatchEvent(
    new CustomEvent('open-lead-modal', { detail: { subject, sourceSection: 'Home · Services' } })
  );
}

/**
 * One bento tile. Glassmorphism base (`backdrop-blur-md bg-white/[0.03] border-white/10`); flagship
 * tiles add a neon-green edge, an outer glow, the `.bento-mesh` texture, a badge, and up to three
 * proof points. The whole tile is a <Link> to the matching service page.
 */
function ServiceTile({ s }: { s: ServiceEntry }) {
  const Icon = s.icon;
  return (
    <Link
      to={s.to}
      className={`group relative flex h-full flex-col overflow-hidden rounded-3xl border p-7 backdrop-blur-md transition-all duration-300 md:p-8 lg:p-12 ${
        s.flagship
          ? 'bento-mesh border-brand-500/35 bg-white/[0.04] shadow-[0_0_44px_-16px_rgba(118,185,0,0.5)] hover:border-brand-500/60 hover:shadow-[0_0_64px_-12px_rgba(118,185,0,0.65)]'
          : 'border-white/12 bg-white/[0.035] hover:border-brand-500/45 hover:bg-white/[0.06] hover:shadow-[0_0_36px_-18px_rgba(118,185,0,0.45)]'
      }`}
    >
      <div className="relative z-10 flex h-full flex-col">
        <div className="mb-4 flex items-center gap-3">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors lg:h-12 lg:w-12 ${
              s.flagship
                ? 'border-brand-500/45 bg-brand-500/20 text-brand-300'
                : 'border-white/12 bg-black/30 text-brand-300 group-hover:border-brand-500/45'
            }`}
          >
            <Icon className="h-5 w-5 lg:h-6 lg:w-6" />
          </span>
          {s.badge && (
            <span className="rounded-full border border-brand-500/45 bg-brand-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-300 lg:text-xs">
              {s.badge}
            </span>
          )}
          <ArrowUpLeft className="ml-auto h-4 w-4 text-zinc-500 transition-colors group-hover:text-brand-400 lg:h-5 lg:w-5" aria-hidden="true" />
        </div>

        <h3
          className={`font-display font-extrabold text-white ${
            s.flagship ? 'text-2xl lg:text-4xl lg:leading-tight' : 'text-xl lg:text-2xl'
          }`}
        >
          {s.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300 md:text-base lg:mt-2.5 lg:text-lg lg:leading-relaxed">
          {s.blurb}
        </p>

        {s.flagship && s.points && (
          <ul className="mt-4 space-y-2 border-t border-white/10 pt-4 lg:mt-5 lg:space-y-2.5 lg:pt-5">
            {s.points.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-sm leading-relaxed text-zinc-200 lg:text-base">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-400 lg:h-[18px] lg:w-[18px]" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        )}

        <span className="mt-auto pt-5 text-sm font-bold text-brand-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100 lg:pt-6 lg:text-[15px]">
          לפרטים על השירות ←
        </span>
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
    <section id="services" className="relative isolate py-20 md:py-28 overflow-x-clip cv-auto">
      <SectionBackdrop tone="a" />

      <div className="container-wide relative z-10">
        <div className="mx-auto mb-12 max-w-3xl text-center md:mb-16">
          <PopHeadline lead="שירותים" accent="ופתרונות טכנולוגיים" />
          <p className="font-sans text-fluid-body text-zinc-300 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">
            כל מה שצריך כדי שהטכנולוגיה תעבוד בשבילכם — סוכני AI ואוטומציה, הגנת סייבר, ותשתית דיגיטלית
            פול-סטאק מקצה לקצה. נבנה בהתאמה אישית, מתומחר לפי אפיון — לא לפי מחירון.
          </p>
        </div>
      </div>

      <DepthSection className="container-wide relative z-10">
        {/* Desktop / tablet: asymmetric bento. lg = 6-col with per-tile spans; md = plain 2-col.
            Each tile carries a gentle mouse-tilt over the section's scroll-depth plane. */}
        <Reveal>
          <div className="mx-auto hidden max-w-[1500px] gap-5 md:grid md:grid-cols-2 lg:grid-cols-6 lg:auto-rows-[minmax(240px,1fr)] lg:gap-6">
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
            style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain', touchAction: 'pan-x' }}
            role="group"
            aria-label="גללו לצדדים לעוד שירותים"
          >
            {SERVICES.map((s) => (
              <div key={s.id} className="w-[84%] max-w-xs shrink-0 snap-center">
                <ServiceTile s={s} />
              </div>
            ))}
          </div>
          <CarouselDots count={SERVICES.length} active={active} onDot={scrollToDot} />
        </div>

        <div className="mx-auto mt-12 max-w-2xl text-center md:mt-16">
          <p className="mb-5 text-xs text-zinc-500">
            לא בטוחים מאיפה להתחיל? שיחת אפיון קצרה — נמפה את הצורך, נגדיר היקף, ונחזור עם תוכנית עבודה ברורה.
          </p>
          <WebButton
            variant="primary"
            onClick={() => openLead('אפיון פתרון טכנולוגי מותאם — שירותים')}
            className="!px-8"
          >
            בואו נאפיין את הפתרון שלכם
          </WebButton>
        </div>
      </DepthSection>
    </section>
  );
}
