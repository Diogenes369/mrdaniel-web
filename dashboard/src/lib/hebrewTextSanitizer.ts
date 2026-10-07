// Mirrors src/agent/hebrewTextSanitizer.ts in the main site — the two projects share no package,
// so this is duplicated rather than imported. Applied here as defense-in-depth right before
// carouselTemplateRenderer.ts tokenizes slide text, so text edited by hand in the dashboard (not
// only text fresh out of Gemini) still gets the same punctuation/RTL-run fix.
//
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

// What the Unicode bidi algorithm itself keeps as ONE left-to-right number (UAX #9 rules W4 and W5,
// confirmed character by character in Chrome on 2026-10-07): digit groups joined by a single
// separator — "20,000", "12.9", a time "09:30", a date "7/10" or "2026-10-07", a range "10-20",
// "24/7" — plus any terminator touching the digits: "50%", "$100", "₪50", "20°". The terminators
// are UAX #9's European Terminator class; U+20A0-U+20CF is the currency-sign block (₪, €, ₹, ₿).
// Anything else between two numbers is NOT part of the run: the browser reverses "10–20" (en dash)
// and "1080×1350" in an RTL line, and so does this, rather than inventing an order of its own.
const NUM_SEPARATOR = '[-+.,:/]';
const NUM_TERMINATOR = '[#$%°±‰‱′″‴¢£¤¥\\u20A0-\\u20CF]';
const DIGIT_RUN = `\\d+(?:(?:${NUM_SEPARATOR}|${NUM_TERMINATOR}+)\\d+)*`;

// A maximal run of Latin letters/digits, allowing single embedded hyphens/apostrophes/spaces so a
// multi-word term ("Agent Guardian") or a hyphenated one ("GPT-4") wraps as one unit — but a space
// only extends the run if another Latin word-char immediately follows, so it never swallows the
// space before a following Hebrew word.
// A number inside the run runs on through its separators and terminators ("Claude 4.5",
// "Zoom 09:30", "SWE-bench 80.9%", "ChatGPT Plus $20"), but a separator only joins when a digit
// follows it, so a sentence-ending period never glues two sentences into one run.
// A number fused to a Latin unit STARTS a run: "32GB", "1.5B", "4K", "5G", "1Password", "$5B".
// Isolating its digits split one LTR token into two bidi units, which an RTL line orders the wrong
// way round — "32GB" rendered as "GB32", "9:30AM" as "AM30:9". As a run it also takes in the Latin
// words after it ("32GB RAM", "128K tokens"), exactly as the browser groups them.
// `\B` before a terminator (itself a non-word character) means "not glued to a word on its left":
// the lookbehind-free spelling, because rtl() ships this file to the browser and a lookbehind is a
// parse error on iOS Safari before 16.4, which would take the whole bundle down with it.
// The trailing terminator may not be followed by a letter, digit or another terminator: two runs
// touching would leave "[RLM][RLM]" between them, and the RLM collapse below would fuse the pair
// into one mis-nested span.
const LATIN_RUN = new RegExp(
  `(?:(?:\\B${NUM_TERMINATOR}+|\\b)${DIGIT_RUN}[A-Za-z]|\\b[A-Za-z])[A-Za-z0-9]*` +
    `(?:[-'’ ]${NUM_TERMINATOR}*[A-Za-z0-9]+|${NUM_SEPARATOR}\\d[A-Za-z0-9]*)*` +
    `\\b(?:${NUM_TERMINATOR}+(?![A-Za-z0-9]|${NUM_TERMINATOR}))?`,
  'g'
);

// A whole number, so it stays ONE isolate instead of one per digit group ("[LRI]20[PDI],[LRI]000[PDI]"
// for "20,000"). Split like that, a bare separator sits between two isolates, and an RTL line orders
// consecutive isolates right to left: "09:30" rendered as "30:09", "7/10" as "10/7", "24/7" as
// "7/24". A terminator left outside drifted to the far side of its number: "50%" as "%50".
const NUMBER = new RegExp(`${NUM_TERMINATOR}*${DIGIT_RUN}${NUM_TERMINATOR}*`, 'g');

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

  // Unicode look-alikes first, or the bidi wrapping below silently does the wrong thing.
  //
  // A model may return U+2011 NON-BREAKING HYPHEN where a keyboard types "-" — the `gpt-oss`
  // family on Groq does it constantly, Gemini occasionally. LATIN_RUN joins a run with `[-'’ ]`,
  // an ASCII hyphen only, so "Wi‑Fi 7" was split into THREE runs (`Wi`, the orphan hyphen, `Fi 7`)
  // and an RTL line orders the later runs to the LEFT of the earlier ones — rendering "Fi 7 ‑ Wi".
  // NBSP does the same damage to every word-count clamp in the pipeline, and a zero-width joiner
  // mid-token breaks the word boundary `\b` that LATIN_RUN anchors on.
  //
  // EN DASH and EM DASH are deliberately NOT touched: this project's Hebrew copy uses "—" as real
  // punctuation throughout, and folding it to "-" would damage correct text to fix a different bug.
  text = text.replace(/[‐‑‒−]/g, '-').replace(/ /g, ' ').replace(/[​‌‍﻿]/g, '');

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
