import { Children, isValidElement, type ReactNode } from 'react';

/**
 * Mobile horizontal card rail — a plain, native `overflow-x` scroll-snap row.
 *
 * NOTE (2026-08): this used to layer a GSAP ScrollTrigger `pin: true` + `scrub` on top for phones,
 * converting continued vertical scroll into a horizontal card sweep. That is a scroll-jack, and on
 * Android low-power devices the pin could mis-measure / stick, blocking vertical page scroll and
 * leaving the sections below it blank. All of that is removed: the rail is now nothing but a
 * `-webkit-overflow-scrolling: touch` scroll-snap track. Vertical swipes always scroll the page;
 * horizontal drags scroll the cards.
 *
 * FIX (2026-09): that split used to be written as `touch-action: pan-x`, on the belief it handed a
 * mostly-vertical gesture back to the page. It does the opposite — per spec `pan-x` permits
 * horizontal panning ONLY, so a vertical drag starting on a card was dropped and the page would
 * not scroll at all from anywhere on the rail. Naming both axes lets the browser resolve the
 * direction from the gesture itself, which is the behaviour the comment always described.
 *
 * `.momentum-scroll` is deliberately NOT used here — it sets `touch-action: pan-y` alone, which
 * would cancel the horizontal drag this row needs. The momentum bits are inlined instead.
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

export default function ScrollLockRail({ children, itemClassName = DEFAULT_ITEM, className = '', ariaLabel }: ScrollLockRailProps) {
  const items = Children.toArray(children).filter(isValidElement);

  return (
    <div className={`relative max-w-full ${className}`}>
      <ul
        aria-label={ariaLabel}
        className="flex flex-nowrap gap-4 list-none p-0 m-0 -mx-4 px-4 overflow-x-auto snap-x snap-mandatory [scrollbar-width:none]"
        style={{
          touchAction: 'pan-x pan-y',
          overscrollBehaviorX: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {items.map((child, i) => (
          <li key={i} className={itemClassName}>
            {child}
          </li>
        ))}
      </ul>
    </div>
  );
}
