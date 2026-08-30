import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useInView } from 'motion/react';
import { prefersReducedMotion } from '../lib/gsap';

/**
 * Scroll-triggered reveal (fade + rise, or scale-in). Animates once when it enters the viewport.
 *
 * Mobile safety: uses a LOW intersection threshold, and a hard failsafe timer that force-shows
 * the content after a short delay — so a delayed / skipped IntersectionObserver callback on a
 * low-power mobile GPU can NEVER leave a section stuck at opacity:0. Honors
 * `prefers-reduced-motion` by rendering a plain div.
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
  const ref = useRef<HTMLDivElement>(null);
  // Low `amount` + generous margin: fire as soon as any sliver is near the viewport.
  const inView = useInView(ref, { once: true, amount: 0.05, margin: '-40px 0px -40px 0px' });
  const [failsafe, setFailsafe] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setFailsafe(true), 1400);
    return () => window.clearTimeout(t);
  }, []);

  if (prefersReducedMotion()) return <div className={className}>{children}</div>;

  const hidden = variant === 'scale' ? { opacity: 0, scale: 0.96 } : { opacity: 0, y: 26 };
  const shown = variant === 'scale' ? { opacity: 1, scale: 1 } : { opacity: 1, y: 0 };

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={hidden}
      animate={inView || failsafe ? shown : hidden}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
