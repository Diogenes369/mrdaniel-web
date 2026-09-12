import type { ThreadTheme, ToolBrand } from './techTipsApi';

/**
 * Design asset engine — the single source of truth for how a generated slide LOOKS.
 *
 * Everything a painter needs that is not layout lives here: the deep-slate palette, the per-theme
 * and per-tool accent pairs, the vector brand marks, the Hebrew type stack, the glass/terminal
 * surface primitives and the hand-drawn accents. `techTipRenderer.ts` keeps only the decisions
 * about WHERE things go; it asks this module WHAT they look like.
 *
 * Why a local module and not an MCP server: these assets are consumed by `ctx.fillText` /
 * `ctx.fill` inside the operator's browser, at export time, on a canvas that must stay untainted
 * for `toDataURL` to work. An out-of-process asset service could not participate in that render —
 * it would have to hand back bytes that then taint the canvas, which is the exact failure mode the
 * vector marks below exist to avoid. Fonts are the one genuinely external asset, and the browser
 * already has the right fetcher for those (`document.fonts`), used by `ensureDeckFonts` below.
 */

// ─── palette ────────────────────────────────────────────────────────────────────────────────

/** Deep slate. Darker and cooler than the old obsidian pair, so the ambient glows read as light
 *  sitting ON the surface rather than as a lighter patch of it. */
export const SLATE_TOP = '#08090E';
export const SLATE_BOTTOM = '#0A0C13';

export const BRAND_GREEN = '#76B900';
export const CYBER_CYAN = '#22D3EE';
export const SILVER = '#E2E8F0';
export const INK = '#05070A';

/** Card surfaces, matching the zinc ramp the rest of the dashboard is built on. */
export const GLASS_FILL = 'rgba(255,255,255,0.05)';
export const GLASS_LINE = 'rgba(255,255,255,0.10)';
export const TERMINAL_FILL = 'rgba(11,13,18,0.92)';
export const TERMINAL_BAR = 'rgba(255,255,255,0.045)';
export const TERMINAL_LINE = 'rgba(255,255,255,0.10)';

/** The only brand that appears on generated output. */
export const BRAND_HANDLE = '@mrdaniel.co.il';
export const BRAND_NAME = 'דניאל בן ברוך';

/**
 * Accent per subject family, assigned by the Threads agent.
 *
 * A deck about Gemini and a deck about ransomware used to render in the identical cyan, so a
 * follower's feed showed one indistinguishable wall of slides. The accent drives the title
 * gradient, the badge and kicker chips, the step badge and the progress rail, which is enough to
 * tell two decks apart at thumbnail size without touching the layout. Every colour here clears
 * 4.5:1 against the slate backdrop.
 */
export const THEME_ACCENT: Record<ThreadTheme, string> = {
  ai: CYBER_CYAN,
  automation: BRAND_GREEN,
  security: '#FB923C',
  code: '#A78BFA',
  data: '#38BDF8',
  web3: '#F0ABFC',
  general: BRAND_GREEN,
};

/**
 * Per-tool identity: the wordmark, the accent the slide's chrome is tinted with, and the second
 * colour of the backdrop's glow.
 *
 * A deck about Gemini and a deck about ChatGPT should be distinguishable with the text blurred out,
 * which is exactly how they are seen in a feed. The tool's accent overrides the subject-family
 * accent whenever one was detected, because the tool is the more specific fact about the slide.
 */
export const TOOL_STYLE: Record<ToolBrand, { label: string; accent: string; glow: string }> = {
  gemini: { label: 'Gemini', accent: '#A78BFA', glow: '#22D3EE' },
  chatgpt: { label: 'ChatGPT', accent: '#10D492', glow: '#34D399' },
  claude: { label: 'Claude', accent: '#E08A63', glow: '#F0A882' },
  canva: { label: 'Canva', accent: '#22D3EE', glow: '#A78BFA' },
  notebooklm: { label: 'NotebookLM', accent: '#7AAEFF', glow: '#A78BFA' },
  make: { label: 'Make', accent: '#B98CFF', glow: '#7C3AED' },
  n8n: { label: 'n8n', accent: '#F4708F', glow: '#FB7185' },
  perplexity: { label: 'Perplexity', accent: '#2DD4BF', glow: '#5EEAD4' },
  copilot: { label: 'Copilot', accent: '#A78BFA', glow: '#60A5FA' },
  workspace: { label: 'Workspace', accent: '#7AAEFF', glow: '#34D399' },
  veo: { label: 'Veo', accent: '#7AAEFF', glow: '#A78BFA' },
  midjourney: { label: 'Midjourney', accent: '#E2E8F0', glow: '#94A3B8' },
};

export function hexToRgba(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ─── typography ─────────────────────────────────────────────────────────────────────────────

/**
 * The Hebrew type stack, in one place so the carousel PNGs, the 9:16 reel frames and any future
 * surface all shape identically.
 *
 * Three roles, deliberately distinct rather than three weights of one face: Rubik's heavy cuts
 * carry a headline, Assistant is the cleanest Hebrew UI face at paragraph size and at the small
 * sizes chips need, and JetBrains Mono is the only one of the three with a real tabular figure and
 * a slashed zero, which is what a prompt or a snippet needs. Each stack ends in a Hebrew-capable
 * fallback so a blocked webfont degrades to readable Hebrew rather than to tofu.
 */
export const FONT_DISPLAY = "Rubik, Assistant, Heebo, 'Segoe UI', sans-serif";
export const FONT_BODY = "Assistant, Heebo, Rubik, 'Segoe UI', sans-serif";
export const FONT_MONO = "'JetBrains Mono', Assistant, Heebo, ui-monospace, monospace";

export const setDisplay = (ctx: CanvasRenderingContext2D, px: number, w = 800) => {
  ctx.font = `${w} ${Math.round(px)}px ${FONT_DISPLAY}`;
};
export const setBody = (ctx: CanvasRenderingContext2D, px: number, w = 400) => {
  ctx.font = `${w} ${Math.round(px)}px ${FONT_BODY}`;
};
export const setMono = (ctx: CanvasRenderingContext2D, px: number, w = 500) => {
  ctx.font = `${w} ${Math.round(px)}px ${FONT_MONO}`;
};

/**
 * Every weight/face pair the painter actually sets, warmed before the first slide is drawn.
 *
 * `document.fonts.load` resolves per (weight, size, family) triple, and canvas silently falls back
 * to the default sans for any face that has not finished loading at the moment `fillText` runs —
 * which on a 12-slide export means slide 1 can ship in the wrong face while slide 12 is correct.
 * Warming the whole set up front removes that race.
 */
export async function ensureDeckFonts(): Promise<void> {
  const specs = [
    `800 90px ${FONT_DISPLAY}`,
    `800 56px ${FONT_DISPLAY}`,
    `900 48px ${FONT_DISPLAY}`,
    `700 34px ${FONT_BODY}`,
    `600 30px ${FONT_BODY}`,
    `400 40px ${FONT_BODY}`,
    `400 28px ${FONT_BODY}`,
    `500 28px ${FONT_MONO}`,
    `700 20px ${FONT_MONO}`,
    `400 22px ${FONT_MONO}`,
  ];
  await Promise.all(
    specs.map(async (spec) => {
      try {
        await document.fonts.load(spec);
      } catch {
        /* visual only — the stack's fallbacks still render Hebrew */
      }
    })
  );
}

// ─── spacing grid ───────────────────────────────────────────────────────────────────────────

export interface Metrics {
  /** Outer page margin. Every element on the slide starts here. */
  pad: number;
  /** Vertical rhythm between stacked blocks. */
  gap: number;
  /** Inner padding of a card, so every card breathes identically. */
  cardPad: number;
  radiusLg: number;
  radiusMd: number;
  radiusSm: number;
  hair: number;
}

/**
 * The one spacing scale, derived from the canvas width so a 1080×1350 carousel slide and a
 * 1080×1920 reel frame have the same optical margins rather than the same pixel ones.
 */
export function metricsFor(W: number): Metrics {
  return {
    pad: Math.round(W * 0.085),
    gap: Math.round(W * 0.028),
    cardPad: Math.round(W * 0.038),
    radiusLg: W * 0.03,
    radiusMd: W * 0.024,
    radiusSm: W * 0.018,
    hair: Math.max(1.25, W * 0.0014),
  };
}

// ─── surfaces ───────────────────────────────────────────────────────────────────────────────

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Glassmorphic card: a barely-there white fill on a hairline border, lifted off the backdrop by a
 * soft drop shadow and finished with an inner top highlight.
 *
 * The highlight is what separates glass from a flat translucent rectangle — a real pane catches
 * light along its upper edge, and without it the card reads as a hole punched in the background.
 */
export function glassCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  m: Metrics,
  accent?: string
) {
  if (w <= 0 || h <= 0) return;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = m.pad * 0.42;
  ctx.shadowOffsetY = m.pad * 0.2;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = GLASS_FILL;
  ctx.fill();
  ctx.restore();

  // Inner top highlight, clipped to the card so it follows the corner radius.
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.clip();
  const sheen = ctx.createLinearGradient(0, y, 0, y + h * 0.5);
  sheen.addColorStop(0, 'rgba(255,255,255,0.09)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(x, y, w, h * 0.5);
  ctx.restore();

  roundRectPath(ctx, x, y, w, h, r);
  ctx.strokeStyle = accent ? hexToRgba(accent, 0.3) : GLASS_LINE;
  ctx.lineWidth = m.hair;
  ctx.stroke();
}

export interface FrameInner {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Height of a terminal frame's title bar at this canvas width. */
export function terminalBarHeight(W: number): number {
  return W * 0.056;
}

/**
 * Terminal container: a dark slab under a title bar carrying the three window dots, a label and an
 * optional copy affordance.
 *
 * This is the frame anything the reader is meant to COPY goes into — a prompt, a snippet, a
 * command. The window chrome is not decoration: it is the visual convention that says "this block
 * is literal text, not prose", which is exactly the distinction a carousel has to make in one
 * glance. Returns the interior rect the caller may paint into.
 */
export function terminalFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  W: number,
  m: Metrics,
  accent: string,
  label: string,
  opts: { copyGlyph?: boolean } = {}
): FrameInner {
  const r = m.radiusMd;
  const barH = terminalBarHeight(W);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = m.pad * 0.5;
  ctx.shadowOffsetY = m.pad * 0.24;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = TERMINAL_FILL;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.clip();

  // Title bar + the accent hairline that tells one tool's card from another's.
  ctx.fillStyle = TERMINAL_BAR;
  ctx.fillRect(x, y, w, barH);
  ctx.fillStyle = hexToRgba(accent, 0.8);
  ctx.fillRect(x, y, w, Math.max(2, m.hair * 2));
  ctx.fillStyle = TERMINAL_LINE;
  ctx.fillRect(x, y + barH - m.hair, w, m.hair);

  // ● ● ● — traffic lights, left, in their conventional order and colours.
  const dotR = W * 0.0058;
  const dotGap = W * 0.021;
  const dotY = y + barH / 2;
  ['#FF5F57', '#FEBC2E', '#28C840'].forEach((colour, i) => {
    ctx.beginPath();
    ctx.arc(x + W * 0.028 + i * dotGap, dotY, dotR, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
  });

  // Label, centred in the bar like a window title.
  if (label) {
    ctx.direction = 'ltr';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    setMono(ctx, W * 0.0165, 700);
    ctx.fillStyle = hexToRgba(accent, 0.9);
    ctx.fillText(label.toUpperCase(), x + w / 2, dotY + 1);
  }

  // Two offset squares — the glyph that reads universally as "copy".
  if (opts.copyGlyph) {
    const gs = W * 0.02;
    const gx = x + w - W * 0.028 - gs;
    ctx.strokeStyle = 'rgba(226,232,240,0.45)';
    ctx.lineWidth = Math.max(1.2, W * 0.0018);
    roundRectPath(ctx, gx + gs * 0.3, dotY - gs * 0.66, gs * 0.7, gs * 0.7, gs * 0.16);
    ctx.stroke();
    roundRectPath(ctx, gx, dotY - gs * 0.24, gs * 0.7, gs * 0.7, gs * 0.16);
    ctx.fillStyle = TERMINAL_FILL;
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  roundRectPath(ctx, x, y, w, h, r);
  ctx.strokeStyle = TERMINAL_LINE;
  ctx.lineWidth = m.hair;
  ctx.stroke();

  return {
    x: x + m.cardPad,
    y: y + barH + m.cardPad * 0.7,
    w: w - m.cardPad * 2,
    h: h - barH - m.cardPad * 1.4,
  };
}

/**
 * The brand lockup: a glass pill carrying a live-green dot and the handle, optionally with the
 * name beneath it.
 *
 * This is the ONLY brand mark on a generated slide. It is deliberately small and set in the
 * footer's optical lane: a carousel that shouts its own URL on every slide reads as an ad, and the
 * link belongs in the caption where it is actually tappable.
 */
export function drawBrandBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  W: number,
  m: Metrics,
  accent: string,
  opts: { withName?: boolean; alpha?: number } = {}
) {
  const fs = W * 0.0185;
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  setMono(ctx, fs, 600);

  const dot = W * 0.0055;
  const padX = W * 0.022;
  const textW = ctx.measureText(BRAND_HANDLE).width;
  const pillW = padX * 2 + dot * 2 + W * 0.012 + textW;
  const pillH = W * 0.042;
  const px = cx - pillW / 2;
  const py = cy - pillH / 2;

  roundRectPath(ctx, px, py, pillW, pillH, pillH / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = m.hair;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(px + padX + dot, cy, dot, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = W * 0.012;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(226,232,240,0.82)';
  ctx.fillText(BRAND_HANDLE, px + padX + dot * 2 + W * 0.012, cy + 1);

  if (opts.withName) {
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    setBody(ctx, W * 0.019, 500);
    ctx.fillStyle = 'rgba(226,232,240,0.5)';
    ctx.fillText(BRAND_NAME, cx, cy + pillH * 0.95);
  }
  ctx.restore();
}

// ─── hand-drawn accents ─────────────────────────────────────────────────────────────────────

/**
 * Seeded PRNG. The wobble that makes a stroke read as hand-drawn has to be STABLE: the same slide
 * is painted once for the carousel PNG and again for every frame of the reel, and a random jitter
 * would make the underline crawl across the video.
 */
function rand(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Strokes a point list as a smooth polyline (midpoint quadratics), so jitter reads as a drawn
 *  line rather than as a jagged one. */
function strokeWobble(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  ctx.stroke();
}

/** Marker underline beneath a run of text — two passes, the second lighter and offset, which is
 *  what makes a real marker stroke look like one rather than like a border-bottom. */
export function scribbleUnderline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  colour: string,
  seed: number
) {
  if (w <= 0) return;
  const rnd = rand(seed);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = colour;
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalAlpha = pass === 0 ? 0.92 : 0.4;
    ctx.lineWidth = Math.max(2, w * (pass === 0 ? 0.016 : 0.009));
    const pts: [number, number][] = [];
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // A drawn underline sags in the middle and overshoots slightly at both ends.
      const sag = Math.sin(t * Math.PI) * w * 0.012;
      pts.push([
        x - w * 0.015 + w * 1.03 * t,
        y + pass * w * 0.016 + sag + (rnd() - 0.5) * w * 0.012,
      ]);
    }
    strokeWobble(ctx, pts);
  }
  ctx.restore();
}

/** Open circle drawn around something — slightly over a full turn, with the overshoot a hand
 *  leaves behind. Used to ring a step numeral. */
export function scribbleCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  colour: string,
  seed: number
) {
  const rnd = rand(seed);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = colour;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = Math.max(2, rx * 0.075);
  const start = -0.7;
  const end = Math.PI * 2 * 1.13 - 0.7;
  const steps = 40;
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = start + (end - start) * (i / steps);
    const j = 1 + (rnd() - 0.5) * 0.07;
    pts.push([cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j]);
  }
  strokeWobble(ctx, pts);
  ctx.restore();
}

/** Doodle arrow — a curved shaft with a two-stroke head, the kind drawn over a screenshot to say
 *  "this bit". Bows sideways so it never reads as a straight connector. */
export function doodleArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  colour: string,
  seed: number
) {
  const rnd = rand(seed);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = colour;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = Math.max(2, len * 0.035);

  // Shaft: bowed perpendicular to the run, plus a little jitter along it.
  const bow = len * 0.22;
  const nx = -dy / len;
  const ny = dx / len;
  const pts: [number, number][] = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const arc = Math.sin(t * Math.PI) * bow;
    pts.push([
      x1 + dx * t + nx * arc + (rnd() - 0.5) * len * 0.02,
      y1 + dy * t + ny * arc + (rnd() - 0.5) * len * 0.02,
    ]);
  }
  strokeWobble(ctx, pts);

  // Head: two strokes off the true tip, angled against the shaft's final direction.
  const [px, py] = pts[pts.length - 2];
  const a = Math.atan2(y2 - py, x2 - px);
  const hl = len * 0.3;
  for (const spread of [2.5, -2.5]) {
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 + Math.cos(a + spread) * hl, y2 + Math.sin(a + spread) * hl);
    ctx.stroke();
  }
  ctx.restore();
}

// ─── tool marks ─────────────────────────────────────────────────────────────────────────────

/**
 * Vector marks for the tools a deck can be about, each drawn into a 0..100 box.
 *
 * Drawn as canvas paths rather than fetched as SVG/PNG on purpose: an external image taints the
 * export canvas and `toDataURL` then throws at the last step of a render that already cost a minute.
 * These are geometric identity marks in each product's own shape language — not reproductions of a
 * trademark — which is also why each one sits next to its wordmark rather than standing alone.
 */
const TOOL_MARKS: Record<ToolBrand, (ctx: CanvasRenderingContext2D, colour: string) => void> = {
  // Four-point sparkle.
  gemini: (ctx, c) => {
    ctx.fillStyle = c;
    ctx.fill(new Path2D('M50 2C50 28 28 50 2 50C28 50 50 72 50 98C50 72 72 50 98 50C72 50 50 28 50 2Z'));
  },
  // Interlocking loops — three stroked ellipses at 60° to each other.
  chatgpt: (ctx, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = 8;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(50, 50, 46, 22, (i * Math.PI) / 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  // Radiating burst.
  claude: (ctx, c) => {
    ctx.strokeStyle = c;
    ctx.lineCap = 'round';
    ctx.lineWidth = 8;
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const inner = 14;
      const outer = i % 2 === 0 ? 47 : 38;
      ctx.beginPath();
      ctx.moveTo(50 + Math.cos(a) * inner, 50 + Math.sin(a) * inner);
      ctx.lineTo(50 + Math.cos(a) * outer, 50 + Math.sin(a) * outer);
      ctx.stroke();
    }
  },
  // Open ring in the shape of a C.
  canva: (ctx, c) => {
    ctx.strokeStyle = c;
    ctx.lineCap = 'round';
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.arc(50, 50, 38, Math.PI * 0.35, Math.PI * 1.68);
    ctx.stroke();
  },
  // Notebook with a spark.
  notebooklm: (ctx, c) => {
    ctx.strokeStyle = c;
    ctx.lineCap = 'round';
    ctx.lineWidth = 8;
    roundRectPath(ctx, 14, 10, 62, 80, 12);
    ctx.stroke();
    ctx.beginPath();
    for (const y of [34, 50]) {
      ctx.moveTo(30, y);
      ctx.lineTo(60, y);
    }
    ctx.stroke();
    ctx.fillStyle = c;
    ctx.fill(new Path2D('M76 44C76 56 68 64 56 64C68 64 76 72 76 84C76 72 84 64 96 64C84 64 76 56 76 44Z'));
  },
  // Two chevrons forming an M.
  make: (ctx, c) => {
    ctx.strokeStyle = c;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(14, 78);
    ctx.lineTo(32, 22);
    ctx.lineTo(50, 62);
    ctx.lineTo(68, 22);
    ctx.lineTo(86, 78);
    ctx.stroke();
  },
  // Connected nodes — one source fanning into two.
  n8n: (ctx, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(26, 50);
    ctx.lineTo(52, 50);
    ctx.moveTo(52, 50);
    ctx.lineTo(74, 26);
    ctx.moveTo(52, 50);
    ctx.lineTo(74, 74);
    ctx.stroke();
    ctx.fillStyle = c;
    for (const [x, y, r] of [
      [20, 50, 12],
      [78, 24, 10],
      [78, 76, 10],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  // Branching search glyph.
  perplexity: (ctx, c) => {
    ctx.strokeStyle = c;
    ctx.lineCap = 'round';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(50, 10);
    ctx.lineTo(50, 90);
    ctx.moveTo(50, 30);
    ctx.lineTo(18, 30);
    ctx.lineTo(18, 62);
    ctx.moveTo(50, 30);
    ctx.lineTo(82, 30);
    ctx.lineTo(82, 62);
    ctx.stroke();
  },
  // Goggled mark.
  copilot: (ctx, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = 8;
    roundRectPath(ctx, 10, 28, 80, 46, 23);
    ctx.stroke();
    ctx.fillStyle = c;
    for (const x of [36, 64]) {
      ctx.beginPath();
      ctx.ellipse(x, 51, 9, 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  // Four-arc ring, the Google family device.
  workspace: (ctx, c) => {
    ctx.lineCap = 'butt';
    ctx.lineWidth = 13;
    const arcs: [string, number, number][] = [
      ['#4285F4', -0.35, 1.2],
      ['#EA4335', 1.3, 2.7],
      ['#FBBC05', 2.8, 4.2],
      ['#34A853', 4.3, 5.85],
    ];
    for (const [colour, a0, a1] of arcs) {
      ctx.strokeStyle = colour || c;
      ctx.beginPath();
      ctx.arc(50, 50, 38, a0, a1);
      ctx.stroke();
    }
  },
  // Play glyph with a spark.
  veo: (ctx, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = 8;
    roundRectPath(ctx, 8, 20, 72, 60, 16);
    ctx.stroke();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(36, 34);
    ctx.lineTo(64, 50);
    ctx.lineTo(36, 66);
    ctx.closePath();
    ctx.fill();
    ctx.fill(new Path2D('M84 8C84 18 78 24 68 24C78 24 84 30 84 40C84 30 90 24 100 24C90 24 84 18 84 8Z'));
  },
  // Sail over a hull.
  midjourney: (ctx, c) => {
    ctx.strokeStyle = c;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(50, 12);
    ctx.lineTo(50, 66);
    ctx.moveTo(50, 20);
    ctx.lineTo(84, 66);
    ctx.lineTo(50, 66);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(16, 74);
    ctx.quadraticCurveTo(50, 96, 88, 74);
    ctx.stroke();
  },
};

/** Paints a tool's mark into a `size`×`size` box at (x, y). */
export function drawToolMark(
  ctx: CanvasRenderingContext2D,
  tool: ToolBrand,
  x: number,
  y: number,
  size: number,
  colour: string,
  opts: { glow?: boolean } = {}
) {
  const mark = TOOL_MARKS[tool];
  if (!mark) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // The glow is drawn as a separate pass at a lower alpha: applying shadowBlur to the mark's own
  // fill smears its edges, and these marks are small enough that the smear reads as blur, not bloom.
  if (opts.glow) {
    ctx.save();
    ctx.shadowColor = colour;
    ctx.shadowBlur = 26;
    ctx.globalAlpha = 0.55;
    mark(ctx, colour);
    ctx.restore();
  }
  mark(ctx, colour);
  ctx.restore();
}

// ─── backdrop ───────────────────────────────────────────────────────────────────────────────

/**
 * The deep-slate backdrop: a cool near-black gradient, a barely-there carbon grid, two ambient
 * radial glows in the slide's own brand pair, and a vignette that pulls the eye to the centre.
 *
 * This is what carries the tool's identity on a photo-free technical slide: a Gemini slide reads
 * purple-into-cyan, a ChatGPT slide emerald, with nothing but the backdrop doing the work. The
 * glow positions are seeded off the slide index so consecutive slides differ without ever moving
 * between the carousel PNG and the reel frames drawn from the same index.
 */
export function paintSlateBackdrop(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  seed: number,
  accent: string,
  glow: string
) {
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, SLATE_TOP);
  g.addColorStop(1, SLATE_BOTTOM);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.strokeStyle = 'rgba(226,232,240,0.03)';
  ctx.lineWidth = 1;
  const step = Math.round(W / 10);
  for (let x = step; x < W; x += step) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
    ctx.stroke();
  }
  for (let y = step; y < H; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
  }
  ctx.restore();

  const pairs: [string, number, number, number][] = [
    [accent, 0.28 + ((seed * 37) % 40) / 100, 0.2 + ((seed * 53) % 45) / 100, 0.2],
    [glow, 0.74 - ((seed * 29) % 35) / 100, 0.76 - ((seed * 41) % 30) / 100, 0.13],
  ];
  for (const [colour, fx, fy, alpha] of pairs) {
    const cx = W * fx;
    const cy = H * fy;
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.8);
    rg.addColorStop(0, hexToRgba(colour, alpha));
    rg.addColorStop(0.55, hexToRgba(colour, alpha * 0.22));
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }

  // Vignette — darkens the corners the glows just lifted, so the content column stays the
  // brightest thing on the slide no matter where the glows landed.
  const vig = ctx.createRadialGradient(W / 2, H / 2, W * 0.32, W / 2, H / 2, W * 0.95);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}
