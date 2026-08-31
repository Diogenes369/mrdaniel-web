import type { NewsItem } from './newsAgentTypes';
import { proxiedImageUrl } from './newsFeedClient';
import { sanitizeHebrewText } from './hebrewTextSanitizer';
import { BRAND_GREEN, CHARCOAL, getLogo, loadFont, drawImageCover, wrapRtl, resolveNewsBackground } from './newsImageComposer';
import { buildStorySlides, type StorySlide, type StoryPayload } from './storySlides';

/**
 * Instagram Story renderer — 9:16 (1080×1920), one <canvas> per slide, no server render.
 * Every slide shares: the full-bleed brand background (the news photo, prominent on the cover /
 * heavily darkened as texture elsewhere) + dark gradient, a 4-segment progress bar up top, the
 * topic kicker, and the MR. DANIEL logo bottom-right. The `mrdaniel.co.il` domain text appears
 * ONLY on slide 4 (the CTA slide) — as the footer AND the prominent link pill.
 */

const W = 1080;
const H = 1920;
const PAD = W * 0.09;

async function resolveStoryBg(item: NewsItem): Promise<HTMLImageElement | null> {
  // Shared resolver: original article image (proxied, retried) → direct CORS → topic stock photo.
  const { img } = await resolveNewsBackground(item, '4:5');
  return img;
}

function drawProgressBar(ctx: CanvasRenderingContext2D, index: number, total: number) {
  const top = H * 0.035;
  const gap = 10;
  const segW = (W - PAD * 2 - gap * (total - 1)) / total;
  for (let i = 0; i < total; i++) {
    ctx.fillStyle = i <= index ? BRAND_GREEN : 'rgba(255,255,255,0.28)';
    const x = PAD + i * (segW + gap);
    ctx.beginPath();
    ctx.roundRect(x, top, segW, 6, 3);
    ctx.fill();
  }
}

function drawKicker(ctx: CanvasRenderingContext2D, label: string, y: number) {
  const fontSize = W * 0.03;
  ctx.font = `700 ${Math.round(fontSize)}px Rubik, sans-serif`;
  ctx.direction = 'rtl';
  const textW = ctx.measureText(label).width;
  const padX = fontSize * 0.85;
  const boxW = textW + padX * 2;
  const boxH = fontSize + fontSize * 0.7;
  const rightX = W - PAD;
  const left = rightX - boxW;
  ctx.fillStyle = BRAND_GREEN;
  ctx.beginPath();
  ctx.roundRect(left, y, boxW, boxH, fontSize * 0.3);
  ctx.fill();
  ctx.fillStyle = '#0B0F0E';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, rightX - padX, y + boxH / 2 + fontSize * 0.04);
}

/** Branded MR. DANIEL logo, bottom-right, on every slide. The `mrdaniel.co.il` domain text is
 * drawn bottom-left ONLY on the CTA slide (`withDomain`) — the link belongs on slide 4. */
async function drawFooter(ctx: CanvasRenderingContext2D, withDomain: boolean) {
  const logo = await getLogo();
  const y = H - PAD * 0.85;
  if (logo) {
    const logoH = H * 0.032;
    const logoW = logoH * (logo.naturalWidth / logo.naturalHeight);
    ctx.drawImage(logo, W - PAD - logoW, y - logoH, logoW, logoH);
  }
  if (withDomain) {
    ctx.font = `600 ${Math.round(W * 0.026)}px Rubik, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('mrdaniel.co.il', PAD, y);
  }
}

function paintBackground(ctx: CanvasRenderingContext2D, photo: HTMLImageElement | null, kind: StorySlide['kind']) {
  ctx.fillStyle = CHARCOAL;
  ctx.fillRect(0, 0, W, H);
  if (photo) drawImageCover(ctx, photo, 0, 0, W, H);

  const g = ctx.createLinearGradient(0, 0, 0, H);
  if (kind === 'cover') {
    g.addColorStop(0, 'rgba(5,6,5,0.35)');
    g.addColorStop(0.45, 'rgba(5,6,5,0.35)');
    g.addColorStop(0.72, 'rgba(5,6,5,0.82)');
    g.addColorStop(1, 'rgba(5,6,5,0.98)');
  } else {
    // Non-cover slides: photo is just texture — near-solid dark so text dominates.
    g.addColorStop(0, 'rgba(6,8,7,0.90)');
    g.addColorStop(1, 'rgba(4,5,4,0.97)');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

async function renderSlide(slide: StorySlide, photo: HTMLImageElement | null): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');

  paintBackground(ctx, photo, slide.kind);
  drawProgressBar(ctx, slide.index, slide.total);
  drawKicker(ctx, slide.kicker, H * 0.065);

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  const rightX = W - PAD;
  const maxW = W - PAD * 2;

  if (slide.kind === 'cover') {
    const fontSize = W * 0.072;
    const spec = `800 ${Math.round(fontSize)}px Rubik, sans-serif`;
    await loadFont(spec);
    ctx.font = spec;
    const lines = wrapRtl(ctx, sanitizeHebrewText(slide.headline ?? ''), maxW).slice(0, 6);
    const lh = fontSize * 1.28;
    let y = H * 0.62;
    // brand rule above headline
    ctx.strokeStyle = BRAND_GREEN;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(rightX, y - fontSize * 1.1);
    ctx.lineTo(rightX - W * 0.18, y - fontSize * 1.1);
    ctx.stroke();
    for (const line of lines) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillText(line, rightX + 2, y + 3);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(line, rightX, y);
      y += lh;
    }
    if (slide.source) {
      ctx.font = `600 ${Math.round(W * 0.03)}px Rubik, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(`מקור: ${slide.source}`, rightX, y + fontSize * 0.3);
    }
  } else if (slide.kind === 'bullets') {
    const headSpec = `800 ${Math.round(W * 0.06)}px Rubik, sans-serif`;
    await loadFont(headSpec);
    ctx.font = headSpec;
    ctx.fillStyle = BRAND_GREEN;
    let y = H * 0.24;
    ctx.fillText(slide.heading ?? '', rightX, y);
    y += W * 0.06 * 1.4;

    const bodySpec = `500 ${Math.round(W * 0.042)}px Rubik, sans-serif`;
    await loadFont(bodySpec);
    const bulletFont = W * 0.042;
    for (const point of slide.points ?? []) {
      ctx.font = bodySpec;
      const lines = wrapRtl(ctx, sanitizeHebrewText(point), maxW - W * 0.06);
      // green dot
      ctx.fillStyle = BRAND_GREEN;
      ctx.beginPath();
      ctx.arc(rightX - 8, y - bulletFont * 0.35, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], i === 0 ? rightX - W * 0.055 : rightX - W * 0.055, y);
        y += bulletFont * 1.35;
      }
      y += bulletFont * 0.6;
    }
  } else if (slide.kind === 'insight') {
    const headSpec = `800 ${Math.round(W * 0.06)}px Rubik, sans-serif`;
    await loadFont(headSpec);
    ctx.font = headSpec;
    ctx.fillStyle = BRAND_GREEN;
    let y = H * 0.26;
    ctx.fillText(slide.heading ?? '', rightX, y);
    y += W * 0.06 * 1.6;

    const bodySpec = `500 ${Math.round(W * 0.046)}px Rubik, sans-serif`;
    await loadFont(bodySpec);
    ctx.font = bodySpec;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    const lh = W * 0.046 * 1.5;
    for (const line of wrapRtl(ctx, sanitizeHebrewText(slide.body ?? ''), maxW).slice(0, 12)) {
      ctx.fillText(line, rightX, y);
      y += lh;
    }
  } else {
    // cta
    const headSpec = `800 ${Math.round(W * 0.075)}px Rubik, sans-serif`;
    await loadFont(headSpec);
    ctx.font = headSpec;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    let y = H * 0.4;
    ctx.fillText(slide.heading ?? '', W / 2, y);
    y += W * 0.075 * 1.4;

    const bodySpec = `500 ${Math.round(W * 0.042)}px Rubik, sans-serif`;
    await loadFont(bodySpec);
    ctx.font = bodySpec;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (const line of wrapRtl(ctx, sanitizeHebrewText(slide.body ?? ''), maxW)) {
      ctx.fillText(line, W / 2, y);
      y += W * 0.042 * 1.45;
    }
    // link pill
    y += W * 0.05;
    const pillFont = W * 0.044;
    ctx.font = `800 ${Math.round(pillFont)}px Rubik, sans-serif`;
    ctx.direction = 'ltr';
    const label = `🔗 ${slide.linkLabel ?? 'mrdaniel.co.il'}`;
    const tw = ctx.measureText(label).width;
    const pillW = tw + pillFont * 2;
    const pillH = pillFont + pillFont * 0.9;
    ctx.fillStyle = BRAND_GREEN;
    ctx.beginPath();
    ctx.roundRect(W / 2 - pillW / 2, y, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.fillStyle = '#0B0F0E';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, W / 2, y + pillH / 2 + 2);
    ctx.textBaseline = 'alphabetic';
    ctx.direction = 'rtl';
  }

  await drawFooter(ctx, slide.kind === 'cta');
  return canvas.toDataURL('image/png');
}

/** Render every slide of a payload → array of PNG data URLs (index-aligned with payload.slides). */
export async function renderStorySlides(payload: StoryPayload, photo: HTMLImageElement | null): Promise<string[]> {
  const out: string[] = [];
  for (const slide of payload.slides) {
    out.push(await renderSlide(slide, photo));
  }
  return out;
}

/** Convenience: build slides for an item and render them in one call. */
export async function renderStoryForItem(item: NewsItem): Promise<{ payload: StoryPayload; images: string[] }> {
  const photo = await resolveStoryBg(item);
  const imageUrl = item.image ? proxiedImageUrl(item.image) : '';
  const payload = buildStorySlides(item, imageUrl);
  const images = await renderStorySlides(payload, photo);
  return { payload, images };
}
