import { useRef, useState, type ReactNode } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { prefersReducedMotion } from '../../lib/gsap';

interface PopHeadlineProps {
  lead: ReactNode;
  /** Trailing phrase rendered in brand green. */
  accent?: ReactNode;
  /** Spacing / alignment overrides for the outer block. */
  className?: string;
}

/**
 * Giant section headline that projects toward the viewer as it scrolls into frame: it rises out
 * of depth (translateZ −→ +), un-tilts from a backward lean (rotateX), and settles from a hair of
 * roll (rotateZ) — a "pops out of the screen" entrance — then holds flat and readable.
 *
 * Performance / GPU contract:
 *   - Only the <h2> transforms — transform + opacity, `transformPerspective` on the same element
 *     (matches DepthSection), `will-change: transform, opacity` so it's on its own layer up front.
 *     No layout or paint work per frame.
 *   - ONE `useScroll` progress per instance, mapped: headline top enters viewport → headline
 *     centre reaches ~58% up. Clamps at both ends, so it holds settled once past.
 *   - Touch devices get a lighter profile (shorter travel, softer angle) for 60fps on older
 *     mobile GPUs. `prefers-reduced-motion` renders the headline flat and static — an
 *     accessibility choice, respected, not bypassed.
 *   - Rendered OUTSIDE the section's <DepthSection> so the two 3D effects never compound.
 */
export default function PopHeadline({ lead, accent, className = 'mb-6 md:mb-8' }: PopHeadlineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [mode] = useState<'full' | 'lite' | 'off'>(() => {
    if (typeof window === 'undefined' || prefersReducedMotion()) return 'off';
    return window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches ? 'full' : 'lite';
  });
  const lite = mode === 'lite';

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center 0.58'] });
  const rotateX = useTransform(scrollYProgress, [0, 1], lite ? [15, 0] : [24, 0]);
  const rotateZ = useTransform(scrollYProgress, [0, 1], lite ? [-1.4, 0] : [-2.4, 0]);
  const z = useTransform(scrollYProgress, [0, 0.72, 1], lite ? [-90, 12, 0] : [-170, 26, 0]);
  const opacity = useTransform(scrollYProgress, [0, 0.32], [0, 1]);

  const heading = (
    <h2 className="text-pop font-display font-black text-white text-center [text-shadow:0_10px_44px_rgba(0,0,0,0.6)]">
      {lead}
      {accent != null && (
        <>
          {' '}
          <span className="text-brand-500">{accent}</span>
        </>
      )}
    </h2>
  );

  if (mode === 'off') return <div className={className}>{heading}</div>;

  return (
    <div ref={ref} className={className}>
      <motion.div
        style={{
          rotateX,
          rotateZ,
          z,
          opacity,
          transformPerspective: lite ? 820 : 1050,
          transformStyle: 'preserve-3d',
          willChange: 'transform, opacity',
        }}
      >
        {heading}
      </motion.div>
    </div>
  );
}
