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

export function rtl(text: string): string {
  let out = cache.get(text);
  if (out === undefined) {
    out = sanitizeHebrewText(text);
    cache.set(text, out);
  }
  return out;
}
