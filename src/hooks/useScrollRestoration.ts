import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { scrollToInstant, smoothScrollTo } from './useLenis';

/**
 * Global smart scroll restoration. Mounted once in App.
 *
 * - Continuously remembers `window.scrollY` per route path in sessionStorage
 *   (`scroll_pos_/`, `scroll_pos_/ai`, …), throttled + on tab hide / pagehide.
 * - On BACK / FORWARD navigation (react-router `navigationType === 'POP'`, which also covers the
 *   iOS Safari back-swipe and the Android back gesture — both dispatch popstate) it restores the
 *   saved position INSTANTLY, re-applying for a few frames so lazy content / images that grow the
 *   page don't strand the viewport short.
 * - On a fresh link click (PUSH / REPLACE) it starts the new page at the top.
 * - A `#hash` in the URL always wins — the anchor scroll runs instead.
 */

const PREFIX = 'scroll_pos_';
const storageKey = (path: string) => PREFIX + path;

function save(path: string, y: number) {
  try {
    sessionStorage.setItem(storageKey(path), String(Math.max(0, Math.round(y))));
  } catch {
    /* private mode / quota — restoration is a nice-to-have */
  }
}

function load(path: string): number | null {
  try {
    const raw = sessionStorage.getItem(storageKey(path));
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Apply `y` now, then keep nudging while the page's layout settles (fonts, images, lazy
 *  sections, GSAP ScrollTrigger.refresh). Stops early once we're within 2px of target. */
function restoreWithRetries(y: number) {
  let cancelled = false;
  const delays = [0, 16, 32, 64, 120, 220, 360, 550]; // ms after mount
  delays.forEach((d) => {
    window.setTimeout(() => {
      if (cancelled) return;
      if (Math.abs(window.scrollY - y) > 2) scrollToInstant(y);
    }, d);
  });
  return () => {
    cancelled = true;
  };
}

export function useScrollRestoration() {
  const location = useLocation();
  const navigationType = useNavigationType(); // 'POP' | 'PUSH' | 'REPLACE'
  const currentPathRef = useRef(location.pathname);

  // Take over the browser's own scroll restoration for the whole app lifetime — it's unreliable
  // and fights Lenis. Set unconditionally (no restore-on-cleanup: the app owns scroll throughout).
  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);

  // Keep the CURRENT route's scroll position fresh in sessionStorage.
  useEffect(() => {
    let lastWrite = 0;
    const remember = () => {
      const now = Date.now();
      if (now - lastWrite < 150) return; // light throttle
      lastWrite = now;
      save(currentPathRef.current, window.scrollY);
    };
    const flush = () => save(currentPathRef.current, window.scrollY);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    window.addEventListener('scroll', remember, { passive: true });
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('scroll', remember, true as never);
      window.removeEventListener('scroll', remember);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // On every route change: snapshot the outgoing route, then position the incoming one.
  useLayoutEffect(() => {
    const outgoing = currentPathRef.current;
    if (outgoing !== location.pathname) {
      save(outgoing, window.scrollY);
      currentPathRef.current = location.pathname;
    }

    // Anchor links keep their existing behaviour, but wait for the target to exist first.
    //
    // smoothScrollTo silently no-ops on a selector that matches nothing, and on a COLD load of a
    // deep link like `/#contact-portal` the homepage's lower sections have not mounted by the time
    // this effect runs — so the scroll was dropped and the visitor was left at the hero. Poll
    // briefly for the element (covers lazy sections and webfont/image reflow), then scroll.
    if (location.hash) {
      let tries = 0;
      const tryScroll = () => {
        let el: Element | null = null;
        try {
          el = document.querySelector(location.hash);
        } catch {
          return; // malformed hash — not a selector we can use
        }
        if (el) {
          smoothScrollTo(location.hash);
          return;
        }
        if (++tries < 25) window.setTimeout(tryScroll, 100); // give up after ~2.5s
      };
      tryScroll();
      return;
    }

    // Back / forward (incl. mobile swipe-back) → restore the saved position for this route.
    if (navigationType === 'POP') {
      const y = load(location.pathname);
      if (y != null && y > 0) {
        return restoreWithRetries(y);
      }
      // POP with nothing saved (e.g. first load of a fresh tab) → top.
      scrollToInstant(0);
      return;
    }

    // Fresh navigation (clicked a link / programmatic push) → start at the top.
    scrollToInstant(0);
  }, [location.pathname, location.hash, navigationType]);
}
