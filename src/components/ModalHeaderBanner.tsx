import { motion } from 'motion/react';
import Logo from './Logo';

interface ModalHeaderBannerProps {
  className?: string;
  /** Continuous breathing glow behind the logo, instead of a static one — reserved for the one
   * modal that should visually announce itself as different from the rest (see
   * AgentQualificationModal.tsx), so it stays a meaningful signal rather than becoming the norm. */
  pulse?: boolean;
}

/**
 * Shared top banner for every popup/modal on the site — replaces the old per-modal flat color
 * strip (and, on the agent-qualifier modal, a hotlinked stock photo) with the brand mark itself:
 * the same faint green grid texture already used on the footer (`.footer-grid` in index.css, so
 * this reads as the same design language rather than a new one), a soft brand-green radial glow,
 * and the centered logo — faded to the modal's own background color at the bottom so the banner
 * and the content below it read as one continuous surface, not a pasted-on header image.
 */
export default function ModalHeaderBanner({ className = '', pulse = false }: ModalHeaderBannerProps) {
  return (
    <div className={`relative h-24 md:h-28 w-full overflow-hidden bg-[#0D0E12] ${className}`}>
      <div className="footer-grid absolute inset-0" aria-hidden="true" />
      {pulse ? (
        <motion.div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 60% 80% at 50% 20%, rgba(118,185,0,0.28), transparent 70%)' }}
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 80% at 50% 20%, rgba(118,185,0,0.18), transparent 70%)' }} aria-hidden="true" />
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        <Logo iconClassName="h-8 md:h-9" className="drop-shadow-[0_0_18px_rgba(118,185,0,0.5)]" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-[#0D0E12] via-transparent to-transparent" aria-hidden="true" />
    </div>
  );
}
