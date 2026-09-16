// Mirrors src/agent/hebrewTextSanitizer.ts in the main site — the two projects share no package,
// so this is duplicated rather than imported. Applied here as defense-in-depth right before
// carouselTemplateRenderer.ts tokenizes slide text, so text edited by hand in the dashboard (not
// only text fresh out of Gemini) still gets the same punctuation/RTL-run fix.
//
// Cleans up Hebrew slide/caption text so punctuation and embedded English/Latin technical terms
// render correctly under this renderer's word-by-word RTL drawing (drawRunsLine draws each
// whitespace-separated token with its own fillText call). A token glued directly to punctuation
// with no space (e.g. "LLM," or "RAG.") has no strong RTL character next to that punctuation for
// the browser's per-token bidi resolution to anchor against, so the mark can end up drawn on the
// wrong visual side. Wrapping the embedded Latin run in RLM (Right-to-Left Mark, U+200F — a
// strong, invisible RTL character) fixes this: the punctuation immediately after it now resolves
// against that anchor instead of drifting.
const RLM = '‏';

// Private-use-area marker for the held-URL placeholder below — distinct from any digit that can
// occur in real text, so the restore step can't mistake an ordinary number ("30" in "ב-30 יום")
// for a placeholder index.
const PUA = '';

// A maximal run of Latin letters/digits, allowing single embedded hyphens/apostrophes/spaces so a
// multi-word term ("Agent Guardian") or a hyphenated one ("GPT-4") wraps as one unit — but a space
// only extends the run if another Latin word-char immediately follows, so it never swallows the
// space before a following Hebrew word.
const LATIN_RUN = /\b[A-Za-z][A-Za-z0-9]*(?:[-'’ ][A-Za-z0-9]+)*\b/g;

// LTR ISOLATE / POP DIRECTIONAL ISOLATE — wrap a URL or bare domain so its internal order stays
// left-to-right inside an RTL line (otherwise "mrdaniel.co.il" renders as "il.co.mrdaniel").
const LTR_ISO_OPEN = '⁦';
const LTR_ISO_CLOSE = '⁩';
// A full URL or a bare dotted domain (optionally with a path). Requires at least one label + a
// 2+ letter TLD, so it never fires on "e.g.", "i.e." or "ב-2026.".
const URL_LIKE = /\b(?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s]*)?/gi;

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
  const held: string[] = [];
  text = text.replace(URL_LIKE, (m) => `${PUA}${held.push(m) - 1}${PUA}`);

  text = text.replace(LATIN_RUN, (match) => `${RLM}${match}${RLM}`);
  text = text.replace(/‏{2,}/g, RLM);

  text = text.replace(new RegExp(`${PUA}(\\d+)${PUA}`, 'g'), (_m, i) => `${LTR_ISO_OPEN}${held[Number(i)]}${LTR_ISO_CLOSE}`);

  // A plain number elsewhere in the sentence ("30" in "ב-30 יום") — isolate it too so its run
  // can't get pulled to the wrong side by a neutral character (hyphen, space) between it and a
  // neighbouring RLM-wrapped Latin term.
  text = text.replace(/\d+/g, (m) => `${LTR_ISO_OPEN}${m}${LTR_ISO_CLOSE}`);

  return text;
}
