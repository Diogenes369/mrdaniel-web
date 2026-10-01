import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';

interface TitleUnderlineProps {
  /** Extra classes on the outer wrapper. */
  className?: string;
  /** Kept for call-site compatibility (the old rule's resting width); unused. */
  base?: string;
}

/**
 * The mark under a section title (rewritten 2026-10-01 for the glyph world): a typing caret and a
 * dotted rule that draws itself out from it, on a spring, the first time it scrolls into view. It
 * replaced a glowing green→cyan gradient bar. Reduced motion shows it drawn.
 */
export default function TitleUnderline({ className = '' }: TitleUnderlineProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const drawn = reduce || inView;

  return (
    <span ref={ref} aria-hidden="true" className={`mt-4 flex items-center gap-2 ${className}`}>
      <span className="story-statusbar__live" />
      <motion.span
        className="block h-px w-24 origin-right border-t border-dotted border-[var(--color-rule)]"
        initial={false}
        animate={{ scaleX: drawn ? 1 : 0.15 }}
        transition={{ type: 'spring', stiffness: 120, damping: 18 }}
      />
    </span>
  );
}
