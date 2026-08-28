import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import { gsap, ScrollTrigger, prefersReducedMotion } from '../../lib/gsap';
import { isIOSWebKit } from '../../hooks/useDeviceTier';

/**
 * Smart mobile horizontal scroll-lock. On a phone viewport it PINS the section and converts the
 * visitor's continued vertical scroll into a 1:1 horizontal sweep of the card track — the page
 * doesn't advance downward again until every card has passed through. Effortless single-thumb
 * browsing: one gesture, no separate swipe.
 *
 * Degrades safely: the exact same markup is always a native `overflow-x` scroll-snap row, so on
 * reduced-motion, on iOS WebKit (where scroll-pinning is jank-prone), and on any desktop caller the
 * cards are still a normal swipeable/visible track — the GSAP pin is layered on top only when it's
 * safe to do so.
 *
 * Desktop layout is the caller's job: render your `md:grid` separately and mount this with
 * `className="md:hidden"`.
 */
interface ScrollLockRailProps {
  children: ReactNode;
  /** Per-card wrapper classes (width / snap). */
  itemClassName?: string;
  /** Extra classes on the outer wrapper (callers pass `md:hidden`). */
  className?: string;
  ariaLabel?: string;
}

const DEFAULT_ITEM = 'shrink-0 w-[82%] sm:w-[58%] snap-center';
// Below this many px of horizontal overflow there's nothing to sweep — stay a plain static row.
const MIN_SWEEP_PX = 48;

export default function ScrollLockRail({ children, itemClassName = DEFAULT_ITEM, className = '', ariaLabel }: ScrollLockRailProps) {
  const pinRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const [pinned, setPinned] = useState(false);
  const [progress, setProgress] = useState(0);

  const items = Children.toArray(children).filter(isValidElement);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    let ctx: ReturnType<typeof gsap.context> | null = null;

    const teardown = () => {
      ctx?.revert();
      ctx = null;
      setPinned(false);
      setProgress(0);
    };

    const build = () => {
      teardown();
      const pin = pinRef.current;
      const track = trackRef.current;
      if (!pin || !track) return;
      if (!mq.matches || prefersReducedMotion() || isIOSWebKit()) return; // native-swipe fallback

      const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
      const sweep = () => Math.max(0, track.scrollWidth - track.clientWidth);
      if (sweep() < MIN_SWEEP_PX) return;

      ctx = gsap.context(() => {
        const tween = gsap.to(track, {
          x: () => (rtl ? sweep() : -sweep()),
          ease: 'none',
        });
        ScrollTrigger.create({
          animation: tween,
          trigger: pin,
          start: 'top top',
          end: () => '+=' + Math.max(1, sweep()),
          pin: true,
          anticipatePin: 1,
          scrub: 1,
          invalidateOnRefresh: true,
          onToggle: (self) => setPinned(self.isActive),
          onUpdate: (self) => setProgress(self.progress),
        });
      }, pin);
      ScrollTrigger.refresh();
      setPinned(true);
    };

    build();
    mq.addEventListener('change', build);
    const refreshOnFonts = () => ScrollTrigger.refresh();
    document.fonts?.ready?.then(refreshOnFonts).catch(() => {});
    const backstops = [300, 1200, 3000].map((ms) => window.setTimeout(() => ScrollTrigger.refresh(), ms));

    return () => {
      mq.removeEventListener('change', build);
      backstops.forEach((id) => window.clearTimeout(id));
      teardown();
    };
  }, [items.length]);

  return (
    <div ref={pinRef} className={`relative ${className}`}>
      <ul
        ref={trackRef}
        aria-label={ariaLabel}
        className={`flex flex-nowrap gap-4 list-none p-0 m-0 -mx-4 px-4 ${
          pinned ? 'overflow-hidden' : 'overflow-x-auto snap-x snap-mandatory momentum-scroll'
        }`}
        style={{ scrollbarWidth: 'none' }}
      >
        {items.map((child, i) => (
          <li key={i} className={itemClassName}>
            {child}
          </li>
        ))}
      </ul>

      {/* Sweep progress rail — only meaningful while the section is pinned. origin-right for RTL. */}
      <div
        className={`mt-4 h-[3px] rounded-full bg-white/10 overflow-hidden transition-opacity duration-300 ${
          pinned ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full bg-brand-400/70 origin-right"
          style={{ transform: `scaleX(${Math.max(0.04, progress)})` }}
        />
      </div>
    </div>
  );
}
