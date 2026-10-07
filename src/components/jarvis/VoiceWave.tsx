import { useEffect, useRef } from 'react';

/**
 * A voice, drawn the way the site draws everything: in the glyph field's density ramp, not as a
 * smooth audio curve. Each column is one moment of the voice; the newest enters at the reading
 * start (the right) and the line scrolls toward the left, so it reads like the words beside it.
 * Louder moments light more rows, and the middle row gets the densest glyph.
 *
 * The amplitude is a made-up speech envelope (syllables inside words, short pauses between them):
 * the demo has no audio and the site makes no sound. The canvas only animates while someone is
 * speaking and while the line settles afterwards, and not at all off screen. Under reduced motion
 * it draws one still line of a spoken phrase (or a flat one if nothing was said).
 */

const RAMP = ['.', ':', '-', '=', '+', '*'];
const CELL_W = 7;
const CELL_H = 7;
const SAMPLE_MS = 46;

interface VoiceWaveProps {
  /** Someone is speaking right now. */
  active: boolean;
  tone: 'you' | 'jarvis';
  /** Reduced motion: draw once, no animation. `spoken` picks a phrase shape over a flat line. */
  still?: boolean;
  spoken?: boolean;
  className?: string;
}

const INK = { you: '230, 236, 221', jarvis: '143, 212, 0' } as const;
const FAINT = '138, 149, 125';

function speech(t: number) {
  const syllable = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 3.2)), 0.55);
  const word = 0.55 + 0.45 * Math.sin(t * Math.PI * 2 * 0.73 + 1.1);
  const pause = Math.sin(t * Math.PI * 2 * 0.41 + 0.3) > 0.82 ? 0.18 : 1;
  return Math.min(1, (0.1 + 0.9 * syllable * word) * pause * (0.72 + 0.28 * Math.random()));
}

export default function VoiceWave({ active, tone, still = false, spoken = false, className = '' }: VoiceWaveProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  const kick = useRef<() => void>(() => {});

  useEffect(() => {
    activeRef.current = active;
    if (active) kick.current();
  }, [active]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let w = 0;
    let h = 0;
    let cols = 0;
    let rows = 0;
    let amps = new Float32Array(0);
    let raf = 0;
    let last = 0;
    let acc = 0;
    let t0 = performance.now();
    let visible = true;

    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const dpr = canvas.width / Math.max(1, w);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `700 9px Cousine, "Courier New", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const mid = (rows - 1) / 2;
      const reach = rows / 2 + 0.25;
      for (let i = 0; i < cols; i++) {
        const a = amps[i];
        const x = w - (i + 0.5) * CELL_W;
        if (a < 0.06) {
          ctx.fillStyle = `rgba(${FAINT}, 0.55)`;
          ctx.fillText('.', x, (mid + 0.5) * CELL_H);
          continue;
        }
        const half = a * reach;
        for (let k = 0; k < rows; k++) {
          const d = Math.abs(k - mid);
          if (d >= half) continue;
          const v = a * (1 - d / reach);
          ctx.fillStyle = `rgba(${INK[tone]}, ${0.35 + 0.65 * v})`;
          ctx.fillText(RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))], x, (k + 0.5) * CELL_H);
        }
      }
    };

    const fillStill = () => {
      amps = new Float32Array(cols);
      if (spoken) for (let i = 0; i < cols; i++) amps[i] = speechAt(i);
    };
    // A deterministic phrase shape for the still line (no Math.random, so it never flickers).
    const speechAt = (i: number) => {
      const t = i * 0.09;
      const syllable = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 1.1 + 0.4)), 0.6);
      const word = 0.5 + 0.5 * Math.sin(t * 1.9 + 1.3);
      return Math.sin(t * 0.8) > 0.86 ? 0.04 : 0.1 + 0.85 * syllable * word;
    };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const nextCols = Math.max(1, Math.floor(w / CELL_W));
      rows = Math.max(3, Math.floor(h / CELL_H) | 1);
      if (still) {
        cols = nextCols;
        fillStill();
      } else if (nextCols !== cols) {
        const next = new Float32Array(nextCols);
        next.set(amps.subarray(0, Math.min(amps.length, nextCols)));
        amps = next;
        cols = nextCols;
      }
      draw();
    };

    const frame = (now: number) => {
      raf = 0;
      acc += Math.min(200, now - last);
      last = now;
      let moved = false;
      while (acc >= SAMPLE_MS) {
        acc -= SAMPLE_MS;
        amps.copyWithin(1, 0);
        amps[0] = activeRef.current ? speech((now - t0) / 1000) : amps[1] * 0.35;
        moved = true;
      }
      if (moved) draw();
      let any = activeRef.current;
      if (!any) for (let i = 0; i < cols && !any; i++) any = amps[i] > 0.02;
      if (!any) {
        amps.fill(0);
        draw();
        return;
      }
      if (visible) raf = requestAnimationFrame(frame);
    };

    kick.current = () => {
      if (still || raf || !visible) return;
      last = performance.now();
      t0 = last;
      acc = 0;
      raf = requestAnimationFrame(frame);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    const io =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([e]) => {
            visible = e.isIntersecting;
            if (visible && activeRef.current) kick.current();
          });
    io?.observe(canvas);
    if (activeRef.current) kick.current();

    return () => {
      ro.disconnect();
      io?.disconnect();
      if (raf) cancelAnimationFrame(raf);
      kick.current = () => {};
    };
  }, [tone, still, spoken]);

  return <canvas ref={ref} className={`jv-wave ${className}`} aria-hidden="true" />;
}
