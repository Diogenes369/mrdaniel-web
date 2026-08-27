// A deterministic carousel slide renderer whose layout, typography, and visual hierarchy are
// modeled directly on real ice.co.il Instagram carousels (analyzed from reference screenshots): a
// cover slide with a centered logo flanked by thin accent lines at a light/dark seam, a category
// badge, and a bold centered headline; inner "quote" slides with a small top-left logo, a
// right-aligned category badge, a thin divider, large bookend quotation marks, and a justified
// paragraph with selectively bolded phrases. ice's red brand accent is replaced throughout with
// MR. DANIEL's actual brand green (#76B900) — the STRUCTURE is what's being replicated, not their
// color identity.
//
// The background is a real photograph (via pexelsBackground.ts — a Gemini-derived creative search
// per slide's own text if PEXELS_API_KEY is configured server-side, otherwise a curated fallback
// pool, so this never depends on a paid/rate-limited AI image model) covered by a heavy dark
// gradient overlay that guarantees full contrast for the Hebrew text, exactly like ice's actual
// posts. EVERY SLIDE resolves its own distinct photo from its own text — see renderCarouselSlides —
// so a carousel never repeats the same background across slides.

import { resolveSlidePhotoUrl, loadPhoto, hashSeed, type PhotoOrientation } from './pexelsBackground';
import { sanitizeHebrewText } from './hebrewTextSanitizer';

export type SlideAspectRatio = '9:16' | '1:1' | '1.91:1';

const CANVAS_SIZE: Record<SlideAspectRatio, { w: number; h: number }> = {
  '9:16': { w: 1080, h: 1920 },
  '1:1': { w: 1080, h: 1080 },
  '1.91:1': { w: 1200, h: 628 },
};

const ORIENTATION_FOR_ASPECT: Record<SlideAspectRatio, PhotoOrientation> = {
  '9:16': 'portrait',
  '1:1': 'square',
  '1.91:1': 'landscape',
};

const BRAND_GREEN = '#76B900';
const LOGO_URL = '/logo.png';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load image: ${src}`));
    img.src = src;
  });
}

let logoPromise: Promise<HTMLImageElement | null> | null = null;
function getLogo(): Promise<HTMLImageElement | null> {
  if (!logoPromise) logoPromise = loadImage(LOGO_URL).catch(() => null);
  return logoPromise;
}

async function loadFont(spec: string): Promise<void> {
  try {
    await document.fonts.load(spec);
  } catch {
    // Falls back to the browser's default sans-serif — a visual degradation, not a functional one.
  }
}

/** Draws `img` into the (dx, dy, dWidth, dHeight) rect with CSS `object-fit: cover` semantics —
 * crops to fill rather than letterboxing, matching how ice's photos always fill their frame. */
function drawImageCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, dx: number, dy: number, dWidth: number, dHeight: number) {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const rectRatio = dWidth / dHeight;
  let sx: number, sy: number, sWidth: number, sHeight: number;
  if (imgRatio > rectRatio) {
    sHeight = img.naturalHeight;
    sWidth = sHeight * rectRatio;
    sx = (img.naturalWidth - sWidth) / 2;
    sy = 0;
  } else {
    sWidth = img.naturalWidth;
    sHeight = sWidth / rectRatio;
    sx = 0;
    sy = (img.naturalHeight - sHeight) / 2;
  }
  ctx.drawImage(img, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
}

/** One word plus whether it fell inside a `**...**` emphasis span in the source text — ice's real
 * quote slides bold a key phrase mid-paragraph rather than the whole thing; SocialAgentEngine.ts's
 * carousel prompt marks that phrase the same way (see its formatInstruction). */
interface WordRun {
  word: string;
  bold: boolean;
}

// drawRunsLine below places each token via its OWN isolated fillText call at a manually-walked
// right-to-left cursor — correct for individual Hebrew words, but a multi-word embedded English
// phrase (e.g. "Agent Guardian") must NOT be split into separate tokens that way, or its two words
// get reversed relative to each other (each successive token is placed further left, which is
// right for RTL words but wrong for an LTR phrase's own internal order). sanitizeHebrewText has
// already wrapped every embedded Latin run — single- or multi-word — in RLM markers (U+200F,
// invisible), so this token pattern keeps an RLM...RLM span (plus any punctuation glued right
// after its closing marker, e.g. "Guardian‏.") together as ONE atomic token; everything else still
// splits on whitespace as a normal single word.
const TOKEN_PATTERN = /‏[^‏]*‏[^\s‏]*|\S+/g;

function parseEmphasisWords(raw: string): WordRun[] {
  const words: WordRun[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const pushPlain = (segment: string, bold: boolean) => {
    for (const w of segment.match(TOKEN_PATTERN) || []) words.push({ word: w, bold });
  };
  while ((match = regex.exec(raw))) {
    pushPlain(raw.slice(lastIndex, match.index), false);
    pushPlain(match[1], true);
    lastIndex = match.index + match[0].length;
  }
  pushPlain(raw.slice(lastIndex), false);
  return words;
}

/** Wraps word-runs into lines under `maxWidth`, switching font per word to measure it at its own
 * weight — needed because a line can mix regular and bold words, which plain fillText/measureText
 * can't do in one call. */
function wrapRuns(ctx: CanvasRenderingContext2D, words: WordRun[], maxWidth: number, regularFont: string, boldFont: string): WordRun[][] {
  const lines: WordRun[][] = [];
  let current: WordRun[] = [];
  let currentWidth = 0;
  ctx.font = regularFont;
  const spaceWidth = ctx.measureText(' ').width;
  for (const w of words) {
    ctx.font = w.bold ? boldFont : regularFont;
    const wordWidth = ctx.measureText(w.word).width;
    const extra = current.length > 0 ? spaceWidth : 0;
    if (current.length > 0 && currentWidth + extra + wordWidth > maxWidth) {
      lines.push(current);
      current = [w];
      currentWidth = wordWidth;
    } else {
      current.push(w);
      currentWidth += extra + wordWidth;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/** Draws one RTL line word-by-word (right edge first, walking leftward) so each word can use its
 * own weight/color — `ctx.direction='rtl'` with a single fillText call can't mix weights within one
 * line, which is exactly what ice's selective bold-phrase emphasis needs. */
function drawRunsLine(ctx: CanvasRenderingContext2D, words: WordRun[], rightX: number, y: number, regularFont: string, boldFont: string, regularColor: string, boldColor: string) {
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.font = regularFont;
  const spaceWidth = ctx.measureText(' ').width;
  let cursorX = rightX;
  for (const w of words) {
    ctx.font = w.bold ? boldFont : regularFont;
    ctx.fillStyle = w.bold ? boldColor : regularColor;
    ctx.fillText(w.word, cursorX, y);
    const wordWidth = ctx.measureText(w.word).width;
    cursorX -= wordWidth + spaceWidth;
  }
}

/** Short topical "kicker" badge — the equivalent of ice.co.il's red name/category pill. Our content
 * isn't quoting a third party, so the badge shows the relevant service pillar instead (see
 * SocialAgentEngine.ts's BRAND_KNOWLEDGE_BASE for these same four pillars), falling back to the
 * brand name when the topic doesn't match a known pillar. */
function shortTopicLabel(topic: string): string {
  if (/zero-?trust|אבטחת סייבר|סייבר|cyber/i.test(topic)) return 'אבטחת סייבר';
  if (/wi-?fi ?7|רשת ארגונית|רשתות ארגוניות/i.test(topic)) return 'רשתות ארגוניות';
  if (/web3|webgl|בלוקצ/i.test(topic)) return 'Web3';
  if (/\bai\b|סוכן|בינה מלאכותית|agentic/i.test(topic)) return 'סוכני AI';
  return 'MR. DANIEL';
}

/** Draws the green category pill. `anchorX`/`align` place it either right-aligned (quote cards,
 * anchorX = the right content edge) or centered (the cover card, anchorX = canvas center) — same
 * shape and type treatment either way, matching ice.co.il's badge in both of its actual positions.
 * Returns the box height so the caller can lay out whatever comes next relative to it. */
function drawBadge(ctx: CanvasRenderingContext2D, label: string, anchorX: number, y: number, fontSize: number, align: 'right' | 'center'): number {
  ctx.font = `700 ${Math.round(fontSize)}px Rubik, sans-serif`;
  const textWidth = ctx.measureText(label).width;
  const padX = fontSize * 0.75;
  const padY = fontSize * 0.55;
  const boxW = textWidth + padX * 2;
  const boxH = fontSize + padY * 1.1;
  const boxLeft = align === 'right' ? anchorX - boxW : anchorX - boxW / 2;
  const boxRight = boxLeft + boxW;
  const radius = fontSize * 0.18;

  ctx.fillStyle = BRAND_GREEN;
  ctx.beginPath();
  ctx.moveTo(boxLeft + radius, y - boxH / 2);
  ctx.arcTo(boxRight, y - boxH / 2, boxRight, y + boxH / 2, radius);
  ctx.arcTo(boxRight, y + boxH / 2, boxLeft, y + boxH / 2, radius);
  ctx.arcTo(boxLeft, y + boxH / 2, boxLeft, y - boxH / 2, radius);
  ctx.arcTo(boxLeft, y - boxH / 2, boxRight, y - boxH / 2, radius);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#0B0F0E';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, boxRight - padX, y + fontSize * 0.04);

  return boxH;
}

/** Large bookend quotation mark, drawn as an actual glyph so it inherits the loaded font's real
 * curve rather than an approximated shape — `mirrored` flips it 180° for the closing mark at the
 * bottom-left, matching ice's actual layout. */
function drawQuoteMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, mirrored: boolean) {
  ctx.save();
  ctx.font = `800 ${Math.round(size)}px Georgia, "Times New Roman", serif`;
  ctx.fillStyle = BRAND_GREEN;
  if (mirrored) {
    ctx.translate(x, y);
    ctx.rotate(Math.PI);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('”', 0, 0);
  } else {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('”', x, y);
  }
  ctx.restore();
}

/** Draws the photo (if any) full-bleed under a heavy dark gradient — deep charcoal (#0B0F0E) at the
 * top easing toward ~85%+ opaque black by `seam`, fully solid black below it, per explicit spec.
 * With no photo (resolution failed), this still paints the same gradient directly over a plain
 * charcoal base, so the layout is identical either way — only the ambient texture differs. */
function paintBackground(ctx: CanvasRenderingContext2D, w: number, h: number, seam: number, photo: HTMLImageElement | null) {
  ctx.fillStyle = '#0B0F0E';
  ctx.fillRect(0, 0, w, h);
  if (photo) {
    drawImageCover(ctx, photo, 0, 0, w, h);
  }

  const seamFrac = seam / h;
  const overlay = ctx.createLinearGradient(0, 0, 0, h);
  overlay.addColorStop(0, 'rgba(11,15,14,0.45)');
  overlay.addColorStop(Math.min(1, seamFrac * 0.6), 'rgba(11,15,14,0.65)');
  overlay.addColorStop(Math.min(1, seamFrac), 'rgba(5,6,5,0.88)');
  overlay.addColorStop(Math.min(1, seamFrac + 0.1), 'rgba(5,6,5,1)');
  overlay.addColorStop(1, 'rgba(5,6,5,1)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, w, h);
}

interface RenderOptions {
  /** The card's topic/subject — drives the badge label (see shortTopicLabel) and, in
   * renderCarouselSlides, the Pexels search query. */
  topic?: string;
  /** Pre-resolved/loaded background photo for THIS slide (each slide in a carousel gets its own —
   * see renderCarouselSlides) — pass null (not undefined) to explicitly render without a photo
   * (gradient-only, the pre-photo look). */
  photo?: HTMLImageElement | null;
}

/**
 * Renders one carousel slide as a finished, ready-to-post PNG, styled after ice.co.il's real
 * Instagram template. `index`/`total` decide the role: position 0 is the Cover (centered logo +
 * lines, centered badge, bold centered headline — ice's cover-card treatment); every other
 * position is a Quote card (small top-left logo, right-aligned badge + divider, bookend quote
 * marks, justified paragraph with `**bold**`-marked phrase emphasis — ice's inner-slide treatment),
 * with the last one carrying the CTA copy. The grid (padding, logo size, badge style, type scale)
 * is identical across every call for a given aspectRatio — only the per-role layout differs, by
 * design, exactly as it does in the reference.
 */
export async function renderSlideCard(text: string, index: number, total: number, aspectRatio: SlideAspectRatio = '1:1', options: RenderOptions = {}): Promise<string> {
  const { w, h } = CANVAS_SIZE[aspectRatio];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context not supported');

  const isCover = index === 0;
  const badgeLabel = shortTopicLabel(options.topic || '');
  const photo = options.photo ?? null;
  const pad = w * 0.075;
  // Defense-in-depth: the backend already sanitizes generated text (see SocialAgentEngine.ts's
  // sanitizeHebrewText call), but text edited by hand here in the dashboard hasn't been — and
  // re-sanitizing already-clean text is a no-op (see hebrewTextSanitizer.ts).
  const cleanText = sanitizeHebrewText(text.trim());

  if (isCover) {
    // Cover: photo visible (through the lighter part of the overlay) down to a seam ~55% of the
    // way down, matching ice.co.il's cover-card proportions, then solid black beneath it.
    const seam = h * 0.55;
    paintBackground(ctx, w, h, seam, photo);

    const logo = await getLogo();
    const logoH = h * 0.05;
    let logoW = 0;
    if (logo) {
      logoW = logoH * (logo.naturalWidth / logo.naturalHeight);
      ctx.drawImage(logo, (w - logoW) / 2, seam - logoH / 2, logoW, logoH);
    }
    ctx.strokeStyle = BRAND_GREEN;
    ctx.lineWidth = 2.5;
    const lineGap = logoW / 2 + w * 0.035;
    const lineLen = w * 0.14;
    ctx.beginPath();
    ctx.moveTo(w / 2 - lineGap, seam);
    ctx.lineTo(w / 2 - lineGap - lineLen, seam);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w / 2 + lineGap, seam);
    ctx.lineTo(w / 2 + lineGap + lineLen, seam);
    ctx.stroke();

    const badgeFontSize = h * 0.021;
    const badgeY = seam + logoH * 0.9 + badgeFontSize;
    const badgeH = drawBadge(ctx, badgeLabel, w / 2, badgeY, badgeFontSize, 'center');

    const fontSize = h * 0.052;
    const fontSpec = `800 ${Math.round(fontSize)}px Rubik, sans-serif`;
    await loadFont(fontSpec);
    ctx.font = fontSpec;
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#FFFFFF';
    const lines = wrapCentered(ctx, cleanText, w - pad * 2).slice(0, 4);
    const lineHeight = fontSize * 1.32;
    let y = badgeY + badgeH * 0.9 + fontSize * 1.15;
    for (const line of lines) {
      ctx.fillText(line, w / 2, y);
      y += lineHeight;
    }

    drawCounter(ctx, w, h, pad, index, total);
    return canvas.toDataURL('image/png');
  }

  // Quote card (every slide after the cover) — ice's inner slides show much less of the photo
  // before the text zone takes over, so the seam sits much higher.
  const seam = h * 0.28;
  paintBackground(ctx, w, h, seam, photo);

  const logo = await getLogo();
  const logoH = h * 0.032;
  if (logo) {
    const logoW = logoH * (logo.naturalWidth / logo.naturalHeight);
    ctx.drawImage(logo, pad, pad, logoW, logoH);
  }

  const badgeFontSize = h * 0.02;
  const badgeY = seam + badgeFontSize * 1.3;
  const badgeH = drawBadge(ctx, badgeLabel, w - pad, badgeY, badgeFontSize, 'right');

  ctx.strokeStyle = BRAND_GREEN;
  ctx.lineWidth = 2;
  const dividerY = badgeY + badgeH * 0.75;
  ctx.beginPath();
  ctx.moveTo(w - pad, dividerY);
  ctx.lineTo(w - pad - w * 0.16, dividerY);
  ctx.stroke();

  // Body slides now carry 50-70 words (up from the original 25-45 — see SocialAgentEngine.ts's
  // carousel formatInstruction) — a smaller size and tighter line-height keep that volume legible
  // and correctly padded instead of overflowing the card or crowding the quote marks/counter.
  const role: 'body' | 'cta' = index === total - 1 ? 'cta' : 'body';
  const fontSize = role === 'cta' ? h * 0.038 : h * 0.0295;
  const regularFont = `500 ${Math.round(fontSize)}px Rubik, sans-serif`;
  const boldFont = `800 ${Math.round(fontSize)}px Rubik, sans-serif`;
  await loadFont(regularFont);
  await loadFont(boldFont);

  // Sized off `h` directly rather than `fontSize` so the quote-mark stays visually consistent even
  // as body text shrinks to fit more words.
  const quoteMarkSize = h * 0.05;
  const topQuoteY = dividerY + quoteMarkSize * 0.85;
  drawQuoteMark(ctx, w - pad, topQuoteY, quoteMarkSize, false);

  const words = parseEmphasisWords(cleanText);
  const textMaxWidth = w - pad * 2;
  const lines = wrapRuns(ctx, words, textMaxWidth, regularFont, boldFont).slice(0, 12);
  const lineHeight = fontSize * 1.38;
  let y = topQuoteY + fontSize * 0.9;
  for (const line of lines) {
    drawRunsLine(ctx, line, w - pad, y, regularFont, boldFont, 'rgba(255,255,255,0.85)', '#FFFFFF');
    y += lineHeight;
  }

  drawQuoteMark(ctx, pad + quoteMarkSize * 0.55, y + quoteMarkSize * 0.15, quoteMarkSize * 0.75, true);

  drawCounter(ctx, w, h, pad, index, total);
  return canvas.toDataURL('image/png');
}

function wrapCentered(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
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

function drawCounter(ctx: CanvasRenderingContext2D, w: number, h: number, pad: number, index: number, total: number) {
  const counterFontSize = Math.round(h * 0.016);
  ctx.font = `500 ${counterFontSize}px Rubik, monospace`;
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText(`${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, pad, h - pad * 0.55);
}

/** Renders an entire carousel's worth of slides with a shared index/total/topic, so every card in
 * the set gets a consistent counter, badge label, and role assignment — but each slide resolves
 * and loads its OWN background photo from its OWN text (see the Promise.all below), so a carousel
 * never repeats the same image across slides. A photo-resolution failure for any one slide
 * (Pexels down, fallback CDN blip) degrades that slide to the gradient-only look, never an error. */
export async function renderCarouselSlides(slides: string[], aspectRatio: SlideAspectRatio = '1:1', topic?: string): Promise<string[]> {
  const orientation = ORIENTATION_FOR_ASPECT[aspectRatio];
  const usedFallbackIndices = new Set<number>();

  // Each slide resolves and loads its OWN photo, driven by its OWN text — run in parallel so an
  // N-slide carousel still only waits as long as the slowest single lookup, not N sequential ones.
  // `usedFallbackIndices` is shared across the batch (not per-call) so if several slides fall
  // through to the static pool in the same carousel, they still land on different entries.
  const photos = await Promise.all(
    slides.map(async (slideText, i) => {
      try {
        const seed = hashSeed(slideText || topic || `mrdaniel-${i}`);
        const photoUrl = await resolveSlidePhotoUrl(slideText, topic || '', orientation, seed, usedFallbackIndices);
        return await loadPhoto(photoUrl);
      } catch {
        return null;
      }
    })
  );

  return Promise.all(slides.map((text, i) => renderSlideCard(text, i, slides.length, aspectRatio, { topic, photo: photos[i] })));
}
