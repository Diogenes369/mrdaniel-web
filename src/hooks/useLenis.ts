import { useEffect } from 'react';
import Lenis from 'lenis';
import { gsap, ScrollTrigger, prefersReducedMotion } from '../lib/gsap';

let lenisInstance: Lenis | null = null;

/** Wires Lenis smooth-scroll into GSAP's ticker so ScrollTrigger stays in sync with the virtual scroll position. */
export function useLenis() {
  useEffect(() => {
    if (prefersReducedMotion()) return;

    // Touch devices (phones/tablets, Android especially): let the NATIVE scroll engine drive.
    // JS-driven smooth scroll fights the browser's URL-bar auto-hide and causes scroll jumps /
    // flicker on mobile. `lenisInstance` stays null and every helper here already has a native
    // fallback; ScrollTrigger updates itself off native scroll events. Desktop keeps Lenis.
    if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) return;

    // syncTouch intentionally left at Lenis's default (off) on every platform, including iOS —
    // a previous attempt turned it on for iOS specifically to try to fix Lenis's `.velocity`
    // reporting, but reading Lenis's source showed that doesn't actually help (see the long
    // comment on dampScrollState below for why), and syncTouch:true replaces iOS's native
    // momentum-scroll physics with Lenis's own JS-driven scrolling — a real feel change with no
    // upside now that velocity is derived independently of Lenis's own property (below), so it's
    // reverted rather than kept as a no-op risk.
    const lenis = new Lenis({
      duration: 1.05,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      touchMultiplier: 1.4,
      wheelMultiplier: 1,
    });
    lenisInstance = lenis;

    lenis.on('scroll', ScrollTrigger.update);

    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // Re-measure ScrollTrigger's pin/trigger offsets once the full page (all sections, images,
    // fonts) has settled — a stale measurement here is a common cause of scroll stutter/jump.
    const refreshId = requestAnimationFrame(() => ScrollTrigger.refresh());

    return () => {
      cancelAnimationFrame(refreshId);
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenisInstance = null;
    };
  }, []);
}

/** Subscribe to Lenis's scroll velocity (px per frame, signed). Desktop only — on touch devices
 * Lenis is off and this is a no-op, which is exactly where velocity effects should not run. */
export function onLenisScroll(cb: (velocity: number) => void): () => void {
  const lenis = lenisInstance;
  if (!lenis) return () => {};
  const handler = (l: Lenis) => cb(l.velocity);
  return lenis.on('scroll', handler);
}

/** Buttery-smooth scroll to a section (by selector or element), synced to the same Lenis/ScrollTrigger loop that drives the 3D scene. Falls back to native smooth-scroll when Lenis isn't active (reduced-motion). */
export function smoothScrollTo(target: string | HTMLElement, offsetPx = -88) {
  if (lenisInstance) {
    lenisInstance.scrollTo(target, { offset: offsetPx, duration: 1.3 });
    return;
  }
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Jump to an exact Y position with no animation, routed through Lenis so its rAF loop doesn't
 *  immediately override a raw `window.scrollTo`. Used by scroll restoration on back/forward. */
export function scrollToInstant(y: number) {
  if (lenisInstance) {
    lenisInstance.scrollTo(Math.max(0, y), { immediate: true, force: true });
    return;
  }
  window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
}

export function scrollToTopInstant() {
  scrollToInstant(0);
}

/** Smooth "back to top" — e.g. clicking the logo while already on the current page. Routed through
 * Lenis (like every other programmatic scroll here) so it doesn't fight the library's own scroll
 * loop; falls back to a plain native smooth scroll when Lenis isn't active (reduced-motion). */
export function scrollToTopSmooth() {
  if (lenisInstance) {
    lenisInstance.scrollTo(0, { duration: 1.2 });
    return;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
