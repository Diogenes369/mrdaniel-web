import { useEffect, useRef, useState } from 'react';
import { getPointerState, usePointerTracking } from '../hooks/usePointer';
import { prefersReducedMotion } from '../lib/gsap';

/**
 * Contextual custom cursor — ported from the Latitude teardown's frosted-circle-with-label
 * technique (the one glassmorphic surface on that whole site, used once, deliberately). Only ever
 * rendered when the `?motion=2d` preview flag is on (see App.tsx); calls its own
 * `usePointerTracking()` rather than relying on Scene3D having done it, since in preview mode
 * Scene3D isn't mounted at all.
 *
 * Any element on the page can opt in with `data-cursor="Label text"` — mirrors Latitude's own
 * `data-cur` convention.
 */
export default function Cursor() {
  const ref = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState('');
  const [on, setOn] = useState(false);
  usePointerTracking();

  useEffect(() => {
    if (!matchMedia('(pointer:fine)').matches || prefersReducedMotion()) return;
    let raf = 0;
    let lastHoverAt = 0;
    let lastPx = -1, lastPy = -1;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const { x, y } = getPointerState(); // already -1..1 normalized (see usePointer.ts)
      const px = ((x + 1) / 2) * window.innerWidth;
      const py = ((y + 1) / 2) * window.innerHeight;
      // Skip the style write (and its layer-transform recalc) on frames where the pointer hasn't
      // actually moved — the common case when the user is reading, not moving the mouse.
      if (ref.current && (px !== lastPx || py !== lastPy)) {
        ref.current.style.transform = `translate3d(${px}px,${py}px,0)`;
        lastPx = px;
        lastPy = py;
      }

      // Re-evaluate what's under the cursor at most ~every 70ms, not every frame — this is a DOM
      // read (elementFromPoint), not a cheap math op, and the label doesn't need per-frame precision.
      if (now - lastHoverAt < 70) return;
      lastHoverAt = now;
      const hit = document.elementFromPoint(px, py)?.closest<HTMLElement>('[data-cursor]');
      setOn((prevOn) => {
        const next = !!hit;
        if (next && hit && hit.dataset.cursor !== undefined) setLabel(hit.dataset.cursor);
        return next === prevOn ? prevOn : next; // avoid a redundant state write/re-render
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (prefersReducedMotion()) return null;

  return (
    <div ref={ref} className={`motion-cursor${on ? ' on' : ''}`} aria-hidden="true">
      <span className="bubble">{label}</span>
    </div>
  );
}
