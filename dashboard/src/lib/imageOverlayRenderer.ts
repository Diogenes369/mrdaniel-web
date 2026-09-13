import { loadImage, wrapRtl } from './newsImageComposer';
import { FONT_DISPLAY, FONT_BODY, FONT_MONO, ensureDeckFonts } from './designAssets';
import type { ImageOverlayBox } from './techTipsApi';

/**
 * Direct on-image text substitution: erase the English printed on an uploaded carousel frame and
 * paint the Hebrew translation back into the exact same spot, at the frame's own native resolution.
 *
 * This is a DELIBERATELY separate module from techTipRenderer.ts. That painter is shared by three
 * other features (Tech Tips Studio, the Threads importer, the 9:16 reel exporter) which have no
 * source image at all and rely on its templated card/paper layouts — this module only makes sense
 * when a real uploaded frame exists to edit, so it never touches that shared code path. It powers
 * only the image-carousel translator's 'creator' preset (see ImageCarouselUploader.tsx).
 *
 * There is no real inpainting available here (no server round-trip, no extra model call, no bundled
 * library) — erasure is a flat fill sampled from the pixels immediately around each text block, plus
 * a faint tiled texture lifted from just above the block, which is a reasonable approximation for
 * the flat UI decks and lightly-textured paper backgrounds this feature actually sees. It is not a
 * substitute for genuine content-aware fill against a busy photographic background.
 */

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Gemini's own bbox convention — `[ymin, xmin, ymax, xmax]`, each 0-1000 normalized to the
 *  image's own dimensions — converted to a pixel rect on the canvas actually being drawn. */
function bboxToRect(bbox: [number, number, number, number], canvasW: number, canvasH: number): Rect {
  const [ymin, xmin, ymax, xmax] = bbox;
  const x = (xmin / 1000) * canvasW;
  const y = (ymin / 1000) * canvasH;
  return {
    x,
    y,
    width: Math.max(1, ((xmax - xmin) / 1000) * canvasW),
    height: Math.max(1, ((ymax - ymin) / 1000) * canvasH),
  };
}

/** Averages every pixel in a canvas region into one RGB colour. Reads in one `getImageData` call
 *  per strip rather than per pixel — a dozen boxes per slide would otherwise mean hundreds of
 *  single-pixel reads, which is the slow path for canvas. */
function averageStrip(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, canvasW: number, canvasH: number): { r: number; g: number; b: number; n: number } | null {
  const sx = Math.max(0, Math.round(x));
  const sy = Math.max(0, Math.round(y));
  const sw = Math.max(0, Math.min(canvasW - sx, Math.round(w)));
  const sh = Math.max(0, Math.min(canvasH - sy, Math.round(h)));
  if (sw <= 0 || sh <= 0) return null;
  const { data } = ctx.getImageData(sx, sy, sw, sh);
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n++;
  }
  return n > 0 ? { r: r / n, g: g / n, b: b / n, n } : null;
}

/**
 * Erases one text block. Returns the padded rect the caller may now paint Hebrew text into.
 *
 * When `containerColor` is set — the box sits inside a dark terminal box, a chip, a highlight — the
 * block is a flat fill of that exact colour: sampling "just outside" is actively wrong there, since
 * outside a small container is the PAGE background, not the container's own colour, the moment the
 * container is bigger than the tight text glyphs Gemini boxed. Otherwise (plain text straight on the
 * page/photo) the background is sampled from a ring just outside the block, padded generously for
 * ascenders/descenders and rotated handwritten strokes, with a faint tiled sample of the texture
 * directly above layered on top for continuity.
 */
function erasePatch(ctx: CanvasRenderingContext2D, rect: Rect, canvasW: number, canvasH: number, containerColor: string): Rect {
  const hasContainer = HEX_COLOR_RE.test(containerColor);
  const padX = hasContainer ? Math.max(2, rect.width * 0.02) : rect.width * 0.12 + 4;
  const padY = hasContainer ? Math.max(2, rect.height * 0.06) : rect.height * 0.3 + 4;
  const ex = Math.max(0, rect.x - padX);
  const ey = Math.max(0, rect.y - padY);
  const ew = Math.min(canvasW - ex, rect.width + padX * 2);
  const eh = Math.min(canvasH - ey, rect.height + padY * 2);

  if (hasContainer) {
    ctx.save();
    ctx.fillStyle = containerColor;
    ctx.fillRect(ex, ey, ew, eh);
    ctx.restore();
    return { x: ex, y: ey, width: ew, height: eh };
  }

  const gap = 2;
  const depth = Math.max(4, Math.round(Math.min(ew, eh) * 0.18));
  const strips = [
    averageStrip(ctx, ex, ey - gap - depth, ew, depth, canvasW, canvasH), // above
    averageStrip(ctx, ex, ey + eh + gap, ew, depth, canvasW, canvasH), // below
    averageStrip(ctx, ex - gap - depth, ey, depth, eh, canvasW, canvasH), // left
    averageStrip(ctx, ex + ew + gap, ey, depth, eh, canvasW, canvasH), // right
  ].filter((s): s is { r: number; g: number; b: number; n: number } => s !== null);

  let r = 255, g = 255, b = 255;
  const total = strips.reduce((sum, s) => sum + s.n, 0);
  if (total > 0) {
    r = strips.reduce((sum, s) => sum + s.r * s.n, 0) / total;
    g = strips.reduce((sum, s) => sum + s.g * s.n, 0) / total;
    b = strips.reduce((sum, s) => sum + s.b * s.n, 0) / total;
  }

  ctx.save();
  ctx.fillStyle = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  ctx.fillRect(ex, ey, ew, eh);

  // A thin tile of whatever sits directly above the patch, repeated across it at low opacity — the
  // one bit of "sample surrounding texture" the spec asks for, without a real inpainting pass.
  const tileH = Math.max(6, Math.min(depth, Math.round(eh * 0.4)));
  if (ey - gap - tileH >= 0) {
    const tile = ctx.getImageData(Math.round(ex), Math.round(ey - gap - tileH), Math.max(1, Math.round(ew)), tileH);
    const tmp = document.createElement('canvas');
    tmp.width = tile.width;
    tmp.height = tile.height;
    const tctx = tmp.getContext('2d');
    if (tctx) {
      tctx.putImageData(tile, 0, 0);
      const pattern = ctx.createPattern(tmp, 'repeat');
      if (pattern) {
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = pattern;
        ctx.fillRect(ex, ey, ew, eh);
        ctx.globalAlpha = 1;
      }
    }
  }
  ctx.restore();
  return { x: ex, y: ey, width: ew, height: eh };
}

const HEBREW_RE = /[֐-׿]/;

/** Font family/weight for one block. Hebrew has no widely-available handwriting webface with real
 *  Hebrew glyph coverage (unlike Latin script's Caveat/Karantina), so `handwritten` is approximated
 *  with the same display face at a heavier weight rather than pulling in a font that would silently
 *  fall back to tofu or a Latin-only face for the actual Hebrew text being drawn. */
function fontFor(box: ImageOverlayBox, px: number): string {
  if (box.boxType === 'command_code') return `500 ${Math.round(px)}px ${FONT_MONO}`;
  if (box.boxType === 'headline') return `800 ${Math.round(px)}px ${FONT_DISPLAY}`;
  if (box.fontType === 'handwritten') return `700 ${Math.round(px)}px ${FONT_DISPLAY}`;
  return `600 ${Math.round(px)}px ${FONT_BODY}`;
}

/** Paints one block's Hebrew translation, autofit-shrunk and wrapped to sit inside the erased rect,
 *  vertically centred, in the original text's own colour. Direction follows the translated text's
 *  own script — a stray Latin command inside a Hebrew block is not force-flipped. */
function drawOverlayText(ctx: CanvasRenderingContext2D, box: ImageOverlayBox, original: Rect, erased: Rect) {
  const text = box.translatedText.trim();
  if (!text) return;
  const rtl = HEBREW_RE.test(text);
  const padX = original.width * 0.04;
  const padY = original.height * 0.06;
  const innerW = Math.max(4, Math.min(original.width, erased.width) - padX * 2);
  const innerH = Math.max(4, erased.height - padY * 2);

  let px = Math.min(original.height * 0.82, erased.width * 0.16);
  const minPx = Math.max(8, erased.width * 0.02);
  let lines: string[] = [text];
  for (let i = 0; i < 22; i++) {
    ctx.font = fontFor(box, px);
    lines = wrapRtl(ctx, text, innerW);
    const totalH = lines.length * px * 1.28;
    if ((lines.length <= 8 && totalH <= innerH) || px <= minPx) break;
    px = Math.max(minPx, px * 0.92);
  }
  ctx.font = fontFor(box, px);

  const lh = px * 1.28;
  const totalH = Math.min(innerH, lines.length * lh);
  const cx = erased.x + erased.width / 2;
  const cy = original.y + original.height / 2;

  ctx.save();
  // A guaranteed backstop, not the normal path: the autofit loop above already shrinks to fit, this
  // only catches a single unbroken token (a long URL/command with no spaces to wrap on) that is
  // still wider than the box at the size floor.
  ctx.beginPath();
  ctx.rect(erased.x, erased.y, erased.width, erased.height);
  ctx.clip();
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = rtl ? 'right' : 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = box.textColor;
  const xAnchor = rtl ? cx + innerW / 2 : cx - innerW / 2;
  let y = cy - totalH / 2 + px * 0.86;
  for (const line of lines) {
    ctx.fillText(line, xAnchor, y);
    y += lh;
  }
  ctx.restore();
}

/**
 * Renders one uploaded carousel frame with every detected text block erased and replaced in place.
 * The canvas is sized to the frame's OWN native resolution — never cropped, stretched or padded to
 * a fixed carousel size — so every pixel of the original artwork (illustrations, doodles, paper
 * texture) that isn't inside a text block survives untouched.
 */
export async function renderOverlayFrame(frameDataUrl: string, boxes: ImageOverlayBox[]): Promise<string> {
  await ensureDeckFonts();
  const img = await loadImage(frameDataUrl);
  if (!img || !img.naturalWidth || !img.naturalHeight) {
    throw new Error('כשל בטעינת תמונת השקופית לעריכה');
  }
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('קנבס לא זמין בדפדפן הזה');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  const rects = boxes.map((b) => bboxToRect(b.bbox, w, h));
  // Every block is erased FIRST, before any Hebrew is painted — so one box's erase-patch can never
  // wipe out text a previous box already drew (two blocks sitting close together, e.g. a watermark
  // right under a closing line).
  const erased = rects.map((r, i) => erasePatch(ctx, r, w, h, boxes[i].containerColor));
  boxes.forEach((box, i) => drawOverlayText(ctx, box, rects[i], erased[i]));

  return canvas.toDataURL('image/png');
}

/** Renders every frame in a deck. `frames[i]` and `slidesBoxes[i]` must correspond 1:1, same order
 *  as the uploaded carousel — the same contract `sourceImage`/`overlayBoxes` already keep elsewhere
 *  in this pipeline. A frame with no detected boxes (or none at all) renders unchanged. */
export async function renderOverlayDeck(
  frames: (string | undefined)[],
  slidesBoxes: (ImageOverlayBox[] | undefined)[],
  onProgress?: (done: number, total: number) => void
): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < frames.length; i++) {
    const src = frames[i];
    out.push(src ? await renderOverlayFrame(src, slidesBoxes[i] ?? []) : '');
    onProgress?.(i + 1, frames.length);
  }
  return out;
}
