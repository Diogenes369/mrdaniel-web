import type { Transition } from 'motion/react';

/**
 * One motion language for every popup on the site — modals, dialogs, slide-overs (2026-10-02).
 *
 * The panel draws itself open from the top edge down, like a terminal window being painted
 * (a clip-path wipe on an expo-out curve), while its position and scale settle on a spring, so it
 * lands with a little weight instead of fading in. Closing is quicker than opening and accelerates
 * away — the visitor asked it to leave. The backdrop is a plain fade.
 *
 * The clip box is inflated by 30% on every side when open, so the panel's registration outline and
 * deep shadow (`.modal-panel` in index.css) are never cut off; only the bottom edge animates.
 */
const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const EASE_IN = [0.7, 0, 0.84, 0] as const;

export const MODAL_SPRING: Transition = { type: 'spring', stiffness: 340, damping: 30, mass: 0.85 };

const CLOSED = 'inset(-30% -30% 100% -30%)';
const OPEN = 'inset(-30% -30% -30% -30%)';

export const backdropMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.24, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: 0.18, ease: EASE_IN } },
};

export const panelMotion = {
  initial: { opacity: 0, y: 26, scale: 0.975, clipPath: CLOSED },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    clipPath: OPEN,
    transition: { default: MODAL_SPRING, opacity: { duration: 0.16 }, clipPath: { duration: 0.5, ease: EASE_OUT } },
  },
  exit: { opacity: 0, y: 14, scale: 0.985, clipPath: CLOSED, transition: { duration: 0.22, ease: EASE_IN } },
};
