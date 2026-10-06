/**
 * The bots' outlines, the same heads the Grok Bot deck draws (public/grok-deck/js/bots.js): each
 * outline resampled to the same number of points by angle and scaled to the area of a circle of
 * radius 100, so every head has the same visual weight. Computed once, when this module loads.
 */
export type BotShape = 'circle' | 'triangle' | 'diamond' | 'square' | 'star' | 'sparkle' | 'flower' | 'clover' | 'heart' | 'house';
export type BotTone = 'ink' | 'fill' | 'hi' | 'pale' | 'deep';

const N = 84;
const R = 100;
const TAU = Math.PI * 2;
type Pt = [number, number];

function polar(fn: (a: number) => number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < 360; i++) {
    const a = -Math.PI / 2 + (i / 360) * TAU;
    const r = fn(a);
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

function roundedPoly(verts: Pt[], rad: number, seg = 14): Pt[] {
  const n = verts.length;
  const out: Pt[] = [];
  const normal = (p: Pt, q: Pt): Pt => {
    const ex = q[0] - p[0], ey = q[1] - p[1];
    let nx = ey, ny = -ex;
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
    const l = Math.hypot(nx, ny) || 1;
    return [nx / l, ny / l];
  };
  for (let i = 0; i < n; i++) {
    const p = verts[(i - 1 + n) % n], v = verts[i], q = verts[(i + 1) % n];
    const n1 = normal(p, v), n2 = normal(v, q);
    const a1 = Math.atan2(n1[1], n1[0]);
    let d = Math.atan2(n2[1], n2[0]) - a1;
    while (d < 0) d += TAU;
    while (d > TAU) d -= TAU;
    for (let s = 0; s <= seg; s++) {
      const a = a1 + (d * s) / seg;
      out.push([v[0] + Math.cos(a) * rad, v[1] + Math.sin(a) * rad]);
    }
  }
  return out;
}

const regular = (k: number, rot: number, r: number): Pt[] =>
  Array.from({ length: k }, (_, i) => [Math.cos(rot + (i / k) * TAU) * r, Math.sin(rot + (i / k) * TAU) * r] as Pt);

function resample(outline: Pt[]): number[] {
  const n = outline.length;
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = outline[i], [x1, y1] = outline[(i + 1) % n];
    const f = x0 * y1 - x1 * y0;
    A += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  A *= 0.5; cx /= 6 * A; cy /= 6 * A;
  const pts: number[] = new Array(N * 2).fill(0);
  for (let i = 0; i < N; i++) {
    const a = -Math.PI / 2 + (i / N) * TAU;
    const dx = Math.cos(a), dy = Math.sin(a);
    let best = 0;
    for (let j = 0; j < n; j++) {
      const ax = outline[j][0] - cx, ay = outline[j][1] - cy;
      const ex = outline[(j + 1) % n][0] - cx - ax, ey = outline[(j + 1) % n][1] - cy - ay;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = (ax * ey - ay * ex) / den;
      const u = (ax * dy - ay * dx) / den;
      if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6 && t > best) best = t;
    }
    pts[2 * i] = dx * best;
    pts[2 * i + 1] = dy * best;
  }
  let area = 0;
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    area += pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1];
  }
  const k = R / Math.sqrt(Math.abs(area / 2) / Math.PI);
  return pts.map((v) => v * k);
}

/** A closed Catmull-Rom curve through the points, as SVG path data. */
function pathFrom(pts: number[]): string {
  const n = pts.length / 2;
  const X = (i: number) => pts[2 * ((i + n) % n)], Y = (i: number) => pts[2 * ((i + n) % n) + 1];
  let d = `M${X(0).toFixed(1)} ${Y(0).toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const c1x = X(i) + (X(i + 1) - X(i - 1)) / 6, c1y = Y(i) + (Y(i + 1) - Y(i - 1)) / 6;
    const c2x = X(i + 1) - (X(i + 2) - X(i)) / 6, c2y = Y(i + 1) - (Y(i + 2) - Y(i)) / 6;
    d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${X(i + 1).toFixed(1)} ${Y(i + 1).toFixed(1)}`;
  }
  return d + 'Z';
}

const heart: Pt[] = [];
for (let i = 0; i < 240; i++) {
  const t = (i / 240) * TAU;
  heart.push([16 * Math.pow(Math.sin(t), 3), -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
}
const star = (k: number, rIn: number, rOut: number, p: number) => (a: number) =>
  rIn + (rOut - rIn) * Math.pow(Math.abs(Math.cos((k * (a + Math.PI / 2)) / 2)), p);

const OUTLINES: Record<BotShape, () => Pt[]> = {
  circle: () => polar(() => 1),
  triangle: () => roundedPoly(regular(3, -Math.PI / 2, 0.9), 0.36),
  diamond: () => roundedPoly(regular(4, -Math.PI / 2, 0.86), 0.3),
  square: () => roundedPoly(regular(4, -Math.PI / 4, 0.8), 0.32),
  star: () => polar(star(5, 0.58, 1.12, 2.4)),
  sparkle: () => polar(star(4, 0.5, 1.18, 4)),
  flower: () => polar((a) => 0.84 + 0.16 * Math.cos(6 * (a + Math.PI / 2))),
  clover: () => polar((a) => 0.74 + 0.26 * Math.pow(Math.abs(Math.cos(2 * (a + Math.PI / 4))), 0.55)),
  heart: () => heart,
  house: () => roundedPoly([[-0.76, -0.12], [0, -0.86], [0.76, -0.12], [0.76, 0.8], [-0.76, 0.8]], 0.2),
};

const cache = new Map<BotShape, string>();
/** SVG path data for a head, in a -120…120 box. */
export function shapePath(shape: BotShape): string {
  let d = cache.get(shape);
  if (!d) {
    d = pathFrom(resample(OUTLINES[shape]()));
    cache.set(shape, d);
  }
  return d;
}

/** Where the eyes sit on each head: x, y and how big they may be. */
export const FACE: Record<BotShape, [number, number, number]> = {
  circle: [0, -6, 1], triangle: [0, 22, 0.9], diamond: [0, 0, 0.95], square: [0, -4, 1], star: [0, 8, 0.86],
  sparkle: [0, 0, 0.8], flower: [0, -4, 0.96], clover: [0, -2, 0.94], heart: [0, -4, 0.98], house: [0, 22, 0.92],
};

export const TONES: Record<BotTone, string> = { ink: '#8FD400', fill: '#76B900', hi: '#C8F46E', pale: '#9FE870', deep: '#5C9200' };
