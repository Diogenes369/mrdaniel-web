import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useInView } from 'motion/react';
import { prefersReducedMotion } from '../lib/gsap';

/** Phone / touch viewport — reveal animations are skipped entirely here (see below). */
function isMobileViewport() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(max-width: 768px)').matches || window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Scroll-triggered reveal (fade + rise, or scale-in) for DESKTOP.
 *
 * Mobile (`max-width: 768px` or `pointer: coarse`): renders immediately at `opacity: 1`,
 * `transform: none` — NO IntersectionObserver, NO scroll trigger, NO failsafe timer. A skipped or
 * delayed observer callback on a low-power Android GPU can never leave a section blank because
 * there is nothing to skip.
 *
 * Desktop keeps the animation, plus a LOW intersection threshold and a hard failsafe timer that
 * force-shows the content after a short delay as a second safety net. Honors
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
  // Evaluated once on mount — a resize across the breakpoint is not worth re-animating for.
  const [mobile] = useState(isMobileViewport);

  useEffect(() => {
    const t = window.setTimeout(() => setFailsafe(true), 1400);
    return () => window.clearTimeout(t);
  }, []);

  if (mobile || prefersReducedMotion()) return <div className={className}>{children}</div>;

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
