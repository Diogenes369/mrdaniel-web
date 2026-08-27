import { gsap, ScrollTrigger } from './gsap';

export type A11yLang = 'he' | 'en';
export type A11yContrast = 'none' | 'high' | 'invert' | 'mono';
export const TEXT_SCALES = [100, 110, 120, 130] as const;
export type A11yTextScale = (typeof TEXT_SCALES)[number];

export interface A11yPrefs {
  lang: A11yLang;
  textScale: A11yTextScale;
  contrast: A11yContrast;
  readableFont: boolean;
  highlightLinks: boolean;
  stopAnimations: boolean;
  largeCursor: boolean;
}

const STORAGE_KEY = 'a11y_prefs_v1';

const DEFAULT_PREFS: A11yPrefs = {
  lang: 'he',
  textScale: 100,
  contrast: 'none',
  readableFont: false,
  highlightLinks: false,
  stopAnimations: false,
  largeCursor: false,
};

function loadPrefs(): A11yPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_PREFS }; // private browsing / storage disabled — fall back to defaults
  }
}

let prefs: A11yPrefs = typeof window !== 'undefined' ? loadPrefs() : { ...DEFAULT_PREFS };
const listeners = new Set<(p: A11yPrefs) => void>();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* private browsing — preference just won't survive a reload */
  }
}

/** Applies every preference to the DOM as classes/CSS vars on <html> — deliberately NOT via
 * `filter`/`transform` on a shared ancestor (that would create a new CSS containing block for
 * every `position: fixed` descendant, including GSAP ScrollTrigger's pinned sections, which use
 * fixed positioning under the hood on this site's native-scroll setup, and would silently break
 * every fixed/pinned element the moment a contrast mode is toggled on). Grayscale/invert instead
 * use a blend-mode overlay (see `.a11y-color-overlay` in index.css) and high-contrast uses real
 * color overrides — both sidestep that trap entirely. */
function applyToDom(p: A11yPrefs) {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;

  html.style.setProperty('--a11y-scale', String(p.textScale / 100));

  html.classList.toggle('a11y-contrast-high', p.contrast === 'high');
  html.classList.toggle('a11y-contrast-invert', p.contrast === 'invert');
  html.classList.toggle('a11y-contrast-mono', p.contrast === 'mono');

  html.classList.toggle('a11y-readable-font', p.readableFont);
  html.classList.toggle('a11y-highlight-links', p.highlightLinks);
  html.classList.toggle('a11y-large-cursor', p.largeCursor);

  html.classList.toggle('a11y-stop-motion', p.stopAnimations);
  if (p.stopAnimations) {
    gsap.globalTimeline.pause();
  } else {
    gsap.globalTimeline.resume();
  }
}

/** Pinned/scroll-triggered sections measure real pixel positions — a text-scale or font change can
 * shift element sizes enough to desync those measurements, so re-measure shortly after paint
 * settles. Mirrors the same `ScrollTrigger.refresh()` call `RouteScrollManager` already does after
 * route changes. */
function refreshScrollTrigger() {
  requestAnimationFrame(() => requestAnimationFrame(() => ScrollTrigger.refresh()));
}

export function getA11yPrefs(): A11yPrefs {
  return prefs;
}

export function setA11yPrefs(patch: Partial<A11yPrefs>) {
  const layoutAffecting = 'textScale' in patch || 'readableFont' in patch;
  prefs = { ...prefs, ...patch };
  applyToDom(prefs);
  persist();
  listeners.forEach((fn) => fn(prefs));
  if (layoutAffecting) refreshScrollTrigger();
}

export function resetA11yPrefs() {
  prefs = { ...DEFAULT_PREFS, lang: prefs.lang };
  applyToDom(prefs);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* private browsing — nothing to persist */
  }
  listeners.forEach((fn) => fn(prefs));
  refreshScrollTrigger();
}

export function subscribeA11y(fn: (p: A11yPrefs) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Applies whatever was saved in localStorage as early as possible (called once from `main.tsx`
 * before React mounts) so the page never flashes unstyled content before the widget itself loads. */
export function initA11y() {
  applyToDom(prefs);
}
