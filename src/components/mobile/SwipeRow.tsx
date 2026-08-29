import { Children, type ReactNode } from 'react';

/**
 * Mobile-only horizontal swipe/snap carousel — the "long vertical card stack → native-app-like
 * swipe row on phones" conversion. Reuses the shared `.mobile-carousel-track` / `.mobile-carousel-item`
 * CSS (src/index.css), which is scoped to `max-width: 767px`, hides the scrollbar, and applies
 * `scroll-snap-type: x mandatory`. Pair it with a `hidden md:grid …` desktop grid of the same
 * cards; this component carries `md:hidden` so only one shows per breakpoint.
 *
 * Each direct child becomes one snap item. `peek` leaves the next card's edge visible as an
 * affordance that there's more to swipe.
 */
export default function SwipeRow({
  children,
  className = '',
  itemClassName = '',
  align = 'center',
  peek = true,
}: {
  children: ReactNode;
  className?: string;
  itemClassName?: string;
  align?: 'center' | 'start';
  peek?: boolean;
}) {
  return (
    <div
      className={`mobile-carousel-track md:hidden gap-4 -mx-4 px-4 pb-3 ${className}`}
      role="group"
      aria-label="גללו לצדדים לעוד"
    >
      {Children.map(children, (child) => (
        <div
          className={`mobile-carousel-item ${peek ? 'w-[82%]' : 'w-full'} max-w-xs ${
            align === 'start' ? '[scroll-snap-align:start]' : ''
          } ${itemClassName}`}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
