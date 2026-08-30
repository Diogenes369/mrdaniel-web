import { useEffect } from 'react';
import Lenis from 'lenis';
import { gsap, ScrollTrigger, prefersReducedMotion } from '../lib/gsap';

/** Framerate-independent exponential-decay smoothing — same formula as `THREE.MathUtils.damp`,
 * reimplemented here (rather than importing `three`) so this hook — used eagerly by `App.tsx`,
 * unlike the lazy-loaded 3D scene — doesn't drag Three.js into the main bundle. */
function damp(x: number, y: number, lambda: number, dt: number) {
  return x + (y - x) * (1 - Math.exp(-lambda * dt));
}

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

/**
 * Cheap per-frame read of current scroll progress (0..1) and velocity, sourced from Lenis's own
 * internally-cached values (it already recomputes these against the live document height via its
 * own ResizeObserver, so this is always correct for whatever route/page is currently mounted —
 * no manual ScrollTrigger.refresh() coordination needed). Falls back to a direct DOM read when
 * Lenis isn't active (reduced-motion). Safe to call every frame from useFrame.
 */
export function getScrollState(): { progress: number } {
  if (lenisInstance) {
    return { progress: lenisInstance.progress || 0 };
  }
  if (typeof window === 'undefined') return { progress: 0 };
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return { progress: max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0 };
}

let dampedProgress = 0;
let dampedVelocity = 0;
let lastRawScrollPx = 0;
let hasLastRawScrollPx = false;

/**
 * Advances the damped scroll values by one frame — call exactly once per rendered frame (see
 * `ScrollDamper` in SceneObjects.tsx). Uses the same framerate-independent exponential-decay
 * filter as `THREE.MathUtils.damp` (equivalent in spirit to a `scrub`), so a single noisy/spiky
 * velocity reading (e.g. one hard trackpad flick) can no longer translate into a one-frame jump
 * in 3D rotation/position speed.
 *
 * Velocity is deliberately NOT read from Lenis's own `.velocity` property — on-device telemetry
 * confirmed it's unreliable on iOS: reading Lenis's source, its native-scroll path only recomputes
 * velocity on each `scroll` event (which iOS delivers sparsely during momentum) and resets it to 0
 * via a 400ms timeout between events, while its synced-touch path calls `scrollTo(..., {lerp: 1})`
 * on every touchmove — an "instant" (single-tick) animation whose completion handler immediately
 * calls `reset()`, zeroing velocity again within the same tick it was just set. Either way, sampling
 * it once per rendered frame (as this code does) reads mostly/always 0 on iOS even while genuinely
 * scrolling fast — confirmed by telemetry showing a stable 55-60fps render loop with permanently
 * zero velocity. `progress` itself is unaffected (Lenis derives it from `animatedScroll` directly,
 * no event-driven reset logic) and confirmed reliable by the same telemetry, so velocity is instead
 * derived here from progress's own frame-to-frame movement — a signal that doesn't depend on any of
 * Lenis's internal event/timeout machinery, and is in the same rough "pixels moved since last
 * sample" scale Lenis's own velocity used, so every existing velocity-driven tuning constant
 * elsewhere keeps behaving the same. Used on every platform, not just iOS, for one consistent path.
 */
export function dampScrollState(delta: number) {
  const raw = getScrollState();
  const scrollableHeight = typeof window !== 'undefined' ? document.documentElement.scrollHeight - window.innerHeight : 0;
  const rawScrollPx = scrollableHeight > 0 ? raw.progress * scrollableHeight : 0;
  const rawVelocity = hasLastRawScrollPx ? rawScrollPx - lastRawScrollPx : 0;
  lastRawScrollPx = rawScrollPx;
  hasLastRawScrollPx = true;

  dampedProgress = damp(dampedProgress, raw.progress, 14, delta);
  dampedVelocity = damp(dampedVelocity, rawVelocity, 5, delta);
}

/** Smoothed read of scroll progress/velocity for anything driving continuous 3D motion — prefer
 * this over `getScrollState` inside `useFrame` loops; `getScrollState` remains the raw source of
 * truth that `dampScrollState` itself reads from. */
export function getSmoothScrollState(): { progress: number; velocity: number } {
  return { progress: dampedProgress, velocity: dampedVelocity };
}

let pulseTarget = 0;
let pulseValue = 0;

/** Call on every route change (see `RouteScrollManager` in App.tsx) to give the 3D layer a brief,
 * smooth "the page is transitioning" signal — TravelingRing blends this into its position to pull
 * floating assets gently toward center as content changes, rather than a hard cut. Deliberately
 * NOT a GSAP-scrubbed 3D animation (see the architecture note on `ScrollDamper`): it's just one
 * more time-driven value, advanced every frame by `dampScrollState`'s ScrollDamper alongside
 * everything else, so it composes with idle motion and scroll exactly the same way they compose
 * with each other. */
export function triggerRouteTransitionPulse() {
  pulseTarget = 1;
}

/** Advances the transition pulse by one frame — called from the same `ScrollDamper` driver that
 * advances the damped scroll state. `pulseTarget` itself decays back toward 0 shortly after being
 * triggered (so it reads as a pulse, not a toggle), and `pulseValue` chases it smoothly. */
export function advanceTransitionPulse(delta: number) {
  pulseTarget = damp(pulseTarget, 0, 1.8, delta);
  pulseValue = damp(pulseValue, pulseTarget, 4, delta);
}

export function getTransitionPulse(): number {
  return pulseValue;
}
