import { Fragment, type ReactNode } from 'react';

/**
 * Bidi-safe renderer for the Hebrew article copy in the News Command Center.
 *
 * Hebrew news text is full of Latin technical terms — "EDR/XDR", "Zero-Trust", "GPT-6", "Wi-Fi 7",
 * "production-", version numbers, URLs. Inside a `dir="rtl"` block the Unicode bidi algorithm
 * reorders those runs against the surrounding text, which is what makes hyphens, slashes and
 * trailing punctuation jump to the wrong end of a term ("Zero-Trust" rendering as "Trust-Zero",
 * "production-" losing its hyphen to the previous word).
 *
 * Wrapping each Latin run in `<bdi dir="ltr">` isolates it: the run lays out LTR internally while
 * the paragraph stays strictly RTL, so nothing flips and no punctuation migrates. This is applied
 * to EVERY text block in the modal rather than relying on `dir="auto"`, which picks its direction
 * from the first strong character and therefore flips a whole Hebrew sentence that happens to open
 * with an English product name.
 */

// One Latin/technical token: alphanumerics, optionally joined by the separators that appear inside
// real terms, and optionally ending on a dangling hyphen ("production-"). Sentence-final "." / ","
// are NOT part of a token, so they stay outside the isolate and keep their RTL position.
const TOKEN = String.raw`[A-Za-z0-9]+(?:[-\u2013\u2014_/.:+&#'\u2019][A-Za-z0-9]+)*[-\u2013\u2014]?`;
// A run is one or more such tokens separated by single spaces, so an English phrase
// ("The Hacker News") is isolated as one unit instead of word-by-word.
const LTR_RUN = new RegExp(TOKEN + String.raw`(?:\s+` + TOKEN + ')*', 'g');
const HAS_LATIN = /[A-Za-z]/;

/** Splits `text` into plain Hebrew segments and `<bdi>`-isolated Latin/technical runs. */
export function bidiSegments(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;

  LTR_RUN.lastIndex = 0;
  for (let m = LTR_RUN.exec(text); m !== null; m = LTR_RUN.exec(text)) {
    // Bare numbers ("3", "2026") are already neutral under bidi and read correctly in place —
    // isolating them would add noise without fixing anything.
    if (!HAS_LATIN.test(m[0])) continue;
    if (m.index > last) out.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>);
    out.push(
      <bdi key={key++} dir="ltr">
        {m[0]}
      </bdi>
    );
    last = m.index + m[0].length;
  }

  if (last < text.length) out.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return out;
}

/** Inline Hebrew copy with every Latin/technical run bidi-isolated. Renders no wrapper element. */
export default function RtlText({ children }: { children: string | null | undefined }) {
  return <>{bidiSegments(String(children ?? ''))}</>;
}
