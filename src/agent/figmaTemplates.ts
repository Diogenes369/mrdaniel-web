/**
 * Template registry — which Figma frames a generated deck is poured into, and how.
 *
 * Why a registry rather than one hardcoded mapping: every third-party template names and structures
 * its layers differently, and the differences are not cosmetic. Reading the first real one
 * (human-deluxe, 2026-09-20) turned up three things that would each have broken a fixed mapping:
 *
 *   1. NO SEMANTIC LAYER NAMES. Every TEXT layer is named after its own content — the title layer
 *      is literally called "How to Improve your Instagram", the body layer "Can a typeface be so
 *      influentical that it shapes the future of an entire city?…". This is Figma's autoRename,
 *      which renames a TEXT layer to match its characters unless someone renamed it by hand. So
 *      figma_inject_text's `name` matching cannot address this template at all, and every entry
 *      here targets `nodeId` instead. Names are recorded nowhere on purpose: the moment the text
 *      is injected, the names change.
 *
 *   2. ONE TEXT BLOCK PER FRAME, not the title/subtitle/body triplet the generator produces. So a
 *      template declares a `compose` strategy; `single-block` flattens the slide's fields into one
 *      string joined by blank lines, which is how the template's own sample copy is written (its
 *      CTA frame ships with a literal "What do you think?\n\nLike and Share…").
 *
 *   3. INVISIBLE CHARACTERS IN FRAME NAMES. "01 – Long Title" and "02 – Title" use a non-breaking
 *      space (U+00A0) after the en-dash; "03 – Copy" and "05 – Call to Action" use a normal space.
 *      Matching frames by name would have silently found three of five archetypes. Another reason
 *      the ids below are literal.
 *
 * The frame tables were extracted from the live file over the REST API rather than typed by hand.
 * To refresh them after the template changes, re-read the page node and re-derive: the ids are
 * stable for as long as nobody deletes and recreates the frames.
 *
 * Adding a template: append a FigmaTemplate. Nothing else in the pipeline needs to know about it —
 * `synthesizeStoryCarousel` takes a templateId, and Hermes can pass one to pick a look per topic.
 */
import { visibleLength as visibleLen, type StoryCarouselSlide, type StoryCarouselDeck } from './storyCarousel.js';
import { BRAND_COLORS, BRAND_FONTS, BRAND_META, brandHandleBlock, hexToFigmaRgb } from './brandIdentity.js';

/** One fillable frame: the frame to render, its single content TEXT node, and its meta line nodes. */
export interface TemplateFrame {
  frameId: string;
  /**
   * Is this variant's background dark enough to be on-brand?
   *
   * The site is dark-only and permanently so (index.css records that a light theme was tried and
   * rolled back), so a white or yellow slide is off-brand rather than a style choice. The light
   * variants stay in the table as data — a future template might want them — but pickFrame only
   * draws from the dark pool. Classified by relative luminance off the live file, not by eye.
   */
  dark?: boolean;
  /** The content TEXT node. `null` on image-only frames, which carry no copy. */
  textNodeId: string | null;
  /** "Your Name / @your_username" — the byline block. */
  handle: string | null;
  /** The sample hashtag line. */
  hashtag: string | null;
  /** The two-digit year block. */
  year: string | null;
}

/** Which archetype a deck slide is rendered into. */
export type FrameArchetype = 'longTitle' | 'title' | 'copy' | 'cta' | 'image';

export interface FigmaTemplate {
  id: string;
  label: string;
  fileKey: string;
  /** The page (CANVAS) holding the frames. The operator's link points here, not at a frame. */
  pageNodeId: string;
  /** 1080x1350 for this one — 4:5, the Instagram carousel ratio, not 9:16. */
  aspect: string;
  /**
   * `single-block` = one TEXT node per frame, fields flattened into it.
   * `named-layers` = separate title/subtitle/body layers addressed by name (see storyCarousel's
   * FIGMA_LAYER_MAP). No registered template uses it yet; it is the shape a purpose-built
   * MrDaniel template would take.
   */
  compose: 'single-block' | 'named-layers';
  /** Which archetype each deck role renders into. */
  roleFrames: Record<StoryCarouselSlide['role'], FrameArchetype>;
  frames: Record<FrameArchetype, TemplateFrame[]>;
  /** Byline text written into every frame's meta block, replacing the template's placeholders. */
  meta: { handle: string; hashtag: string; year: string };
  /**
   * Substitute font, applied only when a node's own font cannot be loaded.
   *
   * Required for every third-party template carrying Hebrew, for two independent reasons. The
   * licensing one: human-deluxe is set in Champion HTF-Bantamweight (commercial Hoefler) and
   * Helvetica (Mac-only), and Figma could load neither on this editor — every injection failed
   * with `The font "..." could not be loaded` until this existed. The typographic one is worse and
   * buying the font would not have fixed it: both are Latin-only faces with no Hebrew glyphs, so
   * Hebrew set in them renders as fallback boxes.
   *
   * Heebo is a Google font, so Figma serves it to any editor with no local install.
   */
  fontFallback: { family: string; style: string };
  /**
   * Apply fontFallback even when the node's own font loads.
   *
   * "Loads" and "can render this script" are different questions. The meta byline is set in Inter,
   * which loaded fine and then drew "דניאל בן ברוך" reversed in the export, because it carries no
   * Hebrew coverage and the shaper fell back badly. Forcing a Hebrew face is the only way the
   * byline renders at all.
   */
  forceFont: boolean;
  /** Hebrew needs RIGHT; every node in this template ships as LEFT. */
  align: 'LEFT' | 'RIGHT' | 'CENTER';
  /**
   * Repaint the template's own accent with ours.
   *
   * human-deluxe ships its dark variants with the designer's accents on the byline text — #db3e1b
   * orange on two of them, #bd3074 pink on another. Those colours are not ours, and a slide wearing
   * them reads as someone else's template with our words in it, which is the exact failure the
   * dark-only filter was already guarding against. `null` leaves a template's own palette alone.
   */
  accentColor: string | null;
  /**
   * Colour for the CONTENT text, separate from the accent.
   *
   * Found by reading fills back out of a rendered deck rather than by looking at it: the accent
   * recolour covered the byline nodes, and 18 of 18 were correct — but the CTA variant sets its
   * BODY text to #bd3074 pink, which the meta-only pass never touched. Body copy must not take the
   * accent (green body text on a dark slide is garish and hurts legibility), so it gets the brand's
   * text colour instead. `null` leaves the template's own body colour alone.
   */
  bodyColor: string | null;
  /**
   * Per-archetype font size override, and the budget the composed block must fit.
   *
   * The template's copy frame holds ~116 characters of Latin at 110px in a 940x940 box. The
   * single-block composition puts title + subtitle + body into that one node, so it carries
   * noticeably more than the sample it was designed around — the first render overflowed the frame.
   * `maxChars` is enforced on the composed string; `fontSize` buys the rest of the room.
   */
  archetypeStyle: Partial<Record<FrameArchetype, { box: { w: number; h: number }; maxFontSize: number; maxChars?: number }>>;
}

/**
 * Instagram Carousel Template by Human Deluxe (Community), duplicated into the operator's drafts.
 * `role: owner` on the REST read, so it is writable — a Community file that has only been *viewed*
 * is not, and injection against one fails at the plugin.
 *
 * Five archetypes, seven colour variants each (bar the image frame). The variants are what lets a
 * deck alternate colours the way a hand-built one does; see pickFrame.
 */
export const HUMAN_DELUXE: FigmaTemplate = {
  id: 'human-deluxe',
  label: 'Human Deluxe — Instagram Carousel (4:5)',
  fileKey: 'KCtdb6UABNfJcKlYZBawmU',
  pageNodeId: '1:205',
  aspect: '1080x1350',
  compose: 'single-block',
  roleFrames: { cover: 'longTitle', item: 'copy', cta: 'cta' },
  meta: { handle: brandHandleBlock(), hashtag: BRAND_META.hashtag, year: BRAND_META.year },
  fontFallback: BRAND_FONTS.figmaFallback,
  forceFont: true,
  align: 'RIGHT',
  accentColor: BRAND_COLORS.brand500,
  bodyColor: BRAND_COLORS.textPrimary,
  // Every text box in this template is 940x940. The sizes are FITTED per slide rather than fixed
  // (see fitFontSize): a fixed size overflowed, because the deck's hard line breaks are sized for a
  // 42-character line and at 130px this box fits about fourteen Hebrew characters per line, so
  // every body line wrapped to two or three and the frame ran over. maxFontSize is the ceiling the
  // template's own design implies, not the size actually used.
  archetypeStyle: {
    longTitle: { box: { w: 940, h: 940 }, maxFontSize: 150, maxChars: 130 },
    copy: { box: { w: 940, h: 940 }, maxFontSize: 110, maxChars: 190 },
    cta: { box: { w: 940, h: 940 }, maxFontSize: 110, maxChars: 150 },
    title: { box: { w: 940, h: 940 }, maxFontSize: 220, maxChars: 60 },
  },
  frames: {
    longTitle: [
      { frameId: '1:346', textNodeId: '1:357', handle: '1:350', hashtag: '1:351', year: '1:352' , dark: true },
      { frameId: '1:620', textNodeId: '1:631', handle: '1:624', hashtag: '1:625', year: '1:626'  },
      { frameId: '1:422', textNodeId: '1:433', handle: '1:426', hashtag: '1:427', year: '1:428' , dark: true },
      { frameId: '1:695', textNodeId: '1:706', handle: '1:699', hashtag: '1:700', year: '1:701' , dark: true },
      { frameId: '1:471', textNodeId: '1:482', handle: '1:475', hashtag: '1:476', year: '1:477'  },
      { frameId: '1:520', textNodeId: '1:531', handle: '1:524', hashtag: '1:525', year: '1:526'  },
      { frameId: '1:569', textNodeId: '1:580', handle: '1:573', hashtag: '1:574', year: '1:575'  },
    ],
    title: [
      { frameId: '1:206', textNodeId: '1:217', handle: '1:379', hashtag: '1:380', year: '1:381' , dark: true },
      { frameId: '1:608', textNodeId: '1:611', handle: '1:613', hashtag: '1:614', year: '1:615'  },
      { frameId: '1:410', textNodeId: '1:413', handle: '1:415', hashtag: '1:416', year: '1:417' , dark: true },
      { frameId: '1:683', textNodeId: '1:686', handle: '1:688', hashtag: '1:689', year: '1:690' , dark: true },
      { frameId: '1:459', textNodeId: '1:462', handle: '1:464', hashtag: '1:465', year: '1:466'  },
      { frameId: '1:508', textNodeId: '1:511', handle: '1:513', hashtag: '1:514', year: '1:515'  },
      { frameId: '1:557', textNodeId: '1:560', handle: '1:562', hashtag: '1:563', year: '1:564'  },
    ],
    copy: [
      { frameId: '1:222', textNodeId: '1:233', handle: '1:395', hashtag: '1:396', year: '1:397' , dark: true },
      { frameId: '1:632', textNodeId: '1:635', handle: '1:637', hashtag: '1:638', year: '1:639'  },
      { frameId: '1:434', textNodeId: '1:437', handle: '1:439', hashtag: '1:440', year: '1:441' , dark: true },
      { frameId: '1:707', textNodeId: '1:710', handle: '1:712', hashtag: '1:713', year: '1:714' , dark: true },
      { frameId: '1:483', textNodeId: '1:486', handle: '1:488', hashtag: '1:489', year: '1:490'  },
      { frameId: '1:532', textNodeId: '1:535', handle: '1:537', hashtag: '1:538', year: '1:539'  },
      { frameId: '1:581', textNodeId: '1:584', handle: '1:586', hashtag: '1:587', year: '1:588'  },
    ],
    cta: [
      { frameId: '1:358', textNodeId: '1:369', handle: '1:403', hashtag: '1:404', year: '1:405' , dark: true },
      { frameId: '1:644', textNodeId: '1:647', handle: '1:649', hashtag: '1:650', year: '1:651'  },
      { frameId: '1:446', textNodeId: '1:449', handle: '1:451', hashtag: '1:452', year: '1:453' , dark: true },
      { frameId: '1:719', textNodeId: '1:722', handle: '1:724', hashtag: '1:725', year: '1:726' , dark: true },
      { frameId: '1:495', textNodeId: '1:498', handle: '1:500', hashtag: '1:501', year: '1:502'  },
      { frameId: '1:544', textNodeId: '1:547', handle: '1:549', hashtag: '1:550', year: '1:551'  },
      { frameId: '1:593', textNodeId: '1:596', handle: '1:598', hashtag: '1:599', year: '1:600'  },
    ],
    image: [{ frameId: '1:656', textNodeId: null, handle: null, hashtag: null, year: null }],
  },
};

export const TEMPLATES: Record<string, FigmaTemplate> = { [HUMAN_DELUXE.id]: HUMAN_DELUXE };

/** The template used when a caller — Hermes included — names none. */
export const DEFAULT_TEMPLATE_ID = HUMAN_DELUXE.id;

export function getTemplate(id?: string | null): FigmaTemplate {
  const tpl = TEMPLATES[String(id || DEFAULT_TEMPLATE_ID)];
  if (!tpl) throw new Error(`unknown figma template '${id}' — registered: ${Object.keys(TEMPLATES).join(', ')}`);
  return tpl;
}

/** Template ids and labels, for a dashboard picker or for Hermes to choose from. */
export function listTemplates(): Array<{ id: string; label: string; aspect: string; compose: string }> {
  return Object.values(TEMPLATES).map((t) => ({ id: t.id, label: t.label, aspect: t.aspect, compose: t.compose }));
}

/**
 * Pick the frame for one slide.
 *
 * Variants rotate by slide position so consecutive slides differ in colour, which is what the
 * template's own example deck does. Deterministic rather than random: the same deck must render
 * identically twice, or a re-run silently produces a different-looking carousel.
 */
export function pickFrame(tpl: FigmaTemplate, slide: StoryCarouselSlide): TemplateFrame {
  const archetype = tpl.roleFrames[slide.role];
  const all = tpl.frames[archetype];
  if (!all?.length) throw new Error(`template ${tpl.id} has no frames for archetype '${archetype}'`);
  // On-brand variants only; fall back to the full pool rather than throwing, so a template with no
  // dark variant still renders instead of failing the whole deck.
  const pool = all.filter((f) => f.dark);
  const from = pool.length ? pool : all;
  return from[(slide.index - 1) % from.length];
}

/**
 * Flatten one slide into the template's single text block.
 *
 * Joined with a blank line between parts, per the template's own copy style. The subtitle sits on
 * its own block rather than being glued to the title, because in the source design it is a visually
 * separate beat — and because a title and its category label run together read as one broken
 * sentence in Hebrew.
 */
export function composeSingleBlock(slide: StoryCarouselSlide): string {
  const parts = [slide.title, slide.subtitle, slide.bodyLines.join('\n')].map((p) => (p || '').trim()).filter(Boolean);
  return parts.join('\n\n');
}

/**
 * Drop whole trailing blocks until the composed string fits the frame's budget.
 *
 * Block-wise rather than character-wise: the parts are separated by blank lines, and cutting one
 * mid-sentence would leave a visibly truncated slide. Losing the last body line is survivable;
 * losing the title is not, so the first block is always kept.
 */
export function capComposed(composed: string, maxChars: number): string {
  if (composed.length <= maxChars) return composed;
  const BLOCK = '\n\n';
  const blocks = composed.split(BLOCK);
  while (blocks.length > 1 && blocks.join(BLOCK).length > maxChars) {
    const last = blocks[blocks.length - 1];
    const lines = last.split('\n');
    if (lines.length > 1) blocks[blocks.length - 1] = lines.slice(0, -1).join('\n');
    else blocks.pop();
  }
  return blocks.join(BLOCK);
}

/**
 * Pick a font size that keeps the composed block inside its box.
 *
 * A fixed per-archetype size does not work here, and the first render showed why: the deck's body
 * lines are broken at ~42 characters (a limit from a different template), while this template's
 * 940-wide box fits roughly fourteen Hebrew characters at 130px. Every line wrapped to two or three
 * and the text ran past the frame — with the copy still perfectly correct in the node, which is why
 * reading the text back could not catch it and only the exported PNG did.
 *
 * The two constants are approximations of Heebo Bold, not exact metrics: Figma does not expose text
 * measurement to this pipeline, so the size is derived from the longest line and the line count and
 * then clamped. Erring small is deliberate — slightly small text is a design nit, overflowing text
 * is an unusable slide. If a render still clips, lower MAX_ADVANCE.
 */
const AVG_ADVANCE = 0.62; // fraction of the em an average Hebrew glyph occupies
const LINE_HEIGHT = 1.3;

export function fitFontSize(text: string, box: { w: number; h: number }, maxFontSize: number): number {
  const lines = text.split('\n');
  const longest = Math.max(1, ...lines.map((l) => visibleLen(l)));
  const byWidth = box.w / (AVG_ADVANCE * longest);
  const byHeight = box.h / (LINE_HEIGHT * Math.max(1, lines.length));
  return Math.max(24, Math.floor(Math.min(maxFontSize, byWidth, byHeight)));
}

/**
 * Prepare one string for a Figma TEXT node: drop the canvas bidi marks, force RTL per line.
 *
 * Two separate corrections, both established by rendering the same sentence four ways into the live
 * template and exporting each:
 *
 *   1. The RLM marks sanitizeHebrewText inserts are a workaround for a renderer that draws text
 *      token-by-token WITHOUT paragraph-level bidi (see that file's header — it names
 *      carouselTemplateRenderer's drawRunsLine). Figma resolves bidi properly, so the marks buy
 *      nothing there and actively cost: with the Latin run at a line edge, the RLM sat between the
 *      word and its following space and the space was trimmed as trailing whitespace, which is what
 *      printed "את" flush against "CLAUDE".
 *
 *   2. Figma takes a paragraph's base direction from its first strong character, so any line
 *      opening on a Latin product name — "Claude סייע…", and product names open these titles
 *      constantly — was laid out LTR, putting the Hebrew in the wrong order. A leading RLM does NOT
 *      fix this (tested, it does not); an explicit RTL isolate does. RLI…PDI rather than RLE…PDF
 *      because an isolate cannot leak its direction into neighbouring text.
 *
 * Per line, because a newline ends a bidi paragraph — one wrapper around the whole block would
 * leave every line after the first back on first-strong detection.
 */
const RLI = '⁧';
const RLM = '‏';
const PDI = '⁩';
const ALL_BIDI_MARKS = /[‎‏؜⁦-⁩‪-‮]/g;

export function prepareForFigma(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const plain = line.replace(ALL_BIDI_MARKS, '').trim();
      if (!plain) return '';
      // A line opening on a NEUTRAL character (a hashtag's "#", a bullet, an opening bracket) has
      // no direction of its own, so inside the isolate it takes the paragraph's — which is what we
      // want, but only because the isolate sets one. The RLM pins it explicitly rather than relying
      // on that inference, and costs nothing: it is zero-width and only added when the line really
      // does start with a neutral.
      //
      // Defensive, not a fix for an observed break — the hashtag renders correctly with or without
      // it. Recorded honestly because the render was misread as broken once already: Hebrew glyph
      // order in an exported PNG reads right-to-left, and transcribing it left-to-right makes
      // correct text look reversed.
      const lead = /^[\p{L}\p{N}]/u.test(plain) ? '' : RLM;
      return `${RLI}${lead}${plain}${PDI}`;
    })
    .join('\n');
}

/** One slide's write plan: the frame to fill and every node→text pair inside it. */
export interface SlidePlan {
  index: number;
  role: StoryCarouselSlide['role'];
  frameId: string;
  entries: Array<{ nodeId: string; text: string; align?: string; fontSize?: number; forceFont?: boolean }>;
  /** Solid fills to repaint on this frame, applied after the text is written. */
  fills: Array<{ nodeId: string; color: { r: number; g: number; b: number } }>;
}

/**
 * Turn a deck into per-slide write plans for the given template.
 *
 * Every entry addresses a nodeId. The meta placeholders are overwritten too — leaving the
 * template's "Your Name / @your_username" in a rendered slide is the single most obvious way to
 * publish something that looks unfinished.
 */
export function planDeck(deck: StoryCarouselDeck, templateId?: string | null): { template: FigmaTemplate; font: { family: string; style: string }; slides: SlidePlan[] } {
  const tpl = getTemplate(templateId);
  const slides = deck.slides.map((slide): SlidePlan => {
    const frame = pickFrame(tpl, slide);
    const archetype = tpl.roleFrames[slide.role];
    const style = tpl.archetypeStyle[archetype];
    const entries: SlidePlan['entries'] = [];
    if (frame.textNodeId) {
      const raw = tpl.compose === 'single-block' ? composeSingleBlock(slide) : slide.title;
      const composed = style?.maxChars ? capComposed(raw, style.maxChars) : raw;
      entries.push({
        nodeId: frame.textNodeId,
        text: prepareForFigma(composed),
        align: tpl.align,
        // Sized on the composed text; prepareForFigma only adds zero-width marks, which
        // visibleLength ignores, so the fit is unaffected either way.
        fontSize: style ? fitFontSize(composed, style.box, style.maxFontSize) : undefined,
        forceFont: tpl.forceFont,
      });
    }
    // The meta lines keep the template's own size — only the font and alignment change, because
    // Inter cannot draw Hebrew (see forceFont).
    const meta = { align: tpl.align, forceFont: tpl.forceFont };
    if (frame.handle) entries.push({ nodeId: frame.handle, text: prepareForFigma(tpl.meta.handle), ...meta });
    if (frame.hashtag) entries.push({ nodeId: frame.hashtag, text: prepareForFigma(tpl.meta.hashtag), ...meta });
    // The year is digits only — an isolate on it would be noise, and it has no direction to get wrong.
    if (frame.year) entries.push({ nodeId: frame.year, text: tpl.meta.year, ...meta });
    // The accent lives on the byline text, which is the only place this template exposes the
    // designer's own colour. Repainting the greys (avatar placeholder, progress bar) would be
    // wrong — they are neutral chrome, not accent.
    const accent = tpl.accentColor ? hexToFigmaRgb(tpl.accentColor) : null;
    const fills = accent
      ? [frame.handle, frame.hashtag, frame.year].filter((id): id is string => Boolean(id)).map((nodeId) => ({ nodeId, color: accent }))
      : [];
    // The content node too, or a variant's own body colour survives the recolour — the CTA frame
    // ships its copy in #bd3074 pink, which the byline-only pass left in place.
    if (tpl.bodyColor && frame.textNodeId) fills.push({ nodeId: frame.textNodeId, color: hexToFigmaRgb(tpl.bodyColor) });
    return { index: slide.index, role: slide.role, frameId: frame.frameId, entries, fills };
  });
  return { template: tpl, font: tpl.fontFallback, slides };
}
