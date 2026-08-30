import { Children, isValidElement, type ReactNode } from 'react';

/**
 * Mobile horizontal card rail — a plain, native `overflow-x` scroll-snap row.
 *
 * NOTE (2026-08): this used to layer a GSAP ScrollTrigger `pin: true` + `scrub` on top for phones,
 * converting continued vertical scroll into a horizontal card sweep. That is a scroll-jack, and on
 * Android low-power devices the pin could mis-measure / stick, blocking vertical page scroll and
 * leaving the sections below it blank. All of that is removed: the rail is now nothing but a
 * `-webkit-overflow-scrolling: touch` scroll-snap track. Vertical swipes always scroll the page;
 * horizontal drags scroll the cards. `touch-action: pan-x` enforces that split so a mostly-vertical
 * gesture that starts on a card is handed straight back to the page.
 *
 * `.momentum-scroll` is deliberately NOT used here — it sets `touch-action: pan-y` for vertical
 * panels and would cancel the `pan-x` this row needs. The momentum bits are inlined instead.
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
          touchAction: 'pan-x',
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
