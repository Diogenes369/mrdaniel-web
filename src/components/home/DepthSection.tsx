import { useRef, useState, type ReactNode } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { prefersReducedMotion } from '../../lib/gsap';

/**
 * Scroll-driven "4D" depth wrapper for a homepage section's content — ALL devices.
 *
 * As the section travels through the viewport its content tilts in 3D perspective, rises with a
 * parallax offset, and scales in, so scrolling feels like moving through layered planes.
 *
 * Device profiles (chosen once on mount):
 *   - Desktop (fine pointer, ≥1024px): full profile — rotateX 7°→0→-5°, y 56px, scale 0.965.
 *   - Mobile / tablet (touch, incl. iOS Safari + Android Chrome back to ~2016 GPUs): a lighter
 *     profile — rotateX 4°→0→-3°, y 32px, scale 0.98 — same feel, roughly half the rasterized
 *     motion area, so weak tilers hold 60fps without dropped frames on fling scrolls.
 *   - `prefers-reduced-motion`: static children. This flag is a user accessibility choice
 *     (vestibular disorders) — it is deliberately respected, not bypassed; the "fallback" for
 *     these users IS the motionless render.
 *
 * Anti-flicker / GPU contract (mobile Safari + Android Chrome):
 *   - transform + opacity only — compositor-thread properties, no layout, no repaints.
 *   - `will-change: transform, opacity` promotes the plane to its own GPU layer up front, so the
 *     first scrolled frame doesn't pay a layer-creation flash.
 *   - `backfaceVisibility: hidden` + `transformStyle: preserve-3d` suppress the iOS Safari
 *     white-flash/z-fighting artifacts on perspective-transformed layers.
 *   - ONE `useScroll` progress per section feeds every transform.
 *   - Fixed/sticky chrome (header, ticker) lives OUTSIDE this subtree, so the transformed
 *     ancestor never re-parents their containing block.
 */
export default function DepthSection({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Once per mount — a mid-session resize/rotation isn't worth re-binding the profile for.
  const [mode] = useState<'full' | 'lite' | 'off'>(() => {
    if (typeof window === 'undefined' || prefersReducedMotion()) return 'off';
    return window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches ? 'full' : 'lite';
  });

  const lite = mode === 'lite';
  // Hooks run unconditionally (rules of hooks); outputs are unused when mode === 'off'.
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const rotateX = useTransform(scrollYProgress, [0, 0.32, 0.68, 1], lite ? [4, 0, 0, -3] : [7, 0, 0, -5]);
  const y = useTransform(scrollYProgress, [0, 0.32, 0.68, 1], lite ? [32, 0, 0, -20] : [56, 0, 0, -36]);
  const scale = useTransform(scrollYProgress, [0, 0.32], lite ? [0.98, 1] : [0.965, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.22], lite ? [0.7, 1] : [0.55, 1]);

  if (mode === 'off') return <div className={className}>{children}</div>;

  return (
    <div ref={ref} className={className}>
      <motion.div
        style={{
          rotateX,
          y,
          scale,
          opacity,
          transformPerspective: lite ? 900 : 1150,
          transformStyle: 'preserve-3d',
          backfaceVisibility: 'hidden',
          willChange: 'transform, opacity',
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
