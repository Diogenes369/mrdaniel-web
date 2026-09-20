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
import type { StoryCarouselSlide, StoryCarouselDeck } from './storyCarousel.js';

/** One fillable frame: the frame to render, its single content TEXT node, and its meta line nodes. */
export interface TemplateFrame {
  frameId: string;
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
  meta: { handle: 'דניאל בן ברוך\n@mrdaniel', hashtag: '#סייבר_ו_AI', year: '20\n26' },
  frames: {
    longTitle: [
      { frameId: '1:346', textNodeId: '1:357', handle: '1:350', hashtag: '1:351', year: '1:352' },
      { frameId: '1:620', textNodeId: '1:631', handle: '1:624', hashtag: '1:625', year: '1:626' },
      { frameId: '1:422', textNodeId: '1:433', handle: '1:426', hashtag: '1:427', year: '1:428' },
      { frameId: '1:695', textNodeId: '1:706', handle: '1:699', hashtag: '1:700', year: '1:701' },
      { frameId: '1:471', textNodeId: '1:482', handle: '1:475', hashtag: '1:476', year: '1:477' },
      { frameId: '1:520', textNodeId: '1:531', handle: '1:524', hashtag: '1:525', year: '1:526' },
      { frameId: '1:569', textNodeId: '1:580', handle: '1:573', hashtag: '1:574', year: '1:575' },
    ],
    title: [
      { frameId: '1:206', textNodeId: '1:217', handle: '1:379', hashtag: '1:380', year: '1:381' },
      { frameId: '1:608', textNodeId: '1:611', handle: '1:613', hashtag: '1:614', year: '1:615' },
      { frameId: '1:410', textNodeId: '1:413', handle: '1:415', hashtag: '1:416', year: '1:417' },
      { frameId: '1:683', textNodeId: '1:686', handle: '1:688', hashtag: '1:689', year: '1:690' },
      { frameId: '1:459', textNodeId: '1:462', handle: '1:464', hashtag: '1:465', year: '1:466' },
      { frameId: '1:508', textNodeId: '1:511', handle: '1:513', hashtag: '1:514', year: '1:515' },
      { frameId: '1:557', textNodeId: '1:560', handle: '1:562', hashtag: '1:563', year: '1:564' },
    ],
    copy: [
      { frameId: '1:222', textNodeId: '1:233', handle: '1:395', hashtag: '1:396', year: '1:397' },
      { frameId: '1:632', textNodeId: '1:635', handle: '1:637', hashtag: '1:638', year: '1:639' },
      { frameId: '1:434', textNodeId: '1:437', handle: '1:439', hashtag: '1:440', year: '1:441' },
      { frameId: '1:707', textNodeId: '1:710', handle: '1:712', hashtag: '1:713', year: '1:714' },
      { frameId: '1:483', textNodeId: '1:486', handle: '1:488', hashtag: '1:489', year: '1:490' },
      { frameId: '1:532', textNodeId: '1:535', handle: '1:537', hashtag: '1:538', year: '1:539' },
      { frameId: '1:581', textNodeId: '1:584', handle: '1:586', hashtag: '1:587', year: '1:588' },
    ],
    cta: [
      { frameId: '1:358', textNodeId: '1:369', handle: '1:403', hashtag: '1:404', year: '1:405' },
      { frameId: '1:644', textNodeId: '1:647', handle: '1:649', hashtag: '1:650', year: '1:651' },
      { frameId: '1:446', textNodeId: '1:449', handle: '1:451', hashtag: '1:452', year: '1:453' },
      { frameId: '1:719', textNodeId: '1:722', handle: '1:724', hashtag: '1:725', year: '1:726' },
      { frameId: '1:495', textNodeId: '1:498', handle: '1:500', hashtag: '1:501', year: '1:502' },
      { frameId: '1:544', textNodeId: '1:547', handle: '1:549', hashtag: '1:550', year: '1:551' },
      { frameId: '1:593', textNodeId: '1:596', handle: '1:598', hashtag: '1:599', year: '1:600' },
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
  const pool = tpl.frames[archetype];
  if (!pool?.length) throw new Error(`template ${tpl.id} has no frames for archetype '${archetype}'`);
  return pool[(slide.index - 1) % pool.length];
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

/** One slide's write plan: the frame to fill and every node→text pair inside it. */
export interface SlidePlan {
  index: number;
  role: StoryCarouselSlide['role'];
  frameId: string;
  entries: Array<{ nodeId: string; text: string }>;
}

/**
 * Turn a deck into per-slide write plans for the given template.
 *
 * Every entry addresses a nodeId. The meta placeholders are overwritten too — leaving the
 * template's "Your Name / @your_username" in a rendered slide is the single most obvious way to
 * publish something that looks unfinished.
 */
export function planDeck(deck: StoryCarouselDeck, templateId?: string | null): { template: FigmaTemplate; slides: SlidePlan[] } {
  const tpl = getTemplate(templateId);
  const slides = deck.slides.map((slide): SlidePlan => {
    const frame = pickFrame(tpl, slide);
    const entries: Array<{ nodeId: string; text: string }> = [];
    if (frame.textNodeId) {
      entries.push({ nodeId: frame.textNodeId, text: tpl.compose === 'single-block' ? composeSingleBlock(slide) : slide.title });
    }
    if (frame.handle) entries.push({ nodeId: frame.handle, text: tpl.meta.handle });
    if (frame.hashtag) entries.push({ nodeId: frame.hashtag, text: tpl.meta.hashtag });
    if (frame.year) entries.push({ nodeId: frame.year, text: tpl.meta.year });
    return { index: slide.index, role: slide.role, frameId: frame.frameId, entries };
  });
  return { template: tpl, slides };
}
