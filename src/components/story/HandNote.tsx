import { motion, useReducedMotion } from 'motion/react';
import { rtl } from '../../lib/rtl';
import { useFieldQuiet } from '../field/fieldState';

/**
 * The one human hand on a page made of machine type: a short handwritten aside (Playpen Sans
 * Hebrew, the same face the carousels use for their margin notes) with a doodle arrow that draws
 * itself toward what it points at. It comments; it never adds a fact or a number.
 */

// Hand-drawn strokes, authored once: a loose curve with a small overshoot and a two-stroke head.
const ARROWS = {
  /** From the note, curving down and away to the left (RTL: forward into the page). */
  'down-left': {
    view: '0 0 120 96',
    body: 'M104 6 C 108 34, 92 58, 62 70 C 46 76, 30 78, 14 84',
    head: 'M28 72 L 13 84 L 31 91',
  },
  /** From the note, up and to the right, back toward the start of the line. */
  'up-right': {
    view: '0 0 120 96',
    body: 'M10 88 C 14 60, 34 34, 66 22 C 82 16, 96 14, 108 10',
    head: 'M92 4 L 108 10 L 96 22',
  },
} as const;

export default function HandNote({
  children,
  arrow = 'down-left',
  className = '',
  tilt = -2.5,
}: {
  children: string;
  arrow?: keyof typeof ARROWS;
  className?: string;
  tilt?: number;
}) {
  const reduce = useReducedMotion();
  // The field steps back behind the handwriting; the arrow stays out in the noise it points at.
  const quiet = useFieldQuiet();
  const a = ARROWS[arrow];
  const draw = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { pathLength: 0 },
          whileInView: { pathLength: 1 },
          viewport: { once: true, amount: 0.8 },
          transition: { type: 'spring' as const, stiffness: 40, damping: 14, delay },
        };
  return (
    <figure className={`hand-note ${className}`} style={{ rotate: `${tilt}deg` }}>
      <figcaption ref={quiet} className="hand-note__text">{rtl(children)}</figcaption>
      <svg className={`hand-note__arrow hand-note__arrow--${arrow}`} viewBox={a.view} aria-hidden="true">
        <motion.path d={a.body} {...draw(0.25)} />
        <motion.path d={a.head} {...draw(0.9)} />
      </svg>
    </figure>
  );
}
