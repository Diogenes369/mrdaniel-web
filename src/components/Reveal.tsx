import { type ReactNode } from 'react';
import { motion } from 'motion/react';
import { prefersReducedMotion } from '../lib/gsap';

/**
 * Scroll-triggered reveal (fade + rise, or scale-in). Animates once when it enters the viewport.
 * Honors `prefers-reduced-motion` by rendering a plain div. Keep wraps shallow — one per section
 * block, not per element — so the page doesn't thrash on scroll.
 */
export default function Reveal({
  children,
  className = '',
  delay = 0,
  variant = 'up',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  variant?: 'up' | 'scale';
}) {
  if (prefersReducedMotion()) return <div className={className}>{children}</div>;

  const initial = variant === 'scale' ? { opacity: 0, scale: 0.96 } : { opacity: 0, y: 26 };
  const inView = variant === 'scale' ? { opacity: 1, scale: 1 } : { opacity: 1, y: 0 };

  return (
    <motion.div
      className={className}
      initial={initial}
      whileInView={inView}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
