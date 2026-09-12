import type { NodeIcon, ThreadTheme, ToolBrand } from './techTipsApi';

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
  glm: { label: 'GLM', accent: '#5B8DEF', glow: '#22D3EE' },
};

// ─── cream & terracotta preset ──────────────────────────────────────────────────────────────

/**
 * The warm editorial palette — the second of the two looks a deck can wear.
 *
 * It is not a recolour of the slate theme. The slate theme carries a tool's identity through
 * coloured light on a near-black ground; this one is paper. Contrast comes from one hot accent and
 * one near-black container against a warm off-white, which is why the install box below is the
 * loudest thing on the slide and reads as the payload before a word is parsed.
 */
export const CREAM_BG = '#FAF6F0';
/** The slightly cooler, greener cream the workflow preset sits on, so the two presets are
 *  distinguishable at thumbnail size rather than looking like one theme with different content. */
export const CREAM_BG_ALT = '#F7F4EB';
export const TERRACOTTA = '#D96B52';
/** The pale wash used for decorative marks and the unfilled half of a progress rail. */
export const TERRACOTTA_WASH = '#F0C9BC';
/** Near-black, warm rather than blue — a pure #000 reads as a hole on a cream ground. */
export const CREAM_INK = '#1C1917';
export const CREAM_BODY = '#57534E';
export const CREAM_MUTED = '#A8A29E';
/** The dark install container. Zinc-950 rather than black, so its rounded corners stay visible. */
export const INSTALL_BG = '#18181B';
/** The tan fill behind a step numeral in the workflow preset. */
export const TILE_FILL = '#EADFCD';
/** The light coral/beige callout a prompt-library card's "why I use this" line sits on — paler
 *  than TERRACOTTA_WASH so CREAM_INK body text stays comfortably readable on top of it. */
export const PROMPT_WHY_BG = '#F7E7DF';
/** The white card a workflow diagram is drawn on, lifted off the cream ground. */
export const NODE_CARD = '#FFFDFA';

/**
 * Per-service node identity: the brand colour its disc is filled with.
 *
 * These are the products' own colours, because a diagram's whole job is to be recognised at a
 * glance — an OpenAI node that is not green and a Gmail node that is not red cost the reader the
 * one thing the picture was for. The mark itself is always drawn white on top.
 */
export const NODE_STYLE: Record<NodeIcon, { fill: string; label: string }> = {
  webhook: { fill: '#EC4899', label: 'Webhook' },
  openai: { fill: '#10A37F', label: 'OpenAI' },
  gmail: { fill: '#3B82F6', label: 'Gmail' },
  calendar: { fill: '#22A565', label: 'Calendar' },
  apify: { fill: '#7C6CF6', label: 'Apify' },
  crm: { fill: '#8B5CF6', label: 'CRM' },
  make: { fill: '#6D28D9', label: 'Make' },
  n8n: { fill: '#EA4B71', label: 'n8n' },
  filter: { fill: '#3B82F6', label: 'Filter' },
  router: { fill: '#F97316', label: 'Router' },
  scheduler: { fill: '#4CAF50', label: 'Scheduler' },
  chat: { fill: '#A855F7', label: 'Chat' },
  phone: { fill: '#E4467E', label: 'Phone' },
  globe: { fill: '#6366F1', label: 'Web' },
  doc: { fill: '#2563EB', label: 'Docs' },
  sheet: { fill: '#16A34A', label: 'Sheets' },
  db: { fill: '#0EA5E9', label: 'Database' },
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
  // Open-weights mark: a stacked lattice of three bars breaking out of a bracket, for GLM / Z.ai.
  glm: (ctx, c) => {
    ctx.strokeStyle = c;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 8;
    // The bracket — "open" weights.
    ctx.beginPath();
    ctx.moveTo(38, 14);
    ctx.lineTo(16, 14);
    ctx.lineTo(16, 86);
    ctx.lineTo(38, 86);
    ctx.stroke();
    // Three descending bars, the widest at the bottom: a model's layer stack.
    ctx.beginPath();
    ctx.moveTo(38, 32);
    ctx.lineTo(66, 32);
    ctx.moveTo(38, 50);
    ctx.lineTo(78, 50);
    ctx.moveTo(38, 68);
    ctx.lineTo(90, 68);
    ctx.stroke();
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

// ─── cream preset · surfaces ────────────────────────────────────────────────────────────────

/**
 * The warm paper backdrop.
 *
 * A flat fill of #FAF6F0 photographs as grey — the warmth only reads when there is somewhere for
 * the eye to see it change. So the ground carries one very wide diagonal gradient into a slightly
 * deeper cream plus a single soft terracotta bloom in a corner, both far too subtle to compete with
 * the content. `variant` picks the cooler ground the workflow preset uses, so the two warm presets
 * are distinguishable at thumbnail size.
 */
export function paintCreamBackdrop(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  seed: number,
  variant: 'skill' | 'workflow' = 'skill'
) {
  const base = variant === 'workflow' ? CREAM_BG_ALT : CREAM_BG;
  const g = ctx.createLinearGradient(0, 0, W * 0.7, H);
  g.addColorStop(0, '#FFFCF8');
  g.addColorStop(0.55, base);
  g.addColorStop(1, variant === 'workflow' ? '#F2ECDD' : '#F6EDE4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // One warm bloom, its corner seeded off the slide index so consecutive slides differ without it
  // ever moving between the carousel PNG and the reel frames drawn from the same index.
  const cx = W * (seed % 2 === 0 ? 0.86 : 0.14);
  const cy = H * (seed % 3 === 0 ? 0.12 : 0.88);
  const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.72);
  rg.addColorStop(0, hexToRgba(TERRACOTTA, 0.09));
  rg.addColorStop(0.6, hexToRgba(TERRACOTTA, 0.02));
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);
}

/**
 * The avatar lockup: a circular portrait and the handle, top-left.
 *
 * This is the rebrand made visible. The source posts put the original creator's avatar and handle
 * in exactly this position on every slide, so leaving it empty would read as a missing element —
 * the slot is kept and OUR mark goes in it. When the site logo has not loaded, the disc falls back
 * to a terracotta monogram rather than to a grey placeholder.
 *
 * Returns the y coordinate directly beneath the lockup.
 */
export function drawAvatarLockup(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  W: number,
  logo: HTMLImageElement | null,
  opts: { size?: number; ink?: string } = {}
): number {
  const d = opts.size ?? W * 0.082;
  const cx = x + d / 2;
  const cy = y + d / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
  ctx.fillStyle = TERRACOTTA;
  ctx.fill();
  if (logo) {
    // Cover-fit inside the circle: the logo is not square, and letterboxing it inside a round
    // avatar looks like a bug rather than like a crop.
    ctx.save();
    ctx.clip();
    const iw = logo.naturalWidth || 1;
    const ih = logo.naturalHeight || 1;
    const scale = Math.max(d / iw, d / ih);
    ctx.drawImage(logo, cx - (iw * scale) / 2, cy - (ih * scale) / 2, iw * scale, ih * scale);
    ctx.restore();
  } else {
    ctx.fillStyle = '#FFF8F4';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'ltr';
    setDisplay(ctx, d * 0.46, 800);
    ctx.fillText('D', cx, cy + d * 0.02);
  }
  ctx.restore();

  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = opts.ink ?? CREAM_INK;
  setDisplay(ctx, W * 0.032, 700);
  ctx.fillText(BRAND_HANDLE.replace(/^@/, ''), x + d + W * 0.022, cy + 1);
  ctx.restore();

  return y + d;
}

/**
 * A section eyebrow — "SKILL 1 / 6" in the accent colour, followed by a hairline rule that runs to
 * the end of the content column. Letterspaced by hand: canvas has no `letter-spacing`, and an
 * un-spaced small-caps eyebrow at this size reads as a cramped word rather than as a label.
 */
export function drawEyebrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  W: number,
  text: string,
  colour: string,
  rtl = false
): number {
  const fs = W * 0.024;
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = colour;
  setBody(ctx, fs, 700);
  const track = fs * 0.16;
  const label = rtl ? text : text.toUpperCase();
  let cursor = x;
  for (const ch of label) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + track;
  }
  const ruleX = cursor + W * 0.018;
  if (ruleX < x + w) {
    ctx.strokeStyle = hexToRgba(colour, 0.3);
    ctx.lineWidth = Math.max(1, W * 0.0016);
    ctx.beginPath();
    ctx.moveTo(ruleX, y);
    ctx.lineTo(x + w, y);
    ctx.stroke();
  }
  ctx.restore();
  return y + fs;
}

/**
 * The dark "HOW TO INSTALL" container.
 *
 * The one high-contrast object on a cream slide, and deliberately so: it holds the only thing on
 * the slide the reader is meant to physically copy, so it should be findable with the text blurred
 * out. Paths and commands are drawn in mono, LTR, verbatim — `.claude/commands/tdd.md` reordered by
 * bidi is not a path any more — while the dim `save as` / `then run` leaders are what make the two
 * rows parse as instructions rather than as two unrelated strings.
 */
/**
 * The install box's own height for `rowCount` rows, at canvas width `W`.
 *
 * Exposed so a caller can reserve the right amount of vertical space for the box BEFORE drawing
 * whatever sits above it — the renderer lays a slide out top to bottom but the box is easiest to
 * draw anchored to the bottom edge, so its height has to be known in advance. Kept as the single
 * source of truth for these constants: `drawInstallBox` computes its own `h` by calling this
 * rather than repeating the formula, so the two can never drift apart and silently overlap or leave
 * a gap.
 */
export function installBoxHeight(W: number, rowCount: number): number {
  const pad = W * 0.036;
  const titleFs = W * 0.024;
  const rowFs = W * 0.028;
  const rowGap = rowFs * 1.62;
  return pad * 2 + titleFs + W * 0.028 + rowCount * rowGap;
}

export function drawInstallBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  W: number,
  m: Metrics,
  rows: { leader: string; value: string }[],
  opts: { title?: string; accent?: string } = {}
): number {
  const accent = opts.accent ?? TERRACOTTA;
  const pad = W * 0.036;
  const titleFs = W * 0.024;
  const rowFs = W * 0.028;
  const rowGap = rowFs * 1.62;
  const h = installBoxHeight(W, rows.length);

  ctx.save();
  ctx.shadowColor = 'rgba(28,25,23,0.18)';
  ctx.shadowBlur = W * 0.03;
  ctx.shadowOffsetY = W * 0.008;
  roundRectPath(ctx, x, y, w, h, m.radiusLg);
  ctx.fillStyle = INSTALL_BG;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // Download glyph — a stem, a chevron and the tray beneath it.
  const gy = y + pad + titleFs * 0.5;
  const gs = titleFs * 0.92;
  const gx = x + pad;
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1.6, W * 0.0026);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(gx + gs / 2, gy - gs * 0.5);
  ctx.lineTo(gx + gs / 2, gy + gs * 0.22);
  ctx.moveTo(gx + gs * 0.18, gy - gs * 0.1);
  ctx.lineTo(gx + gs / 2, gy + gs * 0.24);
  ctx.lineTo(gx + gs * 0.82, gy - gs * 0.1);
  ctx.moveTo(gx, gy + gs * 0.52);
  ctx.lineTo(gx + gs, gy + gs * 0.52);
  ctx.stroke();

  ctx.fillStyle = accent;
  setBody(ctx, titleFs, 700);
  const track = titleFs * 0.18;
  let cursor = gx + gs + W * 0.018;
  for (const ch of (opts.title ?? 'HOW TO INSTALL').toUpperCase()) {
    ctx.fillText(ch, cursor, gy);
    cursor += ctx.measureText(ch).width + track;
  }

  let ry = y + pad + titleFs + W * 0.028 + rowGap * 0.42;
  for (const row of rows) {
    let rx = x + pad;
    if (row.leader) {
      setMono(ctx, rowFs, 400);
      ctx.fillStyle = 'rgba(250,246,240,0.42)';
      ctx.fillText(row.leader, rx, ry);
      rx += ctx.measureText(`${row.leader} `).width;
    }
    setMono(ctx, rowFs, 600);
    ctx.fillStyle = '#FAF6F0';
    // The value is the one thing here that must never be clipped silently, so it shrinks to fit.
    let fs = rowFs;
    while (fs > rowFs * 0.6 && rx + ctx.measureText(row.value).width > x + w - pad) {
      fs *= 0.94;
      setMono(ctx, fs, 600);
    }
    ctx.fillText(row.value, rx, ry);
    ry += rowGap;
  }
  ctx.restore();
  return y + h;
}

/**
 * The bottom progress rail: a filled terracotta run over a pale track, with "n/total" to its right.
 * Mirrors the reference decks, where it is the only thing telling the reader how much is left.
 */
export function drawProgressRail(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  W: number,
  index: number,
  total: number,
  colour = TERRACOTTA
) {
  const fs = W * 0.026;
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  setBody(ctx, fs, 600);
  const label = `${index + 1}/${total}`;
  const labelW = ctx.measureText(label).width;
  const railW = Math.max(0, w - labelW - W * 0.03);
  const railH = Math.max(3, W * 0.0075);

  roundRectPath(ctx, x, y - railH / 2, railW, railH, railH / 2);
  ctx.fillStyle = hexToRgba(colour, 0.18);
  ctx.fill();

  const frac = total > 1 ? (index + 1) / total : 1;
  roundRectPath(ctx, x, y - railH / 2, Math.max(railH, railW * frac), railH, railH / 2);
  ctx.fillStyle = colour;
  ctx.fill();

  ctx.fillStyle = CREAM_MUTED;
  ctx.fillText(label, x + w, y + 1);
  ctx.restore();
}

/** The pale radiating asterisk the reference decks use as breathing room between the body and the
 *  install box. Seeded, so it is identical in the PNG and in every reel frame of the same slide. */
export function drawStarburst(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  colour: string,
  seed: number
) {
  const rnd = (() => {
    let s = (seed >>> 0) || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296);
  })();
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, r * 0.11);
  const spokes = 12;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + 0.2;
    const len = r * (0.66 + rnd() * 0.34);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.12, cy + Math.sin(a) * r * 0.12);
    ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();
}

/** The circular-arrow-with-two-dots glyph the reference deck sets opposite its headline — a loop
 *  that never quite closes, which is the red-green-refactor idea in one mark. */
export function drawLoopGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, colour: string) {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(2.5, r * 0.13);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.62, Math.PI * 0.28);
  ctx.stroke();
  // Arrowhead at the open end.
  const a = Math.PI * 0.28;
  const hx = cx + Math.cos(a) * r;
  const hy = cy + Math.sin(a) * r;
  ctx.beginPath();
  ctx.moveTo(hx - r * 0.26, hy - r * 0.2);
  ctx.lineTo(hx, hy);
  ctx.lineTo(hx + r * 0.08, hy - r * 0.3);
  ctx.stroke();
  // The red/green pair inside — failing test, passing test.
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(cx - r * 0.26, cy + r * 0.3, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4CAF50';
  ctx.beginPath();
  ctx.arc(cx + r * 0.12, cy + r * 0.32, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A rounded tan tile carrying a step numeral — the workflow preset's section marker. */
export function drawNumberTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  m: Metrics,
  n: number
) {
  ctx.save();
  roundRectPath(ctx, x, y, size, size, m.radiusMd);
  ctx.fillStyle = TILE_FILL;
  ctx.fill();
  ctx.fillStyle = CREAM_INK;
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  setDisplay(ctx, size * 0.58, 800);
  ctx.fillText(String(n), x + size / 2, y + size / 2 + size * 0.02);
  ctx.restore();
}

/**
 * The white diagram frame a workflow's node chain is drawn inside — lifted off the cream backdrop
 * by a soft shadow, the light-preset counterpart of `glassCard`. A translucent white fill (what
 * `glassCard` draws) all but disappears on a backdrop that is already near-white, so this is a
 * solid, slightly warmer white with a real shadow to read as a lifted card.
 */
export function drawPaperCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.save();
  ctx.shadowColor = 'rgba(120,95,70,0.14)';
  ctx.shadowBlur = Math.max(8, w * 0.02);
  ctx.shadowOffsetY = w * 0.006;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = NODE_CARD;
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.strokeStyle = 'rgba(28,25,23,0.06)';
  ctx.lineWidth = Math.max(1, w * 0.0012);
  ctx.stroke();
  ctx.restore();
}

// ─── workflow preset · node marks ───────────────────────────────────────────────────────────

/**
 * The service marks, each drawn white inside a 100×100 box that the caller has already filled with
 * the service's brand colour.
 *
 * Vector paths rather than fetched logos, for the same reason as TOOL_MARKS: the export canvas must
 * stay untainted for `toDataURL`, and an <img> from a CDN would taint it. They are recognisable
 * silhouettes, not exact trademarks.
 */
const NODE_MARKS: Record<NodeIcon, (ctx: CanvasRenderingContext2D) => void> = {
  // Lightning bolt.
  webhook: (ctx) => {
    ctx.fill(new Path2D('M56 8 26 56h20l-6 36 32-50H50l6-34Z'));
  },
  // The interlocking-loops knot, reused from the tool marks at node scale.
  openai: (ctx) => {
    ctx.lineWidth = 9;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(50, 50, 40, 19, (i * Math.PI) / 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  // Envelope with the M fold.
  gmail: (ctx) => {
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    roundRectPath(ctx, 14, 26, 72, 48, 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(16, 30);
    ctx.lineTo(50, 56);
    ctx.lineTo(84, 30);
    ctx.stroke();
  },
  // Calendar with a marked day.
  calendar: (ctx) => {
    ctx.lineWidth = 8;
    roundRectPath(ctx, 16, 22, 68, 62, 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(16, 40);
    ctx.lineTo(84, 40);
    ctx.moveTo(34, 12);
    ctx.lineTo(34, 28);
    ctx.moveTo(66, 12);
    ctx.lineTo(66, 28);
    ctx.stroke();
    roundRectPath(ctx, 58, 54, 16, 16, 4);
    ctx.fill();
  },
  // Spider/crawler: a body with radiating legs.
  apify: (ctx) => {
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(50, 50, 18, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      ctx.beginPath();
      ctx.moveTo(50 + Math.cos(a) * 22, 50 + Math.sin(a) * 22);
      ctx.lineTo(50 + Math.cos(a) * 42, 50 + Math.sin(a) * 42);
      ctx.stroke();
    }
  },
  // Person in a card — a contact record.
  crm: (ctx) => {
    ctx.beginPath();
    ctx.arc(50, 38, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(22, 84);
    ctx.arc(50, 84, 28, Math.PI, Math.PI * 2);
    ctx.fill();
  },
  // The Make chevron stack.
  make: (ctx) => {
    ctx.lineWidth = 9;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(20, 74);
    ctx.lineTo(36, 26);
    ctx.lineTo(50, 74);
    ctx.lineTo(64, 26);
    ctx.lineTo(80, 74);
    ctx.stroke();
  },
  // n8n: three connected nodes.
  n8n: (ctx) => {
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(28, 50);
    ctx.lineTo(50, 50);
    ctx.lineTo(72, 30);
    ctx.moveTo(50, 50);
    ctx.lineTo(72, 70);
    ctx.stroke();
    for (const [x, y] of [
      [24, 50],
      [76, 30],
      [76, 70],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  // Funnel.
  filter: (ctx) => {
    ctx.beginPath();
    ctx.moveTo(16, 20);
    ctx.lineTo(84, 20);
    ctx.lineTo(58, 52);
    ctx.lineTo(58, 86);
    ctx.lineTo(42, 76);
    ctx.lineTo(42, 52);
    ctx.closePath();
    ctx.fill();
  },
  // Branching arrows.
  router: (ctx) => {
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(22, 50);
    ctx.lineTo(48, 50);
    ctx.lineTo(74, 26);
    ctx.moveTo(48, 50);
    ctx.lineTo(74, 74);
    ctx.stroke();
    for (const [x, y] of [
      [20, 50],
      [78, 24],
      [78, 76],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  // Clock.
  scheduler: (ctx) => {
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(50, 50, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(50, 50);
    ctx.lineTo(50, 30);
    ctx.moveTo(50, 50);
    ctx.lineTo(66, 58);
    ctx.stroke();
  },
  // Speech bubble with dots.
  chat: (ctx) => {
    roundRectPath(ctx, 14, 20, 72, 52, 14);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(34, 70);
    ctx.lineTo(34, 88);
    ctx.lineTo(52, 70);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    for (const x of [34, 50, 66]) {
      ctx.beginPath();
      ctx.arc(x, 46, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },
  // Handset.
  phone: (ctx) => {
    ctx.fill(
      new Path2D(
        'M30 14c-8 0-16 8-16 18 0 30 24 54 54 54 10 0 18-8 18-16 0-4-2-6-5-7l-13-5c-3-1-6 0-8 2l-5 6c-9-5-16-12-21-21l6-5c2-2 3-5 2-8l-5-13c-1-3-3-5-7-5Z'
      )
    );
  },
  // Globe with meridians.
  globe: (ctx) => {
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(50, 50, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(50, 50, 15, 34, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(18, 50);
    ctx.lineTo(82, 50);
    ctx.stroke();
  },
  // Document with ruled lines.
  doc: (ctx) => {
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(26, 14);
    ctx.lineTo(60, 14);
    ctx.lineTo(76, 32);
    ctx.lineTo(76, 86);
    ctx.lineTo(26, 86);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    for (const y of [46, 60, 74]) {
      ctx.moveTo(38, y);
      ctx.lineTo(64, y);
    }
    ctx.stroke();
  },
  // Grid/table.
  sheet: (ctx) => {
    ctx.lineWidth = 8;
    roundRectPath(ctx, 16, 18, 68, 64, 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(16, 40);
    ctx.lineTo(84, 40);
    ctx.moveTo(50, 40);
    ctx.lineTo(50, 82);
    ctx.stroke();
  },
  // Stacked cylinders.
  db: (ctx) => {
    ctx.lineWidth = 8;
    for (const y of [30, 50, 70]) {
      ctx.beginPath();
      ctx.ellipse(50, y, 30, 11, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(20, 30);
    ctx.lineTo(20, 70);
    ctx.moveTo(80, 30);
    ctx.lineTo(80, 70);
    ctx.stroke();
  },
};

/** Paints a service node: a brand-coloured disc of diameter `size` at (cx, cy), its mark in white. */
export function drawNodeIcon(ctx: CanvasRenderingContext2D, icon: NodeIcon, cx: number, cy: number, size: number) {
  const style = NODE_STYLE[icon] ?? NODE_STYLE.globe;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = style.fill;
  ctx.shadowColor = hexToRgba(style.fill, 0.42);
  ctx.shadowBlur = size * 0.26;
  ctx.shadowOffsetY = size * 0.07;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(cx - size * 0.29, cy - size * 0.29);
  ctx.scale((size * 0.58) / 100, (size * 0.58) / 100);
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineCap = 'round';
  (NODE_MARKS[icon] ?? NODE_MARKS.globe)(ctx);
  ctx.restore();
}

/**
 * The dashed connector between two nodes: a run of dashes with a travelling dot at its midpoint and
 * a small arrowhead where it meets the target.
 *
 * Drawn as an explicit dash run rather than with `setLineDash`, because the dot and the arrowhead
 * have to sit at known fractions along the path and a dashed stroke gives no handle on that.
 */
export function drawNodeLink(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  colour: string,
  W: number
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len;
  const uy = dy / len;

  ctx.save();
  ctx.strokeStyle = hexToRgba(colour, 0.45);
  ctx.lineWidth = Math.max(2, W * 0.0034);
  ctx.lineCap = 'round';
  ctx.setLineDash([W * 0.009, W * 0.011]);
  ctx.beginPath();
  // A curved connector when the two nodes are on different rows — the fan-out in the reference
  // diagram bends out of the trunk rather than cutting diagonally across it.
  if (Math.abs(dy) > W * 0.01) {
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1 + dx * 0.45, y1, x2 - dx * 0.45, y2, x2, y2);
  } else {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Midpoint bead.
  ctx.fillStyle = hexToRgba(colour, 0.75);
  ctx.beginPath();
  ctx.arc(x1 + dx * 0.5, y1 + dy * 0.5, W * 0.0055, 0, Math.PI * 2);
  ctx.fill();

  // Arrowhead, aimed along the last leg of the path.
  const ax = x2 - ux * W * 0.004;
  const ay = y2 - uy * W * 0.004;
  const head = W * 0.011;
  ctx.fillStyle = hexToRgba(colour, 0.75);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax - ux * head + uy * head * 0.55, ay - uy * head - ux * head * 0.55);
  ctx.lineTo(ax - ux * head - uy * head * 0.55, ay - uy * head + ux * head * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
