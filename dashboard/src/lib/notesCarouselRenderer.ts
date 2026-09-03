import { getLogo, loadFont, wrapRtl } from './newsImageComposer';
import { sanitizeHebrewText } from './hebrewTextSanitizer';
import type { NewsTopic } from './newsAgentTypes';
import type { LayoutKind, StudioDeck, StudioSlide } from './carouselStudioTypes';

/**
 * "Study-notes" render style for the Carousel Studio — a light, friendly tutorial-carousel look
 * (white paper + faint dotted grid, an author identity bar, big bold black headlines, a coloured
 * italic sub-headline, disc-bullet lists, a callout, swipe arrows and a branded footer). It is the
 * light-mode counterpart to web3CarouselRenderer.ts and shares the exact same StudioSlide model,
 * so a deck can be re-rendered between the two themes without regenerating copy.
 */

const W = 1080;
const H = 1350;
const PAD = 86;
const CONTENT_TOP = 236;
const CONTENT_BOTTOM = 1176;

const PAPER = '#FFFFFF';
const PAPER_EDGE = '#F1F2F5';
const INK = '#14171B';
const INK_BODY = '#353B44';
const INK_MUTED = '#9AA1AC';
const HAIRLINE = '#E7E9EE';
const CARD_BG = '#F4F5F7';
const GREEN = '#16A34A';
const RED = '#E23B4E';

const DOMAIN = 'mrdaniel.co.il';
const AUTHOR = 'דניאל בן ברוך';
const HANDLE = '@mrdaniel · AI · סייבר · Web3';

interface TopicStyle {
  glyph: string;
  accent: string;
  soft: string;
}
const TOPIC: Record<NewsTopic, TopicStyle> = {
  ai: { glyph: '🤖', accent: '#F0356E', soft: '#FCE7EF' },
  cyber: { glyph: '🛡️', accent: '#2F6BFF', soft: '#E4ECFF' },
  cloud: { glyph: '☁️', accent: '#0EA5E9', soft: '#E0F3FC' },
  general: { glyph: '⚡', accent: '#7C3AED', soft: '#EFE7FD' },
};

// ─── shared helpers ───────────────────────────────────────────────────────────────────────

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function setBold(ctx: CanvasRenderingContext2D, px: number, weight = 800) {
  ctx.font = `${weight} ${px}px Rubik, Heebo, sans-serif`;
}
function setBody(ctx: CanvasRenderingContext2D, px: number, weight = 400) {
  ctx.font = `${weight} ${px}px Heebo, Rubik, sans-serif`;
}
function setItalic(ctx: CanvasRenderingContext2D, px: number, weight = 700) {
  ctx.font = `italic ${weight} ${px}px Rubik, Heebo, sans-serif`;
}
function setMono(ctx: CanvasRenderingContext2D, px: number, weight = 500) {
  ctx.font = `${weight} ${px}px 'JetBrains Mono', 'Heebo', monospace`;
}

function he(s: string): string {
  return sanitizeHebrewText(s || '');
}

function wrapLtr(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/(\s+)/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (ctx.measureText(cur + w).width > maxW && cur) {
      lines.push(cur.replace(/\s+$/, ''));
      cur = w.replace(/^\s+/, '');
    } else {
      cur += w;
    }
  }
  if (cur.trim()) lines.push(cur.replace(/\s+$/, ''));
  return lines.length ? lines : [''];
}

function autoFit(
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
  for (let i = 0; i < 26; i++) {
    set(ctx, px);
    lines = wrapRtl(ctx, text, maxW);
    if (lines.length <= maxLines || px <= minPx) break;
    px = Math.max(minPx, px * 0.93);
  }
  return { lines, px };
}

function paintPaper(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  // faint outer vignette so the card reads as paper, not a flat fill
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, PAPER_EDGE);
  g.addColorStop(0.12, PAPER);
  g.addColorStop(0.88, PAPER);
  g.addColorStop(1, PAPER_EDGE);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawDotGrid(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.fillStyle = 'rgba(20,23,26,0.05)';
  const step = 46;
  for (let y = step; y < H; y += step) {
    for (let x = step; x < W; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Big translucent topic glyph bleeding off the top-left corner (RTL mirror of the reference's
 * top-right logo). */
function cornerGlyph(ctx: CanvasRenderingContext2D, style: TopicStyle) {
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.font = '340px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(style.glyph, 150, 250);
  ctx.restore();
}

function drawAuthorBar(ctx: CanvasRenderingContext2D, style: TopicStyle) {
  const cy = 84;
  const avR = 34;
  const avX = W - PAD - avR;
  // avatar
  ctx.save();
  ctx.beginPath();
  ctx.arc(avX, cy, avR, 0, Math.PI * 2);
  ctx.fillStyle = style.soft;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = style.accent;
  ctx.stroke();
  ctx.clip();
  ctx.font = '38px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(style.glyph, avX, cy + 2);
  ctx.restore();

  // name + handle, right-aligned to the avatar's left edge
  const tx = avX - avR - 18;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  setItalic(ctx, 25, 800);
  ctx.fillStyle = INK;
  ctx.fillText(`${AUTHOR}  🚀`, tx, cy - 4);
  setBody(ctx, 19, 500);
  ctx.fillStyle = INK_MUTED;
  ctx.fillText(HANDLE, tx, cy + 22);

  // swipe hint, top-left
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.font = '30px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('👆', PAD, cy);
  ctx.restore();

  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, 150.5);
  ctx.lineTo(W - PAD, 150.5);
  ctx.stroke();
}

function drawSideArrows(ctx: CanvasRenderingContext2D, slide: StudioSlide, total: number) {
  const y = H / 2;
  const draw = (x: number, chev: string, show: boolean) => {
    if (!show) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(20,23,26,0.14)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(20,23,26,0.32)';
    ctx.font = '600 30px Rubik, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(chev, x, y);
    ctx.restore();
  };
  draw(46, '‹', slide.index < total - 1);
  draw(W - 46, '›', slide.index > 0);
}

function drawPageDots(ctx: CanvasRenderingContext2D, slide: StudioSlide, total: number, accent: string) {
  const n = Math.min(total, 14);
  const gap = 16;
  const startX = W / 2 - ((n - 1) * gap) / 2;
  const y = H - 30;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(startX + i * gap, y, i === slide.index ? 4 : 3, 0, Math.PI * 2);
    ctx.fillStyle = i === slide.index ? accent : 'rgba(20,23,26,0.18)';
    ctx.fill();
  }
}

async function drawFooter(ctx: CanvasRenderingContext2D, style: TopicStyle) {
  const y = H - 96;
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y - 26.5);
  ctx.lineTo(W - PAD, y - 26.5);
  ctx.stroke();

  // brand mark — right (RTL start)
  const logo = await getLogo();
  ctx.direction = 'ltr';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  let rx = W - PAD;
  if (logo) {
    const h = 30;
    const w = h * (logo.naturalWidth / logo.naturalHeight || 3);
    ctx.drawImage(logo, rx - w, y - h / 2, w, h);
    rx -= w + 12;
  }
  setMono(ctx, 19, 600);
  ctx.fillStyle = INK_MUTED;
  ctx.fillText(DOMAIN, rx, y);

  // CTA — left
  ctx.textAlign = 'left';
  ctx.direction = 'rtl';
  setBold(ctx, 19, 800);
  ctx.fillStyle = INK;
  ctx.fillText('כל התכנים המלאים והכלים', PAD, y - 12);
  setBold(ctx, 18, 700);
  ctx.fillStyle = style.accent;
  ctx.fillText(`באתר · הלינק בביו`, PAD, y + 14);
}

// ─── layout renderers ────────────────────────────────────────────────────────────────────

interface Ctx {
  ctx: CanvasRenderingContext2D;
  s: StudioSlide;
  style: TopicStyle;
}

function eyebrow(ctx: CanvasRenderingContext2D, text: string, y: number, accent: string): number {
  if (!text) return y;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  setBold(ctx, 21, 800);
  ctx.fillStyle = accent;
  ctx.fillText(he(text), W - PAD, y);
  return y + 40;
}

function renderHero({ ctx, s, style }: Ctx) {
  cornerGlyph(ctx, style);
  let y = CONTENT_TOP + 60;
  const { lines, px } = autoFit(ctx, he(s.headline), W - PAD * 2, 92, 52, 5, (c, p) => setBold(c, p, 800));
  const lh = px * 1.16;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = INK;
  for (const line of lines) {
    ctx.fillText(line, W - PAD, y);
    y += lh;
  }

  if (s.subhead) {
    y += 20;
    setItalic(ctx, 40, 700);
    ctx.fillStyle = style.accent;
    for (const line of wrapRtl(ctx, he(s.subhead), W - PAD * 2).slice(0, 3)) {
      ctx.fillText(line, W - PAD, y);
      y += 52;
    }
  }

  if (s.readingTime) {
    y += 24;
    setBody(ctx, 22, 600);
    const label = `⏱  ${he(s.readingTime)}`;
    const tw = ctx.measureText(label).width + 40;
    roundRectPath(ctx, W - PAD - tw, y - 30, tw, 46, 23);
    ctx.fillStyle = CARD_BG;
    ctx.fill();
    ctx.fillStyle = INK_BODY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, W - PAD - tw / 2, y - 6);
    ctx.textBaseline = 'alphabetic';
  }
}

function renderValue({ ctx, s, style }: Ctx) {
  let y = CONTENT_TOP + 20;
  y = eyebrow(ctx, s.kicker, y + 10, style.accent);
  if (s.headline) {
    const { lines, px } = autoFit(ctx, he(s.headline), W - PAD * 2, 52, 36, 3, (c, p) => setBold(c, p, 800));
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = INK;
    for (const line of lines) {
      ctx.fillText(line, W - PAD, y + px);
      y += px * 1.2;
    }
    y += 30;
  }
  const text = he(s.body || s.bullets.join('. '));
  const { lines, px } = autoFit(ctx, text, W - PAD * 2, 34, 25, 14, (c, p) => setBody(c, p, 400));
  setBody(ctx, px, 400);
  ctx.fillStyle = INK_BODY;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  const lh = px * 1.55;
  for (const line of lines) {
    ctx.fillText(line, W - PAD, y + px);
    y += lh;
  }
}

function bulletList(ctx: CanvasRenderingContext2D, items: string[], x: number, top: number, w: number, maxH: number, accent: string, mark = '•') {
  const count = Math.max(items.length, 1);
  const px = Math.max(24, Math.min(34, Math.floor(maxH / (count * 1.7))));
  setBody(ctx, px, 450);
  const lh = px * 1.42;
  let y = top + px;
  ctx.direction = 'rtl';
  ctx.textBaseline = 'alphabetic';
  for (const raw of items) {
    ctx.textAlign = 'right';
    ctx.fillStyle = accent;
    ctx.fillText(mark, x, y);
    ctx.fillStyle = INK_BODY;
    const lines = wrapRtl(ctx, he(raw), w - 46);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x - 40, y);
      y += lh;
    }
    y += px * 0.4;
  }
  return y;
}

function renderChecklist({ ctx, s, style }: Ctx) {
  let y = CONTENT_TOP + 20;
  y = eyebrow(ctx, s.kicker, y + 10, style.accent);
  const { lines, px } = autoFit(ctx, he(s.headline || 'הנקודות'), W - PAD * 2, 50, 34, 2, (c, p) => setBold(c, p, 800));
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = INK;
  for (const line of lines) {
    ctx.fillText(line, W - PAD, y + px);
    y += px * 1.2;
  }
  y += 28;
  const items = (s.bullets.length ? s.bullets : s.bulletsLeft).slice(0, 8);
  bulletList(ctx, items, W - PAD, y, W - PAD * 2, CONTENT_BOTTOM - y, style.accent, '•');
}

function renderStat({ ctx, s, style }: Ctx) {
  const stat = he(s.stat || '—');
  const { px } = autoFit(ctx, stat, W - PAD * 2, 230, 110, 1, (c, p) => setBold(c, p, 800));
  setBold(ctx, px, 800);
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = style.accent;
  const numY = CONTENT_TOP + 220;
  ctx.fillText(stat, W / 2, numY);
  // underline
  ctx.fillStyle = style.soft;
  roundRectPath(ctx, W / 2 - 110, numY + 20, 220, 12, 6);
  ctx.fill();

  let y = numY + 90;
  if (s.headline) {
    const { lines, px: hpx } = autoFit(ctx, he(s.headline), W - PAD * 2, 46, 32, 2, (c, p) => setBold(c, p, 800));
    setBold(ctx, hpx, 800);
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    for (const line of lines) {
      ctx.fillText(line, W / 2, y);
      y += hpx * 1.24;
    }
    y += 14;
  }
  if (s.body) {
    setBody(ctx, 30, 400);
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.fillStyle = INK_BODY;
    for (const line of wrapRtl(ctx, he(s.body), W - PAD * 2.4).slice(0, 5)) {
      ctx.fillText(line, W / 2, y);
      y += 44;
    }
  }
}

function renderComparison({ ctx, s, style }: Ctx) {
  let y = CONTENT_TOP + 20;
  y = eyebrow(ctx, s.kicker, y + 10, style.accent);
  if (s.headline) {
    const { lines, px } = autoFit(ctx, he(s.headline), W - PAD * 2, 46, 32, 2, (c, p) => setBold(c, p, 800));
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = INK;
    for (const line of lines) {
      ctx.fillText(line, W - PAD, y + px);
      y += px * 1.2;
    }
    y += 24;
  }
  const labels = s.columnLabels ?? ['מיתוס', 'מציאות'];
  const half = (CONTENT_BOTTOM - y) / 2;

  const section = (label: string, items: string[], top: number, positive: boolean) => {
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    setBold(ctx, 28, 800);
    ctx.fillStyle = positive ? GREEN : RED;
    ctx.fillText(`${positive ? '✓' : '✕'}  ${he(label)}`, W - PAD, top + 28);
    bulletList(ctx, items.slice(0, 4), W - PAD, top + 48, W - PAD * 2, half - 80, positive ? GREEN : INK_MUTED, positive ? '▸' : '·');
  };
  section(labels[0], s.bulletsLeft.length ? s.bulletsLeft : s.bullets, y, false);
  // divider
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y + half - 6.5);
  ctx.lineTo(W - PAD, y + half - 6.5);
  ctx.stroke();
  section(labels[1], s.bullets.length ? s.bullets : s.bulletsLeft, y + half + 8, true);
}

function renderPrompt({ ctx, s, style }: Ctx) {
  let y = CONTENT_TOP + 20;
  y = eyebrow(ctx, s.kicker || 'פרומפט', y + 10, style.accent);
  if (s.headline) {
    const { lines, px } = autoFit(ctx, he(s.headline), W - PAD * 2, 46, 32, 2, (c, p) => setBold(c, p, 800));
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = INK;
    for (const line of lines) {
      ctx.fillText(line, W - PAD, y + px);
      y += px * 1.2;
    }
    y += 22;
  }
  const cardH = CONTENT_BOTTOM - y;
  roundRectPath(ctx, PAD, y, W - PAD * 2, cardH, 20);
  ctx.fillStyle = CARD_BG;
  ctx.fill();
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1;
  ctx.stroke();
  // window dots + tag
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(PAD + 30 + i * 22, y + 30, 5, 0, Math.PI * 2);
    ctx.fillStyle = ['#F87171', '#FBBF24', '#34D399'][i];
    ctx.fill();
  }
  ctx.direction = 'ltr';
  ctx.textAlign = 'right';
  setMono(ctx, 16, 700);
  ctx.fillStyle = INK_MUTED;
  ctx.fillText('PROMPT', W - PAD - 26, y + 36);

  const raw = (s.code || s.body || '').replace(/\r/g, '');
  setMono(ctx, 24, 500);
  const codeLines: string[] = [];
  for (const para of raw.split('\n')) codeLines.push(...wrapLtr(ctx, para || ' ', W - PAD * 2 - 64));
  let cpx = 24;
  if (codeLines.length * cpx * 1.55 > cardH - 96) {
    cpx = Math.max(15, Math.floor((cardH - 96) / (codeLines.length * 1.55)));
    setMono(ctx, cpx, 500);
  }
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.fillStyle = INK_BODY;
  let cy = y + 76 + cpx;
  for (const line of codeLines.slice(0, Math.floor((cardH - 84) / (cpx * 1.55)))) {
    ctx.fillText(line, PAD + 28, cy);
    cy += cpx * 1.55;
  }
}

function renderQuote({ ctx, s, style }: Ctx) {
  ctx.save();
  ctx.font = '160px Rubik, sans-serif';
  ctx.fillStyle = style.soft;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('”', W / 2, CONTENT_TOP + 150);
  ctx.restore();

  const quote = he(s.quote || s.headline || s.body);
  const { lines, px } = autoFit(ctx, quote, W - PAD * 2.2, 56, 34, 6, (c, p) => setItalic(c, p, 600));
  const lh = px * 1.34;
  let y = CONTENT_TOP + 320;
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += lh;
  }
  if (s.body) {
    y += 24;
    setBody(ctx, 27, 500);
    ctx.fillStyle = INK_MUTED;
    for (const line of wrapRtl(ctx, he(s.body), W - PAD * 2).slice(0, 3)) {
      ctx.fillText(line, W / 2, y);
      y += 38;
    }
  }
  ctx.fillStyle = style.accent;
  roundRectPath(ctx, W / 2 - 54, y + 22, 108, 8, 4);
  ctx.fill();
}

function renderCta({ ctx, s, style }: Ctx) {
  let y = CONTENT_TOP + 140;
  const { lines, px } = autoFit(ctx, he(s.headline || 'רוצים ליישם את זה נכון?'), W - PAD * 2, 72, 44, 4, (c, p) => setBold(c, p, 800));
  const lh = px * 1.18;
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += lh;
  }
  if (s.body) {
    y += 20;
    setBody(ctx, 31, 400);
    ctx.fillStyle = INK_BODY;
    for (const line of wrapRtl(ctx, he(s.body), W - PAD * 2.1).slice(0, 5)) {
      ctx.fillText(line, W / 2, y);
      y += 44;
    }
  }
  y += 44;
  setBold(ctx, 32, 800);
  ctx.direction = 'ltr';
  const label = `🔗  ${DOMAIN}`;
  const tw = ctx.measureText(label).width + 76;
  const pillH = 72;
  roundRectPath(ctx, W / 2 - tw / 2, y, tw, pillH, pillH / 2);
  ctx.fillStyle = style.accent;
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, W / 2, y + pillH / 2 + 2);
  ctx.textBaseline = 'alphabetic';

  y += pillH + 46;
  setBody(ctx, 25, 600);
  ctx.direction = 'rtl';
  ctx.fillStyle = INK_MUTED;
  ctx.fillText('עקבו · שמרו · שתפו — ולעוד תוכן על AI · סייבר · Web3', W / 2, y);
}

const RENDERERS: Record<LayoutKind, (c: Ctx) => void> = {
  hero: renderHero,
  value: renderValue,
  checklist: renderChecklist,
  stat: renderStat,
  comparison: renderComparison,
  prompt: renderPrompt,
  quote: renderQuote,
  cta: renderCta,
};

async function ensureFonts() {
  await Promise.all([
    loadFont('800 92px Rubik'),
    loadFont('800 46px Rubik'),
    loadFont('700 30px Rubik'),
    loadFont('italic 700 40px Rubik'),
    loadFont('italic 600 52px Rubik'),
    loadFont('400 32px Heebo'),
    loadFont('500 26px Heebo'),
    loadFont("600 24px 'JetBrains Mono'"),
  ]);
}

export async function renderNotesSlide(slide: StudioSlide, total: number, topic: NewsTopic): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const style = TOPIC[topic] ?? TOPIC.general;

  paintPaper(ctx);
  drawDotGrid(ctx);
  await ensureFonts();
  drawAuthorBar(ctx, style);

  try {
    (RENDERERS[slide.layout] ?? renderValue)({ ctx, s: slide, style });
  } catch (err) {
    console.warn('[notes-carousel] layout render failed, using value fallback:', (err as Error)?.message);
    try {
      renderValue({ ctx, s: slide, style });
    } catch {
      /* leave the chrome-only slide */
    }
  }

  drawSideArrows(ctx, slide, total);
  drawPageDots(ctx, slide, total, style.accent);
  await drawFooter(ctx, style);

  return canvas.toDataURL('image/png');
}

export async function renderNotesDeck(
  deck: StudioDeck,
  onProgress?: (done: number, total: number) => void
): Promise<string[]> {
  const total = deck.slides.length;
  const out: string[] = [];
  for (let i = 0; i < total; i++) {
    out.push(await renderNotesSlide(deck.slides[i], total, deck.topic));
    onProgress?.(i + 1, total);
  }
  return out;
}
