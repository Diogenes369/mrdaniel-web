import {
  synthesizeInstagramDeck,
  extractInstagramPromptLibrary,
  ModelOutputError,
  stripSourceCredits,
  type PromptLibraryExtraction,
} from '../../agent/SocialAgentEngine.js';
import { sanitizeHebrewText } from '../../agent/hebrewTextSanitizer.js';
import { STATIC_GUIDES } from '../leadMagnets.js';
import {
  analyzeThreadTopic,
  layOutDeck,
  stripSlideCta,
  CTA_COPY,
  type ThreadTopicProfile,
  type DeckSource,
} from './threadsThreadAgent.js';
import type { InstallBlock, TechTipDeck, TechTipSlide } from '../../agent/types.js';
import type { ImportedInstagramPost } from '../instagramFetcher.js';

/** The two cream & terracotta presets, plus the existing dark 'creator' default. Threaded from the
 *  dashboard's style picker through to both the model prompt (see synthesizeInstagramDeck's
 *  `visualPreset`) and the renderer (dashboard/src/lib/techTipRenderer.ts's `TipStyle`) — the two
 *  enums are kept in sync by hand since they live in different packages. */
export type InstagramVisualPreset = 'creator' | 'cream-skill' | 'cream-workflow' | 'cream-prompt-library';

/**
 * Instagram post → contextual Hebrew carousel. The agent half of the pipeline whose other half is
 * `src/server/instagramFetcher.ts`; driven by /api/agent-generate · action:"instagram-deck".
 *
 * The fetcher answers "what did the author actually publish". This module answers "what should that
 * look like": it reads the post's own subject matter, assigns a theme (accent colour, topic badge,
 * CTA guide), asks the engine for the Hebrew adaptation, then lays the result out as slides.
 *
 * Deliberately thin. The Threads agent already owns the topic analysis, the click-path and prompt
 * extraction, the CTA stripping and the whole layout pass, and every one of those reads plain text
 * and produces the same TechTipDeck — so they are IMPORTED here rather than re-implemented. What is
 * genuinely Instagram-specific, and all that lives in this file:
 *
 *   1. Segmentation. A thread arrives pre-split into posts; an Instagram post is one caption plus,
 *      on a carousel, the text printed on each frame. `instagramSegments` turns that into the units
 *      a slide can be built from, and is what feeds both the topic analysis and the layout pass.
 *   2. The OCR channel. A carousel's frames carry machine-read text that is partially garbled, so it
 *      is kept apart from the caption all the way into the prompt — see `synthesizeInstagramDeck`.
 *   3. Engagement-bait removal. Instagram captions open and close with "Comment X to get the link",
 *      "Save this post", "Follow for more". On Threads that is occasional; here it is the house
 *      style, and it must never survive into a slide.
 */

const SITE = 'https://mrdaniel.co.il';

/**
 * The caption furniture Instagram creators wrap every post in.
 *
 * Removed before the caption is ever analysed or sent to the model, because it is not what the post
 * is ABOUT: a topic analysis that sees "Comment 3D to get the link" scores nothing useful, and a
 * faithful adaptation of it produces a slide telling an Israeli reader to comment on someone else's
 * post. `stripSlideCta` catches the same shapes on the way OUT of the model; this catches them on
 * the way in, which is cheaper and keeps them out of the topic signals too.
 *
 * Whole lines only. A sentence that merely contains "follow" mid-paragraph is real content.
 */
const CAPTION_BAIT = new RegExp(
  '^(?:' +
    // "Comment 3D to get the link", "DM me GLM", "Type YES below"
    '(?:comment|dm|write|type|drop)\\s+["“\']?[\\w\\s]{1,24}["”\']?\\s*(?:below|in the comments?|to get|for the|and i\'?ll|👇|⬇️)?.*' +
    // "Save this post for later", "Follow for more", "Tag a friend", "Turn on notifications"
    '|(?:save|share|like|tag|follow|subscribe|turn on|bookmark)\\s+(?:this|that|it|me|us|a friend|for more|notifications|the post).*' +
    '|follow\\s+@[A-Za-z0-9._]+.*' +
    '|link in bio.*' +
    // The engagement question creators close on. Enumerated, never "any line ending in ?", because
    // a real teaching caption legitimately asks one ("So which quant actually fits in 24GB?").
    '|(?:so\\s+)?(?:what(?:\'?s| are| do)\\s+(?:your|you)\\s*(?:thoughts?|take|think).*|thoughts\\??|do you agree\\??|agree\\??|which one (?:are|do|would) you.*|are you (?:using|running|trying).*|have you tried.*|let me know.*)' +
    // Bare arrow/spacer lines: the "." padding trick that keeps the feed preview short.
    '|👇+|⬇️+|[.·•\\-—_]{1,10}' +
    ')$',
  'i'
);

/**
 * The caption with its engagement bait and spacer lines removed.
 *
 * Instagram creators pad a caption with lines of a single "." so the feed preview stays short, and
 * wrap the ask in brackets or emoji — "(Save this post for later ❗)". So the line is unwrapped
 * before it is tested: matching the raw line misses every bracketed variant, which is the common
 * one. Everything else survives untouched, including the emoji the author opened with, which
 * carries tone.
 */
export function stripCaptionBait(caption: string): string {
  const kept = String(caption || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => !CAPTION_BAIT.test(unwrapLine(line)));
  // The keyword tail is by definition the last thing in the caption, so only the last line is
  // tested — which is what keeps the heuristic from eating a short headline mid-caption.
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  if (kept.length && isKeywordTail(kept[kept.length - 1])) kept.pop();
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * English function words. Their ABSENCE from a run of four or more words is what separates a
 * keyword list from a sentence — no English sentence of that length avoids all of them.
 */
const FUNCTION_WORD =
  /\b(?:the|a|an|and|or|but|to|of|in|on|at|for|with|from|by|is|are|was|were|be|been|it|its|this|that|these|those|you|your|i|we|they|he|she|my|our|their|can|will|would|should|could|not|no|if|as|so|than|then|when|what|how|why|all|any|more|most|one|two|just|only|about|into|out|up|down|over|after|before|now|get|got|use|using)\b/i;

/**
 * Whether a line is a bare keyword tail rather than prose.
 *
 * Instagram creators append reach keywords AFTER the hashtag block, without the hashes —
 * "blender 3DPrinting Unity UnrealEngine AITools 3DModeling". `captionWithoutHashtags` cannot see
 * those (there is no `#`), so they survive into the caption, become their own paragraph, and turn
 * into a slide made of product names in the fallback deck.
 *
 * Deliberately narrow, because a false positive deletes real content: the line must be four or more
 * words, carry no sentence punctuation at all, and contain not one English function word.
 */
function isKeywordTail(line: string): boolean {
  const text = line.trim();
  if (!text || /[.,!?:;]/.test(text)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 4 || words.length > 30) return false;
  return !FUNCTION_WORD.test(text);
}

/** A line stripped of the brackets, emoji and punctuation creators wrap an ask in, so the bait
 *  patterns above can match its words. Only used for TESTING a line — never for its content. */
function unwrapLine(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^[\s([{"'“‘]+/, '')
    .replace(/[\s)\]}"'”’]+$/, '')
    // Emoji and pictographs at either end — the "❗" in "(Save this post for later ❗)".
    .replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '')
    .replace(/[\p{Extended_Pictographic}️‍\s]+$/u, '')
    .trim();
}

/**
 * The post as the units a slide can be built from.
 *
 * A thread hands the layout pass one entry per post and the numbering follows naturally. An
 * Instagram post has no such split, so one is derived: the caption's own paragraphs, which is how
 * the author actually chunked their argument. On a carousel the frames' OCR text is NOT mixed in
 * here — it is garbled, and everything downstream of this (the prompt boxes, the click-path chips,
 * the local fallback deck's slide bodies) copies its input verbatim onto a slide.
 */
export function instagramSegments(post: ImportedInstagramPost): string[] {
  const clean = stripCaptionBait(post.text || post.caption);
  return clean
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .slice(0, 20);
}

/** The OCR text of each carousel frame, empty entries dropped. Secondary context for the model,
 *  and never a source of quotable strings — see the system instruction in the engine. */
export function slideTexts(post: ImportedInstagramPost): string[] {
  return post.slides.map((s) => s.text.trim()).filter((t) => t.length > 12).slice(0, 20);
}

/**
 * What the layout pass sees.
 *
 * The OCR text is deliberately excluded from `posts` (see `instagramSegments`) but the FRAME IMAGES
 * are included: those are the post's own published graphics, which is exactly the "evidence, not
 * stock" case the renderer already handles.
 */
function deckSource(post: ImportedInstagramPost): DeckSource {
  return { posts: instagramSegments(post), images: post.images };
}

/**
 * The post's subject family, badge and CTA guide.
 *
 * Reads the caption AND the frames' OCR text: on a carousel the caption is often just the pitch
 * while the tool being taught is named only on the slides, so analysing the caption alone
 * mis-themes exactly the posts this tab exists for. Garbled OCR is safe HERE in a way it is not in
 * a slide — this only ever counts keyword matches, so a mangled token scores nothing rather than
 * printing wrong.
 */
export function analyzeInstagramTopic(post: ImportedInstagramPost): ThreadTopicProfile {
  return analyzeThreadTopic([stripCaptionBait(post.text || post.caption), ...slideTexts(post)].join('\n'));
}

/** A slug only becomes a link when the guide is actually registered and live. */
function liveGuide(slug: string): string {
  return STATIC_GUIDES.some((g) => g.slug === slug) ? slug : '';
}

// ─── skill-card structural extraction (deterministic, OCR-sourced) ─────────────────────────
//
// A skill card's install block ("save as .claude/commands/tdd.md", "then run /tdd") is a LITERAL
// string a reader has to type — the one place on the whole slide where a wrong character actually
// breaks something, rather than just reading a little awkward. So unlike the deck's prose, it is
// never trusted to the model (which never even sees the raw per-frame screenshot it came from):
// it is read straight off the carousel frame's own OCR text, the same way `extractPrompts` and
// `extractWorkflowPaths` read literal strings off a Threads post in threadsThreadAgent.ts.

/**
 * "save as <path>" — tolerant of the noise real OCR introduces around it (case, spacing, the
 * occasional garbled middle segment: "conmands" for "commands"), but the path token itself is kept
 * verbatim. There is no cleaner source for it than the frame's own screenshot, so an OCR misread
 * here is a known limitation of the pipeline, not a translation error — it is exactly what the
 * dashboard's OCR review panel exists to catch before the operator publishes.
 */
const SAVE_AS_RE = /save\s*as[:\s]+([./][^\s,;]{2,90}?\.[a-z0-9]{1,6})\b/i;

/** "then run <command>" / "run <command>" — the slash command that follows the install step. */
const RUN_RE = /\b(?:then\s+)?run[:\s]+(\/[^\s,;.!?]{1,60})/i;

/** A bare slash command with no "run" framing around it — the headline command a skill card
 *  names ("/tdd"). Requires a following boundary (space, quote or end of string) so a command
 *  embedded in a longer path never matches: ".claude/commands/tdd.md" has no "/tdd" that is
 *  followed by a boundary, because a "." comes right after it. */
const BARE_SLASH_RE = /(?:^|[\s"'])\/([a-z][a-z0-9-]{1,24})(?=[\s"'.,!?]|$)/i;

/** The install block one OCR text names, or undefined when it names neither line. */
function installFromText(text: string): InstallBlock | undefined {
  const saveAs = text.match(SAVE_AS_RE)?.[1]?.trim();
  const run = text.match(RUN_RE)?.[1]?.trim();
  return saveAs || run ? { saveAs, run } : undefined;
}

/** One carousel frame's install data: the slash command it teaches plus its install block. */
export interface SkillExtract {
  slashCommand: string;
  install?: InstallBlock;
}

/** Reads one OCR text for both fields at once — the install block's own `run` value doubles as
 *  the slide's headline command when present, so the two are never allowed to disagree. */
export function extractSkill(text: string): SkillExtract {
  const install = installFromText(text);
  const bare = text.match(BARE_SLASH_RE)?.[1];
  const slashCommand = install?.run || (bare ? `/${bare}` : '');
  return { slashCommand, install };
}

/**
 * Attaches each content slide's own slash command / install block.
 *
 * Matched by CONTENT first: the adapted Hebrew title routinely names its own command verbatim
 * ("פקודת /tdd: פיתוח מונחה בדיקות" — brand names and commands stay Latin under the source-fidelity
 * rules), so a slide whose title or body literally contains an extracted command gets that exact
 * extract. This is what a naive "consume the extracts in carousel order" queue gets wrong the
 * moment the model inserts one extra slide the source carousel didn't have a frame for — an intro
 * slide before the first skill, say — which shifts every later slide onto the WRONG command's
 * install box. That drift is invisible to a positional queue but is exactly what a content match
 * catches.
 *
 * Extracts no slide's copy names (or a deck whose copy never echoes the command at all) fall back
 * to the same "consume the remaining extracts in carousel order" queue as `layOutDeck` already uses
 * for `images` and `prompts` — a slide the extraction found nothing for simply renders without an
 * install box; nothing is invented to fill the gap.
 *
 * Harmless to call for every Instagram deck regardless of the chosen visual preset: the dark
 * presets' painter never reads `slashCommand` or `install`, so this only has a visible effect once
 * the operator switches to the cream-skill preset — including on a deck that was already
 * synthesized under a different preset, with no need to re-run the model.
 */
export function attachSkillExtras(deck: TechTipDeck, post: ImportedInstagramPost): TechTipDeck {
  const extracts = post.slides.map((s) => extractSkill(s.text)).filter((e) => e.slashCommand || e.install);
  if (!extracts.length || deck.slides.length < 3) return deck;
  const firstContent = 1;
  const lastContent = deck.slides.length - 2;
  const contentSlides = deck.slides.filter((_s, i) => i >= firstContent && i <= lastContent);

  const pool = [...extracts];
  const unmatched: TechTipSlide[] = [];
  for (const slide of contentSlides) {
    const haystack = `${slide.title} ${slide.body}`.toLowerCase();
    const at = pool.findIndex((e) => e.slashCommand && haystack.includes(e.slashCommand.toLowerCase()));
    if (at >= 0) {
      const [found] = pool.splice(at, 1);
      if (!slide.slashCommand && found.slashCommand) slide.slashCommand = found.slashCommand;
      if (!slide.install && found.install) slide.install = found.install;
    } else {
      unmatched.push(slide);
    }
  }
  // Whatever is left — extracts no slide named, and slides no extract named — is consumed as a
  // positional queue, in the order each side already appears in.
  for (const slide of unmatched) {
    if (!pool.length) break;
    const found = pool.shift()!;
    if (!slide.slashCommand && found.slashCommand) slide.slashCommand = found.slashCommand;
    if (!slide.install && found.install) slide.install = found.install;
  }
  return deck;
}

// ─── deterministic fallback ─────────────────────────────────────────────────────────────────

const NEUTRAL_VISUAL =
  'abstract dark cyber technology background, deep obsidian, circuit and node grid geometry, neon green and cyan accents, no text, no letters, no words, no logos, no watermark';

function blankSlide(partial: Partial<TechTipSlide> & Pick<TechTipSlide, 'kind'>): TechTipSlide {
  return {
    kicker: 'מהפוסט',
    title: '',
    body: '',
    bullets: [],
    code: '',
    codeLang: '',
    stepNumber: 0,
    visualPrompt: NEUTRAL_VISUAL,
    ...partial,
  };
}

function clampWords(text: string, max: number): string {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  return words.length <= max ? words.join(' ') : words.slice(0, max).join(' ').replace(/[,;:\-–—״"']+$/, '').trim();
}

/**
 * The source-faithful deck, built without the model.
 *
 * Used when the model answers with something structurally unusable — not when the API is down or
 * rate-limited, which must surface to the operator as the retryable error it is. Deliberately
 * honest: it does NOT machine-translate and does NOT invent Hebrew copy, it carries the caption's
 * own paragraphs through one per slide so the operator can see exactly what was imported and edit
 * from there. It still gets the full visual treatment, so a fallback deck looks like a deck.
 */
export function buildLocalInstagramDeck(post: ImportedInstagramPost, topic: ThreadTopicProfile): TechTipDeck {
  const source = deckSource(post);
  const segments = source.posts.length ? source.posts : [post.text].filter(Boolean);
  const cover = clampWords(segments[0] ?? 'פוסט מאינסטגרם', 8);
  const copy = CTA_COPY[topic.theme];

  const body = segments.slice(1, 11).map((segment, i) =>
    blankSlide({
      kind: 'concept',
      kicker: `חלק ${i + 1}`,
      // stripSlideCta on the local path too: the caption is the author's, and it is exactly the
      // place a "link in bio" survives into a slide when the model is not in the loop.
      title: stripSlideCta(clampWords(segment.split('\n')[0] ?? '', 8)),
      body: stripSlideCta(clampWords(segment.replace(/\n+/g, ' '), 30)),
    })
  );

  const deck: TechTipDeck = {
    title: cover,
    slides: [
      // No author credit on the cover — the only brand on generated output is mrdaniel.co.il.
      blankSlide({ kind: 'cover', kicker: 'טיוטה', title: cover, body: 'טקסט המקור כפי שיובא — לעריכה ידנית לפני פרסום.' }),
      ...body,
      blankSlide({ kind: 'cta', kicker: 'צעד הבא', title: copy.title, body: copy.body }),
    ],
    hashtags: ['#AI', '#אוטומציה', '#עסקים', '#טכנולוגיה'],
  };
  return layOutDeck(deck, source, topic);
}

// ─── entry point ────────────────────────────────────────────────────────────────────────────

export interface InstagramDeckResult {
  deck: TechTipDeck;
  topic: ThreadTopicProfile;
  /** false when the model's output was unusable and this is the deterministic source-faithful deck */
  synthesized: boolean;
  /** why, when `synthesized` is false — shown on the dashboard's amber badge */
  fallbackReason?: string;
}

/** Whether a failure is the model producing junk (recoverable here) rather than the API being
 *  unavailable (which must reach the operator as a retryable 429/503, not a silent fallback). */
function isModelOutputFailure(err: unknown): boolean {
  if (err instanceof ModelOutputError) return true;
  return /too few usable instagram slides|caption too short to adapt|no text in response/i.test(
    (err as Error)?.message ?? ''
  );
}

/**
 * Adapt an imported Instagram post into a themed, laid-out Hebrew carousel.
 *
 * Throws only for failures the operator can act on (missing key, rate limit, network) — those keep
 * their classified status through api/agent-generate.ts's error handler.
 */
export async function buildInstagramDeck(input: {
  post: ImportedInstagramPost;
  notes?: string;
  /** false to ignore the carousel frames' OCR text entirely — the operator's escape hatch for a
   *  post whose graphics read as noise. Defaults to true. */
  useSlideText?: boolean;
  /** The visual preset the dashboard has selected. Only changes what is ASKED of the model (see
   *  the two addenda in SocialAgentEngine.ts) — defaults to the existing dark 'creator' preset, so
   *  a caller that never passes this gets exactly the behaviour it always had. */
  visualPreset?: InstagramVisualPreset;
}): Promise<InstagramDeckResult> {
  // The prompt-library preset's source shape (content printed on the images, not the caption) is
  // different enough — vision OCR instead of a caption adaptation, one slide per frame instead of
  // 10-12 invented concept slides — that it is its own build path end to end. See
  // `buildPromptLibraryDeck` below.
  if (input.visualPreset === 'cream-prompt-library') {
    return buildPromptLibraryDeck(input);
  }
  const { post, notes } = input;
  const topic = analyzeInstagramTopic(post);
  const source = deckSource(post);

  try {
    const raw = await synthesizeInstagramDeck({
      caption: stripCaptionBait(post.text || post.caption),
      slideTexts: input.useSlideText === false ? [] : slideTexts(post),
      author: post.author || undefined,
      sourceUrl: post.url || undefined,
      notes: notes?.trim() || undefined,
      visualPreset: input.visualPreset,
    });
    const deck = attachSkillExtras(layOutDeck(raw, source, topic), post);
    return { deck, topic, synthesized: true };
  } catch (err) {
    if (!isModelOutputFailure(err)) throw err;
    console.warn('[instagramAgent] model output unusable, serving source-faithful deck:', (err as Error).message);
    return {
      deck: attachSkillExtras(buildLocalInstagramDeck(post, topic), post),
      topic,
      synthesized: false,
      fallbackReason: 'מנוע ה-AI לא החזיר דק שמיש — מוצג טקסט המקור לעריכה',
    };
  }
}

// ─── prompt-library build path (vision OCR) ────────────────────────────────────────────────

/**
 * One carousel frame's image, fetched server-side and base64-encoded for Gemini vision input.
 * `slide.image` is already same-origin-proxied (see `proxiedImage` in threadsThreadFetcher.ts),
 * so this is a plain HTTPS fetch — no extra allow-listing needed on top of what produced that URL.
 * Never throws: a single frame the CDN 404s or times out on is dropped, not fatal to the whole
 * carousel — `buildPromptLibraryDeck` proceeds with whatever frames did come back.
 */
async function fetchFrameImageBase64(url: string): Promise<{ mimeType: string; data: string } | null> {
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // A guard against an unexpectedly huge response, not a real-world limit: a 1440px-wide carousel
    // frame is a few hundred KB at most.
    if (!buf.length || buf.length > 6_000_000) return null;
    const mimeType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim() || 'image/jpeg';
    return { mimeType, data: buf.toString('base64') };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Turn the vision extraction into a finished deck: one slide per frame the model actually
 * answered for, cover coerced first and closer coerced last (the model reads role from content,
 * which is usually but not always right), category numbering assigned in code so it is stable
 * regardless of what the model did or didn't repeat per frame.
 */
function promptLibraryToDeck(ext: PromptLibraryExtraction): TechTipDeck {
  const categorySeq = new Map<string, number>();
  const numberFor = (category: string): number => {
    if (!category) return 0;
    if (!categorySeq.has(category)) categorySeq.set(category, categorySeq.size + 1);
    return categorySeq.get(category)!;
  };

  const slides: TechTipSlide[] = ext.frames.map((f, i): TechTipSlide => {
    if (f.role === 'cover') {
      return blankSlide({
        kind: 'cover',
        kicker: 'ספריית פרומפטים',
        title: stripSlideCta(ext.coverTitle || f.text) || 'ספריית פרומפטים',
        body: '',
        coverTiles: ext.coverTiles,
      });
    }
    if (f.role === 'closer') {
      return blankSlide({
        kind: 'cta',
        kicker: 'סיכום',
        title: 'עכשיו תריצו אחד',
        body: stripSlideCta(f.text) || 'בחרו פרומפט אחד מהרשימה והריצו אותו היום.',
      });
    }
    // The model sometimes echoes the source's own leading ordinal in categoryTitle ("01 Reels
    // Scripts" -> "01 תסריטי Reels") despite the instruction not to — stripped here so the number
    // this code assigns is never doubled ("✴ 01 01 תסריטי Reels").
    const category = f.categoryTitle.replace(/^\s*\d{1,3}\s+/, '').trim();
    const num = numberFor(category);
    return blankSlide({
      kind: 'concept',
      kicker: `שקופית ${i + 1}`,
      title: '',
      body: '',
      badge: category ? `✴ ${String(num).padStart(2, '0')} ${category}` : undefined,
      subtitle: f.subtitle ? stripSlideCta(f.subtitle) : undefined,
      promptCards: f.promptCards
        .map((c) => ({ ...c, body: stripSlideCta(c.body), whyIUseThis: stripSlideCta(c.whyIUseThis) }))
        .filter((c) => c.body.trim()),
    });
  });

  const usable = slides.filter((s) => s.kind === 'cover' || s.kind === 'cta' || (s.promptCards?.length ?? 0) > 0);
  if (usable.filter((s) => s.kind === 'concept').length < 1) {
    throw new ModelOutputError('too few usable prompt-library slides after layout');
  }

  // Structural contract, same as `parseAdaptedDeck`: cover first, cta last. The model gets this
  // right from content most of the time; when it doesn't, coercing the kind is enough.
  usable[0].kind = 'cover';
  usable[usable.length - 1].kind = 'cta';

  return {
    title: ext.coverTitle || 'ספריית פרומפטים',
    slides: usable.slice(0, 20),
    hashtags: ['#AI', '#פרומפטים', '#קלוד', '#תוכן'],
  };
}

/**
 * The prompt-library build path: fetch every carousel frame's image, read and translate its
 * printed text in one Gemini vision call, and lay the result out one slide per frame. Falls back
 * to the same deterministic source-faithful deck as the caption-driven path when the model's
 * output is unusable or no frame could be fetched — the prompt-library painter's own defensive
 * branch (see `drawPromptLibrarySlide`) renders a plain title+paragraph for a slide with no
 * `promptCards`, so that fallback still reads as a deck rather than a blank canvas.
 */
async function buildPromptLibraryDeck(input: {
  post: ImportedInstagramPost;
  notes?: string;
}): Promise<InstagramDeckResult> {
  const { post, notes } = input;
  const topic = analyzeInstagramTopic(post);

  const localFallback = (reason: string): InstagramDeckResult => ({
    deck: attachSkillExtras(buildLocalInstagramDeck(post, topic), post),
    topic,
    synthesized: false,
    fallbackReason: reason,
  });

  if (!post.slides.length) {
    return localFallback('לא נמצאו תמונות שקופיות לקריאה חזותית — מוצג טקסט המקור לעריכה');
  }

  try {
    const fetched = await Promise.all(post.slides.slice(0, 20).map((s) => fetchFrameImageBase64(s.image)));
    const frames = fetched.filter((f): f is { mimeType: string; data: string } => f !== null);
    if (!frames.length) throw new ModelOutputError('no frame images could be fetched for vision OCR');

    const extraction = await extractInstagramPromptLibrary({
      caption: stripCaptionBait(post.text || post.caption),
      frames,
      author: post.author || undefined,
      notes: notes?.trim() || undefined,
    });
    const deck = promptLibraryToDeck(extraction);
    return { deck, topic, synthesized: true };
  } catch (err) {
    if (!isModelOutputFailure(err)) throw err;
    console.warn('[instagramAgent] prompt-library vision OCR unusable, serving source-faithful deck:', (err as Error).message);
    return localFallback('מנוע ה-AI לא הצליח לקרוא את השקופיות — מוצג טקסט המקור לעריכה');
  }
}

/**
 * Ready-to-paste caption for an adapted Instagram deck.
 *
 * Carries no source attribution, per the repo-wide rule that the only brand on generated output is
 * mrdaniel.co.il — `stripSourceCredits` enforces the same on the slide copy. The source post's own
 * hashtags are deliberately NOT reused: they are tuned to someone else's audience and reach, and
 * the deck's own are generated from its adapted Hebrew content.
 */
export function instagramDeckCaption(deck: TechTipDeck, topic: ThreadTopicProfile): string {
  const lead = deck.slides.find((s) => s.body)?.body ?? '';
  const link = topic.guideSlug && liveGuide(topic.guideSlug) ? `${SITE}/g/${topic.guideSlug}` : SITE;
  return [
    sanitizeHebrewText(stripSourceCredits(deck.title)),
    '',
    sanitizeHebrewText(stripSourceCredits(lead)).slice(0, 220),
    '',
    'החליקו לכל השקפים ➔',
    `המדריך המלא: ${link}`,
    '',
    deck.hashtags.join(' '),
  ]
    .join('\n')
    .trim();
}
