import { useRef } from 'react';
import { useInView } from 'motion/react';
import { prefersReducedMotion } from '../lib/gsap';

interface TitleUnderlineProps {
  /** Extra classes on the outer wrapper — pass `w-full` so the bar can fill the title's width. */
  className?: string;
  /** Resting width before scroll-in and when not hovered. */
  base?: string;
}

/**
 * Animated glowing rule under a section title. Place it inside a `group` wrapper alongside the
 * heading:
 *   - it expands from a short stub to a medium bar the first time it scrolls into view,
 *   - and fills to the full title width while the pointer is over the group (`group-hover:w-full`).
 * Neon green → cyan → transparent, with a soft bloom. `prefers-reduced-motion` renders it at the
 * revealed width with no transition.
 */
export default function TitleUnderline({ className = '', base = 'w-10' }: TitleUnderlineProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduced = prefersReducedMotion();
  const revealed = reduced || inView;

  return (
    <span ref={ref} aria-hidden="true" className={`mt-4 block h-[3px] ${className}`}>
      <span
        className={[
          'block h-[3px] rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-transparent',
          'shadow-[0_0_16px_rgba(52,211,153,0.55)]',
          reduced ? '' : 'transition-[width] duration-500 ease-out will-change-[width]',
          'group-hover:w-full group-focus-within:w-full',
          revealed ? 'w-20 sm:w-28' : base,
        ].join(' ')}
      />
    </span>
  );
}
