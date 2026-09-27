/**
 * Text quality gate for the news feed (2026-09-27).
 *
 * The bug this closes: an item whose feed carried only a headline (every English Google-News entry
 * — the Stocktwits "טסלה דוחפת לכאורה…" story among them) opened a modal whose summary bullets AND
 * article body were the same one sentence. Two things let it through: the item was served before
 * the precompute agent had analysed it, and nothing checked that a stored analysis was actually an
 * article rather than a headline repeated in three shapes.
 *
 * `insightQualityIssues` is the single definition of "good enough to show". The feed serves an item
 * only when its stored analysis passes (newsFeed.ts `getNewsItems`), and the precompute agent
 * retries an analysis that fails it (articlePrecompute.ts) instead of keeping it forever.
 *
 * Pure and dependency-free except for node:crypto, so the test suite can exercise it directly.
 */
import { createHash } from 'node:crypto';

/** Stable per-article key for the stored analysis: the link, not the title (titles get translated). */
export function insightKey(link: string): string {
  return createHash('sha1').update(link).digest('hex').slice(0, 16);
}

/** What the gate reads from a stored analysis. Mirrors ArticleInsights in newsInsights.ts. */
export interface InsightForQuality {
  executiveSummary?: unknown;
  extendedArticle?: unknown;
  fullText?: unknown;
}

/** The modal shows at most this many of each (src/services/newsInsightsService.ts `normalize`). */
const MAX_BULLETS = 4;
const MAX_PARAS = 3;

export const MIN_BULLETS = 3;
/** A bullet shorter than this is a fragment ("עדכון חשוב."), not a summary point. */
export const MIN_BULLET_CHARS = 20;
/** Real article text in the body section, summed over the paragraphs the modal shows. */
export const MIN_BODY_CHARS = 200;

const clean = (v: unknown) =>
  String(v ?? '')
    .replace(/^[\s\-–—•*·>]+/, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Comparison form: no bidi marks, punctuation, case or spacing differences. */
export function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‎‏⁦-⁩]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when two passages say the same thing in (nearly) the same words: identical after
 * normalisation, one containing the other at a similar length, or ≥ 80% shared words. The length
 * condition matters — a bullet legitimately reappearing INSIDE a long paragraph is summarising,
 * not duplicating; a paragraph that is just the bullet again is the bug.
 */
export function isNearDuplicate(a: string, b: string): boolean {
  const x = normalizeForCompare(a);
  const y = normalizeForCompare(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 15 && long.includes(short) && short.length / long.length >= 0.6) return true;
  const wa = new Set(x.split(' '));
  const wb = new Set(y.split(' '));
  if (wa.size < 4 || wb.size < 4) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.min(wa.size, wb.size) >= 0.8 && Math.min(wa.size, wb.size) / Math.max(wa.size, wb.size) >= 0.6;
}

/**
 * Stricter test for "this IS the headline": equal after normalisation, or one containing the other
 * at ≥ 85% of its length. A lead bullet PARAPHRASING the headline is ordinary summarising (TechTime,
 * measured 2026-09-27) — the bug was the headline itself, verbatim, standing in for content.
 */
export function isSameText(a: string, b: string): boolean {
  const x = normalizeForCompare(a);
  const y = normalizeForCompare(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return long.includes(short) && short.length / long.length >= 0.85;
}

function hasDuplicates(lines: string[]): boolean {
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) if (isNearDuplicate(lines[i], lines[j])) return true;
  }
  return false;
}

/**
 * Everything wrong with a stored analysis, as short machine-readable reasons. Empty = passes.
 * Judged on exactly what the modal would render (same caps as the client's normaliser).
 */
export function insightQualityIssues(ins: InsightForQuality | null | undefined, title = ''): string[] {
  if (!ins) return ['no-analysis'];
  const issues: string[] = [];
  const list = (v: unknown, max: number) => (Array.isArray(v) ? v : []).map(clean).filter(Boolean).slice(0, max);
  const bullets = list(ins.executiveSummary, MAX_BULLETS);
  const paras = list(ins.extendedArticle, MAX_PARAS);

  // Written from the publisher's full article, not from the feed teaser.
  if (ins.fullText !== true) issues.push('no-full-text');

  const real = bullets.filter((b) => b.length >= MIN_BULLET_CHARS);
  if (real.length < MIN_BULLETS) issues.push('few-bullets');
  if (hasDuplicates(bullets)) issues.push('duplicate-bullets');
  if (title && bullets.some((b) => isSameText(b, title))) issues.push('bullet-repeats-title');

  if (paras.join(' ').length < MIN_BODY_CHARS) issues.push('short-body');
  if (hasDuplicates(paras)) issues.push('duplicate-paragraphs');
  if (paras.some((p) => bullets.some((b) => isNearDuplicate(p, b)))) issues.push('body-repeats-summary');
  if (title && paras.some((p) => isSameText(p, title))) issues.push('body-repeats-title');

  return issues;
}

export function passesTextQuality(ins: InsightForQuality | null | undefined, title = ''): boolean {
  return insightQualityIssues(ins, title).length === 0;
}
