import { gsap, ScrollTrigger } from './gsap';
import { SplitText } from 'gsap/SplitText';
import { onLenisScroll } from '../hooks/useLenis';

gsap.registerPlugin(SplitText);

/**
 * The desktop scene layer (2026-10-01): every page's sections hand over to each other as layers
 * in depth instead of simply scrolling past.
 *
 *   Headings  — each section's h2 rises line by line out of its own mask, once, as it arrives.
 *   Enter     — a section's content tilts up out of depth (rotateX + y + opacity), scrubbed with lag
 *               so it trails the hand a beat, like something with mass.
 *   Exit      — the section that is leaving recedes: it drifts up, shrinks a touch and dims, so the
 *               next one visibly slides over it.
 *   Velocity  — scroll speed bends every section (skewY), and it springs back when the wheel stops.
 *
 * Desktop with a fine pointer and no reduced-motion preference ONLY. Phones and in-app webviews
 * keep plain native scroll (no pinning, no scrubbed transforms): that is where pinned/scrubbed
 * sections break, and where the battery is the visitor's. Nothing here pins anything.
 */
const DESKTOP = '(min-width: 1024px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)';

/** Top-level sections only: a section nested in another section moves with its parent. */
function scenes(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('section')].filter((s) => !s.parentElement?.closest('section'));
}

export function mountSceneMotion(root: HTMLElement): () => void {
  const mm = gsap.matchMedia();

  mm.add(DESKTOP, () => {
    const sections = scenes(root);

    // Headings: lines rise out of a mask. Re-split automatically when the headline webfont lands
    // or the width changes, so the lines are always the real lines.
    root.querySelectorAll<HTMLElement>('section h2').forEach((h) => {
      if (h.closest('[role="dialog"]') || h.dataset.noReveal !== undefined) return;
      SplitText.create(h, {
        type: 'lines',
        mask: 'lines',
        autoSplit: true,
        onSplit: (self) =>
          gsap.from(self.lines, {
            yPercent: 118,
            duration: 1.15,
            ease: 'expo.out',
            stagger: 0.09,
            scrollTrigger: { trigger: h, start: 'top 88%', once: true },
          }),
      });
    });

    sections.forEach((section, i) => {
      const inner = (section.querySelector(':scope > .container-wide') as HTMLElement | null) ?? (section.firstElementChild as HTMLElement | null);

      // Enter: not for the first section — it is already on screen when the page opens.
      if (inner && i > 0) {
        gsap.set(inner, { transformPerspective: 1400, transformOrigin: '50% 0%' });
        gsap.fromTo(
          inner,
          { y: 110, rotateX: 7, opacity: 0.2 },
          {
            y: 0,
            rotateX: 0,
            opacity: 1,
            ease: 'none',
            scrollTrigger: { trigger: section, start: 'top 100%', end: 'top 42%', scrub: 1 },
          }
        );
      }

      // Exit: the outgoing layer recedes while the next one rises over it.
      gsap.fromTo(
        section,
        { y: 0, scale: 1, opacity: 1 },
        {
          y: -56,
          scale: 0.965,
          opacity: 0.32,
          ease: 'none',
          immediateRender: false,
          scrollTrigger: { trigger: section, start: 'bottom 58%', end: 'bottom 4%', scrub: 1 },
        }
      );
    });

    // Velocity: bend with the wheel, spring back when it stops.
    const benders = sections.map((s) => gsap.quickTo(s, 'skewY', { duration: 0.55, ease: 'power3.out' }));
    const off = onLenisScroll((velocity) => {
      const skew = gsap.utils.clamp(-2.2, 2.2, velocity * -0.06);
      benders.forEach((bend) => bend(skew));
    });

    // Content that lands after mount (news, model lists) changes section heights: re-measure.
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => ScrollTrigger.refresh());
    });
    ro.observe(root);

    return () => {
      off();
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  });

  return () => mm.revert();
}
