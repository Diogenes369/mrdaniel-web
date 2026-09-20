// Cleans up generated Hebrew slide/caption text so punctuation and embedded English/Latin
// technical terms render correctly in layout engines (canvas, SVG) that place text token-by-token
// rather than running a full paragraph-level bidi resolution — see
// dashboard/src/lib/carouselTemplateRenderer.ts's drawRunsLine, which draws each whitespace-
// separated token with its own fillText call. A token glued directly to punctuation with no space
// (e.g. "LLM," or "RAG.") has no strong RTL character next to that punctuation for the browser's
// per-token bidi resolution to anchor against, so the mark can end up drawn on the wrong visual
// side. Wrapping the embedded Latin run in RLM (Right-to-Left Mark, U+200F — a strong, invisible
// RTL character) fixes this: the punctuation immediately after it now resolves against that
// anchor instead of drifting.
const RLM = '‏';

// Private-use-area marker for the held-URL placeholder below — distinct from any digit that can
// occur in real text, so the restore step can't mistake an ordinary number ("30" in "ב-30 יום")
// for a placeholder index.
const PUA = '';

// A maximal run of Latin letters/digits, allowing single embedded hyphens/apostrophes/spaces so a
// multi-word term ("Agent Guardian") or a hyphenated one ("GPT-4") wraps as one unit — but a space
// only extends the run if another Latin word-char immediately follows, so it never swallows the
// space before a following Hebrew word.
// A dot extends the run ONLY before digits, so a dotted version ("Claude 4.5") stays one bidi unit
// while a sentence-ending period never glues two sentences into one run.
const LATIN_RUN = /\b[A-Za-z][A-Za-z0-9]*(?:[-'’ ][A-Za-z0-9]+|\.\d+)*\b/g;

// A whole number including its grouping separators, so "20,000" stays one isolate instead of
// becoming "[LRI]20[PDI],[LRI]000[PDI]" — which puts a bare comma between two isolates and lets it
// drift to the wrong side of the number in an RTL line.
const NUMBER = /\d+(?:[.,]\d+)*/g;

// LTR ISOLATE / POP DIRECTIONAL ISOLATE — wrap a URL or bare domain so its internal order stays
// left-to-right inside an RTL line (otherwise "mrdaniel.co.il" renders as "il.co.mrdaniel").
const LTR_ISO_OPEN = '⁦';
const LTR_ISO_CLOSE = '⁩';
// A full URL or a bare dotted domain (optionally with a path). Requires at least one label + a
// 2+ letter TLD, so it never fires on "e.g.", "i.e." or "ב-2026.".
const URL_LIKE = /\b(?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s]*)?/gi;

/**
 * Split into [outside, wrapped, outside, wrapped, …] — odd indices are spans already carrying
 * direction marks (an RLM-wrapped Latin run, or an LRI…PDI isolate) and must not be touched again.
 * String.split with a capturing group interleaves the separators, which is exactly this shape.
 */
function protectedSplit(text: string): string[] {
  return text.split(/(‏[^‏]*‏|⁦[^⁩]*⁩)/g);
}

/** Sanitizes one piece of generated Hebrew text before it's stored/rendered:
 * 1. Collapses stray space(s) before sentence/clause punctuation ("שלום , עולם" -> "שלום, עולם") —
 *    punctuation must sit flush against the word it closes, never floating or opening a line.
 * 2. Strips a leading punctuation mark with nothing before it (defensive, in case upstream
 *    line-splitting ever leaves one dangling at the start of a slide/caption).
 * 3. Wraps every embedded Latin run in RLM (see file header) so it, and any punctuation glued to
 *    it, renders on the correct RTL side regardless of the layout engine's per-token bidi quirks.
 * Idempotent — re-running this on already-sanitized text is a no-op (the RLM collapse step below
 * absorbs the harmless double-wrap that would otherwise result from matching inside an existing
 * wrap, since RLM itself isn't a Latin word character). */
export function sanitizeHebrewText(raw: string): string {
  let text = raw;

  text = text.replace(/[ \t]+([,.:;!?])/g, '$1');
  text = text.replace(/^[,.:;!?]+\s*/, '');

  // Pull URLs/domains out first (placeholder = PUA char + index + PUA char, immune to LATIN_RUN
  // which must start with a letter), run the Latin-run pass on the rest, then restore each one
  // inside an LTR isolate so it keeps left-to-right order within the RTL line.
  // Held only from unprotected segments: on a re-run the input already carries LRI…PDI around its
  // URLs, and matching inside one wrapped it a second time ("[LRI][LRI]mrdaniel.co.il[PDI][PDI]").
  const held: string[] = [];
  text = protectedSplit(text)
    .map((seg, i) => (i % 2 === 1 ? seg : seg.replace(URL_LIKE, (m) => `${PUA}${held.push(m) - 1}${PUA}`)))
    .join('');

  // Also gap-only: on a re-run an already-isolated URL is a protected span, and wrapping inside it
  // shattered "mrdaniel.co.il" into "[RLM]mrdaniel[RLM].[RLM]co[RLM].[RLM]il[RLM]".
  text = protectedSplit(text)
    .map((seg, i) => (i % 2 === 1 ? seg : seg.replace(LATIN_RUN, (match) => `${RLM}${match}${RLM}`)))
    .join('');
  text = text.replace(/‏{2,}/g, RLM);

  text = text.replace(new RegExp(`${PUA}(\\d+)${PUA}`, 'g'), (_m, i) => `${LTR_ISO_OPEN}${held[Number(i)]}${LTR_ISO_CLOSE}`);

  // A plain number elsewhere in the sentence ("30" in "ב-30 יום") — isolate it too so its run
  // can't get pulled to the wrong side by a neutral character (hyphen, space) between it and a
  // neighbouring RLM-wrapped Latin term.
  //
  // Only OUTSIDE an existing wrap. Isolating a digit that is already part of a Latin run splits
  // that run into two bidi units, and in an RTL paragraph the second one is then ordered to the
  // left of the first: "Claude Opus 5" became "[RLM]Claude Opus [LRI]5[PDI][RLM]" and rendered as
  // "5 Claude Opus". Product names ending in a version number are everywhere in this content
  // (Claude Opus 5, GPT-6, Wi-Fi 7), so this was not an edge case. Splitting on the protected
  // spans and treating only the gaps also stops a URL's digits being wrapped a second time.
  text = protectedSplit(text).map((seg, i) => (i % 2 === 1 ? seg : seg.replace(NUMBER, (m) => `${LTR_ISO_OPEN}${m}${LTR_ISO_CLOSE}`))).join('');

  return text;
}
