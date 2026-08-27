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

// A maximal run of Latin letters/digits, allowing single embedded hyphens/apostrophes/spaces so a
// multi-word term ("Agent Guardian") or a hyphenated one ("GPT-4") wraps as one unit — but a space
// only extends the run if another Latin word-char immediately follows, so it never swallows the
// space before a following Hebrew word.
const LATIN_RUN = /\b[A-Za-z][A-Za-z0-9]*(?:[-'’ ][A-Za-z0-9]+)*\b/g;

/** Sanitizes one piece of Hebrew slide text right before rendering — see file header. Idempotent:
 * re-running this on already-sanitized text (e.g. text the backend already sanitized) is a no-op,
 * since the RLM-collapse step absorbs the harmless double-wrap that would otherwise result. */
export function sanitizeHebrewText(raw: string): string {
  let text = raw;

  text = text.replace(/[ \t]+([,.:;!?])/g, '$1');
  text = text.replace(/^[,.:;!?]+\s*/, '');
  text = text.replace(LATIN_RUN, (match) => `${RLM}${match}${RLM}`);
  text = text.replace(/‏{2,}/g, RLM);

  return text;
}
