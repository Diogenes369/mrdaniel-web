import JSZip from 'jszip';
import { loadImage, getLogo, wrapRtl } from './newsImageComposer';
import { sanitizeHebrewText } from './hebrewTextSanitizer';
import { highlightCode, TOKEN_PALETTE } from './syntaxHighlight';
import type { TechTipDeck, TechTipSlide } from './techTipsApi';
import { resolveSlidePhotoUrl, loadPhoto } from './pexelsBackground';
import {
  BRAND_GREEN,
  CYBER_CYAN,
  SILVER,
  THEME_ACCENT,
  TOOL_STYLE,
  ensureDeckFonts,
  setDisplay,
  setBody,
  setMono,
  metricsFor,
  type Metrics,
  roundRectPath,
  glassCard,
  terminalFrame,
  terminalBarHeight,
  drawBrandBadge,
  drawToolMark,
  scribbleUnderline,
  markerHighlight,
  scribbleCircle,
  doodleArrow,
  paintSlateBackdrop,
  hexToRgba,
  TERRACOTTA,
  TERRACOTTA_WASH,
  PROMPT_WHY_BG,
  CREAM_INK,
  CREAM_BODY,
  CREAM_MUTED,
  paintCreamBackdrop,
  drawAvatarLockup,
  drawEyebrow,
  drawInstallBox,
  installBoxHeight,
  drawProgressRail,
  drawStarburst,
  drawLoopGlyph,
  drawNumberTile,
  drawNodeIcon,
  drawNodeLink,
  drawPaperCard,
} from './designAssets';
import type { WorkflowNode } from './techTipsApi';

/**
 * Tech Tips slide painter — deep-slate teaching slides, drawn on <canvas> so the SAME painter
 * feeds both outputs: the still carousel PNGs and every frame of the animated reel
 * (motionStudioService.ts). Size-agnostic: pass 1080×1350 for a 4:5 carousel or 1080×1920 for a
 * 9:16 reel and the layout scales off the canvas box rather than hard-coded coordinates.
 *
 * This module owns LAYOUT only — where a block sits, how big it is, what wraps. Everything about
 * how a surface LOOKS (palette, type stack, glass and terminal frames, brand marks, hand-drawn
 * accents, the backdrop itself) comes from `designAssets.ts`, so the same visual language can be
 * reused by any other painter without copying constants around.
 *
 * Backgrounds are OPTIONAL. The default and best-looking mode fetches nothing at all: the slide is
 * painted on the procedural slate backdrop lit by its own tool's colours.
 */

/** The slide's accent: its tool's colour when one was detected, else its subject family's. */
function accentFor(slide: TechTipSlide): string {
  const tool = slide.tool ? TOOL_STYLE[slide.tool] : undefined;
  return tool?.accent ?? THEME_ACCENT[slide.theme ?? 'general'] ?? BRAND_GREEN;
}

/** The second colour of the backdrop glow — the tool's, else a cool counterpoint to the accent. */
function glowFor(slide: TechTipSlide): string {
  const tool = slide.tool ? TOOL_STYLE[slide.tool] : undefined;
  return tool?.glow ?? CYBER_CYAN;
}

export interface SlideBox {
  W: number;
  H: number;
  PAD: number;
  /** The shared spacing scale for this canvas size — see `metricsFor` in designAssets.ts. */
  m: Metrics;
}

export function boxFor(width: number, height: number): SlideBox {
  const m = metricsFor(width);
  return { W: width, H: height, PAD: m.pad, m };
}

// ─── background ─────────────────────────────────────────────────────────────────────────────

/** Pollinations: free + keyless + `Access-Control-Allow-Origin: *` (verified), so the generated
 * image can be drawn to canvas without tainting it. */
export function pollinationsUrl(prompt: string, width: number, height: number, seed: number): string {
  const p = encodeURIComponent(prompt.slice(0, 380));
  return `https://image.pollinations.ai/prompt/${p}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
}

/**
 * Technologies whose logos meaningfully sharpen an illustration.
 *
 * A generic "abstract tech grid" backdrop is interchangeable between guides. Naming the actual
 * stack in the image prompt — the Python emblem, the Docker whale — anchors the illustration to
 * the subject and makes the set read as one deliberate series rather than stock filler.
 * Matched case-insensitively on word boundaries so "Go" does not fire on "Google".
 */
const BRAND_TERMS: { re: RegExp; visual: string }[] = [
  { re: /\bpython\b/i, visual: 'Python logo emblem, blue and yellow entwined serpents' },
  { re: /\bdocker\b/i, visual: 'Docker whale logo carrying shipping containers' },
  { re: /\b(kubernetes|k8s)\b/i, visual: 'Kubernetes blue helm wheel logo' },
  { re: /\breact\b/i, visual: 'React atom orbital logo in cyan' },
  { re: /\bnode(\.js)?\b/i, visual: 'Node.js green hexagon logo' },
  { re: /\b(typescript|ts)\b/i, visual: 'TypeScript blue square TS logo' },
  { re: /\bpostgres(ql)?\b/i, visual: 'PostgreSQL blue elephant logo' },
  { re: /\bmongo(db)?\b/i, visual: 'MongoDB green leaf logo' },
  { re: /\bredis\b/i, visual: 'Redis red stacked cubes logo' },
  { re: /\b(aws|amazon web services)\b/i, visual: 'AWS orange logo above a cloud datacenter' },
  { re: /\bazure\b/i, visual: 'Microsoft Azure blue triangle logo' },
  { re: /\bgit(hub)?\b/i, visual: 'GitHub Octocat logo with branching version control graph' },
  { re: /\b(linux|ubuntu)\b/i, visual: 'Linux Tux penguin logo beside a terminal' },
  { re: /\bnginx\b/i, visual: 'NGINX green N logo' },
  { re: /\b(tensorflow|pytorch)\b/i, visual: 'machine learning framework logo over a neural network' },
  { re: /\b(openai|gpt)\b/i, visual: 'OpenAI hexagonal knot emblem' },
  { re: /\bfigma\b/i, visual: 'Figma multicoloured shapes logo' },
  { re: /\bterraform\b/i, visual: 'Terraform purple T logo, infrastructure as code' },
];

/** Brand/tech visuals named anywhere in the slide's own text. */
function brandVisualsFor(text: string): string[] {
  return BRAND_TERMS.filter((t) => t.re.test(text)).map((t) => t.visual).slice(0, 3);
}

/**
 * Background sources offered in the Tips & Guides control bar.
 *
 * `creator` is the odd one out and deliberately so: it fetches nothing at all. The deck is painted
 * on the procedural slate backdrop lit by the slide's own tool colours, which is what the
 * reference aesthetic actually is — a stock photo behind a prompt card is the thing it avoids.
 * It is the only mode the Threads importer offers.
 */
export type TipStyle =
  | 'creator'
  | 'photoreal'
  | 'enterprise'
  | 'dark-minimal'
  | 'sketchnote'
  | 'cream-skill'
  | 'cream-workflow'
  | 'cream-prompt-library';

/** Extra search terms per style, appended to the slide's own contextual query. */
const STYLE_TONE: Record<TipStyle, string> = {
  creator: '',
  photoreal: 'professional photography',
  enterprise: 'bright clean corporate office technology',
  'dark-minimal': 'dark moody minimal technology',
  sketchnote: '',
  'cream-skill': '',
  'cream-workflow': '',
  'cream-prompt-library': '',
};

/** Whether a style paints its own procedural backdrop and never fetches a photo. All three cream
 *  presets are paper, not photography — a searched or generated image behind an install box, a
 *  node diagram or a prompt card is exactly the "assembled, not made" tell the creator preset
 *  already avoids. */
function isProceduralStyle(style: TipStyle): boolean {
  return style === 'creator' || style === 'cream-skill' || style === 'cream-workflow' || style === 'cream-prompt-library';
}

export async function resolveTipBackgrounds(
  deck: TechTipDeck,
  width: number,
  height: number,
  onProgress?: (done: number, total: number) => void,
  style: TipStyle = 'photoreal'
): Promise<(HTMLImageElement | null)[]> {
  const total = deck.slides.length;
  const out: (HTMLImageElement | null)[] = new Array(total).fill(null);
  let done = 0;
  let cursor = 0;
  // Tracks fallback photos already used so two slides never land on the same stock image.
  const usedFallbacks = new Set<number>();
  const workers = Array.from({ length: Math.min(3, total) }, async () => {
    while (cursor < total) {
      const i = cursor++;
      const slide = deck.slides[i];
      if (slide.sourceImage) {
        // An image the thread itself published beats anything generated or searched: it is what the
        // post actually showed, so it can't be off-topic. Already routed through the site's own
        // relay by the fetcher, so it draws to canvas without tainting it. A failure yields null
        // and the slide falls back to the procedural backdrop, same as every other source here.
        out[i] = await loadPhoto(slide.sourceImage, 12000);
      } else if (isProceduralStyle(style) || slide.noPhoto) {
        // Zero stock imagery. `noPhoto` marks the slides carrying something the reader is meant to
        // copy, run or click; the procedural styles apply the same rule to the whole deck. Either
        // way the slide keeps its own painted backdrop — which is the point, not a fallback.
        out[i] = null;
      } else if (style === 'sketchnote') {
        // Illustrated art: keep the existing Pollinations path driven by the slide's visualPrompt.
        const subject = [slide.title, slide.body, slide.code].filter(Boolean).join(' ');
        const brands = brandVisualsFor(subject);
        const prompt = [
          slide.visualPrompt || 'dark cyber technology scene, neon green accents',
          ...brands,
          // Pushes the model off generic wallpaper and towards a deliberate, readable illustration.
          'bold high-contrast digital illustration, dramatic rim lighting, deep dark background,',
          'sharp focal subject, cinematic depth, no text, no letters, no watermark',
        ].join(', ');
        out[i] = await Promise.race([
          loadImage(pollinationsUrl(prompt, Math.round(width / 2), Math.round(height / 2), i + 7)),
          new Promise<null>((r) => setTimeout(() => r(null), 30000)),
        ]);
      } else {
        // Photographic styles: build the query from THIS slide's own text, not the deck title, so
        // each slide gets its own matched image. resolveSlidePhotoUrl sends the slide text to the
        // server, which derives a targeted English scene query for it.
        const slideText = [slide.title, slide.body, slide.visualPrompt]
          .filter(Boolean).join(' ').slice(0, 320);
        const orientation = height > width ? 'portrait' : height === width ? 'square' : 'landscape';
        const url = await resolveSlidePhotoUrl(
          `${slideText} ${STYLE_TONE[style]}`.trim(),
          deck.title || slide.title || 'technology',
          orientation,
          i + 7,
          usedFallbacks
        );
        out[i] = await Promise.race([
          loadPhoto(url, 12000),
          new Promise<null>((r) => setTimeout(() => r(null), 15000)),
        ]);
      }
      done++;
      onProgress?.(done, total);
    }
  });
  await Promise.all(workers);
  return out;
}

function drawBackgroundImage(ctx: CanvasRenderingContext2D, b: SlideBox, img: HTMLImageElement) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!iw || !ih) return;
  const canvasRatio = b.W / b.H;
  const imgRatio = iw / ih;
  let sw: number, sh: number, sx: number, sy: number;
  if (imgRatio > canvasRatio) {
    sh = ih;
    sw = sh * canvasRatio;
    sx = (iw - sw) / 2;
    sy = 0;
  } else {
    sw = iw;
    sh = sw / canvasRatio;
    sx = 0;
    sy = (ih - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, b.W, b.H);
  // Heavy scrim: the backdrop image is texture, never competition for the teaching content.
  ctx.fillStyle = 'rgba(6,8,13,0.8)';
  ctx.fillRect(0, 0, b.W, b.H);
}

// ─── chrome ─────────────────────────────────────────────────────────────────────────────────

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
  for (let i = 0; i < 24; i++) {
    set(ctx, px);
    lines = wrapRtl(ctx, text, maxW);
    if (lines.length <= maxLines || px <= minPx) break;
    px = Math.max(minPx, px * 0.93);
  }
  return { lines, px };
}

function drawTopBar(
  ctx: CanvasRenderingContext2D,
  b: SlideBox,
  slide: TechTipSlide,
  index: number,
  total: number,
  logo: HTMLImageElement | null,
  accent: string
) {
  const y = Math.round(b.H * 0.045);
  // Progress, left (LTR). A Threads deck counts the SUB-POSTS it was built from ("2 / 7"), which is
  // the sequence the reader is actually stepping through; a deck with no sub-posts keeps the
  // deck-wide slide index it always showed.
  const progress =
    slide.stepLabel?.trim() || `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  setMono(ctx, b.W * 0.019, 600);
  ctx.fillStyle = 'rgba(226,232,240,0.55)';
  ctx.fillText(progress, b.PAD, y);
  const progressW = ctx.measureText(progress).width;
  ctx.restore();

  // Topic badge, beside the counter. Latin by design — "Gemini AI", not a transliteration — so it
  // is drawn LTR next to the LTR counter rather than in the RTL lane on the right.
  const badge = (slide.badge ?? '').trim();
  if (badge) {
    ctx.save();
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    setMono(ctx, b.W * 0.0165, 700);
    const bh = b.W * 0.034;
    // The tool's mark rides inside the topic chip as a leading glyph rather than claiming a lane of
    // its own — the top bar already carries a counter, the chip and the site logo, and a fourth
    // element there crowds the slide at thumbnail size.
    const markS = slide.tool ? bh * 0.74 : 0;
    const markGap = slide.tool ? b.W * 0.009 : 0;
    const bw = ctx.measureText(badge).width + b.W * 0.03 + markS + markGap;
    const bx = b.PAD + progressW + b.W * 0.022;
    roundRectPath(ctx, bx, y - bh / 2, bw, bh, bh * 0.3);
    ctx.fillStyle = hexToRgba(accent, 0.14);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(accent, 0.5);
    ctx.lineWidth = b.m.hair;
    ctx.stroke();
    if (slide.tool) drawToolMark(ctx, slide.tool, bx + b.W * 0.013, y - markS / 2, markS, accent);
    ctx.fillStyle = accent;
    ctx.fillText(badge, bx + b.W * 0.015 + markS + markGap, y + 1);
    ctx.restore();
  }

  // kicker chip, right (RTL)
  const kicker = sanitizeHebrewText(slide.kicker || '');
  if (kicker) {
    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    setMono(ctx, b.W * 0.018, 600);
    const kw = ctx.measureText(kicker).width + b.W * 0.035;
    const kh = b.W * 0.038;
    const kx = b.W - b.PAD - kw;
    roundRectPath(ctx, kx, y - kh / 2, kw, kh, kh * 0.28);
    ctx.fillStyle = hexToRgba(accent, 0.12);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(accent, 0.45);
    ctx.lineWidth = b.m.hair;
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillText(kicker, b.W - b.PAD - b.W * 0.017, y + 1);
    ctx.restore();
  }

  // The site's logo bitmap is NOT drawn here any more. It is a dark mark on a dark backdrop, so at
  // slide scale it rendered as an illegible smudge between the counter and the kicker — and the
  // footer now carries a purpose-drawn brand badge, which made it redundant as well as ugly. The
  // parameter stays so motionStudioService's call signature is unchanged.
  void logo;
}

/**
 * Progress rail plus the brand lockup.
 *
 * The lockup is a handle badge, never a link: a carousel that prints a URL on every slide reads as
 * an ad, and the link is not tappable inside the image anyway — it belongs in the caption. The
 * closing slide draws its own larger lockup instead, so the footer one is skipped there.
 */
function drawBottomBar(
  ctx: CanvasRenderingContext2D,
  b: SlideBox,
  index: number,
  total: number,
  accent: string,
  withBadge: boolean
) {
  const railY = b.H - b.PAD * 1.2;
  const gap = 7;
  const railW = b.W - b.PAD * 2;
  const segW = (railW - gap * (total - 1)) / total;
  for (let i = 0; i < total; i++) {
    const x = b.PAD + i * (segW + gap);
    roundRectPath(ctx, x, railY, Math.max(2, segW), 5, 2.5);
    ctx.fillStyle = i <= index ? accent : 'rgba(255,255,255,0.14)';
    ctx.fill();
  }
  if (withBadge) drawBrandBadge(ctx, b.W / 2, b.H - b.PAD * 0.48, b.W, b.m, accent, { alpha: 0.9 });
}

// ─── per-kind bodies ────────────────────────────────────────────────────────────────────────

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

function contentRegion(b: SlideBox): Region {
  const top = b.H * 0.14;
  const bottom = b.H - b.PAD * 2;
  return { x: b.PAD, y: top, w: b.W - b.PAD * 2, h: bottom - top };
}

function drawTitle(
  ctx: CanvasRenderingContext2D,
  b: SlideBox,
  r: Region,
  title: string,
  startPx: number,
  maxLines: number,
  accent: string,
  markerSeed?: number
): number {
  if (!title) return r.y;
  const { lines, px } = autoFit(ctx, sanitizeHebrewText(title), r.w, startPx, b.W * 0.032, maxLines, (c, p) => setDisplay(c, p, 800));
  setDisplay(ctx, px, 800);
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  let y = r.y + px;
  lines.forEach((line, i) => {
    // The marker goes on the title's closing line — where the claim usually lands in Hebrew — and
    // is painted first so the swipe sits under the glyphs instead of greying them out.
    if (markerSeed !== undefined && i === lines.length - 1) {
      const w = Math.min(ctx.measureText(line).width, r.w);
      markerHighlight(ctx, r.x + r.w - w, r.y + px + i * px * 1.18, w, px, accent, markerSeed);
      setDisplay(ctx, px, 800);
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
    }
  });
  for (const line of lines) {
    const grad = ctx.createLinearGradient(r.x + r.w, 0, r.x, 0);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.6, SILVER);
    grad.addColorStop(1, accent);
    ctx.fillStyle = grad;
    ctx.fillText(line, r.x + r.w, y);
    y += px * 1.18;
  }
  return y;
}

/**
 * A slide that is one strong line and nothing else: no code, no prompt, no path, no list, and a body
 * short enough to read as a statement. Those used to get the same glass card as a 60-word
 * explanation, which is exactly the "every slide is the same template" tell — so they get the
 * editorial treatment instead: giant display type, a big quote mark, deliberately off-centre.
 */
export function isQuoteSlide(slide: TechTipSlide): boolean {
  if (slide.kind !== 'concept' && slide.kind !== 'takeaway') return false;
  if (slide.code.trim() || slide.promptBox?.trim() || slide.workflowPath?.length || slide.bullets.some((t) => t.trim())) return false;
  const body = (slide.body || '').trim();
  const words = body.split(/\s+/).filter(Boolean).length;
  return words >= 4 && words <= 22;
}

function drawQuoteLayout(ctx: CanvasRenderingContext2D, b: SlideBox, r: Region, slide: TechTipSlide, accent: string, index: number) {
  // The title shrinks to a label: on this slide the body IS the headline.
  let y = r.y;
  if (slide.title) {
    // Body face, not mono: JetBrains Mono has no Hebrew, and the fallback spaces the letters apart.
    setBody(ctx, b.W * 0.03, 700);
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = hexToRgba(accent, 0.95);
    const label = wrapRtl(ctx, sanitizeHebrewText(slide.title), r.w * 0.8)[0] ?? '';
    ctx.fillText(label, r.x + r.w, y + b.W * 0.03);
    y += b.W * 0.07;
  }

  // Oversized quote glyph, bleeding off the right edge of the text column — the asymmetry is the point.
  ctx.save();
  setDisplay(ctx, b.W * 0.34, 900);
  ctx.direction = 'ltr';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = accent;
  ctx.fillText('”', r.x + r.w + b.W * 0.02, y - b.W * 0.06);
  ctx.restore();

  // The statement itself: display face, as large as the column allows, indented from the LEFT only
  // so the ragged edge opens toward the empty side of the slide.
  const colW = r.w * 0.88;
  const top = y + b.W * 0.12;
  const avail = r.y + r.h - top - b.W * 0.06;
  const { lines, px } = autoFit(ctx, sanitizeHebrewText(slide.body), colW, b.W * 0.082, b.W * 0.046, 6, (c, p) => setDisplay(c, p, 800));
  const lh = px * 1.22;
  let ty = top + Math.max(0, (avail - lines.length * lh) * 0.35) + px;
  const last = lines.length - 1;
  lines.forEach((line, i) => {
    setDisplay(ctx, px, 800);
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    if (i === last) {
      const w = Math.min(ctx.measureText(line).width, colW);
      markerHighlight(ctx, r.x + r.w - w, ty, w, px, accent, index * 613 + 29);
      setDisplay(ctx, px, 800);
    }
    ctx.fillStyle = i === last ? '#FFFFFF' : 'rgba(241,245,249,0.92)';
    ctx.fillText(line, r.x + r.w, ty);
    ty += lh;
  });

  // Accent rule under the statement, short and left of the column — the counterweight.
  ctx.fillStyle = accent;
  roundRectPath(ctx, r.x + r.w - b.W * 0.12, ty - lh + px * 0.5, b.W * 0.12, b.W * 0.008, b.W * 0.004);
  ctx.fill();
}

function drawParagraph(
  ctx: CanvasRenderingContext2D,
  b: SlideBox,
  r: Region,
  text: string,
  top: number,
  maxH: number,
  accent: string
) {
  if (!text) return;
  const inner = r.w - b.m.cardPad * 2;
  const { lines, px } = autoFit(ctx, sanitizeHebrewText(text), inner, b.W * 0.038, b.W * 0.022, 14, (c, p) => setBody(c, p, 400));
  const lh = px * 1.6;
  const naturalH = lines.length * lh + b.m.cardPad * 1.8;
  // A three-line paragraph in a region tall enough for twelve used to leave the bottom half of the
  // slide empty, which reads as a rendering fault rather than as breathing room. The card claims a
  // minimum share of the space it was given and centres its text inside it, so a short body and a
  // long one both produce a composed slide instead of one looking unfinished.
  const panelH = Math.min(maxH, Math.max(naturalH, maxH * 0.5));
  glassCard(ctx, r.x, top, r.w, panelH, b.m.radiusLg, b.m, accent);
  setBody(ctx, px, 400);
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  let y = top + (panelH - lines.length * lh) / 2 + px * 1.05;
  for (const line of lines) {
    if (y > top + panelH - b.m.cardPad * 0.3) break;
    ctx.fillText(line, r.x + r.w - b.m.cardPad, y);
    y += lh;
  }
}

/**
 * A snippet the thread actually contained, in a terminal container.
 *
 * The window chrome, the language label and the line-number gutter all say the same thing in three
 * registers: this block is literal, copy it as it is.
 */
function drawCodeBlock(ctx: CanvasRenderingContext2D, b: SlideBox, r: Region, slide: TechTipSlide, top: number, maxH: number) {
  if (maxH <= terminalBarHeight(b.W) * 1.6) return;
  const lines = highlightCode(slide.code, slide.codeLang);
  const panelH = maxH;
  const inner = terminalFrame(
    ctx,
    r.x,
    top,
    r.w,
    panelH,
    b.W,
    b.m,
    CYBER_CYAN,
    slide.codeLang || 'code',
    { copyGlyph: true }
  );

  // Fit the snippet. Shrinking alone was not enough: once the floor size was reached a long line
  // simply kept overflowing the terminal border (the slide-03 bug), because nothing ever wrapped.
  // Now the width budget is enforced by WRAPPING at the token level after shrinking, and the panel
  // is clipped as a final guarantee that no glyph can paint outside the box.
  let px = b.W * 0.026;
  const minPx = b.W * 0.0135;
  let wrapped: { toks: { text: string; color: keyof typeof TOKEN_PALETTE }[]; num: number | null }[] = [];

  for (let i = 0; i < 24; i++) {
    setMono(ctx, px, 500);
    const gutter = px * 2.2;
    const textW = inner.w - gutter;
    wrapped = wrapCodeLines(ctx, lines, textW);
    if ((wrapped.length * px * 1.5 <= inner.h && maxTokenWidth(ctx, wrapped) <= textW) || px <= minPx) break;
    px = Math.max(minPx, px * 0.94);
  }
  setMono(ctx, px, 500);
  const lh = px * 1.5;
  const gutterW = px * 2.2;

  ctx.save();
  // Hard clip to the panel interior — belt and braces against any residual overflow.
  ctx.beginPath();
  ctx.rect(inner.x - px * 0.3, inner.y - px, inner.w + px * 0.6, inner.h + px);
  ctx.clip();
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let y = inner.y + px;
  for (const row of wrapped) {
    if (y > inner.y + inner.h) break;
    if (row.num !== null) {
      ctx.fillStyle = 'rgba(148,163,184,0.35)';
      ctx.fillText(String(row.num).padStart(2, ' '), inner.x, y);
    }
    // Continuation rows indent slightly so a wrapped line reads as one statement.
    let x = inner.x + gutterW + (row.num === null ? px * 1.2 : 0);
    for (const tok of row.toks) {
      ctx.fillStyle = TOKEN_PALETTE[tok.color];
      ctx.fillText(tok.text, x, y);
      x += ctx.measureText(tok.text).width;
    }
    y += lh;
  }
  ctx.restore();
}

/** Widest rendered row, used by the fit loop. */
function maxTokenWidth(
  ctx: CanvasRenderingContext2D,
  rows: { toks: { text: string; color: keyof typeof TOKEN_PALETTE }[] }[]
): number {
  return rows.reduce(
    (m, row) => Math.max(m, ctx.measureText(row.toks.map((t) => t.text).join('')).width),
    0
  );
}

/**
 * Wraps highlighted code lines to a pixel width, preserving token colours.
 *
 * Splits on token boundaries first and only breaks inside a token when a single token is itself
 * wider than the budget (a long URL or path), so syntax colouring survives the wrap. Continuation
 * rows carry `num: null` so the line-number gutter is not repeated.
 */
function wrapCodeLines(
  ctx: CanvasRenderingContext2D,
  lines: { text: string; color: keyof typeof TOKEN_PALETTE }[][],
  maxW: number
): { toks: { text: string; color: keyof typeof TOKEN_PALETTE }[]; num: number | null }[] {
  const out: { toks: { text: string; color: keyof typeof TOKEN_PALETTE }[]; num: number | null }[] = [];
  if (maxW <= 0) return out;

  lines.forEach((toks, idx) => {
    let row: { text: string; color: keyof typeof TOKEN_PALETTE }[] = [];
    let rowW = 0;
    let first = true;
    const push = () => {
      out.push({ toks: row, num: first ? idx + 1 : null });
      first = false;
      row = [];
      rowW = 0;
    };

    for (const tok of toks) {
      let text = tok.text;
      while (text) {
        const w = ctx.measureText(text).width;
        if (rowW + w <= maxW) {
          row.push({ text, color: tok.color });
          rowW += w;
          break;
        }
        // Find how much of this token still fits on the current row.
        let fit = text.length;
        while (fit > 0 && rowW + ctx.measureText(text.slice(0, fit)).width > maxW) fit--;
        if (fit === 0) {
          if (row.length === 0) fit = 1; // pathological: force at least one char to avoid a stall
          else {
            push();
            continue;
          }
        }
        row.push({ text: text.slice(0, fit), color: tok.color });
        text = text.slice(fit);
        push();
      }
    }
    if (row.length > 0 || first) push();
  });

  return out;
}

/**
 * Plain greedy word wrap for Latin text. `wrapRtl` is tuned for Hebrew shaping; a quoted prompt is
 * usually English and only needs word breaking, with blank lines preserved as paragraph breaks.
 */
function wrapLtr(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (!line || ctx.measureText(next).width <= maxW) {
        line = next;
      } else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

/**
 * A prompt lifted from the source thread, in its own terminal container.
 *
 * Deliberately not drawCodeBlock: a prompt is text to COPY into a model, not source to read, so it
 * gets no line numbers and no syntax colouring — tokenising English prose as if it were code makes
 * it harder to read, not easier. It keeps the window chrome, because the chrome is what says
 * "literal text". Direction follows the prompt's own script, so a Hebrew prompt is not painted
 * left-to-right.
 */
function drawPromptBox(
  ctx: CanvasRenderingContext2D,
  b: SlideBox,
  r: Region,
  raw: string,
  top: number,
  maxH: number,
  accent: string
) {
  const clean = raw.trim();
  const barH = terminalBarHeight(b.W);
  if (!clean || maxH <= barH * 1.6) return;
  const rtl = /[֐-׿]/.test(clean.slice(0, 80));

  // The card is MEASURED before it is drawn: a prompt that needs four lines gets a four-line card,
  // not one stretched to the bottom of the slide. Sizing it to the region left short prompts
  // floating in a half-empty slab, which reads as a rendering fault rather than as a design.
  const chromeH = barH + b.m.cardPad * 2.1;
  const innerW = r.w - b.m.cardPad * 2;
  const budget = maxH - chromeH;
  if (budget <= 0) return;

  let px = b.W * 0.026;
  const minPx = b.W * 0.015;
  let lines: string[] = [];
  for (let i = 0; i < 24; i++) {
    setMono(ctx, px, 400);
    lines = rtl ? wrapRtl(ctx, sanitizeHebrewText(clean), innerW) : wrapLtr(ctx, clean, innerW);
    if (lines.length * px * 1.55 <= budget || px <= minPx) break;
    px = Math.max(minPx, px * 0.94);
  }
  setMono(ctx, px, 400);
  // A prompt too long even at the floor size is clipped, not allowed to grow the card past maxH.
  const textH = Math.min(budget, lines.length * px * 1.55);
  const inner = terminalFrame(ctx, r.x, top, r.w, chromeH + textH, b.W, b.m, accent, 'prompt', { copyGlyph: true });

  ctx.save();
  // Hard clip to the slab interior, so an over-long prompt truncates instead of bleeding out.
  ctx.beginPath();
  ctx.rect(inner.x - px * 0.4, inner.y - px, inner.w + px * 0.8, textH + px);
  ctx.clip();
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = rtl ? 'right' : 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(226,232,240,0.93)';
  const x = rtl ? inner.x + inner.w : inner.x;
  let y = inner.y + px;
  for (const line of lines) {
    if (y > inner.y + textH) break;
    ctx.fillText(line, x, y);
    y += px * 1.55;
  }
  ctx.restore();
}

function drawBulletList(
  ctx: CanvasRenderingContext2D,
  b: SlideBox,
  r: Region,
  bullets: string[],
  top: number,
  maxH: number,
  marker: 'check' | 'dot',
  accent: string
) {
  const items = bullets.slice(0, 5);
  if (!items.length) return;
  const rowH = Math.min(b.W * 0.16, maxH / items.length);
  let y = top;
  for (const raw of items) {
    const h = rowH - b.m.gap * 0.5;
    glassCard(ctx, r.x, y, r.w, h, b.m.radiusMd, b.m);
    const boxS = b.W * 0.037;
    const bx = r.x + r.w - b.m.cardPad - boxS;
    const by = y + h / 2 - boxS / 2;
    if (marker === 'check') {
      roundRectPath(ctx, bx, by, boxS, boxS, boxS * 0.25);
      ctx.fillStyle = hexToRgba(accent, 0.16);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.save();
      ctx.strokeStyle = accent;
      ctx.lineWidth = boxS * 0.11;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx + boxS * 0.26, by + boxS * 0.52);
      ctx.lineTo(bx + boxS * 0.45, by + boxS * 0.72);
      ctx.lineTo(bx + boxS * 0.76, by + boxS * 0.3);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(bx + boxS / 2, by + boxS / 2, boxS * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
    }
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    const { lines, px } = autoFit(ctx, sanitizeHebrewText(raw), r.w - boxS - b.m.cardPad * 2.4, b.W * 0.03, b.W * 0.02, 2, (c, p) => setBody(c, p, 500));
    setBody(ctx, px, 500);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    let ty = y + h / 2 - ((lines.length - 1) * px * 1.3) / 2 + px * 0.34;
    for (const line of lines) {
      ctx.fillText(line, bx - b.W * 0.022, ty);
      ty += px * 1.3;
    }
    y += rowH;
  }
}

/**
 * The UI path the thread told the reader to walk, as an LTR breadcrumb of chips.
 *
 * Menu labels are never translated — a reader following along needs the literal string printed in
 * the product — so the row is drawn left-to-right and right-aligned as a block into the RTL column,
 * which is where the eye lands first in Hebrew. Returns the y the next element may start at.
 */
function drawWorkflowPath(
  ctx: CanvasRenderingContext2D,
  b: SlideBox,
  r: Region,
  segs: string[],
  top: number,
  accent: string
): number {
  const steps = segs.map((s) => s.trim()).filter(Boolean).slice(0, 4);
  if (!steps.length) return top;

  const h = b.W * 0.052;
  const padX = b.W * 0.021;
  const gap = b.W * 0.028;
  let px = b.W * 0.02;
  const width = () => {
    setMono(ctx, px, 700);
    return steps.reduce((w, s) => w + ctx.measureText(s).width + padX * 2, 0) + gap * (steps.length - 1);
  };
  // Shrink rather than wrap: a path broken across two lines stops reading as one journey.
  let total = width();
  while (total > r.w && px > b.W * 0.012) {
    px *= 0.94;
    total = width();
  }

  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const midY = top + h / 2;
  let x = r.x + r.w - total;
  steps.forEach((step, i) => {
    const w = ctx.measureText(step).width + padX * 2;
    // Each leg is its own glass chip, so the breadcrumb reads as a row of interface elements
    // rather than as a sentence that happens to contain arrows.
    glassCard(ctx, x, top, w, h, h * 0.3, b.m, i === steps.length - 1 ? accent : undefined);
    setMono(ctx, px, 700);
    ctx.fillStyle = i === steps.length - 1 ? accent : 'rgba(226,232,240,0.95)';
    ctx.fillText(step, x + padX, midY + 1);
    x += w;
    if (i < steps.length - 1) {
      ctx.fillStyle = hexToRgba(accent, 0.8);
      ctx.textAlign = 'center';
      ctx.fillText('›', x + gap / 2, midY);
      ctx.textAlign = 'left';
      x += gap;
    }
  });
  ctx.restore();
  return top + h + b.m.gap;
}

function drawStepBadge(
  ctx: CanvasRenderingContext2D,
  b: SlideBox,
  r: Region,
  n: number,
  accent: string,
  ring = false
): number {
  const size = b.W * 0.115;
  const x = r.x + r.w - size;
  const y = r.y;
  ctx.save();
  roundRectPath(ctx, x, y, size, size, size * 0.28);
  ctx.fillStyle = hexToRgba(accent, 0.14);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(accent, 0.55);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  setDisplay(ctx, size * 0.52, 900);
  // Glow and numeral are drawn as separate passes: a shadowBlur applied to the fill itself
  // smeared the digit's own edges. The halo goes down first, then the numeral is painted crisp
  // with the shadow cleared, so the badge reads sharp at slide scale.
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 16;
  ctx.globalAlpha = 0.55;
  ctx.fillText(String(n), x + size / 2, y + size / 2 + 2);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.fillText(String(n), x + size / 2, y + size / 2 + 2);
  ctx.restore();
  // The circled numeral — seeded off the step number so the same step is ringed identically in the
  // carousel PNG and in every frame of the reel.
  if (ring) {
    scribbleCircle(ctx, x + size / 2, y + size / 2, size * 0.74, size * 0.68, accent, n * 313 + 5);
  }
  return y + size + b.m.gap;
}

// ─── cream & terracotta preset ──────────────────────────────────────────────────────────────
//
// A second, entirely separate visual family alongside the dark slate one above. Where the slate
// preset carries a tool's identity through coloured light on a near-black ground, this one is
// paper: one hot terracotta accent and one near-black install container on a warm cream ground.
// It does not share layout code with the slate preset beyond the primitives both draw with
// (`roundRectPath`, `wrapRtl`) — the composition itself (avatar lockup, eyebrow counter, oversized
// LTR command headline, dark install box, thin progress rail) is its own thing end to end.

/** LTR auto-fit for a single short token — a slash command, a CLI invocation. Never wraps: a
 *  command broken onto a second line stops reading as one literal string to type. Mirrors
 *  `autoFit` above, which does the RTL, multi-line equivalent for prose. */
function autoFitLtr(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  startPx: number,
  minPx: number,
  set: (c: CanvasRenderingContext2D, px: number) => void
): number {
  let px = startPx;
  for (let i = 0; i < 24; i++) {
    set(ctx, px);
    if (ctx.measureText(text).width <= maxW || px <= minPx) break;
    px = Math.max(minPx, px * 0.93);
  }
  return px;
}

/** The Hebrew headline on a cream slide — solid ink, not the slate preset's white-to-accent
 *  gradient, which would wash out against a light ground. Reuses `autoFit`'s wrap/shrink loop. */
function drawCreamTitle(ctx: CanvasRenderingContext2D, b: SlideBox, r: Region, title: string, startPx: number, maxLines: number): number {
  if (!title) return r.y;
  const { lines, px } = autoFit(ctx, sanitizeHebrewText(title), r.w, startPx, b.W * 0.036, maxLines, (c, p) => setDisplay(c, p, 800));
  setDisplay(ctx, px, 800);
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = CREAM_INK;
  let y = r.y + px;
  for (const line of lines) {
    ctx.fillText(line, r.x + r.w, y);
    y += px * 1.16;
  }
  return y;
}

/** Plain wrapped body prose on cream — no card panel behind it, matching the reference decks,
 *  where the paragraph just sits on the paper. */
function drawCreamParagraph(ctx: CanvasRenderingContext2D, b: SlideBox, r: Region, text: string, top: number, maxLines: number): number {
  if (!text) return top;
  const { lines, px } = autoFit(ctx, sanitizeHebrewText(text), r.w, b.W * 0.032, b.W * 0.02, maxLines, (c, p) => setBody(c, p, 400));
  setBody(ctx, px, 400);
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = CREAM_BODY;
  let y = top + px;
  for (const line of lines) {
    ctx.fillText(line, r.x + r.w, y);
    y += px * 1.5;
  }
  return y;
}

/** The takeaway / tool bullet list on cream — a plain check row, no card, matching the paper look. */
function drawCreamBulletList(ctx: CanvasRenderingContext2D, b: SlideBox, r: Region, items: string[], top: number, accent: string): number {
  const rows = items.filter((t) => t.trim()).slice(0, 5);
  if (!rows.length) return top;
  const fs = b.W * 0.03;
  const rowH = fs * 1.9;
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  setBody(ctx, fs, 500);
  let y = top + rowH / 2;
  for (const raw of rows) {
    const dotX = r.x + r.w - fs * 0.18;
    ctx.beginPath();
    ctx.arc(dotX, y, fs * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = CREAM_INK;
    const label = sanitizeHebrewText(raw);
    const maxW = r.w - fs * 0.7;
    let fitted = label;
    while (fitted.length > 4 && ctx.measureText(fitted).width > maxW) fitted = fitted.slice(0, -2);
    ctx.fillText(fitted === label ? label : `${fitted}…`, dotX - fs * 0.55, y);
    y += rowH;
  }
  ctx.restore();
  return y;
}

/**
 * The node flowchart: a trunk of nodes running left to right, optionally fanning out into parallel
 * branch rows after the last trunk node — the exact shape the reference diagrams use (a webhook
 * into an agent, which then forks into several handled outcomes).
 *
 * Column position is what keeps the fan-out readable: every node's column is its position within
 * ITS OWN row (trunk or branch), offset by the trunk's length for a branch row, so a branch's first
 * node always lines up directly after the point it forked from, whatever row it is drawn in.
 */
function drawWorkflowDiagram(ctx: CanvasRenderingContext2D, b: SlideBox, r: Region, nodes: WorkflowNode[], top: number, maxH: number, accent: string): number {
  if (!nodes.length) return top;
  const trunk = nodes.filter((n) => !n.lane);
  const branchLanes = new Map<number, WorkflowNode[]>();
  for (const n of nodes) {
    if (!n.lane) continue;
    if (!branchLanes.has(n.lane)) branchLanes.set(n.lane, []);
    branchLanes.get(n.lane)!.push(n);
  }
  const lanes = [...branchLanes.keys()].sort((a, b2) => a - b2);
  const cols = Math.max(trunk.length, trunk.length + Math.max(0, ...lanes.map((l) => branchLanes.get(l)!.length)));
  const rows = 1 + lanes.length;

  // Node size respects BOTH constraints — how many columns must fit across, and how many rows must
  // fit down to `maxH` — so a wide trunk and a tall fan-out both shrink the same node grid rather
  // than one of them silently overflowing its axis.
  const pad = b.W * 0.05;
  const labelFs = b.W * 0.019;
  const labelSpace = labelFs * 2.7; // room for a node's two-line label beneath it
  const byWidth = (r.w - pad * 2) / Math.max(1, cols) - b.W * 0.03;
  const byHeight = (maxH - pad * 2 - Math.max(0, rows - 1) * labelSpace) / rows;
  const nodeSize = Math.max(b.W * 0.045, Math.min(b.W * 0.1, byWidth, byHeight));
  const colGap = cols > 1 ? (r.w - pad * 2 - cols * nodeSize) / (cols - 1) : 0;
  const rowGap = rows > 1 ? Math.max(nodeSize * 0.3, labelSpace) : 0;
  // The card's own height is the content it actually holds, clamped to what the caller granted —
  // never the full `maxH`, which used to leave a mostly-empty white box under a short diagram.
  const cardH = Math.min(maxH, pad * 2 + rows * nodeSize + Math.max(0, rows - 1) * rowGap);
  drawPaperCard(ctx, r.x, top, r.w, cardH, b.m.radiusLg);

  const colX = (col: number) => r.x + pad + col * (nodeSize + colGap) + nodeSize / 2;
  const rowY = (row: number) => top + pad + row * (nodeSize + rowGap) + nodeSize / 2;

  const drawLabel = (cx: number, cy: number, node: WorkflowNode) => {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const ly = cy + nodeSize / 2 + labelFs * 0.7;
    if (node.label) {
      ctx.direction = 'rtl';
      setBody(ctx, labelFs, 700);
      ctx.fillStyle = CREAM_INK;
      ctx.fillText(node.label, cx, ly);
    }
    if (node.sublabel) {
      ctx.direction = 'ltr';
      setBody(ctx, labelFs * 0.86, 400);
      ctx.fillStyle = CREAM_MUTED;
      ctx.fillText(node.sublabel, cx, ly + labelFs * 1.3);
    }
    ctx.restore();
  };

  // Trunk row, connected in sequence.
  const trunkY = rowY(0);
  trunk.forEach((node, i) => {
    const cx = colX(i);
    drawNodeIcon(ctx, node.icon, cx, trunkY, nodeSize);
    drawLabel(cx, trunkY, node);
    if (i > 0) drawNodeLink(ctx, colX(i - 1) + nodeSize / 2, trunkY, cx - nodeSize / 2, trunkY, accent, b.W);
  });

  // Branch rows: each starts right after the trunk and forks from its last node.
  const lastTrunkX = trunk.length ? colX(trunk.length - 1) : r.x + pad + nodeSize / 2;
  lanes.forEach((lane, li) => {
    const laneNodes = branchLanes.get(lane)!;
    const laneY = rowY(li + 1);
    laneNodes.forEach((node, i) => {
      const cx = colX(trunk.length + i);
      drawNodeIcon(ctx, node.icon, cx, laneY, nodeSize);
      drawLabel(cx, laneY, node);
      if (i === 0) {
        drawNodeLink(ctx, lastTrunkX + nodeSize / 2, trunkY, cx - nodeSize / 2, laneY, accent, b.W);
      } else {
        drawNodeLink(ctx, colX(trunk.length + i - 1) + nodeSize / 2, laneY, cx - nodeSize / 2, laneY, accent, b.W);
      }
    });
  });

  return top + cardH;
}

/**
 * Paints one slide in the cream & terracotta family — either the "skill card" composition
 * (avatar, eyebrow counter, command headline, install box) or, when the slide carries workflow
 * nodes and the deck is in `cream-workflow` mode, the node-diagram composition instead.
 */
function drawCreamSlide(
  ctx: CanvasRenderingContext2D,
  b: SlideBox,
  slide: TechTipSlide,
  index: number,
  total: number,
  logo: HTMLImageElement | null,
  anim: SlideAnim,
  style: TipStyle
) {
  const accent = TERRACOTTA;
  ctx.clearRect(0, 0, b.W, b.H);
  paintCreamBackdrop(ctx, b.W, b.H, index, style === 'cream-workflow' ? 'workflow' : 'skill');

  const alpha = Math.max(0, Math.min(1, anim.intro)) * (1 - Math.max(0, Math.min(1, anim.outro)));
  const rise = (1 - Math.min(1, anim.intro)) * b.W * 0.02;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(0, rise);

  const pad = b.PAD;
  let y = b.H * 0.058;
  y = drawAvatarLockup(ctx, pad, y, b.W, logo) + b.W * 0.026;

  const railY = b.H - b.PAD * 0.62;
  const r: Region = { x: pad, y, w: b.W - pad * 2, h: railY - b.W * 0.05 - y };

  if (style === 'cream-workflow' && slide.workflow?.length) {
    // Number-tile heading: the section ordinal plus the slide's own title/subtitle beside it.
    const tileSize = b.W * 0.1;
    drawNumberTile(ctx, r.x, y, tileSize, b.m, index + 1);
    const headX = r.x + tileSize + b.W * 0.03;
    const headW = r.w - tileSize - b.W * 0.03;
    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    const { lines: tLines, px: tPx } = autoFit(ctx, sanitizeHebrewText(slide.title), headW, b.W * 0.05, b.W * 0.03, 2, (c, p) => setDisplay(c, p, 800));
    setDisplay(ctx, tPx, 800);
    ctx.fillStyle = CREAM_INK;
    let ty = y + tileSize * 0.42;
    for (const line of tLines) {
      ctx.fillText(line, r.x + r.w, ty);
      ty += tPx * 1.1;
    }
    ctx.restore();
    let headBottom = Math.max(y + tileSize, ty + b.W * 0.014);
    if (slide.subtitle?.trim()) {
      headBottom = drawCreamParagraph(ctx, b, { ...r, x: headX, w: headW }, slide.subtitle, headBottom, 2);
    }
    const diagramTop = headBottom + b.W * 0.03;
    drawWorkflowDiagram(ctx, b, r, slide.workflow, diagramTop, railY - b.W * 0.05 - diagramTop, accent);
  } else {
    // Eyebrow: an English counter chip — "SKILL 1 / 6" — kept Latin end to end so the manual
    // letterspacing in `drawEyebrow` (built for Latin glyph order) is never handed Hebrew.
    const label = (slide.badge || slide.kicker || 'SKILL').toUpperCase();
    const count = slide.stepLabel?.trim() || `${index + 1} / ${total}`;
    y = drawEyebrow(ctx, r.x, y + b.W * 0.014, r.w, b.W, `${label} ${count}`, accent) + b.W * 0.036;

    if (slide.slashCommand?.trim()) {
      const px = autoFitLtr(ctx, slide.slashCommand, r.w * 0.66, b.W * 0.088, b.W * 0.05, (c, p) => setDisplay(c, p, 800));
      setDisplay(ctx, px, 800);
      ctx.save();
      ctx.direction = 'ltr';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = CREAM_INK;
      ctx.fillText(slide.slashCommand, r.x, y + px * 0.86);
      ctx.restore();
      // The circular-arrow glyph — a decorative motif for a "loop" step. Drawn only when the
      // slide's own scribble says so, so it means something (a TDD-style repeat) rather than
      // decorating every command headline identically.
      if (slide.scribble === 'circle' || slide.scribble === 'arrow') {
        drawLoopGlyph(ctx, r.x + r.w - px * 0.4, y + px * 0.32, px * 0.34, accent);
      }
      y += px * 1.3;
    } else {
      y = drawCreamTitle(ctx, b, r, slide.title, b.W * 0.062, 3) + b.W * 0.01;
    }

    if (slide.subtitle?.trim()) {
      ctx.save();
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      setBody(ctx, b.W * 0.03, 700);
      ctx.fillStyle = accent;
      const subPx = b.W * 0.03;
      y += subPx * 0.2;
      for (const line of wrapRtl(ctx, sanitizeHebrewText(slide.subtitle), r.w).slice(0, 2)) {
        y += subPx;
        ctx.fillText(line, r.x + r.w, y);
      }
      ctx.restore();
      y += b.W * 0.018;
    }

    // Reserve space for the install box (if any) and the progress rail before laying out the body,
    // so the paragraph never overlaps either — the box is drawn anchored to the bottom, last.
    const installRows: { leader: string; value: string }[] = [];
    if (slide.install?.saveAs) installRows.push({ leader: 'save as', value: slide.install.saveAs });
    if (slide.install?.run) installRows.push({ leader: 'then run', value: slide.install.run });
    const installH = installRows.length ? installBoxHeight(b.W, installRows.length) : 0;
    const bodyBottom = railY - b.W * 0.05 - (installH ? installH + b.W * 0.035 : 0);
    const bodyMaxLines = Math.max(2, Math.floor((bodyBottom - y) / (b.W * 0.048)));

    if (slide.code.trim()) {
      drawCodeBlock(ctx, b, { ...r, y, h: bodyBottom - y }, slide, y + b.W * 0.02, bodyBottom - y - b.W * 0.02);
    } else if (slide.promptBox?.trim()) {
      drawPromptBox(ctx, b, { ...r, y, h: bodyBottom - y }, slide.promptBox, y + b.W * 0.02, bodyBottom - y - b.W * 0.02, accent);
    } else if ((slide.kind === 'tool' || slide.kind === 'takeaway' || slide.kind === 'cta') && slide.bullets.length) {
      drawCreamBulletList(ctx, b, r, slide.bullets, y + b.W * 0.01, accent);
    } else {
      const bodyY = drawCreamParagraph(ctx, b, r, slide.body, y, bodyMaxLines);
      // A starburst fills genuinely empty space between the paragraph and the install box — never
      // forced in, and never drawn low enough to collide with the box.
      if (installH && bodyBottom - bodyY > b.W * 0.14) {
        drawStarburst(ctx, r.x + r.w * 0.14, (bodyY + bodyBottom - installH * 0.3) / 2, b.W * 0.05, TERRACOTTA_WASH, index * 7 + 3);
      }
    }

    if (installRows.length) {
      drawInstallBox(ctx, r.x, railY - b.W * 0.05 - installH, r.w, b.W, b.m, installRows, { accent });
    }
  }

  drawProgressRail(ctx, pad, railY, b.W - pad * 2, b.W, index, total, accent);
  ctx.restore();
}

// ─── cream prompt-library preset ────────────────────────────────────────────────────────────
//
// A third cream family, for a source shape neither of the two above handles: a dense-text
// carousel where the teaching content is PRINTED ON the images themselves — numbered prompt
// cards, one or two per frame, each with a "why I use this" rationale underneath. Instagram's own
// accessibility OCR reads only a minority of such frames reliably, so the deck this preset renders
// comes from a dedicated vision-OCR extraction (see imageTranslatorAgent.ts's `buildPromptLibraryImageDeck`)
// rather than the caption-driven adaptation the other two presets consume. Shares the cream
// palette and the avatar/progress-rail chrome with `drawCreamSlide` but is its own composition:
// stacked white prompt cards instead of an install box or a node diagram.

/** One prompt card: a white rounded panel with a large index numeral, the prompt body, and a
 *  "why I use this" callout pinned to the card's own bottom edge. Measures the why-box first
 *  (its copy is always short) and gives the prompt body whatever room is left above it — the same
 *  "reserve the fixed piece, autofit the rest" split `drawCreamSlide` uses for its install box. */
function drawPromptLibraryCard(
  ctx: CanvasRenderingContext2D,
  b: SlideBox,
  x: number,
  y: number,
  w: number,
  h: number,
  card: { index: string; body: string; whyIUseThis: string },
  accent: string
) {
  drawPaperCard(ctx, x, y, w, h, b.m.radiusLg);
  const pad = b.W * 0.032;

  // Index numeral — oversized, LTR digits, anchored to the card's leading (right, in RTL) corner.
  const numFs = b.W * 0.052;
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  setDisplay(ctx, numFs, 800);
  ctx.fillStyle = accent;
  ctx.fillText(card.index.padStart(3, '0'), x + w - pad, y + pad + numFs * 0.82);
  ctx.restore();

  const whyText = card.whyIUseThis.trim();
  const whyFs = b.W * 0.021;
  const whyLabelFs = whyFs * 0.98;
  const whyPad = b.W * 0.022;
  const innerW = w - pad * 2;
  let whyLines: string[] = [];
  let whyH = 0;
  if (whyText) {
    setBody(ctx, whyFs, 500);
    whyLines = wrapRtl(ctx, sanitizeHebrewText(whyText), innerW - whyPad * 2).slice(0, 3);
    whyH = whyPad * 2 + whyLabelFs * 1.3 + whyLines.length * whyFs * 1.4;
  }

  const bodyTop = y + pad + numFs * 1.05;
  const bodyBottom = y + h - pad - (whyH ? whyH + b.W * 0.018 : 0);
  const bodyMaxH = Math.max(0, bodyBottom - bodyTop);
  if (bodyMaxH > whyFs * 2) {
    const { lines, px } = autoFit(
      ctx,
      sanitizeHebrewText(card.body),
      innerW,
      b.W * 0.026,
      b.W * 0.016,
      Math.max(2, Math.floor(bodyMaxH / (b.W * 0.026 * 1.5))),
      (c, p) => setBody(c, p, 500)
    );
    setBody(ctx, px, 500);
    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = CREAM_INK;
    let ly = bodyTop + px;
    for (const line of lines) {
      if (ly > bodyBottom) break;
      ctx.fillText(line, x + w - pad, ly);
      ly += px * 1.5;
    }
    ctx.restore();
  }

  if (whyText && whyLines.length) {
    const boxY = y + h - pad - whyH;
    roundRectPath(ctx, x + pad, boxY, innerW, whyH, b.m.radiusMd);
    ctx.fillStyle = PROMPT_WHY_BG;
    ctx.fill();
    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    setBody(ctx, whyLabelFs, 800);
    ctx.fillStyle = accent;
    let wy = boxY + whyPad + whyLabelFs * 0.9;
    ctx.fillText('למה אני משתמש בזה:', x + w - pad - whyPad, wy);
    wy += whyLabelFs * 1.3;
    setBody(ctx, whyFs, 500);
    ctx.fillStyle = CREAM_BODY;
    for (const line of whyLines) {
      ctx.fillText(line, x + w - pad - whyPad, wy);
      wy += whyFs * 1.4;
    }
    ctx.restore();
  }
}

/** The cover slide's feature grid — up to 10 category tiles, two per row, beneath the headline. */
function drawPromptLibraryTileGrid(ctx: CanvasRenderingContext2D, b: SlideBox, r: Region, tiles: string[], top: number, bottom: number, accent: string) {
  const items = tiles.filter((t) => t.trim()).slice(0, 10);
  if (!items.length) return;
  const cols = 2;
  const rows = Math.ceil(items.length / cols);
  const gap = b.W * 0.022;
  const tileH = Math.min(b.W * 0.1, (bottom - top - gap * (rows - 1)) / rows);
  const tileW = (r.w - gap) / cols;
  const fs = b.W * 0.023;
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  items.forEach((label, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    // Column 0 sits on the RIGHT in an RTL grid.
    const x = r.x + r.w - tileW - col * (tileW + gap);
    const y = top + row * (tileH + gap);
    roundRectPath(ctx, x, y, tileW, tileH, b.m.radiusMd);
    ctx.fillStyle = TERRACOTTA_WASH;
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;
    const { lines, px } = autoFit(ctx, sanitizeHebrewText(label), tileW - b.W * 0.03, fs, b.W * 0.014, 2, (c, p) => setBody(c, p, 700));
    setBody(ctx, px, 700);
    ctx.fillStyle = accent;
    const cy = y + tileH / 2 - ((lines.length - 1) * px * 1.15) / 2;
    lines.forEach((line, li) => ctx.fillText(line, x + tileW / 2, cy + li * px * 1.15));
  });
  ctx.restore();
}

/**
 * Paints one slide of the prompt-library preset: the cover's headline + feature grid, a closer's
 * plain sign-off, or — the common case — one or two stacked prompt cards read off this frame.
 */
function drawPromptLibrarySlide(
  ctx: CanvasRenderingContext2D,
  b: SlideBox,
  slide: TechTipSlide,
  index: number,
  total: number,
  logo: HTMLImageElement | null,
  anim: SlideAnim
) {
  const accent = TERRACOTTA;
  ctx.clearRect(0, 0, b.W, b.H);
  paintCreamBackdrop(ctx, b.W, b.H, index, 'skill');

  const alpha = Math.max(0, Math.min(1, anim.intro)) * (1 - Math.max(0, Math.min(1, anim.outro)));
  const rise = (1 - Math.min(1, anim.intro)) * b.W * 0.02;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(0, rise);

  const pad = b.PAD;
  let y = b.H * 0.058;
  y = drawAvatarLockup(ctx, pad, y, b.W, logo) + b.W * 0.03;

  const railY = b.H - b.PAD * 0.62;
  const r: Region = { x: pad, y, w: b.W - pad * 2, h: railY - b.W * 0.05 - y };

  const cards = (slide.promptCards ?? []).filter((c) => c.body.trim());

  if (slide.kind === 'cover') {
    y = drawCreamTitle(ctx, b, r, slide.title, b.W * 0.064, 3) + b.W * 0.026;
    drawPromptLibraryTileGrid(ctx, b, r, slide.coverTiles ?? [], y, railY - b.W * 0.05, accent);
  } else if (cards.length) {
    if (slide.badge?.trim()) {
      ctx.save();
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      const fs = b.W * 0.03;
      setDisplay(ctx, fs, 800);
      ctx.fillStyle = accent;
      ctx.fillText(sanitizeHebrewText(slide.badge), r.x + r.w, y + fs);
      y += fs * 1.15;
      ctx.restore();
      if (slide.subtitle?.trim()) {
        y = drawCreamParagraph(ctx, b, r, slide.subtitle, y, 1) + b.W * 0.006;
      }
      y += b.W * 0.014;
    }
    const gap = b.W * 0.024;
    const slotH = (railY - b.W * 0.05 - y - gap * (cards.length - 1)) / cards.length;
    cards.forEach((card, i) => {
      drawPromptLibraryCard(ctx, b, r.x, y + i * (slotH + gap), r.w, slotH, card, accent);
    });
  } else {
    // No cards recovered for this frame (a vision miss, or the deterministic local fallback) — a
    // plain cream title + paragraph so the slide still reads as content rather than a blank card.
    y = drawCreamTitle(ctx, b, r, slide.title, b.W * 0.05, 2) + b.W * 0.014;
    drawCreamParagraph(ctx, b, r, slide.body, y, 8);
  }

  drawProgressRail(ctx, pad, railY, b.W - pad * 2, b.W, index, total, accent);
  ctx.restore();
}

// ─── main painter ───────────────────────────────────────────────────────────────────────────

export interface SlideAnim {
  /** 0..1 entrance progress — drives the fade/rise of the slide's body content. */
  intro: number;
  /** 0..1 crossfade-out at the end of a scene (motion export only). */
  outro: number;
}

export function drawTipSlide(
  ctx: CanvasRenderingContext2D,
  b: SlideBox,
  slide: TechTipSlide,
  index: number,
  total: number,
  bg: HTMLImageElement | null,
  logo: HTMLImageElement | null,
  anim: SlideAnim = { intro: 1, outro: 0 },
  style: TipStyle = 'creator'
) {
  // The cream & terracotta family is a completely separate painter — different palette, different
  // chrome, no shared layout beyond the primitives both draw with — so it branches off before any
  // of the slate-specific drawing below runs, rather than threading an if/else through every block.
  if (style === 'cream-skill' || style === 'cream-workflow') {
    drawCreamSlide(ctx, b, slide, index, total, logo, anim, style);
    return;
  }
  if (style === 'cream-prompt-library') {
    drawPromptLibrarySlide(ctx, b, slide, index, total, logo, anim);
    return;
  }
  ctx.clearRect(0, 0, b.W, b.H);
  const accent = accentFor(slide);
  // The backdrop is lit in the slide's own brand pair, so a photo-free technical slide still
  // carries the tool's identity before a single word is read.
  paintSlateBackdrop(ctx, b.W, b.H, index, accent, glowFor(slide));
  if (bg) drawBackgroundImage(ctx, b, bg);
  drawTopBar(ctx, b, slide, index, total, logo, accent);
  drawBottomBar(ctx, b, index, total, accent, slide.kind !== 'cta');

  const r = contentRegion(b);
  const alpha = Math.max(0, Math.min(1, anim.intro)) * (1 - Math.max(0, Math.min(1, anim.outro)));
  const rise = (1 - Math.min(1, anim.intro)) * b.W * 0.02;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(0, rise);

  const region: Region = { ...r };
  let cursorY = region.y;

  if (slide.kind === 'step' && slide.stepNumber > 0) {
    cursorY = drawStepBadge(ctx, b, region, slide.stepNumber, accent, slide.scribble === 'circle');
    region.y = cursorY;
    region.h = r.y + r.h - cursorY;
  }

  if (slide.kind === 'cover' || slide.kind === 'cta') {
    // Centred, oversized title + supporting line.
    // Tool lockup above the headline — mark plus wordmark, centred. The cover of a creator deck
    // names its subject before the title does, which is what makes it identifiable in a grid.
    if (slide.kind === 'cover' && slide.tool) {
      const t = TOOL_STYLE[slide.tool];
      const ms = b.W * 0.072;
      const lockGap = b.W * 0.018;
      ctx.save();
      ctx.direction = 'ltr';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      setMono(ctx, b.W * 0.026, 700);
      const lockW = ms + lockGap + ctx.measureText(t.label).width;
      const lx = b.W / 2 - lockW / 2;
      const ly = region.y + region.h * 0.1;
      drawToolMark(ctx, slide.tool, lx, ly - ms / 2, ms, t.accent, { glow: true });
      ctx.fillStyle = 'rgba(226,232,240,0.92)';
      ctx.fillText(t.label, lx + ms + lockGap, ly + 1);
      ctx.restore();
    }

    const { lines, px } = autoFit(ctx, sanitizeHebrewText(slide.title), region.w, b.W * 0.085, b.W * 0.042, 5, (c, p) => setDisplay(c, p, 800));
    setDisplay(ctx, px, 800);
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    let y = region.y + region.h * 0.3 - ((lines.length - 1) * px * 1.18) / 2;
    let lastBaseline = y;
    let lastWidth = 0;
    for (const line of lines) {
      const grad = ctx.createLinearGradient(region.x + region.w, 0, region.x, 0);
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.55, SILVER);
      grad.addColorStop(1, accent);
      ctx.fillStyle = grad;
      ctx.fillText(line, b.W / 2, y);
      lastBaseline = y;
      lastWidth = ctx.measureText(line).width;
      y += px * 1.18;
    }
    // Marker underline beneath the closing line of the headline — the one hand-drawn mark on a
    // cover. Measured off the line actually painted, so it tracks the auto-fitted type size.
    if (slide.scribble === 'underline' && lastWidth > 0) {
      const uw = Math.min(lastWidth, region.w * 0.9);
      scribbleUnderline(ctx, b.W / 2 - uw / 2, lastBaseline + px * 0.28, uw, accent, index * 977 + 13);
    }
    if (slide.body) {
      y += b.m.gap;
      setBody(ctx, b.W * 0.034, 400);
      ctx.fillStyle = 'rgba(226,232,240,0.85)';
      for (const line of wrapRtl(ctx, sanitizeHebrewText(slide.body), region.w * 0.9).slice(0, 5)) {
        ctx.fillText(line, b.W / 2, y);
        y += b.W * 0.048;
      }
    }
    if (slide.kind === 'cta') {
      // The closing card. No link pill, no comment trigger, no keyword: the slide's job is to leave
      // the reader with the takeaway and with a name to follow, and a URL painted into a PNG is not
      // tappable anyway — the guide link lives in the caption, where it is.
      const takeaways = slide.bullets.filter((t) => t.trim()).slice(0, 3);
      if (takeaways.length) {
        y += b.m.gap * 0.6;
        // The lockup owns the bottom of the slide and is never crowded out; the card takes what is
        // left and shrinks its rows to fit, rather than being dropped whole the moment it would not
        // fit at its natural size — which is what silently emptied this slide.
        const reserved = b.W * 0.155;
        const avail = region.y + region.h - reserved - y;
        const rowH = Math.min(b.W * 0.072, (avail - b.m.cardPad) / takeaways.length);
        const cardH = takeaways.length * rowH + b.m.cardPad;
        const cardW = region.w * 0.92;
        const cardX = b.W / 2 - cardW / 2;
        if (rowH > b.W * 0.04) {
          glassCard(ctx, cardX, y, cardW, cardH, b.m.radiusLg, b.m, accent);
          ctx.direction = 'rtl';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          setBody(ctx, b.W * 0.027, 500);
          takeaways.forEach((item, i) => {
            const ty = y + b.m.cardPad * 0.5 + rowH * (i + 0.5);
            const dotX = cardX + cardW - b.m.cardPad;
            ctx.beginPath();
            ctx.arc(dotX - b.W * 0.006, ty, b.W * 0.006, 0, Math.PI * 2);
            ctx.fillStyle = accent;
            ctx.fill();
            ctx.fillStyle = 'rgba(226,232,240,0.9)';
            const label = sanitizeHebrewText(item);
            const maxW = cardW - b.m.cardPad * 2.6;
            let fitted = label;
            while (fitted.length > 4 && ctx.measureText(fitted).width > maxW) fitted = fitted.slice(0, -2);
            ctx.fillText(fitted === label ? label : `${fitted}…`, dotX - b.W * 0.028, ty);
          });
          y += cardH;
        }
      }
      // The brand lockup, sitting where the link pill used to: handle badge plus the name beneath.
      drawBrandBadge(ctx, b.W / 2, region.y + region.h - b.W * 0.09, b.W, b.m, accent, { withName: true });
    }
  } else if (isQuoteSlide(slide)) {
    drawQuoteLayout(ctx, b, region, slide, accent, index);
  } else {
    // A snippet longer than a handful of lines is the slide's whole point: the title steps down to
    // two smaller lines and the set-up copy to one, and the terminal takes everything that frees up.
    const codeHeavy = slide.kind === 'code' && slide.code.split(/\r?\n/).filter((l) => l.trim()).length >= 8;
    // Marker swipe on alternating plain slides only — on every slide it stops reading as emphasis.
    const plain = !slide.code.trim() && !slide.promptBox?.trim() && !slide.workflowPath?.length;
    const markerSeed = plain && slide.scribble !== 'underline' && index % 2 === 1 ? index * 389 + 11 : undefined;
    let afterTitle =
      drawTitle(ctx, b, region, slide.title, codeHeavy ? b.W * 0.042 : b.W * 0.052, codeHeavy ? 2 : 3, accent, markerSeed) + b.m.gap;
    // The click-path sits directly beneath the title: it IS the slide's instruction, and the body,
    // prompt card or snippet below it are the elaboration.
    if (slide.workflowPath?.length) {
      afterTitle = drawWorkflowPath(ctx, b, region, slide.workflowPath, afterTitle, accent);
    }
    const remaining = region.y + region.h - afterTitle;

    if (slide.kind === 'code' && slide.code.trim()) {
      if (slide.body) {
        setBody(ctx, b.W * 0.028, 400);
        ctx.direction = 'rtl';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = 'rgba(226,232,240,0.8)';
        let by = afterTitle;
        for (const line of wrapRtl(ctx, sanitizeHebrewText(slide.body), region.w).slice(0, codeHeavy ? 1 : 2)) {
          ctx.fillText(line, region.x + region.w, by);
          by += b.W * 0.04;
        }
        drawCodeBlock(ctx, b, region, slide, by + b.m.gap * 0.5, region.y + region.h - (by + b.m.gap * 0.5));
      } else {
        drawCodeBlock(ctx, b, region, slide, afterTitle, remaining);
      }
    } else if (slide.promptBox?.trim()) {
      // Same shape as the code branch: the body sets the prompt up in a line or two, the box is the
      // slide's actual payload. Checked after code so a slide carrying both never draws two panels.
      let boxTop = afterTitle;
      if (slide.body) {
        setBody(ctx, b.W * 0.028, 400);
        ctx.direction = 'rtl';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = 'rgba(226,232,240,0.8)';
        let by = afterTitle;
        for (const line of wrapRtl(ctx, sanitizeHebrewText(slide.body), region.w).slice(0, 2)) {
          ctx.fillText(line, region.x + region.w, by);
          by += b.W * 0.04;
        }
        boxTop = by + b.m.gap * 0.5;
      }
      // The doodle arrow gets its own reserved gap instead of being drawn over whatever sits
      // above the card. Room is taken from the card, so the arrow can never collide with the body
      // copy, and it is skipped outright when the card is already tight.
      const gap = slide.scribble === 'arrow' && region.y + region.h - boxTop > b.W * 0.55 ? b.W * 0.062 : 0;
      if (gap > 0) {
        doodleArrow(
          ctx,
          region.x + region.w * 0.27,
          boxTop + gap * 0.06,
          region.x + region.w * 0.15,
          boxTop + gap * 0.88,
          accent,
          index * 131 + 7
        );
      }
      drawPromptBox(ctx, b, region, slide.promptBox, boxTop + gap, region.y + region.h - boxTop - gap, accent);
    } else if ((slide.kind === 'tool' || slide.kind === 'takeaway') && slide.bullets.length) {
      drawBulletList(ctx, b, region, slide.bullets, afterTitle, remaining, slide.kind === 'takeaway' ? 'check' : 'dot', accent);
    } else {
      drawParagraph(ctx, b, region, slide.body || slide.bullets.join('. '), afterTitle, remaining, accent);
    }
  }

  ctx.restore();
}

// ─── still carousel export ──────────────────────────────────────────────────────────────────

export async function renderTipDeckImages(
  deck: TechTipDeck,
  opts: { width?: number; height?: number; backgrounds?: (HTMLImageElement | null)[]; style?: TipStyle } = {},
  onProgress?: (done: number, total: number) => void
): Promise<string[]> {
  const width = opts.width ?? 1080;
  const height = opts.height ?? 1350;
  const b = boxFor(width, height);
  const logo = await getLogo();
  await ensureDeckFonts();

  const out: string[] = [];
  for (let i = 0; i < deck.slides.length; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    drawTipSlide(ctx, b, deck.slides[i], i, deck.slides.length, opts.backgrounds?.[i] ?? null, logo, undefined, opts.style ?? 'creator');
    out.push(canvas.toDataURL('image/png'));
    onProgress?.(i + 1, deck.slides.length);
  }
  return out;
}

/**
 * Repaints ONE slide, reusing an already-resolved background — the live-preview path for the
 * slide text editor. Re-running the full `renderTipDeckImages` loop on every keystroke would
 * re-decode every other slide's background for nothing; this touches only the index that changed.
 */
export async function renderSingleTipSlide(
  deck: TechTipDeck,
  index: number,
  opts: { width?: number; height?: number; background?: HTMLImageElement | null; style?: TipStyle } = {}
): Promise<string> {
  const width = opts.width ?? 1080;
  const height = opts.height ?? 1350;
  const b = boxFor(width, height);
  const logo = await getLogo();
  await ensureDeckFonts();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  drawTipSlide(ctx, b, deck.slides[index], index, deck.slides.length, opts.background ?? null, logo, undefined, opts.style ?? 'creator');
  return canvas.toDataURL('image/png');
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? '';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function exportTipDeckZip(deck: TechTipDeck, images: string[], caption: string): Promise<void> {
  const zip = new JSZip();
  const slug = (deck.title || 'tech-tip').replace(/[^\w֐-׿]+/g, '-').slice(0, 40) || 'tech-tip';
  images.forEach((img, i) => {
    const s = deck.slides[i];
    if (img && s) zip.file(`${String(i + 1).padStart(2, '0')}_${s.kind}.png`, dataUrlToBytes(img));
  });
  zip.file('caption.txt', caption);
  zip.file(
    'code-snippets.txt',
    deck.slides
      .map((s, i) => (s.code.trim() ? `--- slide ${i + 1} (${s.codeLang}) — ${s.title}\n${s.code}\n` : ''))
      .filter(Boolean)
      .join('\n')
  );
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mrdaniel-tips-${slug}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
