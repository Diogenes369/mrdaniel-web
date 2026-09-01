import type { NewsItem } from './newsAgentTypes';
import { proxiedImageUrl } from './newsFeedClient';
import { SITE_ORIGIN } from './useDashboardRefresh';
import { sanitizeHebrewText } from './hebrewTextSanitizer';
import { BRAND_GREEN, CHARCOAL, getLogo, loadFont, drawImageCover, wrapRtl, resolveNewsBackground } from './newsImageComposer';
import { buildStorySlides, synthesizeStory, type StorySlide, type StoryPayload } from './storySlides';

const ADMIN_SECRET = import.meta.env.VITE_ADMIN_API_SECRET as string | undefined;

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

/**
 * Thin, refined accent line under a heading — the site's own brand-green accent (matches
 * TitleUnderline.tsx: no blue, no blocky bar), a short bar fading to transparent with a soft
 * green glow. RTL (starts at the right margin).
 */
function drawAccentLine(ctx: CanvasRenderingContext2D, rightX: number, y: number, width: number) {
  const grad = ctx.createLinearGradient(rightX, 0, rightX - width, 0);
  grad.addColorStop(0, BRAND_GREEN);
  grad.addColorStop(0.6, 'rgba(118,185,0,0.85)');
  grad.addColorStop(1, 'rgba(118,185,0,0)');
  ctx.save();
  ctx.fillStyle = grad;
  ctx.shadowColor = 'rgba(118,185,0,0.5)';
  ctx.shadowBlur = 12;
  const h = Math.max(2, W * 0.0028);
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(rightX - width, y, width, h, h / 2);
    ctx.fill();
  } else {
    ctx.fillRect(rightX - width, y, width, h);
  }
  ctx.restore();
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
    // Cover: one strong opening fact under the headline (narrative, no bullet).
    const lead = slide.narrativeText?.trim();
    if (lead) {
      ctx.font = `500 ${Math.round(W * 0.04)}px Rubik, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      const leadLh = W * 0.04 * 1.5;
      for (const line of wrapRtl(ctx, sanitizeHebrewText(lead), maxW).slice(0, 4)) {
        ctx.fillText(line, rightX, y);
        y += leadLh;
      }
      y += W * 0.02;
    }
    if (slide.source) {
      ctx.font = `600 ${Math.round(W * 0.03)}px Rubik, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      // isolate the (often Latin) source name so it doesn't flip order after "מקור:"
      ctx.fillText(sanitizeHebrewText(`מקור: ${slide.source}`), rightX, y + fontSize * 0.2);
    }
  } else if (slide.kind === 'bullets' || slide.kind === 'insight') {
    // Both content kinds render the SAME way now: heading + accent line + narrative paragraph.
    // No bullet dots, no lists. `points[]` (legacy cached payloads) is flattened to prose.
    const headSpec = `800 ${Math.round(W * 0.058)}px Rubik, sans-serif`;
    await loadFont(headSpec);
    ctx.font = headSpec;
    ctx.fillStyle = BRAND_GREEN;
    let y = H * 0.26;
    const heading = (slide.heading ?? '').trim();
    if (heading) {
      for (const line of wrapRtl(ctx, sanitizeHebrewText(heading), maxW).slice(0, 2)) {
        ctx.fillText(line, rightX, y);
        y += W * 0.058 * 1.3;
      }
      drawAccentLine(ctx, rightX, y - W * 0.03, W * 0.2);
      y += W * 0.05;
    }

    const bodyText = (slide.narrativeText || slide.body || (slide.points ?? []).join('. ')).trim();
    const bodySpec = `500 ${Math.round(W * 0.046)}px Rubik, sans-serif`;
    await loadFont(bodySpec);
    ctx.font = bodySpec;
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    const lh = W * 0.046 * 1.52;
    for (const line of wrapRtl(ctx, sanitizeHebrewText(bodyText), maxW).slice(0, 14)) {
      ctx.fillText(line, rightX, y);
      y += lh;
    }
  } else {
    // cta
    await loadFont('800 80px Rubik, sans-serif');
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';

    // Auto-fit the CTA heading: shrink the font until every wrapped line fits inside a strict
    // side margin (>= 44px per edge) and the block is at most 3 lines — so it can NEVER clip.
    const ctaMaxW = W - Math.max(88, PAD * 2); // PAD*2 ≈ 194px; hard floor 88 = 44px each side
    const headText = sanitizeHebrewText(slide.heading ?? '');
    let headPx = W * 0.07;
    let headLines: string[] = [];
    for (let attempt = 0; attempt < 8; attempt++) {
      ctx.font = `800 ${Math.round(headPx)}px Rubik, sans-serif`;
      headLines = wrapRtl(ctx, headText, ctaMaxW);
      const widest = headLines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
      if (widest <= ctaMaxW && headLines.length <= 3) break;
      headPx *= 0.85;
    }
    const headLh = headPx * 1.22;
    let y = H * 0.4 - (headLines.length - 1) * headLh * 0.5;
    for (const line of headLines) {
      ctx.fillText(line, W / 2, y);
      y += headLh;
    }
    // centred accent line under the (possibly multi-line) heading
    drawAccentLine(ctx, W / 2 + W * 0.1, y - headLh * 0.32, W * 0.2);
    y += W * 0.035;

    const bodySpec = `500 ${Math.round(W * 0.042)}px Rubik, sans-serif`;
    await loadFont(bodySpec);
    ctx.font = bodySpec;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (const line of wrapRtl(ctx, sanitizeHebrewText(slide.narrativeText || slide.body || ''), maxW)) {
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

/**
 * Build slides for an item and render them. Tries the LLM synthesis endpoint first (strict
 * article grounding, no bullets, no filler); falls back to the deterministic article-grounded
 * builder if there's no key / the call fails.
 */
export async function renderStoryForItem(item: NewsItem): Promise<{ payload: StoryPayload; images: string[] }> {
  const photo = await resolveStoryBg(item);
  const imageUrl = item.image ? proxiedImageUrl(item.image) : '';

  let payload: StoryPayload;
  try {
    payload = await synthesizeStory(item, imageUrl, { apiBase: SITE_ORIGIN, adminSecret: ADMIN_SECRET });
  } catch (err) {
    console.warn('[story] LLM synthesis unavailable, using deterministic fallback:', (err as Error)?.message);
    payload = buildStorySlides(item, imageUrl);
  }

  const images = await renderStorySlides(payload, photo);
  return { payload, images };
}
