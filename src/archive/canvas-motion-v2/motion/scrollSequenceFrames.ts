/**
 * Frame helpers for ScrollSequenceCanvas — the scroll-scrubbed background image sequence
 * (Peachweb / Apple-product-page style). Framework-agnostic so the React wrapper only owns
 * lifecycle + the ScrollTrigger.
 *
 * Expected real assets: /public/sequence/frame_001.webp … frame_060.webp (see public/sequence/
 * README). Until those exist, every missing frame is drawn PROCEDURALLY (see drawPlaceholderFrame)
 * so the scroll mechanism is fully testable now.
 */

export interface LoadedFrame {
  index: number;
  img: HTMLImageElement | null; // null → not available, draw a procedural placeholder instead
}

export interface SequenceManifest {
  count: number;
  width?: number;
  height?: number;
}

/** Absolute path (public/ is served at site root) for frame `i` (0-based) → `/sequence/frame_007.webp`. */
export function framePath(i: number): string {
  return `/sequence/frame_${String(i + 1).padStart(3, '0')}.webp`;
}

/** Reads /public/sequence/manifest.json to get the exact frame count. Returns null if absent. */
export async function loadManifest(): Promise<SequenceManifest | null> {
  try {
    const res = await fetch('/sequence/manifest.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    const data = (await res.json()) as SequenceManifest;
    return typeof data?.count === 'number' && data.count > 0 ? data : null;
  } catch {
    return null;
  }
}

/**
 * Load every frame. Each image load is wrapped so a 404 (a not-yet-uploaded frame) resolves to
 * `{ img: null }` rather than rejecting — Promise.all never fails. `img.decode()` is awaited up
 * front so the first paint of any frame never blocks the scroll (no decode hitch on fast flings).
 * `onEach` fires as each frame becomes ready, so the caller can paint progressively instead of
 * waiting for all of them.
 */
export function preloadFrames(total: number, onEach?: (frame: LoadedFrame) => void): Promise<LoadedFrame[]> {
  const loaders = Array.from({ length: total }, (_, index) => {
    return new Promise<LoadedFrame>((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      const done = (frame: LoadedFrame) => {
        onEach?.(frame);
        resolve(frame);
      };
      img.onload = () => {
        if (typeof img.decode === 'function') {
          img.decode().then(() => done({ index, img })).catch(() => done({ index, img }));
        } else {
          done({ index, img });
        }
      };
      img.onerror = () => done({ index, img: null });
      img.src = framePath(index);
    });
  });
  return Promise.all(loaders);
}

/** `object-fit: cover` math for drawing a natural-sized image into a w×h box, centred, no stretch. */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Procedural stand-in for a not-yet-uploaded render frame. Deterministic in `frameIndex` so
 * scrubbing back and forth is perfectly stable. Draws: a deep background, three slowly-morphing
 * radial-gradient light pools, a rotating/skewing wireframe ring stack, a progress bar, and a large
 * mono frame counter — enough visual change per frame to verify the 1:1 scroll scrub immediately.
 */
export function drawPlaceholderFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  frameIndex: number,
  totalFrames: number,
) {
  const t = totalFrames > 1 ? frameIndex / (totalFrames - 1) : 0; // 0..1 across the sequence
  const spin = t * TAU * 1.5;

  // ---- background ----
  ctx.fillStyle = '#080910';
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const minWH = Math.min(w, h);

  // ---- three morphing light pools ----
  const pools = [
    { hue: 'rgba(150, 170, 210,', phase: 0.0, amp: 0.28 },
    { hue: 'rgba(120, 200, 160,', phase: 0.33, amp: 0.22 },
    { hue: 'rgba(200, 190, 170,', phase: 0.66, amp: 0.2 },
  ];
  ctx.globalCompositeOperation = 'lighter';
  for (const p of pools) {
    const a = (t + p.phase) * TAU;
    const px = cx + Math.cos(a * 1.3) * w * p.amp;
    const py = cy + Math.sin(a * 0.9) * h * p.amp;
    const rad = minWH * (0.35 + 0.12 * Math.sin(a * 1.7));
    const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
    const strength = 0.16 + 0.06 * Math.sin(a * 2.1);
    g.addColorStop(0, `${p.hue}${strength.toFixed(3)})`);
    g.addColorStop(1, `${p.hue}0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.globalCompositeOperation = 'source-over';

  // ---- rotating wireframe ring stack (a cheap stand-in for a 3D object turning) ----
  ctx.save();
  ctx.translate(cx, cy);
  const rings = 5;
  for (let r = 0; r < rings; r++) {
    const rt = r / (rings - 1);
    const rx = minWH * lerp(0.12, 0.42, rt);
    const ry = rx * lerp(0.22, 0.5, Math.abs(Math.sin(spin + rt * 1.6)));
    const rot = spin * (r % 2 ? -1 : 1) * (0.6 + rt);
    ctx.save();
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.strokeStyle = `rgba(226, 232, 245, ${(0.05 + 0.09 * (1 - rt)).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
  // a few "vertices" travelling the outer ring
  const dots = 9;
  for (let d = 0; d < dots; d++) {
    const a = spin * 1.8 + (d / dots) * TAU;
    const rr = minWH * 0.42;
    const dx = Math.cos(a) * rr;
    const dy = Math.sin(a) * rr * 0.5;
    ctx.beginPath();
    ctx.arc(dx, dy, 2.2, 0, TAU);
    ctx.fillStyle = 'rgba(143, 212, 0, 0.85)';
    ctx.fill();
  }
  ctx.restore();

  // ---- HUD: progress bar + frame counter ----
  const pad = Math.round(minWH * 0.06);
  const barW = w - pad * 2;
  const barY = h - pad;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(pad, barY, barW, 2);
  ctx.fillStyle = 'rgba(143, 212, 0, 0.9)';
  ctx.fillRect(pad, barY, barW * t, 2);

  const label = `${String(frameIndex + 1).padStart(3, '0')} / ${String(totalFrames).padStart(3, '0')}`;
  const fontPx = Math.round(minWH * 0.09);
  ctx.direction = 'ltr'; // the app root is dir=rtl; keep the HUD readable left-to-right
  ctx.font = `700 ${fontPx}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(232, 238, 245, 0.9)';
  ctx.fillText(label, cx, cy);

  ctx.font = `600 ${Math.round(minWH * 0.018)}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText('SEQUENCE · PLACEHOLDER — drop frame_XXX.webp into /public/sequence', cx, cy + fontPx * 0.9);
}
