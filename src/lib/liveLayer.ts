/**
 * The live layer (2026-10-06): what scrolls into view arrives, on every device, phones included.
 * The desktop scene layer (sceneMotion.ts) tilts whole sections; this one moves the things inside
 * them, the way the Grok Bot deck builds a slide: lines rise, frames open from the reading start,
 * lists arrive one item after another, short machine labels resolve out of noise.
 *
 * Elements opt in with data-live:
 *   rise     fades up from below
 *   wipe     revealed right to left, the reading direction, by a clip
 *   frame    a frame opens from the reading start
 *   stagger  its children rise one after another
 *   decode   a short label resolves out of noise, letter by letter
 * On phones and tablets (where the scene layer is off) every section h2 also rises, so no page
 * sits still. Optional per element: data-live-delay (ms).
 *
 * IntersectionObserver and CSS transitions only: no scroll listener, no scrubbing, nothing pinned,
 * so it is safe in Instagram and Facebook webviews. html.live-on is set only once this runs, so a
 * page that never runs it hides nothing; reduced motion shows everything at once.
 */
const NOISE = 'אבגדהוזחטיכלמנסעפצקרשת=+:-';
const LETTER = /[א-תA-Za-z0-9]/;
const DESKTOP = '(min-width: 1024px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)';

function decode(el: HTMLElement) {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue?.trim()) nodes.push(n as Text);
  const orig = nodes.map((n) => n.nodeValue || '');
  const total = Math.max(1, orig.reduce((a, s) => a + [...s].length, 0));
  // Hold the final width while the noise runs, so nothing around the label moves.
  const w = el.getBoundingClientRect().width;
  if (w) el.style.minWidth = `${w}px`;
  const start = performance.now();
  const dur = Math.min(1100, 420 + total * 16);
  let last = 0;
  const step = (now: number) => {
    const p = (now - start) / dur;
    if (p >= 1) {
      nodes.forEach((n, k) => (n.nodeValue = orig[k]));
      el.style.minWidth = '';
      return;
    }
    if (now - last > 45) {
      last = now;
      let idx = 0;
      nodes.forEach((n, k) => {
        const chars = [...orig[k]];
        n.nodeValue = chars.map((c, i) => (!LETTER.test(c) || (idx + i) / total < p * 1.15 - 0.12 ? c : NOISE[Math.floor(Math.random() * NOISE.length)])).join('');
        idx += chars.length;
      });
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function mountLiveLayer(root: HTMLElement): () => void {
  if (typeof IntersectionObserver === 'undefined' || typeof window === 'undefined') return () => {};
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('motion-reduced');
  if (reduce) return () => {};

  // Phones and tablets: every section heading rises too (the desktop scene layer does its own).
  if (!window.matchMedia(DESKTOP).matches) {
    root.querySelectorAll<HTMLElement>('section h2').forEach((h) => {
      if (!h.dataset.live && !h.closest('[data-live]') && !h.closest('[role="dialog"]')) h.dataset.live = 'rise';
    });
  }

  const els = [...root.querySelectorAll<HTMLElement>('[data-live]')];
  if (!els.length) return () => {};
  els.forEach((el) => {
    if (el.dataset.live === 'stagger') [...el.children].forEach((c, i) => (c as HTMLElement).style.setProperty('--i', String(i)));
    if (el.dataset.liveDelay) el.style.setProperty('--live-delay', el.dataset.liveDelay);
  });
  document.documentElement.classList.add('live-on');

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        el.classList.add('is-live');
        if (el.dataset.live === 'decode') decode(el);
        // The reveal mask has done its job: drop it, so the element composites like any other.
        if (el.dataset.live === 'wipe' || el.dataset.live === 'frame') window.setTimeout(() => el.classList.add('is-done'), 1400 + Number(el.dataset.liveDelay || 0));
        io.unobserve(el);
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
  );
  els.forEach((el) => io.observe(el));

  // Content that arrives later (news, the model board) can carry data-live too.
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        const found = n.matches('[data-live]') ? [n] : [...n.querySelectorAll<HTMLElement>('[data-live]')];
        found.forEach((el) => {
          if (el.classList.contains('is-live')) return;
          if (el.dataset.live === 'stagger') [...el.children].forEach((c, i) => (c as HTMLElement).style.setProperty('--i', String(i)));
          io.observe(el);
        });
      });
    }
  });
  mo.observe(root, { childList: true, subtree: true });

  return () => {
    io.disconnect();
    mo.disconnect();
  };
}
