import type React from 'react';
import type { ReactNode } from 'react';
import GlyphButton from './ui/GlyphButton';

type Variant = 'primary' | 'glass' | 'ghost';

interface WebButtonProps {
  children: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => void;
  variant?: Variant;
  /** Kept for call-site compatibility; the glyph button's own springs replace the magnetic pull. */
  magnetic?: boolean;
  className?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
  href?: string;
  target?: string;
  rel?: string;
  'aria-label'?: string;
}

/**
 * The legacy button API, rendered as the site's one button since 2026-10-01 (GlyphButton): sharp
 * rectangle, corner registration ticks, spring press, a ripple through the glyph field. `primary`
 * is the filled glyph button; `glass` and `ghost` are the line variant whose fill types in on
 * hover. Kept as a wrapper so the existing call sites inherit the new button without each one
 * being rewritten.
 */
export default function WebButton({ children, onClick, variant = 'glass', magnetic: _magnetic, ...rest }: WebButtonProps) {
  return (
    <GlyphButton
      variant={variant === 'primary' ? 'primary' : 'line'}
      onClick={onClick as ((e: React.MouseEvent<HTMLElement>) => void) | undefined}
      {...rest}
    >
      {children}
    </GlyphButton>
  );
}
