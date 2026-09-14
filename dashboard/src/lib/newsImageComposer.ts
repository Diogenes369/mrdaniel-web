import { ASPECT_SIZE, type ImageAspect, type NewsItem, type NewsTopic } from './newsAgentTypes';
import { proxiedImageUrl } from './newsFeedClient';
import { loadPhoto, resolveSlidePhotoUrl, hashSeed, type PhotoOrientation } from './pexelsBackground';
import { sanitizeHebrewText } from './hebrewTextSanitizer';

/**
 * Client-side branded social image for a news item — one <canvas>, no server render.
 *
 * Layers, bottom to top:
 *   1. Background photo (`object-fit: cover`), ORIGINAL ARTICLE IMAGE FIRST: `item.image` (the
 *      RSS media / og:image from Globes, Ynet, Geektime, TechTime, Israel Defense) via the site's
 *      CORS relay (`/api/img-proxy`), retried, then a direct CORS attempt. Only if the item has
 *      no image at all, or every attempt fails, a topic-matched stock photo from the Pexels pool;
 *      if that also fails, a flat charcoal fill. See `resolveNewsBackground`.
 *   2. Bottom-to-top dark gradient for text/logo contrast.
 *   3. Optional stylised headline (lower area, RTL, sanitised).
 *   4. Category kicker pill, top-right (RTL start).
 *   5. "MR. DANIEL" logo, bottom-right.
 */

export const BRAND_GREEN = '#76B900';
export const CHARCOAL = '#0B0F0E';
const LOGO_URL = '/logo.png';

const ORIENTATION_FOR_ASPECT: Record<ImageAspect, PhotoOrientation> = { '1:1': 'square', '4:5': 'portrait' };

export const TOPIC_KICKER: Record<NewsTopic, string> = {
  cyber: 'סייבר ואבטחה',
  ai: 'בינה מלאכותית',
  ai_models: 'מודלי AI וחידושים',
  cloud: 'ענן ותשתיות',
  devops: 'ניהול מערכות ו-DevOps',
  general: 'טכנולוגיה',
};

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

let logoPromise: Promise<HTMLImageElement | null> | null = null;
export function getLogo(): Promise<HTMLImageElement | null> {
  if (!logoPromise) logoPromise = loadImage(LOGO_URL);
  return logoPromise;
}

export async function loadFont(spec: string): Promise<void> {
  try {
    await document.fonts.load(spec);
  } catch {
    /* falls back to the default sans-serif — visual only */
  }
}

/** `object-fit: cover` semantics: crop to fill the destination rect, never letterbox. */
export function drawImageCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, dx: number, dy: number, dw: number, dh: number) {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const rectRatio = dw / dh;
  let sx: number, sy: number, sw: number, sh: number;
  if (imgRatio > rectRatio) {
    sh = img.naturalHeight;
    sw = sh * rectRatio;
    sx = (img.naturalWidth - sw) / 2;
    sy = 0;
  } else {
    sw = img.naturalWidth;
    sh = sw / rectRatio;
    sx = 0;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

/** Where the rendered background photo actually came from — surfaced to the UI so the operator
 * sees the truth (a "stock" badge is a prompt to pick a different article), not just whether the
 * feed happened to include an image URL. */
export type BgSource = 'original' | 'stock' | 'none';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** `loadPhoto` with retries — a cold `/api/img-proxy` Lambda or a momentary CDN hiccup shouldn't
 * be enough to knock the real article image out and drop us to a stock photo. */
async function loadPhotoRetry(url: string, attempts = 3): Promise<HTMLImageElement | null> {
  for (let i = 0; i < attempts; i++) {
    const img = await loadPhoto(url);
    if (img) return img;
    if (i < attempts - 1) await sleep(300 * (i + 1));
  }
  return null;
}

/**
 * Resolve the background photo for a news item, ORIGINAL ARTICLE IMAGE FIRST.
 *
 *   1. `item.image` through the CORS relay (`/api/img-proxy`), retried — this is the exact photo
 *      from the source article (Globes / Ynet / Geektime / TechTime / Israel Defense og:image).
 *   2. `item.image` loaded directly in CORS mode — succeeds on the CDNs that do send
 *      `Access-Control-Allow-Origin` (fails clean, never taints the canvas, if they don't).
 *   3. Only if the item genuinely has NO image, or every attempt above failed: a topic-matched
 *      stock photo from the shared Pexels pool.
 *   4. Nothing loaded at all → caller paints the flat charcoal + gradient.
 */
export async function resolveNewsBackground(
  item: NewsItem,
  aspect: ImageAspect,
): Promise<{ img: HTMLImageElement | null; source: BgSource }> {
  if (item.image) {
    const viaProxy = await loadPhotoRetry(proxiedImageUrl(item.image), 3);
    if (viaProxy) return { img: viaProxy, source: 'original' };
    const direct = await loadPhoto(item.image);
    if (direct) return { img: direct, source: 'original' };
    console.warn('[newsImageComposer] original image failed to load, falling back to stock:', item.image);
  }
  try {
    const orientation = ORIENTATION_FOR_ASPECT[aspect];
    const seed = hashSeed(item.title || item.topic);
    // 2nd arg is the raw topic — resolveSlidePhotoUrl derives its own Pexels query from it.
    const url = await resolveSlidePhotoUrl(item.title, item.topic, orientation, seed, new Set());
    const stock = await loadPhoto(url);
    return { img: stock, source: stock ? 'stock' : 'none' };
  } catch {
    return { img: null, source: 'none' };
  }
}

function drawKicker(ctx: CanvasRenderingContext2D, label: string, rightX: number, y: number, fontSize: number) {
  ctx.font = `700 ${Math.round(fontSize)}px Rubik, sans-serif`;
  ctx.direction = 'rtl';
  const textW = ctx.measureText(label).width;
  const padX = fontSize * 0.8;
  const padY = fontSize * 0.55;
  const boxW = textW + padX * 2;
  const boxH = fontSize + padY * 1.2;
  const left = rightX - boxW;
  const r = fontSize * 0.28;

  ctx.fillStyle = BRAND_GREEN;
  ctx.beginPath();
  ctx.moveTo(left + r, y);
  ctx.arcTo(rightX, y, rightX, y + boxH, r);
  ctx.arcTo(rightX, y + boxH, left, y + boxH, r);
  ctx.arcTo(left, y + boxH, left, y, r);
  ctx.arcTo(left, y, rightX, y, r);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#0B0F0E';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, rightX - padX, y + boxH / 2 + fontSize * 0.04);
}

export function wrapRtl(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(test).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export interface NewsImageOptions {
  aspect: ImageAspect;
  headline: boolean;
}

export interface RenderedNewsImage {
  dataUrl: string;
  /** Provenance of the background photo — `'original'` means the real article image rendered. */
  imageSource: BgSource;
}

export async function renderNewsImage(item: NewsItem, opts: NewsImageOptions): Promise<RenderedNewsImage> {
  const { w, h } = ASPECT_SIZE[opts.aspect];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  // Best-quality resample when cover-cropping the source photo into the fixed export size.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const pad = w * 0.07;

  // 1. Background — original article image first, stock only as a fallback (see resolveNewsBackground)
  ctx.fillStyle = CHARCOAL;
  ctx.fillRect(0, 0, w, h);
  const { img: photo, source: imageSource } = await resolveNewsBackground(item, opts.aspect);
  if (photo) drawImageCover(ctx, photo, 0, 0, w, h);

  // 2. Bottom-to-top dark gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(5,6,5,0.30)');
  grad.addColorStop(0.42, 'rgba(5,6,5,0.30)');
  grad.addColorStop(0.72, 'rgba(5,6,5,0.78)');
  grad.addColorStop(1, 'rgba(5,6,5,0.97)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // 3. Optional headline, sitting just above the logo row
  const logoRowH = h * 0.11;
  if (opts.headline) {
    const fontSize = w * (opts.aspect === '4:5' ? 0.06 : 0.062);
    const fontSpec = `800 ${Math.round(fontSize)}px Rubik, sans-serif`;
    await loadFont(fontSpec);
    ctx.font = fontSpec;
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    const lines = wrapRtl(ctx, sanitizeHebrewText(item.title.trim()), w - pad * 2).slice(0, 4);
    const lineHeight = fontSize * 1.3;
    let y = h - logoRowH - pad * 0.5 - (lines.length - 1) * lineHeight;
    for (const line of lines) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(line, w - pad + 2, y + 3);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(line, w - pad, y);
      y += lineHeight;
    }
    // thin brand rule above the headline
    ctx.strokeStyle = BRAND_GREEN;
    ctx.lineWidth = Math.max(2, w * 0.004);
    const ruleY = h - logoRowH - pad * 0.5 - lines.length * lineHeight - fontSize * 0.35;
    ctx.beginPath();
    ctx.moveTo(w - pad, ruleY);
    ctx.lineTo(w - pad - w * 0.16, ruleY);
    ctx.stroke();
  }

  // 4. Category kicker — top-right
  drawKicker(ctx, TOPIC_KICKER[item.topic], w - pad, pad, w * 0.026);

  // 5. Logo — bottom-right
  const logo = await getLogo();
  if (logo) {
    const logoH = h * 0.055;
    const logoW = logoH * (logo.naturalWidth / logo.naturalHeight);
    ctx.drawImage(logo, w - pad - logoW, h - pad - logoH, logoW, logoH);
  } else {
    ctx.font = `800 ${Math.round(w * 0.032)}px Rubik, sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.direction = 'ltr';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('MR. DANIEL', w - pad, h - pad);
  }

  return { dataUrl: canvas.toDataURL('image/png'), imageSource };
}
