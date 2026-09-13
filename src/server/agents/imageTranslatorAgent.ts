import {
  extractImageCarouselContent,
  extractInstagramPromptLibrary,
  classifyImageCarouselPreset,
  ModelOutputError,
  stripSourceCredits,
  type ImageCarouselExtraction,
  type PromptLibraryExtraction,
} from '../../agent/SocialAgentEngine.js';
import { sanitizeHebrewText } from '../../agent/hebrewTextSanitizer.js';
import { STATIC_GUIDES } from '../leadMagnets.js';
import { analyzeThreadTopic, layOutDeck, stripSlideCta, type ThreadTopicProfile } from './threadsThreadAgent.js';
import type { InstallBlock, TechTipDeck, TechTipSlide } from '../../agent/types.js';

/**
 * Direct carousel image → Hebrew, rebranded carousel. Driven by /api/agent-generate ·
 * action:"image-carousel-deck".
 *
 * Replaces the old link-based Instagram importer (instagramFetcher.ts / instagramAgent.ts,
 * decommissioned 2026-09-13): there is no URL to fetch and no caption to translate — the operator
 * uploads the carousel's own slide images directly, and every frame's printed text is read and
 * translated by Gemini vision in one call (`extractImageCarouselContent`). The output keeps a strict
 * one-slide-per-uploaded-frame mapping, in order, so the deck never invents or reorganises slides —
 * it translates and rebrands each frame in place, structure untouched.
 *
 * Reuses the Threads agent's topic analysis, CTA/theme assignment and CTA-bait stripping
 * (`threadsThreadAgent.ts`) for exactly the reason `instagramAgent.ts` used to: that layout logic
 * reads plain text and produces a TechTipDeck regardless of where the text came from.
 */

export type ImageCarouselVisualPreset =
  | 'creator'
  | 'cream-skill'
  | 'cream-workflow'
  | 'cream-prompt-library'
  | 'auto-detect';

const SITE = 'https://mrdaniel.co.il';

// ─── literal-string extraction (ported unchanged from the decommissioned instagramAgent.ts) ────
// An install block ("save as .claude/commands/tdd.md", "then run /tdd") is a literal string the
// reader has to type — the one place on a slide where a wrong character actually breaks something —
// so it is read straight off the frame's own verbatim `rawText`, never trusted to the translation
// pass that produced `title`/`body`.

const SAVE_AS_RE = /save\s*as[:\s]+([./][^\s,;]{2,90}?\.[a-z0-9]{1,6})\b/i;
const RUN_RE = /\b(?:then\s+)?run[:\s]+(\/[^\s,;.!?]{1,60})/i;
const BARE_SLASH_RE = /(?:^|[\s"'])\/([a-z][a-z0-9-]{1,24})(?=[\s"'.,!?]|$)/i;

function installFromText(text: string): InstallBlock | undefined {
  const saveAs = text.match(SAVE_AS_RE)?.[1]?.trim();
  const run = text.match(RUN_RE)?.[1]?.trim();
  return saveAs || run ? { saveAs, run } : undefined;
}

function slashCommandFromText(text: string, install: InstallBlock | undefined): string {
  const bare = text.match(BARE_SLASH_RE)?.[1];
  return install?.run || (bare ? `/${bare}` : '');
}

/** A slug only becomes a link when the guide is actually registered and live. */
function liveGuide(slug: string): string {
  return STATIC_GUIDES.some((g) => g.slug === slug) ? slug : '';
}

const NEUTRAL_VISUAL =
  'abstract dark cyber technology background, deep obsidian, circuit and node grid geometry, neon green and cyan accents, no text, no letters, no words, no logos, no watermark';

function blankSlide(partial: Partial<TechTipSlide> & Pick<TechTipSlide, 'kind'>): TechTipSlide {
  return {
    kicker: 'מהקרוסלה',
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

/** Whether a failure is the model producing junk (recoverable here) rather than the API being
 *  unavailable (which must reach the operator as a retryable 429/503, not a silent fallback). */
function isModelOutputFailure(err: unknown): boolean {
  if (err instanceof ModelOutputError) return true;
  return /too few usable (?:image-carousel slides|prompt cards)|no frame images|no text in response/i.test(
    (err as Error)?.message ?? ''
  );
}

// ─── generic path (creator / cream-skill / cream-workflow) ─────────────────────────────────────

/** Turns the vision extraction into a deck, one slide per frame, in order. `slashCommand`/`install`
 *  are read from each slide's own `rawText` — exact positional correspondence means no content
 *  matching is needed the way `instagramAgent.ts`'s `attachSkillExtras` once had to do it. */
function extractionToDeck(ext: ImageCarouselExtraction): TechTipDeck {
  const slides: TechTipSlide[] = ext.slides.map((s): TechTipSlide => {
    const install = installFromText(s.rawText);
    const slashCommand = slashCommandFromText(s.rawText, install);
    return {
      kind: s.kind,
      kicker: s.kicker || 'מהקרוסלה',
      title: s.title,
      body: s.body,
      bullets: s.bullets,
      code: s.code,
      codeLang: s.codeLang,
      stepNumber: s.stepNumber,
      visualPrompt: NEUTRAL_VISUAL,
      badge: s.badge || undefined,
      subtitle: s.subtitle || undefined,
      workflow: s.workflow.length ? s.workflow : undefined,
      slashCommand: slashCommand || undefined,
      install,
    };
  });

  if (!slides.length) return { title: ext.title, slides, hashtags: ext.hashtags };

  // Structural contract: first frame is the cover, last is the CTA. The model gets this right from
  // content most of the time; when it doesn't, coercing the kind is enough — the copy is already
  // right, only the chrome (progress ring, scribble) reads `kind`.
  slides[0].kind = 'cover';
  slides[slides.length - 1].kind = 'cta';

  // Sequential step numbering, same as every other adaptation pipeline (see `parseAdaptedDeck` in
  // SocialAgentEngine.ts) — the model's own per-frame numbers are a hint, not the source of truth,
  // since a frame the model misjudged as non-step would otherwise leave a gap in the sequence.
  let stepSeq = 0;
  for (const slide of slides) {
    slide.stepNumber = slide.kind === 'step' ? ++stepSeq : 0;
  }

  return { title: ext.title, slides, hashtags: ext.hashtags };
}

/** The source-faithful placeholder deck used when vision extraction fails entirely. Unlike the
 *  Threads/Instagram text pipelines there is no caption to fall back to — the whole point was
 *  reading text OFF the images — so this only guarantees a deck skeleton the operator can fill in
 *  by hand, one placeholder slide per uploaded frame. */
function buildLocalImageCarouselDeck(frameCount: number): TechTipDeck {
  const n = Math.max(2, frameCount);
  const slides: TechTipSlide[] = Array.from({ length: n }, (_, i) =>
    blankSlide({
      kind: i === 0 ? 'cover' : i === n - 1 ? 'cta' : 'concept',
      kicker: 'טיוטה',
      title: i === 0 ? 'קרוסלה מיובאת' : i === n - 1 ? 'עכשיו התור שלכם' : `שקופית ${i + 1}`,
      body: 'התרגום האוטומטי לא הצליח לקרוא את הטקסט בשקופית הזו — ערכו אותו ידנית לפני פרסום.',
    })
  );
  return { title: 'קרוסלה מיובאת', slides, hashtags: ['#AI', '#אוטומציה', '#עסקים'] };
}

// ─── prompt-library path (dense on-slide cards) ────────────────────────────────────────────────
// Reuses extractInstagramPromptLibrary as-is — it already takes raw frame images with no caption
// dependency, so nothing about it is specific to the decommissioned link importer.

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

  usable[0].kind = 'cover';
  usable[usable.length - 1].kind = 'cta';

  return {
    title: ext.coverTitle || 'ספריית פרומפטים',
    slides: usable.slice(0, 20),
    hashtags: ['#AI', '#פרומפטים', '#קלוד', '#תוכן'],
  };
}

async function buildPromptLibraryImageDeck(
  frames: { mimeType: string; data: string }[],
  notes?: string
): Promise<{ deck: TechTipDeck; topic: ThreadTopicProfile; synthesized: boolean; fallbackReason?: string }> {
  const topic = analyzeThreadTopic('');
  try {
    const extraction = await extractInstagramPromptLibrary({ caption: '', frames, notes: notes?.trim() || undefined });
    return { deck: promptLibraryToDeck(extraction), topic, synthesized: true };
  } catch (err) {
    if (!isModelOutputFailure(err)) throw err;
    console.warn('[imageTranslatorAgent] prompt-library vision OCR unusable, serving placeholder deck:', (err as Error).message);
    return {
      deck: buildLocalImageCarouselDeck(frames.length),
      topic,
      synthesized: false,
      fallbackReason: 'מנוע ה-AI לא הצליח לקרוא את השקופיות — מוצגת טיוטה לעריכה',
    };
  }
}

// ─── entry point ────────────────────────────────────────────────────────────────────────────

export interface ImageCarouselResult {
  deck: TechTipDeck;
  topic: ThreadTopicProfile;
  /** false when vision extraction was unusable and this is the placeholder deck. */
  synthesized: boolean;
  fallbackReason?: string;
  /** The preset actually used to render — meaningful feedback when the caller passed
   *  'auto-detect' and the classifier resolved it to a concrete one. */
  resolvedPreset: Exclude<ImageCarouselVisualPreset, 'auto-detect'>;
}

/**
 * Translate and rebrand a directly-uploaded carousel into a Hebrew deck.
 *
 * Throws only for failures the operator can act on (missing key, rate limit, network) — those keep
 * their classified status through api/agent-generate.ts's error handler. `frames` must already be in
 * the carousel's own reading order.
 */
export async function buildImageCarouselDeck(input: {
  frames: { mimeType: string; data: string }[];
  notes?: string;
  visualPreset?: ImageCarouselVisualPreset;
}): Promise<ImageCarouselResult> {
  const frames = input.frames.slice(0, 20);
  if (frames.length < 2) throw new Error('at least 2 carousel frame images required');

  const preset: Exclude<ImageCarouselVisualPreset, 'auto-detect'> =
    input.visualPreset === 'auto-detect'
      ? await classifyImageCarouselPreset(frames)
      : input.visualPreset === 'cream-skill' || input.visualPreset === 'cream-workflow' || input.visualPreset === 'cream-prompt-library'
        ? input.visualPreset
        : 'creator';

  if (preset === 'cream-prompt-library') {
    const result = await buildPromptLibraryImageDeck(frames, input.notes);
    return { ...result, resolvedPreset: preset };
  }

  try {
    const extraction = await extractImageCarouselContent({ frames, notes: input.notes, visualPreset: preset });
    const topicText = extraction.slides.map((s) => `${s.rawText} ${s.title} ${s.body}`).join('\n');
    const topic = analyzeThreadTopic(topicText);
    const deck = layOutDeck(extractionToDeck(extraction), { posts: [], images: [] }, topic);
    return { deck, topic, synthesized: true, resolvedPreset: preset };
  } catch (err) {
    if (!isModelOutputFailure(err)) throw err;
    console.warn('[imageTranslatorAgent] model output unusable, serving placeholder deck:', (err as Error).message);
    const topic = analyzeThreadTopic('');
    return {
      deck: layOutDeck(buildLocalImageCarouselDeck(frames.length), { posts: [], images: [] }, topic),
      topic,
      synthesized: false,
      fallbackReason: 'מנוע ה-AI לא הצליח לקרוא ולתרגם את השקופיות — מוצגת טיוטה לעריכה',
      resolvedPreset: preset,
    };
  }
}

/**
 * Ready-to-paste caption for a translated carousel. No source attribution — the only brand on
 * generated output is mrdaniel.co.il.
 */
export function imageCarouselDeckCaption(deck: TechTipDeck, topic: ThreadTopicProfile): string {
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
