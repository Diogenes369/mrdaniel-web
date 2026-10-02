import Logo from './Logo';

interface ModalHeaderBannerProps {
  className?: string;
  /** Kept for call-site compatibility. The breathing glow it used to switch on is gone: the glyph
   * world has no glow, and a blinking caret already marks the banner as live. */
  pulse?: boolean;
}

/**
 * Shared top banner for every popup on the site (rewritten 2026-10-02 for the glyph world): the
 * logo on the ground, a sparse lattice of ink dots — the field's calm state — behind it, and a
 * dotted rule with a typing caret underneath. It replaced a grid texture with a pulsing green
 * radial glow and a glowing logo.
 */
export default function ModalHeaderBanner({ className = '' }: ModalHeaderBannerProps) {
  return (
    <div className={`relative h-24 w-full overflow-hidden bg-ground md:h-28 ${className}`}>
      <div
        className="absolute inset-0"
        aria-hidden="true"
        style={{
          backgroundImage: 'radial-gradient(rgba(143, 212, 0, 0.18) 0.9px, transparent 1.3px)',
          backgroundSize: '28px 36px',
          backgroundPosition: '3px 6px',
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <Logo iconClassName="h-8 md:h-9" />
      </div>
      <div className="absolute inset-x-6 bottom-3 flex items-center gap-2 md:inset-x-8" aria-hidden="true">
        <span className="story-statusbar__live" />
        <span className="h-px flex-1 border-t border-dotted border-[var(--color-rule)]" />
      </div>
    </div>
  );
}
