import JSZip from 'jszip';
import { getLogo, loadFont, wrapRtl } from './newsImageComposer';
import { sanitizeHebrewText } from './hebrewTextSanitizer';
import type { AccentKey, LayoutKind, StudioDeck, StudioSlide } from './carouselStudioTypes';

/**
 * Agents 3 & 4 of the WEB3 Carousel Studio.
 *
 *  · directDeck()        — "WEB3 Creative Director": assigns each slide an accent (electric green /
 *                          cyber cyan), an ambient-glow intensity, and normalises the layout.
 *  · renderStudioSlide() — "Compositor & Export Engine": paints one pixel-perfect 1080×1350 slide
 *                          on a <canvas> — deep-obsidian ground, carbon grid, neon glows,
 *                          glassmorphism panels, a brand top bar and an interactive-style bottom
 *                          progress rail — and returns a PNG data URL.
 *  · renderStudioDeck()  — renders every slide, reporting progress.
 *  · exportStudioZip()   — bundles the deck as 01_Hook.png … NN_CTA.png + caption/hashtags.
 */

const W = 1080;
const H = 1350;
const PAD = 92;
const CONTENT_TOP = 214;
const CONTENT_BOTTOM = H - 168;

const OBSIDIAN_TOP = '#06080D';
const OBSIDIAN_BOTTOM = '#0B0F17';
const NEON_GREEN = '#76B900';
const NEON_GREEN_BRIGHT = '#00FF66';
const CYBER_CYAN = '#00F0FF';
const SILVER = '#E2E8F0';

const BRAND_ID = 'MR. DANIEL // AI COMMAND';
const DOMAIN = 'mrdaniel.co.il';

function accentHex(a: AccentKey): string {
  return a === 'cyan' ? CYBER_CYAN : NEON_GREEN_BRIGHT;
}

// ─── Agent 3 · WEB3 Creative Director ──────────────────────────────────────────────────────

const LAYOUT_STYLE: Record<LayoutKind, { accent: AccentKey; glow: number }> = {
  hero: { accent: 'green', glow: 0.95 },
  value: { accent: 'green', glow: 0.4 },
  checklist: { accent: 'green', glow: 0.5 },
  stat: { accent: 'cyan', glow: 0.85 },
  comparison: { accent: 'green', glow: 0.5 },
  prompt: { accent: 'green', glow: 0.55 },
  quote: { accent: 'cyan', glow: 0.7 },
  cta: { accent: 'green', glow: 1 },
};

/** Pure — returns a new deck with per-slide accent + glow assigned. `value` slides alternate the
 * accent so a long deck keeps visual rhythm. */
export function directDeck(deck: StudioDeck): StudioDeck {
  let valueSeen = 0;
  const slides = deck.slides.map((s): StudioSlide => {
    const base = LAYOUT_STYLE[s.layout] ?? LAYOUT_STYLE.value;
    let accent = base.accent;
    if (s.layout === 'value') {
      accent = valueSeen % 2 === 0 ? 'green' : 'cyan';
      valueSeen++;
    }
    return { ...s, accent, glow: base.glow };
  });
  return { ...deck, slides };
}

// ─── shared canvas chrome ─────────────────────────────────────────────────────────────────

function paintObsidian(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, OBSIDIAN_TOP);
  g.addColorStop(1, OBSIDIAN_BOTTOM);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawCarbonGrid(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(226,232,240,0.035)';
  const step = 108;
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
  // one brighter accent axis for depth
  ctx.strokeStyle = 'rgba(118,185,0,0.06)';
  ctx.beginPath();
  ctx.moveTo(W - step * 2 + 0.5, 0);
  ctx.lineTo(W - step * 2 + 0.5, H);
  ctx.stroke();
  ctx.restore();
}

function drawAmbientGlow(ctx: CanvasRenderingContext2D, slide: StudioSlide) {
  if (slide.glow <= 0) return;
  const hex = accentHex(slide.accent);
  const cx = slide.layout === 'hero' || slide.layout === 'cta' || slide.layout === 'quote' ? W / 2 : W * 0.62;
  const cy = slide.layout === 'hero' ? H * 0.66 : slide.layout === 'stat' ? H * 0.44 : H * 0.5;
  const r = W * (0.55 + slide.glow * 0.25);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, hexToRgba(hex, 0.18 * slide.glow));
  g.addColorStop(0.55, hexToRgba(hex, 0.05 * slide.glow));
  g.addColorStop(1, hexToRgba(hex, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function hexToRgba(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Frosted-glass container: translucent fill, hairline border, soft outer shadow, top inner
 * highlight — the `backdrop-blur-xl bg-white/[0.03] border-white/10` treatment from the spec. */
function glassPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r = 28,
  accent?: string
) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 24;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  ctx.fill();
  ctx.restore();

  roundRectPath(ctx, x, y, w, h, r);
  ctx.strokeStyle = accent ? hexToRgba(accent, 0.35) : 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // top inner highlight
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.clip();
  const hl = ctx.createLinearGradient(0, y, 0, y + h * 0.4);
  hl.addColorStop(0, 'rgba(255,255,255,0.08)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(x, y, w, h * 0.4);
  ctx.restore();
}

function setMono(ctx: CanvasRenderingContext2D, px: number, weight = 500) {
  ctx.font = `${weight} ${px}px 'JetBrains Mono', 'Heebo', monospace`;
}
function setDisplay(ctx: CanvasRenderingContext2D, px: number, weight = 800) {
  ctx.font = `${weight} ${px}px Rubik, Heebo, sans-serif`;
}
function setBody(ctx: CanvasRenderingContext2D, px: number, weight = 400) {
  ctx.font = `${weight} ${px}px Heebo, Rubik, sans-serif`;
}

/** Gradient-filled headline lines (white → slate → accent), RTL, right-aligned unless centered. */
function drawGradientLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  rightX: number,
  startY: number,
  lh: number,
  accent: string,
  centered = false
) {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = centered ? 'center' : 'right';
  ctx.textBaseline = 'alphabetic';
  let y = startY;
  for (const line of lines) {
    const grad = ctx.createLinearGradient(rightX, y - lh, rightX - (W - PAD * 2), y);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.55, SILVER);
    grad.addColorStop(1, accent);
    ctx.fillStyle = grad;
    ctx.fillText(line, centered ? W / 2 : rightX, y);
    y += lh;
  }
  ctx.restore();
  return y;
}

function drawTopBar(ctx: CanvasRenderingContext2D, slide: StudioSlide, total: number) {
  const y = 74;
  const accent = accentHex(slide.accent);
  // brand id — left, LTR, letter-spaced mono
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  setMono(ctx, 20, 600);
  ctx.fillStyle = 'rgba(226,232,240,0.72)';
  drawTracked(ctx, BRAND_ID, PAD, y, 2.5);
  ctx.restore();

  // slide index — right, mono
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  setMono(ctx, 20, 600);
  ctx.fillStyle = 'rgba(226,232,240,0.55)';
  const idx = `${String(slide.index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  const idxW = ctx.measureText(idx).width;
  ctx.fillText(idx, W - PAD, y);
  ctx.restore();

  // live pill — just left of the index
  const pillLabel = 'LIVE';
  setMono(ctx, 16, 700);
  const pillW = ctx.measureText(pillLabel).width + 3 * 2.2 + 44;
  const pillH = 34;
  const pillX = W - PAD - idxW - 24 - pillW;
  const pillY = y - pillH / 2;
  roundRectPath(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fillStyle = hexToRgba(accent, 0.12);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(accent, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 12;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(pillX + 17, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = accent;
  drawTracked(ctx, pillLabel, pillX + 30, y + 1, 2.2);

  // kicker chip — under the brand id, RTL
  const kicker = sanitizeHebrewText(slide.kicker || '').slice(0, 28);
  if (kicker) {
    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    setMono(ctx, 18, 600);
    const kw = ctx.measureText(kicker).width + 34;
    const kh = 40;
    const kx = W - PAD - kw;
    const ky = 108;
    roundRectPath(ctx, kx, ky, kw, kh, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(226,232,240,0.8)';
    ctx.fillText(kicker, W - PAD - 17, ky + kh / 2 + 1);
    ctx.restore();
  }

  // hairline under the bar
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, 158.5);
  ctx.lineTo(W - PAD, 158.5);
  ctx.stroke();
}

/** letter-spaced text (canvas has no letterSpacing in older engines — draw char by char). */
function drawTracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
  return cx;
}

function drawBottomBar(ctx: CanvasRenderingContext2D, slide: StudioSlide, total: number) {
  const railY = H - 116;
  const accent = accentHex(slide.accent);

  // progress rail
  const gap = 8;
  const railW = W - PAD * 2;
  const segW = (railW - gap * (total - 1)) / total;
  for (let i = 0; i < total; i++) {
    const x = PAD + i * (segW + gap);
    roundRectPath(ctx, x, railY, segW, 5, 2.5);
    ctx.fillStyle = i <= slide.index ? accent : 'rgba(255,255,255,0.14)';
    if (i === slide.index) {
      ctx.save();
      ctx.shadowColor = accent;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fill();
    }
  }

  // domain — left, LTR
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  setMono(ctx, 20, 600);
  ctx.fillStyle = 'rgba(226,232,240,0.6)';
  ctx.fillText(DOMAIN, PAD, H - 74);
  ctx.restore();

  // swipe indicator — right, RTL (hidden on the last slide)
  if (slide.index < total - 1) {
    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    setBody(ctx, 22, 600);
    ctx.fillStyle = hexToRgba(accent, 0.9);
    ctx.fillText('החלק לשקף הבא  ➔', W - PAD, H - 74);
    ctx.restore();
  }
}

async function drawLogo(ctx: CanvasRenderingContext2D) {
  const logo = await getLogo();
  if (!logo) return;
  const h = 40;
  const w = h * (logo.naturalWidth / logo.naturalHeight || 3);
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.drawImage(logo, W / 2 - w / 2, H - 150, w, h);
  ctx.restore();
}

// ─── layout renderers ─────────────────────────────────────────────────────────────────────

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function contentBox(): Box {
  return { x: PAD, y: CONTENT_TOP, w: W - PAD * 2, h: CONTENT_BOTTOM - CONTENT_TOP };
}

function autoFitLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  startPx: number,
  minPx: number,
  maxLines: number,
  set: (c: CanvasRenderingContext2D, px: number) => void
): { lines: string[]; px: number } {
  let px = startPx;
  let lines: string[] = [];
  for (let i = 0; i < 30; i++) {
    set(ctx, px);
    lines = wrapRtl(ctx, text, maxW);
    if (lines.length <= maxLines || px <= minPx) break;
    px = Math.max(minPx, px * 0.93);
  }
  return { lines, px };
}

function renderHero(ctx: CanvasRenderingContext2D, s: StudioSlide) {
  const b = contentBox();
  const accent = accentHex(s.accent);
  const headText = sanitizeHebrewText(s.headline);
  const { lines, px } = autoFitLines(ctx, headText, b.w, 96, 52, 5, (c, p) => setDisplay(c, p, 800));
  const lh = px * 1.2;
  const blockH = lines.length * lh;
  let y = b.y + Math.max(40, (b.h - blockH) * 0.42) + px;

  // accent tick above the headline
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.moveTo(b.x + b.w, y - px - 26);
  ctx.lineTo(b.x + b.w - 150, y - px - 26);
  ctx.stroke();
  ctx.restore();

  y = drawGradientLines(ctx, lines, b.x + b.w, y, lh, accent, false);

  // sub-headline
  if (s.subhead) {
    y += 26;
    setBody(ctx, 34, 400);
    ctx.fillStyle = 'rgba(226,232,240,0.82)';
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    for (const line of wrapRtl(ctx, sanitizeHebrewText(s.subhead), b.w).slice(0, 4)) {
      ctx.fillText(line, b.x + b.w, y);
      y += 46;
    }
  }

  // reading-time pill
  if (s.readingTime) {
    y += 18;
    setMono(ctx, 20, 600);
    const label = sanitizeHebrewText(s.readingTime);
    const tw = ctx.measureText(label).width + 40;
    const px2 = b.x + b.w - tw;
    roundRectPath(ctx, px2, y, tw, 44, 22);
    ctx.fillStyle = hexToRgba(accent, 0.12);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(accent, 0.4);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, px2 + tw / 2, y + 23);
    ctx.textBaseline = 'alphabetic';
  }
}

function renderValue(ctx: CanvasRenderingContext2D, s: StudioSlide) {
  const b = contentBox();
  const accent = accentHex(s.accent);
  let y = b.y + 26;

  if (s.headline) {
    const { lines, px } = autoFitLines(ctx, sanitizeHebrewText(s.headline), b.w, 58, 40, 3, (c, p) => setDisplay(c, p, 800));
    y = drawGradientLines(ctx, lines, b.x + b.w, y + px, px * 1.16, accent, false);
    // accent rule
    ctx.save();
    ctx.fillStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 12;
    roundRectPath(ctx, b.x + b.w - 132, y + 14, 132, 5, 2.5);
    ctx.fill();
    ctx.restore();
    y += 62;
  }

  const panelY = y;
  const panelH = b.y + b.h - panelY;
  glassPanel(ctx, b.x, panelY, b.w, panelH, 30, accent);

  const inX = b.x + 46;
  const inW = b.w - 92;
  const bodyText = sanitizeHebrewText(s.body || (s.bullets || []).join('. '));
  const { lines, px } = autoFitLines(ctx, bodyText, inW, 40, 26, 12, (c, p) => setBody(c, p, 400));
  setBody(ctx, px, 400);
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  const lh = px * 1.5;
  let ty = panelY + Math.max(46, (panelH - lines.length * lh) / 2) + px;
  for (const line of lines) {
    ctx.fillText(line, b.x + b.w - 46, ty);
    ty += lh;
  }
}

function renderChecklist(ctx: CanvasRenderingContext2D, s: StudioSlide) {
  const b = contentBox();
  const accent = accentHex(s.accent);
  let y = b.y + 26;
  const { lines, px } = autoFitLines(ctx, sanitizeHebrewText(s.headline || 'מה חשוב לדעת'), b.w, 56, 40, 2, (c, p) => setDisplay(c, p, 800));
  y = drawGradientLines(ctx, lines, b.x + b.w, y + px, px * 1.16, accent, false);
  y += 44;

  const items = (s.bullets.length ? s.bullets : s.bulletsLeft).slice(0, 5).map((t) => sanitizeHebrewText(t));
  const rowH = Math.min(150, (b.y + b.h - y) / Math.max(items.length, 1));
  for (const item of items) {
    const ry = y;
    glassPanel(ctx, b.x, ry, b.w, rowH - 16, 20, accent);
    // check mark box
    const boxS = 40;
    const bx = b.x + b.w - 46 - boxS;
    const by = ry + (rowH - 16) / 2 - boxS / 2;
    roundRectPath(ctx, bx, by, boxS, boxS, 10);
    ctx.fillStyle = hexToRgba(accent, 0.16);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.shadowColor = accent;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(bx + 10, by + 21);
    ctx.lineTo(bx + 18, by + 29);
    ctx.lineTo(bx + 31, by + 12);
    ctx.stroke();
    ctx.restore();
    // text
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    const { lines: il, px: ipx } = autoFitLines(ctx, item, b.w - 92 - boxS - 24, 32, 22, 2, (c, p) => setBody(c, p, 500));
    setBody(ctx, ipx, 500);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    let ity = ry + (rowH - 16) / 2 - ((il.length - 1) * ipx * 1.3) / 2 + ipx * 0.35;
    for (const line of il) {
      ctx.fillText(line, bx - 24, ity);
      ity += ipx * 1.3;
    }
    y += rowH;
  }
}

function renderStat(ctx: CanvasRenderingContext2D, s: StudioSlide) {
  const b = contentBox();
  const accent = accentHex(s.accent);
  const stat = sanitizeHebrewText(s.stat || '—');

  // oversized number, centered, with heavy glow
  const { px } = autoFitLines(ctx, stat, b.w, 260, 120, 1, (c, p) => setDisplay(c, p, 900));
  setDisplay(ctx, px, 900);
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = accent;
  ctx.shadowBlur = 60;
  const grad = ctx.createLinearGradient(0, b.y + 60, 0, b.y + 60 + px);
  grad.addColorStop(0, '#FFFFFF');
  grad.addColorStop(1, accent);
  ctx.fillStyle = grad;
  const numY = b.y + b.h * 0.34;
  ctx.fillText(stat, W / 2, numY);
  ctx.restore();

  // headline under the number
  let y = numY + px * 0.5 + 40;
  if (s.headline) {
    const { lines, px: hpx } = autoFitLines(ctx, sanitizeHebrewText(s.headline), b.w, 46, 32, 2, (c, p) => setDisplay(c, p, 700));
    setDisplay(ctx, hpx, 700);
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.fillStyle = SILVER;
    for (const line of lines) {
      ctx.fillText(line, W / 2, y);
      y += hpx * 1.25;
    }
    y += 12;
  }

  // explainer
  if (s.body) {
    setBody(ctx, 30, 400);
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(226,232,240,0.78)';
    for (const line of wrapRtl(ctx, sanitizeHebrewText(s.body), b.w * 0.86).slice(0, 4)) {
      ctx.fillText(line, W / 2, y);
      y += 42;
    }
  }
}

function renderComparison(ctx: CanvasRenderingContext2D, s: StudioSlide) {
  const b = contentBox();
  const accent = accentHex(s.accent);
  let y = b.y + 22;
  if (s.headline) {
    const { lines, px } = autoFitLines(ctx, sanitizeHebrewText(s.headline), b.w, 52, 36, 2, (c, p) => setDisplay(c, p, 800));
    y = drawGradientLines(ctx, lines, b.x + b.w, y + px, px * 1.16, accent, false);
    y += 34;
  }

  const colGap = 28;
  const colW = (b.w - colGap) / 2;
  const colH = b.y + b.h - y;
  const labels = s.columnLabels ?? ['מיתוס', 'מציאות'];
  // right column (RTL first) = bulletsLeft, left column = bullets
  const cols: { x: number; label: string; items: string[]; tone: 'dim' | 'bright' }[] = [
    { x: b.x + colW + colGap, label: labels[0], items: s.bulletsLeft.length ? s.bulletsLeft : s.bullets, tone: 'dim' },
    { x: b.x, label: labels[1], items: s.bullets.length ? s.bullets : s.bulletsLeft, tone: 'bright' },
  ];

  for (const col of cols) {
    const isBright = col.tone === 'bright';
    glassPanel(ctx, col.x, y, colW, colH, 26, isBright ? accent : undefined);
    // label header
    roundRectPath(ctx, col.x + 20, y + 20, colW - 40, 48, 12);
    ctx.fillStyle = isBright ? hexToRgba(accent, 0.16) : 'rgba(255,255,255,0.05)';
    ctx.fill();
    setDisplay(ctx, 26, 800);
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isBright ? accent : 'rgba(226,232,240,0.7)';
    ctx.fillText(sanitizeHebrewText(col.label), col.x + colW / 2, y + 45);
    ctx.textBaseline = 'alphabetic';

    // items
    let iy = y + 100;
    setBody(ctx, 25, 450);
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = isBright ? 'rgba(255,255,255,0.95)' : 'rgba(226,232,240,0.7)';
    for (const raw of col.items.slice(0, 4)) {
      const bullet = isBright ? '▸ ' : '· ';
      for (const line of wrapRtl(ctx, bullet + sanitizeHebrewText(raw), colW - 44).slice(0, 3)) {
        ctx.fillText(line, col.x + colW - 22, iy);
        iy += 34;
      }
      iy += 12;
    }
  }
}

function renderPrompt(ctx: CanvasRenderingContext2D, s: StudioSlide) {
  const b = contentBox();
  const accent = accentHex(s.accent);
  let y = b.y + 22;
  if (s.headline) {
    const { lines, px } = autoFitLines(ctx, sanitizeHebrewText(s.headline), b.w, 52, 36, 2, (c, p) => setDisplay(c, p, 800));
    y = drawGradientLines(ctx, lines, b.x + b.w, y + px, px * 1.16, accent, false);
    y += 30;
  }

  const panelH = b.y + b.h - y;
  glassPanel(ctx, b.x, y, b.w, panelH, 24, accent);
  // window dots
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(b.x + 34 + i * 24, y + 34, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  setMono(ctx, 16, 600);
  ctx.direction = 'ltr';
  ctx.textAlign = 'right';
  ctx.fillStyle = hexToRgba(accent, 0.8);
  ctx.fillText('PROMPT', b.x + b.w - 28, y + 40);

  // code body — LTR, mono, wrapped on width, preserves explicit newlines
  const codeRaw = (s.code || s.body || '').replace(/\r/g, '');
  const codeLines: string[] = [];
  setMono(ctx, 24, 500);
  for (const para of codeRaw.split('\n')) {
    const wrapped = wrapLtr(ctx, para || ' ', b.w - 76);
    codeLines.push(...wrapped);
  }
  let cpx = 24;
  if (codeLines.length * cpx * 1.55 > panelH - 96) {
    cpx = Math.max(15, Math.floor((panelH - 96) / (codeLines.length * 1.55)));
    setMono(ctx, cpx, 500);
  }
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(226,232,240,0.95)';
  let cy = y + 78 + cpx;
  for (const line of codeLines.slice(0, Math.floor((panelH - 90) / (cpx * 1.55)))) {
    ctx.fillText(line, b.x + 30, cy);
    cy += cpx * 1.55;
  }
}

function wrapLtr(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/(\s+)/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (ctx.measureText(cur + w).width > maxW && cur) {
      lines.push(cur.trimEnd());
      cur = w.trimStart();
    } else {
      cur += w;
    }
  }
  if (cur.trim()) lines.push(cur.trimEnd());
  return lines.length ? lines : [''];
}

function renderQuote(ctx: CanvasRenderingContext2D, s: StudioSlide) {
  const b = contentBox();
  const accent = accentHex(s.accent);
  const quote = sanitizeHebrewText(s.quote || s.headline || s.body);

  // big quote mark
  setDisplay(ctx, 200, 900);
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.fillStyle = hexToRgba(accent, 0.28);
  ctx.shadowColor = accent;
  ctx.shadowBlur = 40;
  ctx.fillText('”', W / 2, b.y + 150);
  ctx.restore();

  const { lines, px } = autoFitLines(ctx, quote, b.w * 0.92, 60, 34, 6, (c, p) => setDisplay(c, p, 700));
  const lh = px * 1.32;
  let y = b.y + b.h * 0.34;
  y = drawGradientLines(ctx, lines, W / 2, y, lh, accent, true);

  if (s.body) {
    y += 30;
    setBody(ctx, 28, 500);
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(226,232,240,0.72)';
    for (const line of wrapRtl(ctx, sanitizeHebrewText(s.body), b.w * 0.8).slice(0, 3)) {
      ctx.fillText(line, W / 2, y);
      y += 40;
    }
  }

  // underline accent
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 14;
  roundRectPath(ctx, W / 2 - 60, y + 22, 120, 5, 2.5);
  ctx.fill();
  ctx.restore();
}

function renderCta(ctx: CanvasRenderingContext2D, s: StudioSlide) {
  const b = contentBox();
  const accent = accentHex(s.accent);
  const headText = sanitizeHebrewText(s.headline || 'רוצים ליישם את זה נכון?');
  const { lines, px } = autoFitLines(ctx, headText, b.w * 0.94, 78, 46, 4, (c, p) => setDisplay(c, p, 800));
  const lh = px * 1.2;
  let y = b.y + b.h * 0.26;
  y = drawGradientLines(ctx, lines, W / 2, y, lh, accent, true);

  if (s.body) {
    y += 26;
    setBody(ctx, 32, 400);
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(226,232,240,0.82)';
    for (const line of wrapRtl(ctx, sanitizeHebrewText(s.body), b.w * 0.82).slice(0, 5)) {
      ctx.fillText(line, W / 2, y);
      y += 44;
    }
  }

  // link pill
  y += 40;
  setDisplay(ctx, 34, 800);
  ctx.direction = 'ltr';
  const label = `🔗  ${DOMAIN}`;
  const tw = ctx.measureText(label).width + 72;
  const pillH = 74;
  const pillX = W / 2 - tw / 2;
  roundRectPath(ctx, pillX, y, tw, pillH, pillH / 2);
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 34;
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#05070A';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, W / 2, y + pillH / 2 + 2);
  ctx.textBaseline = 'alphabetic';

  // follow line
  y += pillH + 44;
  setBody(ctx, 26, 500);
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(226,232,240,0.6)';
  ctx.fillText('עקבו לעוד תוכן על AI · מודלים · סוכנים', W / 2, y);
}

const LAYOUT_RENDERERS: Record<LayoutKind, (ctx: CanvasRenderingContext2D, s: StudioSlide) => void> = {
  hero: renderHero,
  value: renderValue,
  checklist: renderChecklist,
  stat: renderStat,
  comparison: renderComparison,
  prompt: renderPrompt,
  quote: renderQuote,
  cta: renderCta,
};

// ─── Agent 4 · Compositor ─────────────────────────────────────────────────────────────────

async function ensureFonts() {
  await Promise.all([
    loadFont("800 96px Rubik"),
    loadFont("900 200px Rubik"),
    loadFont("700 46px Rubik"),
    loadFont("500 40px Heebo"),
    loadFont("400 34px Heebo"),
    loadFont("600 22px 'JetBrains Mono'"),
    loadFont("500 24px 'JetBrains Mono'"),
  ]);
}

export async function renderStudioSlide(slide: StudioSlide, total: number): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  paintObsidian(ctx);
  drawCarbonGrid(ctx);
  drawAmbientGlow(ctx, slide);
  await ensureFonts();

  drawTopBar(ctx, slide, total);

  try {
    (LAYOUT_RENDERERS[slide.layout] ?? renderValue)(ctx, slide);
  } catch (err) {
    console.warn('[carousel-studio] layout render failed, using value fallback:', (err as Error)?.message);
    renderValue(ctx, slide);
  }

  drawBottomBar(ctx, slide, total);
  if (slide.layout !== 'cta') await drawLogo(ctx);

  return canvas.toDataURL('image/png');
}

export async function renderStudioDeck(
  deck: StudioDeck,
  onProgress?: (done: number, total: number) => void
): Promise<string[]> {
  const total = deck.slides.length;
  const out: string[] = [];
  for (let i = 0; i < total; i++) {
    out.push(await renderStudioSlide(deck.slides[i], total));
    onProgress?.(i + 1, total);
  }
  return out;
}

// ─── ZIP export ───────────────────────────────────────────────────────────────────────────

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? '';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function slideTag(s: StudioSlide): string {
  if (s.role === 'hook') return 'Hook';
  if (s.role === 'cta') return 'CTA';
  return s.layout.charAt(0).toUpperCase() + s.layout.slice(1);
}

export async function exportStudioZip(deck: StudioDeck, images: string[]): Promise<void> {
  const zip = new JSZip();
  const slug = (deck.title || 'carousel').replace(/[^\w֐-׿]+/g, '-').slice(0, 40) || 'carousel';

  images.forEach((img, i) => {
    const s = deck.slides[i];
    if (img && s) zip.file(`${String(i + 1).padStart(2, '0')}_${slideTag(s)}.png`, dataUrlToBytes(img));
  });

  zip.file(
    'caption.txt',
    [
      deck.caption,
      '',
      deck.hashtags.join(' '),
      '',
      '--- הערה ---',
      'Instagram: העלו את כל התמונות לפי הסדר (01→NN) כקרוסלה אחת, והדביקו את הטקסט שלמעלה ככיתוב.',
    ].join('\n')
  );
  zip.file('hashtags.txt', deck.hashtags.join(' '));
  zip.file(
    'deck.json',
    JSON.stringify(
      { title: deck.title, topic: deck.topic, synthesized: deck.synthesized, source: deck.sourceLink, slides: deck.slides },
      null,
      2
    )
  );

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mrdaniel-web3-carousel-${slug}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
