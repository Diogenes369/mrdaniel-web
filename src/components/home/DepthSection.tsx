import { useRef, useState, type ReactNode } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { prefersReducedMotion } from '../../lib/gsap';

/**
 * Scroll-driven "4D" depth wrapper for a homepage section's content.
 *
 * As the section travels through the viewport its content tilts in 3D perspective (rotateX eases
 * from a slight backward lean at entry → flat at center → a slight forward lean at exit), rises
 * with a parallax offset, and scales from 96.5% → 100% — so scrolling feels like moving *through*
 * layered planes rather than past flat slabs.
 *
 * Performance contract:
 *   - Transforms + opacity only (compositor-thread properties; no layout, no paint storms).
 *   - ONE `useScroll` progress value per section, shared by all four transforms.
 *   - DESKTOP + FINE-POINTER ONLY, evaluated once on mount: phones/tablets and
 *     `prefers-reduced-motion` users get the plain, static children — zero animation cost,
 *     zero battery drain, and no interference with the mobile gesture carousels.
 *   - A transformed ancestor would break `position: fixed`/sticky descendants — none of the
 *     wrapped sections use them (that's why this wraps section CONTENT, never the page).
 */
export default function DepthSection({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Once per mount — a mid-session resize across the breakpoint isn't worth re-binding for.
  const [enabled] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches &&
      !prefersReducedMotion()
  );

  // Hooks run unconditionally (rules of hooks); their output is simply unused when disabled.
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const rotateX = useTransform(scrollYProgress, [0, 0.32, 0.68, 1], [7, 0, 0, -5]);
  const y = useTransform(scrollYProgress, [0, 0.32, 0.68, 1], [56, 0, 0, -36]);
  const scale = useTransform(scrollYProgress, [0, 0.32], [0.965, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.22], [0.55, 1]);

  if (!enabled) return <div className={className}>{children}</div>;

  return (
    <div ref={ref} className={className}>
      <motion.div
        style={{
          rotateX,
          y,
          scale,
          opacity,
          transformPerspective: 1150,
          transformStyle: 'preserve-3d',
          willChange: 'transform',
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
