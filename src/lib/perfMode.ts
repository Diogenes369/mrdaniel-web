/**
 * One boot-time read of how much visual work this device should be asked to do, published as
 * classes on <html> so CSS can degrade without a React re-render, and as plain getters for the few
 * components (Scene3D, TiltCard) that decide in JS.
 *
 *   html.perf-lite      touch-first device, Save-Data, or weak hardware. CSS drops the SVG
 *                       feTurbulence grain and halves backdrop blur; JS turns off bloom and the
 *                       mouse-driven tilt (there is no hover to drive it on a phone anyway).
 *   html.motion-reduced prefers-reduced-motion. No WebGL scene at all, no scroll-linked 3D, every
 *                       looping CSS animation stopped. This is a vestibular accessibility setting,
 *                       so the static page IS the intended experience, not a fallback.
 *
 * Read ONCE: a phone does not become a desktop mid-session, and re-deciding on resize would tear
 * down and rebuild the WebGL context for nothing. The reduced-motion query is the one exception
 * worth listening to, since a user can flip it in OS settings with the tab open.
 */

type NavigatorHints = Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };

function mq(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

export function isReducedMotion(): boolean {
  return mq('(prefers-reduced-motion: reduce)');
}

export function isSaveData(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (navigator as NavigatorHints).connection?.saveData === true;
}

/** A device with no precise hovering pointer: phones, tablets, most IG/FB in-app webviews. */
export function isTouchFirst(): boolean {
  return !mq('(hover: hover) and (pointer: fine)');
}

/** Few cores or little RAM. hardwareConcurrency is capped by WebKit for anti-fingerprinting, so it
 * is only trusted together with deviceMemory's absence-safe default (see useDeviceTier.ts). */
export function isWeakHardware(): boolean {
  if (typeof navigator === 'undefined') return false;
  const n = navigator as NavigatorHints;
  return (n.deviceMemory ?? 8) <= 2 || ((n.hardwareConcurrency ?? 8) <= 2);
}

export function isPerfLite(): boolean {
  return isTouchFirst() || isSaveData() || isWeakHardware();
}

/** Whether the fixed WebGL background should mount at all. Touch devices with capable hardware
 * keep it (it is the site's identity, and useDeviceTier already trims it there); reduced motion,
 * Save-Data and weak hardware get the static CSS glow that sits under it anyway. */
export function shouldMountScene(): boolean {
  return !isReducedMotion() && !isSaveData() && !isWeakHardware();
}

export function initPerfMode(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const apply = () => {
    root.classList.toggle('perf-lite', isPerfLite());
    root.classList.toggle('motion-reduced', isReducedMotion());
  };
  apply();
  try {
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', apply);
  } catch {
    // Safari < 14 only has addListener; the boot-time value is still correct there.
  }
}
