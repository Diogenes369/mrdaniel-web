import { smoothScrollTo } from '../hooks/useLenis';

/**
 * Smoothly scrolls (via Lenis — the same virtual-scroll system driving the rest of the site, not
 * a raw `scrollIntoView` that would desync Lenis's own tracked position) so `selector` lands
 * roughly centered in the viewport, then flashes a 2.5s neon pulse around it plus a floating
 * "found here" badge that tracks the element's position for the full duration (covers both the
 * tail of the scroll animation settling and any layout shift), matching Lenis's own settle time.
 */
export function scrollToAndHighlight(selector: string) {
  // Some targets (e.g. ArchitectureBlueprint's layer cards) exist twice in the DOM — a desktop
  // and a mobile-only variant, toggled via CSS `hidden`/`md:hidden` rather than being
  // conditionally rendered — so a plain `querySelector` could return the currently-invisible one
  // (display:none, zero-size `getBoundingClientRect()`), scrolling nowhere. Picking the first
  // match with real layout dimensions handles both the normal single-match case and this one.
  const el = Array.from(document.querySelectorAll<HTMLElement>(selector)).find((candidate) => candidate.getClientRects().length > 0);
  if (!el) return;

  const rect = el.getBoundingClientRect();
  const centerOffset = -((window.innerHeight - rect.height) / 2);
  smoothScrollTo(el, centerOffset);

  el.classList.add('search-highlight-pulse');

  const badge = document.createElement('div');
  badge.textContent = 'נמצא כאן 🎯';
  badge.setAttribute('dir', 'rtl');
  badge.className =
    'fixed z-[200] -translate-x-1/2 px-3 py-1.5 rounded-full bg-[#0D0E12] border border-brand-500/50 text-brand-400 text-xs font-tech font-semibold shadow-[0_0_20px_rgba(0,255,102,0.45)] pointer-events-none transition-opacity duration-300';
  badge.style.opacity = '0';
  document.body.appendChild(badge);

  let raf = 0;
  const track = () => {
    const r = el.getBoundingClientRect();
    badge.style.top = `${r.top - 44}px`;
    badge.style.left = `${r.left + r.width / 2}px`;
    badge.style.opacity = '1';
    raf = requestAnimationFrame(track);
  };
  raf = requestAnimationFrame(track);

  window.setTimeout(() => {
    cancelAnimationFrame(raf);
    el.classList.remove('search-highlight-pulse');
    badge.style.opacity = '0';
    window.setTimeout(() => badge.remove(), 300);
  }, 2500);
}
