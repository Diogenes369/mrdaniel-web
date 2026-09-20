import { sanitizeHebrewText } from './hebrewTextSanitizer';

/**
 * Subtitle cue formatting — the dashboard mirror of `src/server/xSubtitles.ts`.
 *
 * The server produces the first cue list, but the operator EDITS it: retimes a line, merges two
 * cues, fixes a term the model mistranslated. Every edit has to re-emit a valid SRT/VTT and repaint
 * the burned-in preview without a round-trip, so the formatting half of the server module lives
 * here too. Only the pure functions are mirrored — the Gemini call and the mp4 download stay on the
 * server, where the key is.
 *
 * The two copies MUST agree: `scripts/__tests__/x-import.test.mjs` runs both implementations over
 * the same cue list and fails on any difference, which is the same drift guard `check:mirrors`
 * applies to the shared type declarations.
 */

/** Cue length bounds. Under 0.8s a line is gone before it is read; over 7s it has stopped being a
 *  subtitle and become a caption card. */
const MIN_CUE_MS = 800;
const MAX_CUE_MS = 7000;

export const MAX_CUE_LINE_CHARS = 42;
export const MAX_CUE_LINES = 2;

export interface SubtitleCue {
  startMs: number;
  endMs: number;
  /** the Hebrew line(s), already bidi-sanitised and wrapped to at most MAX_CUE_LINES */
  text: string;
  /** the source-language line the Hebrew was made from, kept so the operator can check a claim */
  source?: string;
}

export interface SubtitleTrack {
  cues: SubtitleCue[];
  sourceLanguage: string;
  durationMs: number;
  transcript: string;
}

/** `HH:MM:SS,mmm` (SRT) or `HH:MM:SS.mmm` (WebVTT). Negative input clamps to zero rather than
 *  emitting `-00:00:01,000`, which every player rejects as a malformed cue. */
export function formatTimestamp(ms: number, separator: ',' | '.' = ','): string {
  const total = Math.max(0, Math.round(Number(ms) || 0));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const frac = total % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(frac, 3)}`;
}

/** `M:SS` — the compact form the cue editor's timeline shows, where hours are always zero. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(Number(ms) || 0));
  return `${Math.floor(total / 60_000)}:${String(Math.floor((total % 60_000) / 1000)).padStart(2, '0')}`;
}

/** Greedy word-boundary wrap onto at most `maxLines`, never hyphenating. Overflow is ellipsised on
 *  the last line rather than dropped, so the cue stays a grammatical fragment. */
export function wrapCueText(raw: string, maxChars = MAX_CUE_LINE_CHARS, maxLines = MAX_CUE_LINES): string {
  const words = String(raw || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return '';
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;
  const used = lines.join(' ').split(' ').filter(Boolean).length;
  if (used < words.length && lines.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.length + 1 <= maxChars ? `${last}…` : `${last.slice(0, maxChars - 1)}…`;
  }
  return lines.join('\n');
}

/** A cue that opens on a Latin token is laid out left-to-right by the first-strong-character rule,
 *  which pushes the Hebrew after it to the wrong side. A leading RLM makes the line's direction
 *  explicit and is a no-op on a line that was already Hebrew-first. */
const RLM = '‏';

export function rtlCueText(text: string): string {
  return String(text || '')
    .split('\n')
    .map((line) => {
      const clean = line.trim();
      if (!clean) return '';
      return clean.startsWith(RLM) ? clean : `${RLM}${clean}`;
    })
    .filter(Boolean)
    .join('\n');
}

/** Repair a cue list into a playable track: ordered, non-overlapping, inside the clip, and wrapped.
 *  Re-run after every operator edit, so a hand-typed cue gets the same treatment a model one did. */
export function normalizeCues(raw: SubtitleCue[], durationMs = 0): SubtitleCue[] {
  const limit = durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY;
  const cleaned = raw
    .map((c) => ({
      startMs: Math.max(0, Math.round(Number(c?.startMs) || 0)),
      endMs: Math.max(0, Math.round(Number(c?.endMs) || 0)),
      text: String(c?.text ?? '').replace(/\s+/g, ' ').trim(),
      source: String(c?.source ?? '').replace(/\s+/g, ' ').trim() || undefined,
    }))
    .filter((c) => c.text && c.startMs < limit)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const out: SubtitleCue[] = [];
  for (const cue of cleaned) {
    const previous = out[out.length - 1];
    let start = previous ? Math.max(cue.startMs, previous.endMs) : cue.startMs;
    if (start >= limit) break;
    let end = cue.endMs > start ? cue.endMs : start + MIN_CUE_MS;
    end = Math.min(end, limit);
    if (end - start < MIN_CUE_MS) end = Math.min(start + MIN_CUE_MS, limit);
    if (end <= start) {
      if (!previous) continue;
      start = Math.max(0, limit - MIN_CUE_MS);
      end = limit;
      if (end <= start) continue;
    }
    if (end - start > MAX_CUE_MS) end = start + MAX_CUE_MS;
    out.push({
      startMs: start,
      endMs: end,
      text: rtlCueText(wrapCueText(sanitizeHebrewText(cue.text))),
      source: cue.source,
    });
  }
  return out.filter((c) => c.text);
}

/** SubRip. `\r\n` endings and the trailing blank line are what the stricter players actually
 *  require (VLC's legacy parser, Premiere's importer). */
export function buildSrt(cues: SubtitleCue[]): string {
  return (
    cues
      .map((cue, i) =>
        [`${i + 1}`, `${formatTimestamp(cue.startMs)} --> ${formatTimestamp(cue.endMs)}`, cue.text, ''].join('\r\n')
      )
      .join('\r\n') + '\r\n'
  );
}

/** WebVTT — what the preview player's `<track>` loads directly. `line:85%` keeps the text clear of
 *  the player's own control bar. */
export function buildVtt(cues: SubtitleCue[]): string {
  const head = ['WEBVTT', '', 'STYLE', '::cue {', '  font-family: Arial, sans-serif;', '  direction: rtl;', '}', ''];
  const body = cues.map((cue, i) =>
    [
      `${i + 1}`,
      `${formatTimestamp(cue.startMs, '.')} --> ${formatTimestamp(cue.endMs, '.')} align:center line:85%`,
      cue.text,
      '',
    ].join('\n')
  );
  return [...head, ...body].join('\n');
}

/** The cue text as flowing Hebrew prose — what the deck agent reads, and what the operator copies
 *  when they want the transcript rather than the subtitles. */
export function cuesToTranscript(cues: SubtitleCue[]): string {
  return cues
    .map((c) => c.text.split('\n').join(' ').split(RLM).join('').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The cue visible at `timeMs`, or null in a gap. Linear because a track is tens of cues, not
 *  thousands, and the burner calls this once per frame where a binary search would be noise. */
export function cueAt(cues: SubtitleCue[], timeMs: number): SubtitleCue | null {
  for (const cue of cues) {
    if (timeMs >= cue.startMs && timeMs < cue.endMs) return cue;
    if (cue.startMs > timeMs) break;
  }
  return null;
}
