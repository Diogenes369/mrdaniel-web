/**
 * Listicle detection — "20 agentic use cases of X" must become a deck that covers all twenty.
 *
 * The importer already extracts the whole article (contentImport.ts keeps up to 12k chars, and the
 * MarkTechPost Jev piece comes through complete at ~6.3k). What lost the items was the synthesis
 * step: every deck prompt asks for "N slides that summarise the source", and a model asked to
 * summarise twenty parallel items into ten slides picks the six it finds most interesting. That
 * cannot be fixed by telling it harder — so the items are found here, IN CODE, passed to the model as
 * a numbered checklist it must cover, and checked afterwards by the carousel verifier.
 *
 * Three shapes are recognised, each only when it repeats (a single "Note:" paragraph is not a list):
 *   1. "Label: explanation" paragraphs — the MarkTechPost/Substack listicle shape.
 *   2. Numbered lines — "1. …", "1) …", "#1 …", "01 — …".
 *   3. Bulleted lines — "- …", "• …", "* …".
 * The LONGEST run wins, allowing one stray paragraph inside a run (a pull quote, an image caption)
 * so a single interruption does not split twenty items into two lists of ten.
 */

export interface ListItem {
  /** 1-based position in the source list. */
  n: number;
  /** The item's name as written in the source ("Model routing"). Latin stays Latin. */
  name: string;
  /** The item's own explanation, verbatim from the source (may be empty for a bare bullet). */
  text: string;
}

export interface DetectedList {
  items: ListItem[];
  /** The count the title promises ("20 Agentic Use Cases" → 20), or null when it names none. */
  promised: number | null;
}

const LABEL_LINE = /^\s*([\p{L}\p{N}"'“”‘’][^:\n]{1,70}?)\s*[:：]\s+(\S[\s\S]*)$/u;
const NUMBERED_LINE = /^\s*(?:#\s*)?(\d{1,2})\s*[.)\-–—:]\s+(\S.*)$/u;
const BULLET_LINE = /^\s*[-•*▪◦]\s+(\S.*)$/u;

/** A label that is really a sentence ("The launch post says these figures: …") is not an item name. */
function plausibleLabel(label: string): boolean {
  const words = label.trim().split(/\s+/);
  if (words.length > 8) return false;
  if (/[.!?]$/.test(label.trim())) return false;
  // Question-form FAQ entries ("What is Jev?") are handled by the FAQ, not as list items.
  return !/\?/.test(label);
}

type Row = { idx: number; name: string; text: string } | null;

function longestRun(rows: Row[]): { name: string; text: string }[] {
  let best: { name: string; text: string }[] = [];
  let cur: { name: string; text: string }[] = [];
  let gap = 0;
  for (const r of rows) {
    if (r) {
      cur.push({ name: r.name, text: r.text });
      gap = 0;
    } else if (cur.length && gap === 0) {
      gap = 1; // tolerate one interruption
    } else {
      if (cur.length > best.length) best = cur;
      cur = [];
      gap = 0;
    }
  }
  return cur.length > best.length ? cur : best;
}

function splitNameText(line: string): { name: string; text: string } {
  const m = line.match(LABEL_LINE);
  if (m && plausibleLabel(m[1])) return { name: m[1].trim(), text: m[2].trim() };
  // "Model routing — score request difficulty…" / a bare bullet: the first clause is the name.
  const dash = line.split(/\s[—–-]\s/);
  if (dash.length > 1 && dash[0].split(/\s+/).length <= 8) return { name: dash[0].trim(), text: dash.slice(1).join(' — ').trim() };
  return { name: line.trim().slice(0, 80), text: '' };
}

export function detectListItems(body: string, title = ''): DetectedList {
  const paragraphs = String(body ?? '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const labelRows: Row[] = paragraphs.map((p, idx) => {
    const m = p.match(LABEL_LINE);
    return m && plausibleLabel(m[1]) ? { idx, name: m[1].trim(), text: m[2].trim() } : null;
  });
  const numberedRows: Row[] = paragraphs.map((p, idx) => {
    const m = p.match(NUMBERED_LINE);
    return m ? { idx, ...splitNameText(m[2]) } : null;
  });
  const bulletRows: Row[] = paragraphs.map((p, idx) => {
    const m = p.match(BULLET_LINE);
    return m ? { idx, ...splitNameText(m[1]) } : null;
  });

  const candidates = [longestRun(labelRows), longestRun(numberedRows), longestRun(bulletRows)];
  const best = candidates.reduce((a, b) => (b.length > a.length ? b : a), [] as { name: string; text: string }[]);

  const promisedMatch = title.match(/\b(\d{1,2})\s+(?:[\p{L}-]+\s+){0,3}?(?:use cases?|ways?|tips?|tools?|examples?|ideas?|things?|lessons?|mistakes?|prompts?|steps?|reasons?|trends?|features?|agents?|models?|דרכים|טיפים|כלים|דוגמאות|שימושים|צעדים|טעויות|פרומפטים)/iu);
  const promised = promisedMatch ? Number(promisedMatch[1]) : null;

  // Fewer than 4 is a couple of labelled asides, not a list worth restructuring a deck around.
  if (best.length < 4) return { items: [], promised };
  return { items: best.map((it, i) => ({ n: i + 1, name: it.name.slice(0, 80), text: it.text.slice(0, 400) })), promised };
}

/** Case/punctuation-insensitive key, so "Tool-call risk gating" matches "tool call risk gating". */
export function itemKey(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
