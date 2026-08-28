const STORAGE_KEY = 'lat-motion-v2';

/**
 * Per-visitor switch for the Latitude-inspired motion system (Canvas2D particle field background,
 * cosmic starfield, custom cursor).
 *
 * Routing:
 *   • `?motion=2d`   → force ON  and remember it for this browser (survives client-side nav).
 *   • `?motion=off`  → force OFF and remember it (an explicit opt-out that sticks — even on mobile).
 *   • otherwise      → the remembered choice if there is one, else the DEFAULT:
 *                        - mobile / small touch viewports  → ON  (no URL param needed)
 *                        - desktop                          → OFF (standard behaviour)
 *
 * Deliberately a runtime/localStorage switch, not a build-time flag, so the preview and the
 * per-visitor opt-out both work on the live build with no redeploy.
 */

/** Phone- or small-tablet-class viewport: a narrow screen, or a touch device that isn't a
 * full-size desktop. Used only to pick the default when the visitor has expressed no preference. */
function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const mm = window.matchMedia.bind(window);
    const narrow = mm('(max-width: 767px)').matches;
    const touchAndSmall = mm('(pointer: coarse)').matches && mm('(max-width: 1024px)').matches;
    return narrow || touchAndSmall;
  } catch {
    return typeof window.innerWidth === 'number' && window.innerWidth < 768;
  }
}

export function isMotionV2Enabled(): boolean {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(window.location.search).get('motion');

  try {
    if (q === '2d') {
      localStorage.setItem(STORAGE_KEY, '1');
      return true;
    }
    if (q === 'off') {
      localStorage.setItem(STORAGE_KEY, '0'); // explicit opt-out — persists over the mobile default
      return false;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
    return isMobileViewport(); // no stored preference → mobile defaults ON, desktop OFF
  } catch {
    // Private browsing / storage disabled — honour the URL, then fall back to the viewport default.
    if (q === '2d') return true;
    if (q === 'off') return false;
    return isMobileViewport();
  }
}
