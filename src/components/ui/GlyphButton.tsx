import { useEffect, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, type Transition, type Variants } from 'motion/react';
import { fieldRipple } from '../field/fieldState';
import { ensureGlyphTexture } from '../../lib/glyphTexture';

/**
 * The site's button since the 2026-10-01 redesign: a sharp rectangle — never a pill — with four
 * corner ticks like the registration marks on a print sheet.
 *
 * Physics, not CSS transitions: hover springs the ticks outward and (on the line variant) types a
 * glyph-density fill across from the reading start; press sinks the whole button two pixels on a
 * stiff spring and sends a ripple through the glyph field behind the page, so a click is felt in
 * the background as well as the button.
 */

type Variant = 'primary' | 'line';

interface GlyphButtonProps {
  children: ReactNode;
  variant?: Variant;
  /** In-app route → react-router Link. */
  to?: string;
  /** Anchor href (hash or external). */
  href?: string;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  className?: string;
  target?: string;
  rel?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
  'aria-label'?: string;
}

const PRESS: Transition = { type: 'spring', stiffness: 720, damping: 30, mass: 0.6 };
const SETTLE: Transition = { type: 'spring', stiffness: 380, damping: 24, mass: 0.7 };

const root: Variants = {
  rest: { y: 0, scale: 1, transition: SETTLE },
  hover: { y: -1, scale: 1, transition: SETTLE },
  press: { y: 2, scale: 0.985, transition: PRESS },
};

// Each tick springs out along its own diagonal.
const tick = (dx: number, dy: number): Variants => ({
  rest: { x: 0, y: 0, transition: SETTLE },
  hover: { x: dx * 5, y: dy * 5, transition: SETTLE },
  press: { x: dx * 2, y: dy * 2, transition: PRESS },
});
const TICKS = [
  { cls: 'glyph-btn__tick--tr', v: tick(1, -1) },
  { cls: 'glyph-btn__tick--tl', v: tick(-1, -1) },
  { cls: 'glyph-btn__tick--br', v: tick(1, 1) },
  { cls: 'glyph-btn__tick--bl', v: tick(-1, 1) },
];

// RTL: the fill enters from the right edge, the way the line is read.
const fill: Variants = {
  rest: { clipPath: 'inset(0 0 0 100%)', transition: SETTLE },
  hover: { clipPath: 'inset(0 0 0 0%)', transition: { type: 'spring', stiffness: 260, damping: 28 } },
  press: { clipPath: 'inset(0 0 0 0%)', transition: PRESS },
};

const MotionLink = motion.create(Link);

export default function GlyphButton({
  children,
  variant = 'primary',
  to,
  href,
  onClick,
  className = '',
  type = 'button',
  target,
  rel,
  disabled = false,
  ...rest
}: GlyphButtonProps) {
  useEffect(ensureGlyphTexture, []);

  const handleClick = (e: MouseEvent<HTMLElement>) => {
    if (disabled) return;
    // Keyboard activation reports 0,0 — ripple from the button's centre instead.
    const r = e.currentTarget.getBoundingClientRect();
    const fromPointer = e.clientX !== 0 || e.clientY !== 0;
    fieldRipple(fromPointer ? e.clientX : r.left + r.width / 2, fromPointer ? e.clientY : r.top + r.height / 2);
    onClick?.(e);
  };

  const inner = (
    <>
      {variant === 'line' ? (
        <motion.span className="glyph-btn__fill" variants={fill} aria-hidden="true" />
      ) : (
        <span className="glyph-btn__fill" aria-hidden="true" />
      )}
      <span className="glyph-btn__label">{children}</span>
      {TICKS.map((t) => (
        <motion.span key={t.cls} className={`glyph-btn__tick ${t.cls}`} variants={t.v} aria-hidden="true" />
      ))}
    </>
  );

  const shared = {
    className: `glyph-btn glyph-btn--${variant} ${className}`,
    variants: root,
    initial: 'rest' as const,
    animate: 'rest' as const,
    whileHover: disabled ? undefined : ('hover' as const),
    whileTap: disabled ? undefined : ('press' as const),
    whileFocus: disabled ? undefined : ('hover' as const),
    onClick: handleClick,
  };

  if (to) {
    return (
      <MotionLink to={to} {...shared} {...rest}>
        {inner}
      </MotionLink>
    );
  }
  if (href) {
    return (
      <motion.a href={href} target={target} rel={rel} {...shared} {...rest}>
        {inner}
      </motion.a>
    );
  }
  return (
    <motion.button type={type} disabled={disabled} {...shared} {...rest}>
      {inner}
    </motion.button>
  );
}
