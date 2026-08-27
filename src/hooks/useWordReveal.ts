import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../lib/gsap';
import { isMotionV2Enabled } from '../lib/motionFlag';

/**
 * Wraps every word of the element's text content in a nested overflow-hidden mask span, then
 * reveals/hides it via a `.in` class toggled by an IntersectionObserver — see the matching `.sp`/
 * `.wd` CSS in index.css. Ported from the Latitude teardown's word-mask technique: a mask reads as
 * "the word was put there," not "it faded in," and is the single biggest lever for a premium-feeling
 * text reveal for near-zero runtime cost (the animation itself is pure CSS transform, no JS per
 * frame).
 *
 * A no-op (does not touch the DOM at all) unless the `?motion=2d` preview flag is on — see
 * motionFlag.ts. This keeps every existing page byte-for-byte unchanged for every real visitor;
 * only content that explicitly opts in via this hook, on a flag-gated preview, is affected.
 */
function splitIntoWordMasks(el: HTMLElement) {
  // Idempotent: React 18 StrictMode double-invokes effects in dev, and this hook may also legitimately
  // re-run if the element's text content changes — never wrap already-wrapped words a second time.
  if (el.dataset.wordSplit === '1') return;
  el.dataset.wordSplit = '1';

  let index = 0;
  const walk = (node: Node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? '';
        if (!text.trim()) return;
        const frag = document.createDocumentFragment();
        text.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) {
            frag.appendChild(document.createTextNode(' '));
            return;
          }
          const mask = document.createElement('span');
          mask.className = 'sp';
          const word = document.createElement('span');
          word.className = 'wd';
          word.textContent = part;
          // Capped at 24 words so a long paragraph doesn't leave the last words waiting nearly a
          // full second to start — matches the teardown's own stagger ceiling.
          word.style.setProperty('--wd', `${Math.min(index++, 24) * 32}ms`);
          mask.appendChild(word);
          frag.appendChild(mask);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    });
  };
  walk(el);
}

export function useWordReveal<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !isMotionV2Enabled() || prefersReducedMotion()) return;

    splitIntoWordMasks(el);

    const io = new IntersectionObserver(
      ([entry]) => el.classList.toggle('in', entry.isIntersecting),
      // Matches the teardown's 6%/94% viewport trigger band — comfortably inside the fold on
      // both edges, rather than triggering the instant a single pixel crosses the edge.
      { rootMargin: '-6% 0px -6% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return ref;
}
