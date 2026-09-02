import { BRAND_GREEN, CHARCOAL, getLogo, loadFont, wrapRtl } from './newsImageComposer';
import { sanitizeHebrewText } from './hebrewTextSanitizer';

/**
 * Single branded cover card — the high-res visual asset that ships ALONGSIDE a WhatsApp Community
 * update (also usable as a standalone teaser). Strictly enforces the site brand:
 *   • NVIDIA green (#76B900) + charcoal (#0B0F0E) + metallic slate gradient, premium tech vibe.
 *   • MR. DANIEL logo bottom-right + a `mrdaniel.co.il` domain pill (LTR isolated) bottom-left.
 *   • Auto-fitted Hebrew headline (RTL), shrink-to-fit so it never clips.
 * Formats: '1:1' (1080×1080) and '9:16' (1080×1920).
 */

export type CardFormat = '1:1' | '9:16';

const DIMS: Record<CardFormat, { W: number; H: number }> = {
  '1:1': { W: 1080, H: 1080 },
  '9:16': { W: 1080, H: 1920 },
};

const SLATE = '#161B22';
const SLATE_2 = '#0D1117';

export async function renderBrandedCard(input: {
  title: string;
  subtitle?: string;
  kicker?: string;
  format?: CardFormat;
}): Promise<string> {
  const format = input.format ?? '1:1';
  const { W, H } = DIMS[format];
  const PAD = W * 0.085;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');

  // ── background: charcoal → metallic slate diagonal + green corner glow ──
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, SLATE);
  bg.addColorStop(0.5, CHARCOAL);
  bg.addColorStop(1, SLATE_2);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.85, H * 0.12, W * 0.05, W * 0.85, H * 0.12, W * 0.9);
  glow.addColorStop(0, 'rgba(118,185,0,0.28)');
  glow.addColorStop(1, 'rgba(118,185,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(W * 0.1, H * 0.95, W * 0.05, W * 0.1, H * 0.95, W * 0.7);
  glow2.addColorStop(0, 'rgba(118,185,0,0.12)');
  glow2.addColorStop(1, 'rgba(118,185,0,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // hairline frame
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  ctx.strokeRect(PAD * 0.5, PAD * 0.5, W - PAD, H - PAD);

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  const rightX = W - PAD;
  const maxW = W - PAD * 2;

  // ── kicker pill (top-right) ──
  const kicker = (input.kicker || 'עדכון קהילה').trim();
  const kickPx = W * 0.03;
  await loadFont(`700 ${Math.round(kickPx)}px Rubik, sans-serif`);
  ctx.font = `700 ${Math.round(kickPx)}px Rubik, sans-serif`;
  const kickW = ctx.measureText(kicker).width;
  const kpX = kickPx * 0.85;
  const pillW = kickW + kpX * 2;
  const pillH = kickPx + kickPx * 0.75;
  const pillY = H * (format === '9:16' ? 0.1 : 0.12);
  ctx.fillStyle = BRAND_GREEN;
  ctx.beginPath();
  ctx.roundRect(rightX - pillW, pillY, pillW, pillH, kickPx * 0.32);
  ctx.fill();
  ctx.fillStyle = '#0B0F0E';
  ctx.textBaseline = 'middle';
  ctx.fillText(kicker, rightX - kpX, pillY + pillH / 2 + kickPx * 0.04);
  ctx.textBaseline = 'alphabetic';

  // ── headline: shrink-to-fit, RTL, max 6 lines within a safe box ──
  const headText = sanitizeHebrewText(input.title.trim());
  let headPx = W * 0.082;
  let lines: string[] = [];
  const topY = pillY + pillH + H * 0.06;
  const bottomSafeY = H - PAD * 2.4;
  for (let attempt = 0; attempt < 10; attempt++) {
    ctx.font = `800 ${Math.round(headPx)}px Rubik, sans-serif`;
    lines = wrapRtl(ctx, headText, maxW);
    const lh = headPx * 1.24;
    const widest = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
    if (widest <= maxW && topY + lines.length * lh <= bottomSafeY && lines.length <= 6) break;
    headPx *= 0.88;
  }
  await loadFont(`800 ${Math.round(headPx)}px Rubik, sans-serif`);
  ctx.font = `800 ${Math.round(headPx)}px Rubik, sans-serif`;
  const lh = headPx * 1.24;
  let y = topY + headPx;
  // brand rule above headline
  ctx.strokeStyle = BRAND_GREEN;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(rightX, y - headPx * 1.15);
  ctx.lineTo(rightX - W * 0.16, y - headPx * 1.15);
  ctx.stroke();
  for (const line of lines) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText(line, rightX + 2, y + 3);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(line, rightX, y);
    y += lh;
  }

  // ── subtitle ──
  const subtitle = (input.subtitle || '').trim();
  if (subtitle) {
    const subPx = W * 0.038;
    await loadFont(`500 ${Math.round(subPx)}px Rubik, sans-serif`);
    ctx.font = `500 ${Math.round(subPx)}px Rubik, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    y += subPx * 0.6;
    const subLh = subPx * 1.5;
    const room = Math.floor((bottomSafeY + PAD - y) / subLh);
    for (const line of wrapRtl(ctx, sanitizeHebrewText(subtitle), maxW).slice(0, Math.max(2, Math.min(5, room)))) {
      ctx.fillText(line, rightX, y);
      y += subLh;
    }
  }

  // ── footer: domain pill (LTR, bottom-left) + logo (bottom-right) ──
  const footY = H - PAD * 1.05;
  const domPx = W * 0.03;
  ctx.font = `800 ${Math.round(domPx)}px Rubik, sans-serif`;
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  const dom = 'mrdaniel.co.il';
  const domW = ctx.measureText(dom).width;
  const dpX = domPx * 0.8;
  const dPillW = domW + dpX * 2;
  const dPillH = domPx + domPx * 0.85;
  ctx.fillStyle = BRAND_GREEN;
  ctx.beginPath();
  ctx.roundRect(PAD, footY - dPillH, dPillW, dPillH, domPx * 0.3);
  ctx.fill();
  ctx.fillStyle = '#0B0F0E';
  ctx.textBaseline = 'middle';
  ctx.fillText(dom, PAD + dpX, footY - dPillH / 2 + domPx * 0.05);
  ctx.textBaseline = 'alphabetic';

  const logo = await getLogo();
  if (logo) {
    const logoH = Math.max(H * 0.03, 40);
    const logoW = logoH * (logo.naturalWidth / logo.naturalHeight);
    ctx.drawImage(logo, W - PAD - logoW, footY - dPillH / 2 - logoH / 2, logoW, logoH);
  }

  return canvas.toDataURL('image/png');
}
