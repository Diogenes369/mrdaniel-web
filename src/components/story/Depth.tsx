import { useRef, type ReactNode } from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';

/**
 * One layer of the layered scroll. Every layer travels with the page, but at its own rate:
 * `speed` > 0 drifts up faster than the scroll (closer to the reader), < 0 lags behind it (further
 * away), over the stretch from the layer entering the viewport to leaving it. The offset rides a
 * spring, so a fast flick makes near layers overshoot a touch and settle, like objects with mass.
 *
 * Transform only, never sticky or pinned: this runs inside Instagram and Facebook webviews, where
 * section-level pinning breaks (AGENTS.md).
 */
export default function Depth({
  speed,
  children,
  className,
  as = 'div',
}: {
  speed: number;
  children: ReactNode;
  className?: string;
  /** `span` (rendered as a block) where a div is not allowed, e.g. inside a heading. */
  as?: 'div' | 'span';
}) {
  const ref = useRef<HTMLDivElement & HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const raw = useTransform(scrollYProgress, [0, 1], [speed * 180, -speed * 180]);
  const y = useSpring(raw, { stiffness: 150, damping: 24, mass: 0.55 });
  if (as === 'span') {
    return (
      <motion.span ref={ref} style={reduce ? { display: 'block' } : { y, display: 'block' }} className={className}>
        {children}
      </motion.span>
    );
  }
  return (
    <motion.div ref={ref} style={reduce ? undefined : { y }} className={className}>
      {children}
    </motion.div>
  );
}
