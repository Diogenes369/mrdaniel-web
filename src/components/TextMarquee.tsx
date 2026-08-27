import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../lib/gsap';

/**
 * Dual-row edge-to-edge text ticker — replicated from a live-verified section of
 * latitudeform.com: two full-width infinite marquee bands, rows scrolling in opposite
 * directions, that idle at a calm ambient pace and visibly speed up while the visitor is
 * actively scrolling the page (then ease back down once they stop).
 *
 * Deliberately NOT a CSS @keyframes animation — a fixed-duration CSS loop can't be sped up
 * dynamically frame-to-frame in response to scroll velocity, so this drives its own
 * requestAnimationFrame loop instead (same vanilla, dependency-free approach as
 * fieldEngine.ts) and writes `transform: translateX()` directly, bypassing React render
 * entirely for the actual motion.
 *
 * Reads scroll velocity itself (a plain scrollY-delta-per-second, damped) rather than the
 * R3F-only ScrollDamper in SceneObjects.tsx/useLenis.ts, since this component — like
 * ContactPortal.tsx — renders on BOTH the default Scene3D background and the `?motion=2d`
 * preview, and that damper is only ever advanced from inside the Scene3D tree.
 */
const TERMS = [
  'AGENTIC AI SYSTEMS',
  'ZERO-TRUST CYBERSECURITY',
  'ENTERPRISE AUTOMATION',
  'WI-FI 7 INFRASTRUCTURE',
  'REAL-TIME INTELLIGENCE',
  'FULL-STACK ARCHITECTURE',
];

function damp(x: number, y: number, lambda: number, dt: number) {
  return x + (y - x) * (1 - Math.exp(-lambda * dt));
}

function MarqueeRow({ reverse }: { reverse: boolean }) {
  return (
    <div className="marquee-row" dir="ltr">
      <div className={`marquee-track ${reverse ? 'marquee-track--rev' : ''}`}>
        {[0, 1].map((copy) => (
          <div className="marquee-copy" key={copy} aria-hidden={copy === 1}>
            {TERMS.map((term) => (
              <span className="marquee-item" key={term}>
                {term}
                <span className="marquee-dot">•</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TextMarquee() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;
    const tracks = Array.from(root.querySelectorAll<HTMLElement>('.marquee-track'));
    if (!tracks.length) return;

    // Two independent loop positions (0..50, wrapping) — one per direction — since the two
    // rows move opposite ways but share the same ambient/boosted speed at any instant.
    let pctFwd = 0, pctRev = 0;
    let lastScrollY = window.scrollY;
    let velocity = 0; // damped px/second
    let raf = 0;
    let last = performance.now();

    const AMBIENT_PCT_PER_S = 3.2; // a full loop (50%) every ~15.6s at rest
    const BOOST_PER_PX_S = 0.012; // additional %/s per px/s of scroll speed
    const MAX_BOOST_PCT_PER_S = 34; // caps how fast a hard flick can drive it

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;

      const rawVel = (window.scrollY - lastScrollY) / Math.max(dt, 1 / 240);
      lastScrollY = window.scrollY;
      velocity = damp(velocity, rawVel, 8, dt);

      const boost = Math.min(Math.abs(velocity) * BOOST_PER_PX_S, MAX_BOOST_PCT_PER_S);
      const speed = AMBIENT_PCT_PER_S + boost;

      pctFwd = (pctFwd + speed * dt) % 50;
      pctRev = (pctRev + speed * dt) % 50;

      for (const track of tracks) {
        const isRev = track.classList.contains('marquee-track--rev');
        const pct = isRev ? pctRev - 50 : -pctFwd;
        track.style.transform = `translateX(${pct}%)`;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={rootRef} className="marquee-section" aria-hidden="true">
      <MarqueeRow reverse={false} />
      <MarqueeRow reverse={true} />
    </div>
  );
}
