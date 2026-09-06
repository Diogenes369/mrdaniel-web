import type { NewsItem, NewsTopic } from './newsAgentTypes';
import { proxiedImageUrl } from './newsFeedClient';
import { SITE_ORIGIN } from './useDashboardRefresh';
import { sanitizeHebrewText } from './hebrewTextSanitizer';
import { BRAND_GREEN, CHARCOAL, getLogo, loadFont, drawImageCover, wrapRtl, resolveNewsBackground } from './newsImageComposer';
import { resolveSlidePhotoUrl, loadPhoto, hashSeed } from './pexelsBackground';
import { fetchFullArticleBody } from './repurposeApi';
import {
  buildSlides,
  synthesizeSlides,
  newsItemToSlideSource,
  textToSlideSource,
  validateDeckSentences,
  finalizeDeck,
  type SlideSource,
  type StorySlide,
  type StoryPayload,
} from './storySlides';
import { getAdminSecret } from './adminSecret';


/**
 * Universal branded slide renderer — one <canvas> per slide, no server render. Drives the same
 * 4–5 slide deck (Cover → 2–3 content → CTA) from ANY source: a scraped news item, free text, or
 * a social-post draft. Three output formats:
 *
 *   '9:16'  1080×1920  Instagram Story / Reels
 *   '4:5'   1080×1350  Instagram feed carousel (also good for LinkedIn)
 *   '1:1'   1080×1080  LinkedIn / Instagram square carousel
 *
 * Every slide shares: the full-bleed brand background (source photo, prominent on the cover /
 * heavily darkened as texture elsewhere) + dark gradient, a progress bar up top, the topic
 * kicker, and the MR. DANIEL logo bottom-right. The `mrdaniel.co.il` domain text appears ONLY on
 * the CTA slide — as the footer AND the prominent link pill.
 */

export type SlideFormat = '9:16' | '4:5' | '1:1';

interface Dims {
  W: number;
  H: number;
  PAD: number;
}

const DIMS: Record<SlideFormat, Dims> = {
  '9:16': { W: 1080, H: 1920, PAD: 1080 * 0.09 },
  '4:5': { W: 1080, H: 1350, PAD: 1080 * 0.09 },
  '1:1': { W: 1080, H: 1080, PAD: 1080 * 0.085 },
};

/** Where the cover text block starts (fraction of H) — lower on tall Story frames where the photo
 * dominates, higher on the shorter carousel frames. */
const COVER_START: Record<SlideFormat, number> = { '9:16': 0.6, '4:5': 0.44, '1:1': 0.4 };

/** Max text lines that fit between `startY` and the footer safe-area, floored at 2. */
function fitLines(H: number, PAD: number, startY: number, lineHeight: number, hardCap: number): number {
  const bottomSafeY = H - PAD * 1.9;
  const room = Math.floor((bottomSafeY - startY) / lineHeight);
  return Math.max(2, Math.min(hardCap, room));
}

/** Hard cap any background-resolution promise: if photo lookup stalls past `ms`, resolve `null`
 * so the deck still renders (branded graphic background) instead of the UI hanging forever. */
function withBgTimeout(p: Promise<HTMLImageElement | null>, ms: number): Promise<HTMLImageElement | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

async function resolveStoryBg(item: NewsItem, format: SlideFormat): Promise<HTMLImageElement | null> {
  return withBgTimeout(
    resolveNewsBackground(item, format === '1:1' ? '1:1' : '4:5').then((r) => r.img),
    14000
  );
}

/**
 * Background for a generic SlideSource (imported URL / free text): the scraped media image if it
 * loads, else a topic-matched STOCK photo (Pexels search → curated Unsplash-style fallback pool),
 * else null (the branded charcoal+green graphic background). Branding (logo + domain watermark)
 * is drawn on top regardless. Bounded so slide generation never hangs on photo lookup.
 */
async function resolveBgForSource(src: SlideSource, format: SlideFormat): Promise<HTMLImageElement | null> {
  return withBgTimeout(resolveBgForSourceInner(src, format), 10000);
}

async function resolveBgForSourceInner(src: SlideSource, format: SlideFormat): Promise<HTMLImageElement | null> {
  if (src.imageUrl) {
    const viaProxy = await loadPhoto(proxiedImageUrl(src.imageUrl));
    if (viaProxy) return viaProxy;
    const direct = await loadPhoto(src.imageUrl);
    if (direct) return direct;
  }
  try {
    const orientation = format === '1:1' ? 'square' : 'portrait';
    const seed = hashSeed(src.title || src.topic);
    const url = await resolveSlidePhotoUrl(src.title || src.bodyText.slice(0, 80), src.topic, orientation, seed, new Set());
    return await loadPhoto(url);
  } catch {
    return null;
  }
}

function drawProgressBar(ctx: CanvasRenderingContext2D, d: Dims, index: number, total: number) {
  const { W, H, PAD } = d;
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

function drawKicker(ctx: CanvasRenderingContext2D, d: Dims, label: string, y: number) {
  const { W, PAD } = d;
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

/** Branded footer on EVERY slide: MR. DANIEL logo bottom-right + the `mrdaniel.co.il` domain
 * watermark bottom-left. `prominent` (CTA slide) makes the domain brighter/larger. */
async function drawFooter(ctx: CanvasRenderingContext2D, d: Dims, prominent: boolean) {
  const { W, H, PAD } = d;
  const logo = await getLogo();
  const y = H - PAD * 0.85;
  if (logo) {
    const logoH = Math.max(H * 0.032, 42);
    const logoW = logoH * (logo.naturalWidth / logo.naturalHeight);
    ctx.drawImage(logo, W - PAD - logoW, y - logoH, logoW, logoH);
  }
  ctx.font = `${prominent ? 700 : 600} ${Math.round(W * (prominent ? 0.028 : 0.022))}px Rubik, sans-serif`;
  ctx.fillStyle = prominent ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.42)';
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('mrdaniel.co.il', PAD, y);
}

/**
 * Thin, refined accent line under a heading — the site's own brand-green accent (matches
 * TitleUnderline.tsx: no blue, no blocky bar), a short bar fading to transparent with a soft
 * green glow. RTL (starts at the right margin).
 */
function drawAccentLine(ctx: CanvasRenderingContext2D, W: number, rightX: number, y: number, width: number) {
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

function paintBackground(ctx: CanvasRenderingContext2D, d: Dims, photo: HTMLImageElement | null, kind: StorySlide['kind']) {
  const { W, H } = d;
  ctx.fillStyle = CHARCOAL;
  ctx.fillRect(0, 0, W, H);
  if (photo) drawImageCover(ctx, photo, 0, 0, W, H);

  const g = ctx.createLinearGradient(0, 0, 0, H);
  if (kind === 'cover') {
    g.addColorStop(0, 'rgba(5,6,5,0.35)');
    g.addColorStop(0.4, 'rgba(5,6,5,0.4)');
    g.addColorStop(0.68, 'rgba(5,6,5,0.82)');
    g.addColorStop(1, 'rgba(5,6,5,0.98)');
  } else {
    // Non-cover slides: photo is just texture — near-solid dark so text dominates.
    g.addColorStop(0, 'rgba(6,8,7,0.9)');
    g.addColorStop(1, 'rgba(4,5,4,0.97)');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (!photo) {
    // Subtle brand vignette so text-only decks still feel designed, not flat.
    const rg = ctx.createRadialGradient(W * 0.5, H * 0.32, W * 0.1, W * 0.5, H * 0.5, W * 0.9);
    rg.addColorStop(0, 'rgba(118,185,0,0.10)');
    rg.addColorStop(1, 'rgba(118,185,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }
}

/** Coerce a possibly-malformed slide into a safe, fully-populated StorySlide so the canvas
 * renderer can never hit an undefined property. */
function safeSlide(raw: unknown, index: number, total: number): StorySlide {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<StorySlide>;
  const kind: StorySlide['kind'] =
    s.kind === 'cover' || s.kind === 'cta' || s.kind === 'bullets' ? s.kind : 'insight';
  return {
    kind,
    index: Number.isFinite(s.index) ? (s.index as number) : index,
    total: Number.isFinite(s.total) && (s.total as number) > 0 ? (s.total as number) : total,
    kicker: typeof s.kicker === 'string' && s.kicker ? s.kicker : 'טכנולוגיה',
    heading: typeof s.heading === 'string' ? s.heading : '',
    headline: typeof s.headline === 'string' ? s.headline : '',
    narrativeText: typeof s.narrativeText === 'string' ? s.narrativeText : '',
    body: typeof s.body === 'string' ? s.body : '',
    linkLabel: typeof s.linkLabel === 'string' ? s.linkLabel : undefined,
    source: typeof s.source === 'string' ? s.source : undefined,
    points: Array.isArray(s.points) ? s.points : undefined,
  };
}

async function renderSlide(raw: StorySlide, photo: HTMLImageElement | null, d: Dims, format: SlideFormat, index = 0, total = 0): Promise<string> {
  const { W, H, PAD } = d;
  const slide = safeSlide(raw, index, total);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  // High-quality resampling for the background photo — the default `imageSmoothingQuality` is
  // 'low' in most engines, which visibly softens/blurs a cover-cropped source image once it's
  // scaled onto the 1080px canvas. Must be set before any drawImage() call.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  paintBackground(ctx, d, photo, slide.kind);
  drawProgressBar(ctx, d, slide.index, slide.total);
  drawKicker(ctx, d, slide.kicker, H * 0.055);

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  const rightX = W - PAD;
  const maxW = W - PAD * 2;

  if (slide.kind === 'cover') {
    // COVER = headline + topic tag (drawn above) + brand watermark ONLY. No body / no source line.
    const fontSize = W * 0.078;
    const spec = `800 ${Math.round(fontSize)}px Rubik, sans-serif`;
    await loadFont(spec);
    ctx.font = spec;
    const lh = fontSize * 1.24;
    const headText = sanitizeHebrewText(slide.headline ?? '');
    let lines = wrapRtl(ctx, headText, maxW);
    // centre the headline block in the lower half (Story) / middle (carousel), shrink if very long
    let px = fontSize;
    while (lines.length > (format === '9:16' ? 6 : 5) && px > W * 0.05) {
      px *= 0.9;
      ctx.font = `800 ${Math.round(px)}px Rubik, sans-serif`;
      lines = wrapRtl(ctx, headText, maxW);
    }
    const curLh = px * 1.24;
    let y = H * COVER_START[format] - (lines.length - 1) * curLh * 0.5;
    ctx.strokeStyle = BRAND_GREEN;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(rightX, y - px * 1.15);
    ctx.lineTo(rightX - W * 0.18, y - px * 1.15);
    ctx.stroke();
    for (const line of lines) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillText(line, rightX + 2, y + 3);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(line, rightX, y);
      y += curLh;
    }
  } else if (slide.kind === 'bullets' || slide.kind === 'insight') {
    // CONTENT slide: a PURE narrative paragraph — NO heading / green title / accent rule.
    // AUTO-SHRINK is the first-line (and only) defence for length: the font scales down until
    // every complete sentence fits. Text is NEVER truncated, and "…" is NEVER appended here —
    // the deck was already sentence-distributed + dynamically expanded upstream.
    const rawBody = (slide.narrativeText || slide.body || (slide.points ?? []).join('. ')).trim();
    const bodyText = sanitizeHebrewText(rawBody);

    const topLimit = H * 0.18;
    const bottomSafeY = H - PAD * 1.95;
    const avail = bottomSafeY - topLimit;

    let bodyPx = W * 0.05;
    const minPx = W * 0.0245; // ~26px on the 1080 canvas — still legible
    let bodyLines = wrapRtl(ctx, bodyText, maxW);
    for (let attempt = 0; attempt < 22; attempt++) {
      ctx.font = `500 ${Math.round(bodyPx)}px Rubik, sans-serif`;
      bodyLines = wrapRtl(ctx, bodyText, maxW);
      if (bodyLines.length * bodyPx * 1.5 <= avail || bodyPx <= minPx) break;
      bodyPx = Math.max(minPx, bodyPx * 0.94);
    }
    // Tighten line-height a touch if the smallest font still overflows — still no truncation.
    let lhFactor = 1.5;
    if (bodyLines.length * bodyPx * lhFactor > avail) lhFactor = 1.36;

    await loadFont(`500 ${Math.round(bodyPx)}px Rubik, sans-serif`);
    ctx.font = `500 ${Math.round(bodyPx)}px Rubik, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.97)';
    const lh = bodyPx * lhFactor;
    let y = topLimit + Math.max(0, (avail - bodyLines.length * lh) / 2) + bodyPx;
    for (const line of bodyLines) {
      ctx.fillText(line, rightX, y);
      y += lh;
    }
  } else {
    // cta
    await loadFont('800 80px Rubik, sans-serif');
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';

    // Auto-fit the CTA heading: shrink until every wrapped line fits a strict side margin and the
    // block is at most 3 lines — so it can NEVER clip, at any format.
    const ctaMaxW = W - Math.max(88, PAD * 2);
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
    let y = H * (format === '9:16' ? 0.4 : 0.36) - (headLines.length - 1) * headLh * 0.5;
    for (const line of headLines) {
      ctx.fillText(line, W / 2, y);
      y += headLh;
    }
    drawAccentLine(ctx, W, W / 2 + W * 0.1, y - headLh * 0.32, W * 0.2);
    y += W * 0.035;

    const bodyPx = W * 0.042;
    const bodySpec = `500 ${Math.round(bodyPx)}px Rubik, sans-serif`;
    await loadFont(bodySpec);
    ctx.font = bodySpec;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const lh = bodyPx * 1.45;
    const bodyCap = fitLines(H, PAD, y, lh, 8);
    for (const line of wrapRtl(ctx, sanitizeHebrewText(slide.narrativeText || slide.body || ''), maxW).slice(0, bodyCap)) {
      ctx.fillText(line, W / 2, y);
      y += lh;
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

  await drawFooter(ctx, d, slide.kind === 'cta');
  return canvas.toDataURL('image/png');
}

/**
 * Render every slide of a payload → array of PNG data URLs. Runs the mandatory pre-render
 * sentence gate first: if any slide would reach the canvas with a mid-sentence cut / trailing
 * "…" / unclosed "(", the deck is repaired via `finalizeDeck` before a single pixel is drawn.
 * Returns the (possibly repaired) payload alongside the images so callers stay in sync.
 */
export async function renderStorySlides(
  payload: StoryPayload,
  photo: HTMLImageElement | null,
  format: SlideFormat = '9:16'
): Promise<{ images: string[]; payload: StoryPayload }> {
  // Defensive: a malformed / empty payload must never throw out of the render path.
  const baseSlides = Array.isArray(payload?.slides) ? payload.slides.filter((s) => s && typeof s === 'object') : [];
  const base: StoryPayload = { ...(payload as StoryPayload), slides: baseSlides };

  const check = validateDeckSentences(base);
  const safe = check.ok && baseSlides.length >= 2 ? base : finalizeDeck(base);
  if (!check.ok) console.warn('[slides] pre-render repair:', check.issues.join(' · ') || 'empty/malformed payload');

  const d = DIMS[format] ?? DIMS['9:16'];
  const slides = safe.slides.length ? safe.slides : base.slides;
  const out: string[] = [];
  for (let i = 0; i < slides.length; i++) {
    out.push(await renderSlide(slides[i], photo, d, format, i, slides.length));
  }
  return { images: out, payload: safe };
}

// ─── Universal source → rendered deck ───────────────────────────────────────────────────────

export interface RenderedDeck {
  payload: StoryPayload;
  images: string[];
  format: SlideFormat;
}

// Session cache of the resolved background per deck+format, so a live text edit re-renders on
// the SAME photo (no jarring background swap) and without another network round-trip.
const bgCache = new Map<string, HTMLImageElement | null>();
const bgKey = (id: string, format: SlideFormat) => `${id}|${format}`;

/**
 * The one engine every workspace calls. Any `SlideSource` (news item, free text, post draft) →
 * a rendered 4–5 slide deck in the requested format. Tries the LLM synthesis endpoint first
 * (strict grounding, no bullets); falls back to the deterministic 4-slide builder if the key is
 * missing / rate-limited (429) / the call fails — content generation never stops.
 */
export async function renderSlidesFromSource(
  src: SlideSource,
  opts: {
    format?: SlideFormat;
    /** explicit background: an image, `null` for the branded graphic bg, or omit to auto-resolve
     * (scraped image → topic stock photo → branded graphic). */
    photo?: HTMLImageElement | null;
    apiBase?: string;
    adminSecret?: string;
  }
): Promise<RenderedDeck> {
  const format = opts.format ?? '9:16';
  const apiBase = opts.apiBase ?? SITE_ORIGIN;
  const adminSecret = opts.adminSecret ?? getAdminSecret();
  const photo = 'photo' in opts ? (opts.photo ?? null) : await resolveBgForSource(src, format);
  bgCache.set(bgKey(src.id, format), photo);

  let payload: StoryPayload;
  try {
    payload = await synthesizeSlides(src, { apiBase, adminSecret });
  } catch (err) {
    const reason = (err as Error)?.message || 'סינתזת ה-AI לא זמינה';
    console.warn('[slides] LLM synthesis unavailable, using deterministic fallback:', reason);
    payload = buildSlides(src, reason);
  }

  const rendered = await renderStorySlides(payload, photo, format);
  return { payload: rendered.payload, images: rendered.images, format };
}

/**
 * Re-render an already-built deck after its slide text was edited in the AI Slide Editor chat.
 * Reuses the cached background photo for that deck+format (falls back to a fresh resolve).
 */
export async function rerenderDeck(payload: StoryPayload, format: SlideFormat): Promise<RenderedDeck> {
  const key = bgKey(payload.newsId, format);
  let photo: HTMLImageElement | null;
  if (bgCache.has(key)) {
    photo = bgCache.get(key) ?? null;
  } else if (payload.imageUrl) {
    photo = await withBgTimeout(loadPhoto(payload.imageUrl), 10000);
    bgCache.set(key, photo);
  } else {
    const src: SlideSource = {
      id: payload.newsId,
      title: payload.newsTitle,
      bodyText: '',
      topic: payload.topic,
      source: '',
      link: payload.newsLink,
      imageUrl: payload.imageUrl,
    };
    photo = await resolveBgForSource(src, format);
    bgCache.set(key, photo);
  }
  const rendered = await renderStorySlides(payload, photo, format);
  return { payload: rendered.payload, images: rendered.images, format };
}

/** Bound any promise; on timeout resolve `fallback` instead of hanging the pipeline. */
function withDeadline<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/**
 * News item → rendered deck. Resolves the article photo, and — CRITICAL — when the feed only
 * carried a thin title/summary (< 150 chars) it DEEP-SCRAPES the full article body first
 * (Jina Reader via `import-url`) so slides are built from real content, not a 5-word headline.
 * Deep scrape is bounded (16s) and falls back to the summary; slide density is still enforced
 * downstream regardless.
 */
export async function renderStoryForItem(item: NewsItem, format: SlideFormat = '9:16'): Promise<RenderedDeck> {
  const photo = await resolveStoryBg(item, format);
  const src = newsItemToSlideSource(item, item.image ? proxiedImageUrl(item.image) : '');

  const summary = (item.summary || item.excerpt || '').trim();
  const link = (item.link || '').trim();
  const scrapable = /^https?:\/\//i.test(link) && !/(^|\.)news\.google\.com/i.test(link);
  if (summary.length < 150 && scrapable) {
    const full = await withDeadline(fetchFullArticleBody(link), 16000, '');
    if (full && full.length > summary.length) src.bodyText = full;
  } else if (summary) {
    src.bodyText = summary;
  }

  return renderSlidesFromSource(src, { format, photo });
}

/**
 * Free text / imported URL / social-post draft → rendered deck. Auto-resolves a background: the
 * supplied `imageUrl` (scraped media) if it loads, else a topic-matched STOCK photo, else the
 * branded graphic background — full branding (logo + `mrdaniel.co.il` watermark) is always applied.
 */
export async function renderSlidesForText(
  text: string,
  opts: { title?: string; topic?: NewsTopic; format?: SlideFormat; imageUrl?: string } = {}
): Promise<RenderedDeck> {
  const src = textToSlideSource(text, { title: opts.title, topic: opts.topic });
  if (opts.imageUrl) src.imageUrl = opts.imageUrl;
  return renderSlidesFromSource(src, { format: opts.format ?? '9:16' });
}
