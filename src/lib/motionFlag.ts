const STORAGE_KEY = 'lat-motion-v2';

/**
 * Runtime, per-visitor preview switch for the experimental Latitude-inspired motion system
 * (Canvas2D field background, custom cursor, word-mask reveals) — OFF for every visitor by
 * default, everywhere, including production. Visiting any page with `?motion=2d` once flips it on
 * for that browser (persisted via localStorage so it survives client-side route navigation, where
 * the query string itself doesn't carry over); `?motion=off` clears it again. Deliberately NOT an
 * environment/build-time flag — this has to be toggleable by one person previewing the live build
 * without a redeploy and without affecting any other visitor.
 */
export function isMotionV2Enabled(): boolean {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(window.location.search).get('motion');
  try {
    if (q === '2d') {
      localStorage.setItem(STORAGE_KEY, '1');
      return true;
    }
    if (q === 'off') {
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Private browsing / storage disabled — fall back to whatever this exact URL says.
    return q === '2d';
  }
}
