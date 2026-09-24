import { useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from 'motion/react';
import type { GuideCoverStyle } from '../../data/creatorContent';
import { isReducedMotion, isTouchFirst } from '../../lib/perfMode';

/**
 * A guide cover drawn entirely in code — no cover image (2026-09-24, explicit brief: the covers
 * must not be static pictures).
 *
 * It is modelled as a physical book rather than a flat card, because depth is what sells "real":
 *   · a front board, a back board and a fore-edge face built in CSS 3D (`preserve-3d`), so tilting
 *     it reveals the page block on the LEFT — a Hebrew book is bound on the right;
 *   · a hinge crease near the spine, a laminate glare that follows the pointer, a fixed specular
 *     band, film grain, and a contact shadow on the "table" that slides against the tilt;
 *   · line art generated per guide (`motif`) from a seeded PRNG, so it is identical on every render
 *     and every device and needs no asset request.
 *
 * Touch-first and reduced-motion devices get the same book at a fixed three-quarter pose: no
 * pointer drives a tilt there, and a flat card would throw away the depth that is the whole point.
 * The grain is dropped under `html.perf-lite` in CSS, like the site's other feTurbulence layers.
 *
 * Sizing is fluid — the cover fills its container and every inner size is in container-query
 * units (`.gcover*` in index.css), so the same component is a card thumbnail and a hero.
 */

interface Props {
  slug: string;
  title: string;
  style: GuideCoverStyle;
  /** Bottom line, e.g. "PDF · 24 עמודים". */
  meta?: string;
  /** Hero use: a deeper resting angle and a stronger bloom. */
  hero?: boolean;
  className?: string;
}

const REST_Y = 18;
const REST_X = 4;

export default function GuideCover({ slug, title, style, meta = 'PDF', hero = false, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const spx = useSpring(px, { stiffness: 180, damping: 22, mass: 0.6 });
  const spy = useSpring(py, { stiffness: 180, damping: 22, mass: 0.6 });

  const range = hero ? 16 : 13;
  const rotateY = useTransform(spx, [0, 1], [REST_Y + range, REST_Y - range]);
  const rotateX = useTransform(spy, [0, 1], [REST_X + 9, REST_X - 9]);
  const glareX = useTransform(spx, [0, 1], [15, 85]);
  const glareY = useTransform(spy, [0, 1], [10, 90]);
  const glare = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.08) 26%, transparent 58%)`;
  // The contact shadow slides opposite the tilt, as a real object's would under a fixed light.
  const shadowX = useTransform(spx, [0, 1], [-10, 10]);

  const [inert] = useState(() => isTouchFirst() || isReducedMotion());
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (inert || e.pointerType !== 'mouse' || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  };
  const onLeave = () => {
    px.set(0.5);
    py.set(0.5);
  };

  const accent = style.accent;
  const vars = { '--gc-accent': accent } as CSSProperties;

  return (
    <div
      ref={ref}
      className={`gcover-stage ${hero ? 'gcover-stage--hero' : ''} ${className}`}
      style={vars}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      aria-hidden="true"
    >
      <motion.div
        className="gcover-floor"
        style={inert ? undefined : { x: shadowX }}
      />
      <motion.div
        className="gcover-book"
        style={inert ? { rotateY: REST_Y, rotateX: REST_X } : { rotateY, rotateX }}
      >
        <div className="gcover-back" />
        <div className="gcover-foreedge" />
        <div className="gcover-spine" />

        <div className="gcover-front">
          <div className="gcover-base" />
          <Motif slug={slug} kind={style.motif} accent={accent} />
          <div className="gcover-grain" />

          <div className="gcover-content" dir="rtl">
            <div className="gcover-top">
              <span className="gcover-kicker">{style.kicker}</span>
              <span className="gcover-brand" dir="ltr">
                mrdaniel<span>.co.il</span>
              </span>
            </div>

            <div className="gcover-titleblock">
              <span className="gcover-rule" />
              <p className="gcover-title">{title}</p>
            </div>

            <div className="gcover-bottom">
              <span className="gcover-author">דניאל בן ברוך</span>
              <span className="gcover-meta">{meta}</span>
            </div>
          </div>

          {/* Light, top to bottom: hinge crease, fixed specular band, pointer glare, edge bevel. */}
          <div className="gcover-hinge" />
          <div className="gcover-specular" />
          {inert ? <div className="gcover-glare gcover-glare--static" /> : <motion.div className="gcover-glare" style={{ backgroundImage: glare }} />}
          <div className="gcover-bevel" />
        </div>
      </motion.div>
    </div>
  );
}

// ─── generated line art ─────────────────────────────────────────────────────────────────────────

/** mulberry32 — tiny deterministic PRNG. Seeded from the slug so a cover never reshuffles. */
function prng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19));
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** viewBox is 100 × 138, the cover's own proportion, so the art never stretches. */
function Motif({ slug, kind, accent }: { slug: string; kind: GuideCoverStyle['motif']; accent: string }) {
  const art = useMemo(() => (kind === 'neural' ? neural(slug) : circuit(slug)), [slug, kind]);
  // useId, not the slug: the same guide can be on screen twice, and duplicate SVG ids make the
  // second copy resolve the first one's mask.
  const gid = `gc${useId().replace(/:/g, '')}`;
  return (
    <svg className="gcover-motif" viewBox="0 0 100 138" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id={`${gid}-fade`} cx="70%" cy="28%" r="75%">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`${gid}-mask`}>
          <rect width="100" height="138" fill={`url(#${gid}-fade)`} />
        </mask>
        <filter id={`${gid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.9" />
        </filter>
      </defs>
      <g mask={`url(#${gid}-mask)`}>
        {art.lines.map((d, i) => (
          <path key={`l${i}`} d={d} fill="none" stroke="#76b900" strokeOpacity={0.55} strokeWidth={0.35} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {/* Bloom pass: the same lines, blurred, in the accent — reads as light IN the board, not ink on it. */}
        <g filter={`url(#${gid}-glow)`} opacity={0.7}>
          {art.hot.map((d, i) => (
            <path key={`h${i}`} d={d} fill="none" stroke={accent} strokeWidth={0.8} strokeLinecap="round" />
          ))}
        </g>
        {art.hot.map((d, i) => (
          <path key={`hc${i}`} d={d} fill="none" stroke={accent} strokeWidth={0.4} strokeLinecap="round" />
        ))}
        {art.nodes.map(([x, y, r, lit], i) => (
          <g key={`n${i}`}>
            {lit && <circle cx={x} cy={y} r={r * 3.2} fill={accent} opacity={0.18} filter={`url(#${gid}-glow)`} />}
            <circle cx={x} cy={y} r={r} fill={lit ? accent : '#0b0f08'} stroke={lit ? accent : '#76b900'} strokeWidth={0.3} strokeOpacity={0.8} />
          </g>
        ))}
      </g>
    </svg>
  );
}

type Art = { lines: string[]; hot: string[]; nodes: [number, number, number, boolean][] };

/** PCB traces: run in from the spine side and turn at 45°/90°, ending on pads. */
function circuit(slug: string): Art {
  const r = prng(slug);
  const lines: string[] = [];
  const hot: string[] = [];
  const nodes: Art['nodes'] = [];
  const rows = 16;
  for (let i = 0; i < rows; i++) {
    let x = 104;
    let y = 4 + i * 5.2 + r() * 2;
    let d = `M${x} ${y.toFixed(1)}`;
    const steps = 2 + Math.floor(r() * 3);
    for (let s = 0; s < steps; s++) {
      x -= 8 + r() * 20;
      d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
      if (s < steps - 1) {
        const dy = (r() > 0.5 ? 1 : -1) * (3 + r() * 6);
        x -= Math.abs(dy);
        y += dy;
        d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
      }
    }
    const isHot = i % 5 === 2;
    (isHot ? hot : lines).push(d);
    nodes.push([x, y, isHot ? 1.1 : 0.8, isHot]);
  }
  // A chip footprint where the traces converge.
  lines.push('M70 30 h18 v18 h-18 Z', 'M73 33 h12 v12 h-12 Z');
  for (let k = 0; k < 4; k++) lines.push(`M${72 + k * 4.5} 30 v-4`, `M${72 + k * 4.5} 48 v4`);
  return { lines, hot, nodes };
}

/** A small feed-forward net: layers of nodes, every edge drawn, a few edges "firing". */
function neural(slug: string): Art {
  const r = prng(slug);
  const layers = [4, 6, 6, 3];
  const cols = layers.map((n, li) => {
    const x = 96 - li * 17;
    return Array.from({ length: n }, (_, k) => [x, 12 + ((k + 0.5) * 70) / n + (r() - 0.5) * 3] as [number, number]);
  });
  const lines: string[] = [];
  const hot: string[] = [];
  for (let li = 0; li < cols.length - 1; li++) {
    for (const [x1, y1] of cols[li]) {
      for (const [x2, y2] of cols[li + 1]) {
        const d = `M${x1.toFixed(1)} ${y1.toFixed(1)} C${(x1 - 8).toFixed(1)} ${y1.toFixed(1)} ${(x2 + 8).toFixed(1)} ${y2.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
        (r() > 0.86 ? hot : lines).push(d);
      }
    }
  }
  // Orbit rings behind the net — "learning from the basics" reads as concentric, widening circles.
  for (let k = 1; k <= 4; k++) lines.push(`M${70 - k * 9} 48 a${k * 9} ${k * 9} 0 1 0 ${k * 18} 0 a${k * 9} ${k * 9} 0 1 0 ${-k * 18} 0`);
  const nodes: Art['nodes'] = cols.flatMap((col, li) => col.map(([x, y]) => [x, y, li === 0 || li === cols.length - 1 ? 1.3 : 1, r() > 0.7] as [number, number, number, boolean]));
  return { lines, hot, nodes };
}
