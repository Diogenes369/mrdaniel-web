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

// A maximal run of Latin letters/digits, allowing single embedded hyphens/apostrophes/spaces so a
// multi-word term ("Agent Guardian") or a hyphenated one ("GPT-4") wraps as one unit — but a space
// only extends the run if another Latin word-char immediately follows, so it never swallows the
// space before a following Hebrew word.
const LATIN_RUN = /\b[A-Za-z][A-Za-z0-9]*(?:[-'’ ][A-Za-z0-9]+)*\b/g;

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
  text = text.replace(LATIN_RUN, (match) => `${RLM}${match}${RLM}`);
  text = text.replace(/‏{2,}/g, RLM);

  return text;
}
