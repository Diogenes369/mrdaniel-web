import { synthesizeInstagramDeck, ModelOutputError, stripSourceCredits } from '../../agent/SocialAgentEngine.js';
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
import type { TechTipDeck, TechTipSlide } from '../../agent/types.js';
import type { ImportedInstagramPost } from '../instagramFetcher.js';

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
}): Promise<InstagramDeckResult> {
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
    });
    return { deck: layOutDeck(raw, source, topic), topic, synthesized: true };
  } catch (err) {
    if (!isModelOutputFailure(err)) throw err;
    console.warn('[instagramAgent] model output unusable, serving source-faithful deck:', (err as Error).message);
    return {
      deck: buildLocalInstagramDeck(post, topic),
      topic,
      synthesized: false,
      fallbackReason: 'מנוע ה-AI לא החזיר דק שמיש — מוצג טקסט המקור לעריכה',
    };
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
