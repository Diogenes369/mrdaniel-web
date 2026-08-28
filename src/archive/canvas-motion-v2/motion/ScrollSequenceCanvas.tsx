import { useEffect, useRef } from 'react';
import { ScrollTrigger, prefersReducedMotion } from '../lib/gsap';
import {
  preloadFrames,
  loadManifest,
  drawCover,
  drawPlaceholderFrame,
  type LoadedFrame,
} from './scrollSequenceFrames';

/**
 * Full-screen, scroll-scrubbed background image sequence — an immersive cinematic "4D tour"
 * (Peachweb / Apple-product-page style), the motion=2d background.
 *
 * Smoothness (NOT a rigid slideshow):
 *  1. GSAP ScrollTrigger with `scrub: 0.7` — page scroll progress itself is tweened, not snapped.
 *  2. A frame-rate-independent damp on top: the drawn frame index (a float) eases toward the
 *     scroll-derived target every rAF, so it keeps gliding for a beat after the wheel stops and
 *     catches up smoothly on fast flings.
 *  3. Adjacent-frame CROSSFADE: the floor frame is drawn opaque, the ceil frame over it at the
 *     fractional alpha — so between two integer frames you see a true blend, never a hard cut.
 *
 * Frames: `/public/sequence/frame_001.webp … frame_NNN.webp`; the exact count is read from
 * `/public/sequence/manifest.json` (falls back to the `totalFrames` prop). Every frame is
 * preloaded and `img.decode()`-d up front to eliminate decode hitches; any missing frame draws a
 * procedural placeholder for that index. DPR-aware backing store (capped 2) + `object-fit: cover`
 * math so frames fill any viewport — tall phone or ultrawide — without stretching.
 */
interface ScrollSequenceCanvasProps {
  totalFrames?: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const damp = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt));

const SCRUB = 0.7;      // ScrollTrigger progress easing
const LAMBDA = 8;       // extra index damp (time-constant ~0.12s)
const SETTLE_EPS = 0.0015;

export default function ScrollSequenceCanvas({ totalFrames = 60 }: ScrollSequenceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = prefersReducedMotion();

    let ctx = canvas.getContext('2d');
    let cssW = 0;
    let cssH = 0;
    let raf = 0;
    let disposed = false;

    let total = Math.max(1, totalFrames);
    let frames: LoadedFrame[] = Array.from({ length: total }, (_, index) => ({ index, img: null }));

    // Target (from scroll) and the smoothed value we actually render.
    let targetIndex = reduced ? (total - 1) / 2 : 0;
    let renderIndex = targetIndex;
    let forceDraw = true;
    let lastMs = performance.now();

    const setupCtx = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cssW = window.innerWidth;
      cssH = window.innerHeight;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
      }
      forceDraw = true;
    };

    const paintFrame = (i: number, alpha: number) => {
      if (!ctx) return;
      const fr = frames[i];
      ctx.globalAlpha = alpha;
      if (fr?.img) drawCover(ctx, fr.img, cssW, cssH);
      else drawPlaceholderFrame(ctx, cssW, cssH, i, total);
      ctx.globalAlpha = 1;
    };

    const draw = () => {
      if (disposed || !ctx || !cssW || !cssH) return;
      const f = clamp(renderIndex, 0, total - 1);
      const lo = Math.floor(f);
      const hi = Math.min(lo + 1, total - 1);
      const frac = f - lo;
      ctx.clearRect(0, 0, cssW, cssH);
      paintFrame(lo, 1);
      if (hi !== lo && frac > 0.004) paintFrame(hi, frac);
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (disposed) return;
      const dt = Math.min((now - lastMs) / 1000, 0.05);
      lastMs = now;
      const next = reduced ? targetIndex : damp(renderIndex, targetIndex, LAMBDA, dt);
      const moved = Math.abs(next - renderIndex) > SETTLE_EPS || Math.abs(targetIndex - next) > SETTLE_EPS;
      renderIndex = next;
      if (moved || forceDraw) {
        forceDraw = false;
        draw();
      }
    };

    setupCtx();
    raf = requestAnimationFrame(tick);

    let resizeTimer = 0;
    const onResize = () => {
      if (resizeTimer) return;
      resizeTimer = window.setTimeout(() => {
        resizeTimer = 0;
        setupCtx();
      }, 150);
    };
    window.addEventListener('resize', onResize, { passive: true });

    const startPreload = () => {
      preloadFrames(total, (fr) => {
        if (disposed || fr.index >= frames.length) return;
        frames[fr.index] = fr;
        if (Math.abs(fr.index - renderIndex) < 2) forceDraw = true; // repaint if it's on screen now
      });
    };

    // Exact frame count from the manifest ("dynamically detect"); falls back to the prop.
    loadManifest().then((m) => {
      if (disposed || !m || m.count === total) return;
      total = Math.max(1, m.count);
      frames = Array.from({ length: total }, (_, index) => ({ index, img: null }));
      targetIndex = clamp(targetIndex, 0, total - 1);
      renderIndex = clamp(renderIndex, 0, total - 1);
      forceDraw = true;
      startPreload();
      ScrollTrigger.refresh();
    });
    startPreload();

    // ---- scroll driver ----
    let st: ScrollTrigger | null = null;
    let refreshTimers: number[] = [];
    if (!reduced) {
      st = ScrollTrigger.create({
        trigger: document.documentElement,
        start: 'top top',
        end: 'max',
        scrub: SCRUB,
        onUpdate: (self) => {
          targetIndex = self.progress * (total - 1);
        },
      });
      refreshTimers = [200, 800, 2000].map((ms) => window.setTimeout(() => ScrollTrigger.refresh(), ms));
      document.fonts?.ready?.then(() => ScrollTrigger.refresh()).catch(() => {});
    }

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      if (resizeTimer) window.clearTimeout(resizeTimer);
      refreshTimers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener('resize', onResize);
      st?.kill();
    };
  }, [totalFrames]);

  return (
    <div className="scroll-sequence-layer" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
