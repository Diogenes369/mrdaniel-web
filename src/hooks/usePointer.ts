import { useEffect } from 'react';

let px = 0;
let py = 0;
let pvx = 0;
let pvy = 0;
let lastX = 0;
let lastY = 0;
let lastT = 0;
let lastMoveAt = 0;

/** Normalized (-1..1) pointer position AND instantaneous velocity (units/sec), updated by a
 * window-level listener since the 3D canvas itself has pointer-events:none (so it never blocks
 * page scroll/clicks) — R3F's own built-in pointer tracking never fires on it, hence this
 * standalone tracker. Works for touch too, since `pointermove` is a unified Pointer Event and the
 * listener sits on `window`, which always receives it regardless of what element is under the
 * finger. Velocity decays smoothly toward 0 on its own rAF loop so a stopped cursor doesn't leave
 * scene objects "stuck" spinning from a stale last-known speed. */
export function getPointerState() {
  return { x: px, y: py, vx: pvx, vy: pvy };
}

/** Milliseconds since the last real pointer/touch movement — `Infinity` before the first move ever
 * happens (e.g. a touch device that's only scrolled, never dragged). Used to blend scene bodies
 * into an idle "no one's driving" wander once this crosses a threshold — see `idleBlend` in
 * SceneObjects.tsx. */
export function getPointerIdleMs(): number {
  return lastMoveAt ? performance.now() - lastMoveAt : Infinity;
}

export function usePointerTracking() {
  useEffect(() => {
    let raf = 0;

    // The velocity-decay loop only needs to run while there's velocity left to decay. It parks
    // itself once |v| is negligible (≈ every frame the pointer is still) and is re-kicked by the
    // next real move — so a stationary cursor costs zero rAF work instead of an always-on loop
    // multiplying two numbers by 0.9 forever.
    const decay = () => {
      pvx *= 0.9;
      pvy *= 0.9;
      if (Math.abs(pvx) + Math.abs(pvy) < 1e-4) {
        pvx = pvy = 0;
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(decay);
    };

    const onMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      const now = performance.now();
      const dt = lastT ? (now - lastT) / 1000 : 0;
      if (dt > 0.001) {
        pvx = (nx - lastX) / dt;
        pvy = (ny - lastY) / dt;
      }
      px = nx;
      py = ny;
      lastX = nx;
      lastY = ny;
      lastT = now;
      lastMoveAt = now;
      if (!raf) raf = requestAnimationFrame(decay);
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
}
