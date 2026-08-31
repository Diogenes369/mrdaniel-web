import { useRef, useState, type ReactNode } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { prefersReducedMotion } from '../../lib/gsap';
import TitleUnderline from '../TitleUnderline';

interface PopHeadlineProps {
  lead: ReactNode;
  /** Trailing phrase rendered in brand green. */
  accent?: ReactNode;
  /** Spacing / alignment overrides for the outer block. */
  className?: string;
}

/**
 * Giant section title that floats in 3D above the section's cards.
 *
 * `perspective: 1000px` lives on the (never-clipped) container; only the inner motion element
 * transforms. As the title scrolls into frame it lifts from depth and forward, then RESTS at a
 * gentle permanent float — rotateX ~8°, translateZ ~20px, pivoting from its bottom edge so the
 * headline "stands up" off the cards below it. It does not settle flat: the pop-out is the
 * resting state.
 *
 * - Transform + opacity only, on one element, `will-change`-hinted → no layout/paint per frame.
 * - The container has no `overflow` and generous margin, so the tilt never cuts a glyph.
 * - Touch: a shallower float for 60fps on older GPUs. `prefers-reduced-motion`: flat + static.
 * - Rendered OUTSIDE the section's <DepthSection>, so the two 3D effects never compound.
 */
export default function PopHeadline({ lead, accent, className = 'mb-7 md:mb-9' }: PopHeadlineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [mode] = useState<'full' | 'lite' | 'off'>(() => {
    if (typeof window === 'undefined' || prefersReducedMotion()) return 'off';
    return window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches ? 'full' : 'lite';
  });
  const lite = mode === 'lite';

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center 0.62'] });
  const rotateX = useTransform(scrollYProgress, [0, 1], lite ? [16, 6] : [22, 8]);
  const z = useTransform(scrollYProgress, [0, 1], lite ? [-60, 14] : [-90, 22]);
  const opacity = useTransform(scrollYProgress, [0, 0.34], [0, 1]);

  const heading = (
    <h2 className="text-pop font-display font-black text-white text-center">
      {lead}
      {accent != null && (
        <>
          {' '}
          <span className="text-brand-500">{accent}</span>
        </>
      )}
    </h2>
  );

  if (mode === 'off') {
    return (
      <div className={className}>
        <div className="group inline-flex max-w-full flex-col items-center">
          {heading}
          <TitleUnderline className="w-full" base="w-12" />
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className={className} style={{ perspective: '1000px' }}>
      <div className="group inline-flex max-w-full flex-col items-center">
        <motion.div
          style={{
            rotateX,
            z,
            opacity,
            transformStyle: 'preserve-3d',
            transformOrigin: 'center bottom',
            willChange: 'transform, opacity',
          }}
        >
          {heading}
        </motion.div>
        <TitleUnderline className="w-full" base="w-12" />
      </div>
    </div>
  );
}
