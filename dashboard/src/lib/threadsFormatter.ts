/**
 * Threads (Meta's text-first platform) output shaping. Deterministically reshapes an already
 * brand-synthesised caption/post (which has been through the Hebrew brand prompts in
 * newsPostComposer / synthesizeNewsPost / story synth) into the two Threads formats:
 *
 *   1. Single post  — one sharp, bite-sized technical insight ≤ 500 chars: hook + 1–2 supporting
 *      lines + a short CTA. Threads' hard per-post limit is 500 characters.
 *   2. Multi-post thread — the same material broken into a numbered 3–5 post thread, each post a
 *      self-contained beat ≤ 500 chars, closing on a CTA post.
 *
 * No LLM call — the source text already carries the "MR. DANIEL" voice (authoritative, technical,
 * community-driven); this only re-chunks it and strips carousel/caption scaffolding (trailing
 * hashtag block, the mrdaniel.co.il promo footer, bullet glyphs, slide markers).
 */

export const THREADS_LIMIT = 500;

const CTA_LINE = 'עקבו לניתוחים על סייבר, AI ו-IT בזמן אמת — ובאתר: mrdaniel.co.il';

export interface ThreadsSinglePost {
  text: string;
  chars: number;
  overLimit: boolean;
}

export interface ThreadsThread {
  /** ordered posts, each already prefixed with its `n/total` marker */
  posts: string[];
  count: number;
  /** any post that still exceeds the 500-char limit after packing (rare — very long sentences) */
  hasOverflow: boolean;
}

/** Strip caption/carousel scaffolding that shouldn't ride into a Threads post. */
export function cleanForThreads(raw: string): string {
  let t = (raw || '').replace(/\r\n?/g, '\n');
  // drop a trailing hashtag block ("האשטגים: ..." or a lone line of #tags)
  t = t.replace(/\n+\s*(?:האשטגים|hashtags)\s*:.*$/is, '');
  t = t.replace(/\n+\s*(?:#[\p{L}\p{N}_]+(?:\s+|$)){2,}\s*$/u, '');
  // drop the standard promo footer / bare domain sign-off lines
  t = t.replace(/\n+\s*💡[^\n]*mrdaniel\.co\.il[^\n]*$/i, '');
  t = t.replace(/\n+\s*(?:רוצים להישאר מעודכנים\?|עקבו אחר העמוד[^\n]*)\n?/g, '\n');
  t = t.replace(/\n+\s*mrdaniel\.co\.il\s*$/i, '');
  // normalise bullet glyphs / slide markers to plain lines
  t = t.replace(/^[ \t]*[•‣▪◦*\-–]\s+/gm, '');
  t = t.replace(/^[ \t]*(?:שקופית|פריים|סצנה)\s*\d+[:.)]\s*/gim, '');
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

/** Split into sentence-ish units, preserving deliberate paragraph breaks as unit boundaries. */
function toUnits(text: string): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n{2,}/)) {
    const chunk = para.trim();
    if (!chunk) continue;
    // sentence split that keeps the terminator; tolerant of Hebrew punctuation
    const sentences = chunk
      .replace(/\n+/g, ' ')
      .split(/(?<=[.!?…])\s+(?=[^\s])/)
      .map((s) => s.trim())
      .filter(Boolean);
    out.push(...(sentences.length ? sentences : [chunk]));
  }
  return out;
}

function ensureStop(s: string): string {
  return /[.!?…:"'׳״)]\s*$/.test(s) ? s : `${s}.`;
}

/** Hard-wrap a single over-long unit at a word boundary so no post breaks the 500 limit. */
function hardWrap(unit: string, limit: number): string[] {
  if (unit.length <= limit) return [unit];
  const words = unit.split(/\s+/);
  const parts: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > limit) {
      parts.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

/**
 * Single Threads post: pack whole sentences up to ~440 chars (leaving room for the CTA line),
 * then append the CTA if it still fits. Never returns empty for non-empty input.
 */
export function toThreadsSinglePost(source: string): ThreadsSinglePost {
  const clean = cleanForThreads(source);
  const units = toUnits(clean);
  const bodyBudget = THREADS_LIMIT - CTA_LINE.length - 2; // 2 = "\n\n"
  let body = '';
  for (const u of units) {
    const next = body ? `${body} ${u}` : u;
    if (next.length > bodyBudget) {
      if (!body) body = hardWrap(u, bodyBudget)[0]; // first unit alone is too long → clip at word
      break;
    }
    body = next;
  }
  if (!body) body = hardWrap(clean, bodyBudget)[0] || clean.slice(0, bodyBudget);
  body = ensureStop(body);

  let text = body;
  if (body.length + CTA_LINE.length + 2 <= THREADS_LIMIT) text = `${body}\n\n${CTA_LINE}`;
  return { text, chars: text.length, overLimit: text.length > THREADS_LIMIT };
}

/**
 * Multi-post thread: post 1 is the hook (first sentence), the middle posts pack the remaining
 * sentences into ≤ ~470-char beats, and the final post is the CTA. Clamped to 3–5 posts total;
 * each post is prefixed with an `n/total` marker.
 */
export function toThreadsThread(source: string): ThreadsThread {
  const clean = cleanForThreads(source);
  const units = toUnits(clean).flatMap((u) => hardWrap(u, THREADS_LIMIT - 12)); // 12 ≈ marker room
  const raw: string[] = [];

  if (units.length) {
    raw.push(ensureStop(units[0])); // hook

    const CHUNK = 460;
    let cur = '';
    for (const u of units.slice(1)) {
      const next = cur ? `${cur} ${u}` : u;
      if (next.length > CHUNK && cur) {
        raw.push(ensureStop(cur));
        cur = u;
      } else {
        cur = next;
      }
    }
    if (cur) raw.push(ensureStop(cur));
  }

  // clamp content posts (excluding the CTA we add below) to 4 → total ≤ 5
  while (raw.length > 4) {
    const last = raw.pop()!;
    raw[raw.length - 1] = `${raw[raw.length - 1]} ${last}`.slice(0, THREADS_LIMIT - 12);
  }
  // guarantee at least 2 content posts (→ total ≥ 3 with CTA): split the longest if needed
  while (raw.length < 2 && raw.length > 0) {
    const idx = raw.reduce((m, s, i, a) => (s.length > a[m].length ? i : m), 0);
    const parts = hardWrap(raw[idx], Math.ceil(raw[idx].length / 2));
    if (parts.length < 2) break;
    raw.splice(idx, 1, ensureStop(parts[0]), parts.slice(1).join(' '));
  }
  if (raw.length === 0) raw.push(ensureStop(clean.slice(0, THREADS_LIMIT - 12)));

  raw.push(CTA_LINE);

  const total = raw.length;
  const posts = raw.map((p, i) => {
    const marker = `${i + 1}/${total} `;
    const room = THREADS_LIMIT - marker.length;
    return marker + (p.length > room ? hardWrap(p, room)[0] : p);
  });
  return { posts, count: total, hasOverflow: posts.some((p) => p.length > THREADS_LIMIT) };
}
