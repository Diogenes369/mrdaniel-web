import { useEffect } from 'react';

/**
 * Reference-counted page scroll lock, shared by every overlay on the site (modals, the mobile nav
 * drawer, the assistant widget, mobile term tooltips, the terminal).
 *
 * ROOT-CAUSE FIX: each overlay used to run its own `const prev = document.body.style.overflow;
 * document.body.style.overflow = 'hidden'` effect and restore `prev` on close. That is only correct
 * for ONE overlay at a time. As soon as two overlapped — tapping a `TermTooltip` term chip inside a
 * card, opening the lead form from a card CTA while the mobile drawer is up, the assistant over a
 * modal — the inner overlay captured `'hidden'` as its "previous" value and wrote `'hidden'` back
 * on close. The page then stayed scroll-locked until a full reload, which is exactly the reported
 * "touching a card stops the page scrolling" symptom on phones.
 *
 * A single module-level counter fixes it: the FIRST lock records the real pre-lock value, and only
 * the LAST release restores it. Nested and interleaved overlays are both safe, and an overlay that
 * unmounts without closing cleanly still decrements through its effect cleanup.
 */

let lockCount = 0;
let savedOverflow: string | null = null;

/** Locks page scroll while `active` is true. Safe to call from any number of components at once. */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;

    if (lockCount === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        document.body.style.overflow = savedOverflow ?? '';
        savedOverflow = null;
      }
    };
  }, [active]);
}

export default useBodyScrollLock;
