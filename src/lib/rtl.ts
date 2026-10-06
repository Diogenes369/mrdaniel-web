import { sanitizeHebrewText } from '../agent/hebrewTextSanitizer';

/**
 * Site copy → bidi-safe Hebrew. Every marketing string that mixes Hebrew with Latin terms or
 * digits ("סוכני AI", "SaaS", "2026") goes through the same sanitizer the content agents use:
 * Latin runs are anchored with RLM, numbers and domains are LTR-isolated, and model look-alike
 * hyphens (U+2011 from gpt-oss) are folded back to ASCII. Without it, a line that starts or ends on
 * an English term or a number, or has punctuation glued to one ("SaaS."), lets the browser's bidi
 * pass move that punctuation to the wrong edge of the line.
 *
 * The marks are invisible and zero-width, so layout and line-breaking are untouched. Memoized
 * because the same few dozen strings re-render on every scroll-driven state change.
 */
const cache = new Map<string, string>();
const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);

/**
 * An LTR isolate around a token rtl() can't anchor by itself: a handle ("@grok", whose "@" otherwise
 * lands on the Hebrew side of the word and reads "grok@") or a name that starts with a digit
 * ("1Password", which the Latin-run match never sees as one word). rtl() leaves isolated spans
 * alone, so the two compose: rtl(`דרך ${ltr('1Password')}`).
 */
export const ltr = (text: string): string => `${LRI}${text}${PDI}`;

export function rtl(text: string): string {
  let out = cache.get(text);
  if (out === undefined) {
    out = sanitizeHebrewText(text);
    cache.set(text, out);
  }
  return out;
}
