import { synthesizeThreadDeck, ModelOutputError } from '../../agent/SocialAgentEngine.js';
import { analyzeThreadTopic, layOutDeck, CTA_COPY, type ThreadTopicProfile } from './threadsThreadAgent.js';
import type { TechTipDeck, TechTipSlide } from '../../agent/types.js';
import type { ImportedXPost } from '../xPostFetcher.js';

/**
 * X (Twitter) post → contextual Hebrew carousel. The agent half of the pipeline whose other half is
 * `src/server/xPostFetcher.ts`; driven by /api/agent-generate · action:"x-post-deck".
 *
 * ## Why this is thin, and why that is the point
 *
 * An X post and a Threads thread are the same problem: someone else's short technical writing, in
 * English, that has to become a numbered Hebrew teaching deck with a topic badge, prompt boxes,
 * step indicators and a guide CTA. `threadsThreadAgent.ts` already solved every one of those, and
 * its `layOutDeck` was deliberately written against the structural `DeckSource` contract
 * (`{posts, images}`) rather than against `ImportedThread`, precisely so a second source could
 * reuse it. So this module owns only what is genuinely different about X:
 *
 *   1. **The video transcript is a first-class source.** An AI-tool tutorial on X is usually a
 *      screen recording with a one-line post above it — the post text alone is not a deck. When the
 *      subtitle pass has run, what was SAID becomes the body of the deck and the post text becomes
 *      its framing. That is the whole reason this tab exists as something other than an alias of
 *      the Threads tab.
 *   2. **The transcript is segmented into slide-sized units here**, in code, before the model sees
 *      it — a 900-word monologue handed over whole comes back as five slides that each summarise
 *      the entire clip.
 *
 * Everything else — theme scoring, badges, numbering, prompt extraction, CTA rules, the
 * source-faithful fallback — is the Threads agent's, unchanged. A second copy would be one more
 * place for the two tabs' decks to drift apart, which is the exact failure the shared layout pass
 * was introduced to prevent.
 */

/** How many slide-sized units a transcript may be cut into. The deck is 10–12 slides including a
 *  cover and a CTA, so more than this is spent on the model's summarising rather than the reader's
 *  reading. */
const MAX_TRANSCRIPT_SEGMENTS = 10;

/** Target words per transcript segment. Roughly one slide's worth of spoken material at a normal
 *  presenting pace (~2.5 words/second over ~25 seconds). */
const SEGMENT_TARGET_WORDS = 60;

/**
 * Cut a flat Hebrew transcript into slide-sized units, on sentence boundaries.
 *
 * Greedy accumulation up to `SEGMENT_TARGET_WORDS`, never splitting a sentence: a slide that opens
 * mid-clause is the loudest "a machine wrote this" tell on a carousel, and the same rule already
 * governs body copy elsewhere in the pipeline (`clampProse` in SocialAgentEngine.ts). A transcript
 * with no sentence punctuation at all — which is what a fast talker's subtitles look like — falls
 * back to a word-count cut, because one 900-word segment is worse than an imperfect break.
 */
export function segmentTranscript(transcript: string, targetWords = SEGMENT_TARGET_WORDS): string[] {
  const clean = String(transcript || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?׃]+[.!?׃]+|\S+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  const units = sentences.length > 1 ? sentences : clean.split(' ');
  const joiner = sentences.length > 1 ? ' ' : ' ';

  const segments: string[] = [];
  let current: string[] = [];
  let words = 0;
  for (const unit of units) {
    const unitWords = unit.split(' ').filter(Boolean).length;
    if (words && words + unitWords > targetWords) {
      segments.push(current.join(joiner));
      current = [];
      words = 0;
    }
    current.push(unit);
    words += unitWords;
  }
  if (current.length) segments.push(current.join(joiner));
  return segments.filter(Boolean).slice(0, MAX_TRANSCRIPT_SEGMENTS);
}

/**
 * The units the deck is built from: the post's own text first, then the video's spoken content.
 *
 * Order is load-bearing. The post text is the author's framing — "here is the trick" — and belongs
 * on the cover; the transcript is the walkthrough and belongs on the numbered slides behind it.
 * Reversing them produces a deck that opens mid-demo.
 */
export function buildXSegments(post: ImportedXPost, transcript = ''): string[] {
  const written = post.posts.map((p) => p.trim()).filter(Boolean);
  const spoken = segmentTranscript(transcript);
  if (!spoken.length) return written;
  // A post that is nothing but "watch this 👇" is framing with no content; keeping it as its own
  // segment would spend a slide on it. Merged into the first spoken segment instead.
  if (written.length === 1 && written[0].split(/\s+/).length < 8) {
    return [`${written[0]} ${spoken[0]}`.trim(), ...spoken.slice(1)];
  }
  return [...written, ...spoken];
}

export interface XDeckResult {
  deck: TechTipDeck;
  topic: ThreadTopicProfile;
  /** false when the model's output was unusable and this is the deterministic source-faithful deck */
  synthesized: boolean;
  /** why, when `synthesized` is false — shown on the dashboard's amber badge */
  fallbackReason?: string;
  /** how many of the deck's source segments came from the video rather than the post text */
  transcriptSegments: number;
}

/** Whether a failure is the model producing junk (recoverable here) rather than the API being
 *  unavailable (which must reach the operator as a retryable 429/503, not a silent fallback).
 *  Mirrors the same guard in threadsThreadAgent.ts. */
function isModelOutputFailure(err: unknown): boolean {
  if (err instanceof ModelOutputError) return true;
  return /too few usable thread slides|thread too short to adapt|no text in response/i.test(
    (err as Error)?.message ?? ''
  );
}

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
 * Same contract as `buildLocalThreadDeck`: used only when the model answers with something
 * structurally unusable, never when the API is down. It does NOT machine-translate and does NOT
 * invent Hebrew copy — it carries the source segments through, one per slide, so the operator can
 * see exactly what was imported and edit from there. Note that when a transcript exists those
 * segments are ALREADY Hebrew (the subtitle pass translated them), so this fallback is materially
 * more useful on a video post than on a text-only one.
 */
export function buildLocalXDeck(segments: string[], images: string[], topic: ThreadTopicProfile): TechTipDeck {
  const source = segments.filter(Boolean);
  const cover = clampWords(source[0] ?? 'פוסט מ-X', 8) || 'פוסט מ-X';
  const copy = CTA_COPY[topic.theme];

  const body = source.slice(1, 11).map((segment, i) =>
    blankSlide({
      kind: 'concept',
      kicker: `חלק ${i + 1}`,
      title: clampWords(segment.split('\n')[0] ?? '', 8),
      body: clampWords(segment.replace(/\n+/g, ' '), 30),
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
    hashtags: ['#AI', '#אוטומציה', '#כלים', '#טכנולוגיה'],
  };
  return layOutDeck(deck, { posts: source, images }, topic);
}

/**
 * Adapt an imported X post — and, when it has one, its video's Hebrew transcript — into a themed,
 * laid-out Hebrew carousel.
 *
 * Throws only for failures the operator can act on (missing key, rate limit, network); those keep
 * their classified status through api/agent-generate.ts's error handler.
 */
export async function buildXDeck(input: {
  post: ImportedXPost;
  /** the Hebrew transcript from action:"x-subtitles", when the operator ran it first */
  transcript?: string;
  notes?: string;
}): Promise<XDeckResult> {
  const { post, transcript, notes } = input;
  const segments = buildXSegments(post, transcript);
  const transcriptSegments = Math.max(0, segments.length - post.posts.filter((p) => p.trim()).length);
  // The theme is scored on everything the deck will be built from, transcript included: a one-line
  // post above a ten-minute n8n screencast is about automation, and only the transcript says so.
  const topic = analyzeThreadTopic(segments.join('\n'));
  const source = { posts: segments, images: post.images };

  try {
    const raw = await synthesizeThreadDeck({
      posts: segments,
      author: post.author || undefined,
      sourceUrl: post.url || undefined,
      notes: [
        // The engine's thread instruction assumes each numbered unit is a post. Saying which units
        // are spoken keeps it from writing "as the author replied" about a line of narration.
        transcriptSegments > 0
          ? `המקור הוא פוסט ב-X שמצורף אליו סרטון. ${transcriptSegments} היחידות האחרונות הן תמלול הדיבור בסרטון (כבר בעברית) — התייחס אליהן כאל הסבר רציף, לא כאל תגובות נפרדות.`
          : '',
        notes?.trim() ?? '',
      ]
        .filter(Boolean)
        .join('\n') || undefined,
    });
    return { deck: layOutDeck(raw, source, topic), topic, synthesized: true, transcriptSegments };
  } catch (err) {
    if (!isModelOutputFailure(err)) throw err;
    console.warn('[xPostAgent] model output unusable, serving source-faithful deck:', (err as Error).message);
    return {
      deck: buildLocalXDeck(segments, post.images, topic),
      topic,
      synthesized: false,
      fallbackReason: 'מנוע ה-AI לא החזיר דק שמיש — מוצג טקסט המקור לעריכה',
      transcriptSegments,
    };
  }
}
