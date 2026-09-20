import { generateContentWithRetry, GEMINI_TEXT_MODEL, ModelOutputError, parseJsonOrThrow, requireText, stripCodeFence, genAI } from '../agent/geminiClient.js';
import { sanitizeHebrewText } from '../agent/hebrewTextSanitizer.js';
import { AUDIENCE_RULES } from '../agent/expertVoice.js';
import { isXVideoUrl, type XVideoVariant } from './xPostFetcher.js';

/**
 * Hebrew subtitles for an X post's video. Server half of the pipeline driven by
 * /api/agent-generate · action:"x-subtitles"; the browser half (burning them into the picture)
 * lives in `dashboard/src/lib/xSubtitleBurner.ts`.
 *
 * ## Why there is no FFmpeg and no speech-to-text vendor here
 *
 * The obvious build is `ffmpeg -i in.mp4 -vn out.wav` → a Whisper/Deepgram/AssemblyAI call →
 * `ffmpeg -vf subtitles=he.srt`. Every step of that is off the table for this project:
 *   - FFmpeg is a ~70 MB binary and a multi-minute CPU burn per clip. The function it would run in
 *     is the same shared `agent-generate` handler as twenty other actions, on a 120 s ceiling.
 *   - Every hosted ASR with usable Hebrew output is paid, and AGENTS.md forbids adding a paid
 *     dependency for a content tool.
 *
 * What replaces both: Gemini reads the mp4 DIRECTLY. Its video understanding covers the audio
 * track, so one call does the transcription, the translation and the cue timing together — with the
 * `GEMINI_API_KEY` the project already has and no second vendor. The burn-in then happens in the
 * operator's browser, on the canvas/WebCodecs pipeline the Motion Studio already ships
 * (`motionStudioService.ts`), which is why the download costs the server nothing at all.
 *
 * The honest trade-off, stated because it decides what the operator should check: model-assigned
 * cue times are good to roughly a quarter-second, not frame-accurate, and `normalizeCues` below
 * repairs the ordering and overlap mistakes the model does make. The dashboard therefore ships the
 * cues in an editable table, not as a finished artefact.
 */

// ─── limits ─────────────────────────────────────────────────────────────────────────────────

/**
 * The largest mp4 this will send to the model.
 *
 * Gemini's inline-data path caps the whole REQUEST at 20 MB, and inline bytes travel base64-encoded
 * — a 4/3 expansion. 12 MB of mp4 becomes ~16 MB on the wire and leaves room for the prompt, which
 * is the headroom this number exists to preserve. Above it the operator is told to trim the clip
 * rather than being handed a 400 from Google.
 */
export const MAX_VIDEO_BYTES = 12 * 1024 * 1024;

/** Clips longer than this are refused before the download. A 20-minute keynote is not the format
 *  this tab exists for, and at 1 fps sampling it is also the point where the call stops fitting in
 *  the function's 120 s budget. */
export const MAX_VIDEO_SECONDS = 600;

/** Cue length bounds. Under 0.8 s a line is gone before it is read; over 7 s it has stopped being a
 *  subtitle and become a caption card. Both are enforced after the model, not asked of it. */
const MIN_CUE_MS = 800;
const MAX_CUE_MS = 7000;

/** Characters per rendered subtitle line, and how many lines one cue may occupy. Two lines of ~40
 *  Hebrew characters is the standard broadcast shape and is what the burner's layout assumes. */
export const MAX_CUE_LINE_CHARS = 42;
export const MAX_CUE_LINES = 2;

// ─── the cue model ──────────────────────────────────────────────────────────────────────────

export interface SubtitleCue {
  /** cue start, milliseconds from the first frame */
  startMs: number;
  /** cue end, milliseconds from the first frame */
  endMs: number;
  /** the Hebrew line(s), already bidi-sanitised and wrapped to at most MAX_CUE_LINES */
  text: string;
  /** the source-language line the Hebrew was made from, kept so the operator can check a claim */
  source?: string;
}

export interface SubtitleTrack {
  cues: SubtitleCue[];
  /** BCP-47ish tag the model reported for the spoken audio, e.g. "en" — '' when it could not tell */
  sourceLanguage: string;
  /** the clip's duration in ms as the fetcher reported it, echoed so the client can lay out a timeline */
  durationMs: number;
  /** a flat Hebrew transcript — what the deck agent reads when it builds slides from the video */
  transcript: string;
}

// ─── timestamp formatting ───────────────────────────────────────────────────────────────────

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

/**
 * Wrap one Hebrew cue onto at most `MAX_CUE_LINES` lines of `MAX_CUE_LINE_CHARS`.
 *
 * Greedy on word boundaries, and it never hyphenates: a Hebrew word broken across subtitle lines is
 * unreadable. When the text does not fit in the allowed lines the LAST line is ellipsised rather
 * than a middle one dropped, so the cue stays a grammatical fragment instead of a jump-cut.
 */
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
  // Anything that did not fit is signalled on the last line, never silently dropped.
  const used = lines.join(' ').split(' ').filter(Boolean).length;
  if (used < words.length && lines.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.length + 1 <= maxChars ? `${last}…` : `${last.slice(0, maxChars - 1)}…`;
  }
  return lines.join('\n');
}

/**
 * The RTL marker every subtitle line carries.
 *
 * A cue that opens on a Latin token ("Claude מריץ את זה") is laid out left-to-right by the first
 * strong character rule, so the Hebrew that follows lands on the wrong side — in VLC, in mpv, in
 * the browser's own `<track>` renderer, and in the canvas burner. A leading RLM makes the
 * paragraph direction explicit and costs nothing on a line that was already Hebrew-first.
 * `sanitizeHebrewText` handles the marks INSIDE the line; this handles the line itself.
 */
const RLM = '‏';

function rtlLine(line: string): string {
  const clean = line.trim();
  if (!clean) return '';
  return clean.startsWith(RLM) ? clean : `${RLM}${clean}`;
}

/** Apply the RTL marker to every line of an already-wrapped cue. */
export function rtlCueText(text: string): string {
  return String(text || '')
    .split('\n')
    .map(rtlLine)
    .filter(Boolean)
    .join('\n');
}

/**
 * Repair a model-produced cue list into a playable track.
 *
 * Everything here is a mistake the model actually makes and that no prompt wording reliably
 * prevents: cues out of order, a cue that ends before it starts, two cues claiming the same second,
 * a cue running past the end of the clip, and a "cue" that is really a paragraph. Fixing it after
 * the fact is deterministic and testable; asking for it in the prompt is not.
 */
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
    // A cue may not start before the previous one ended; the model's timings drift by a few frames
    // and an overlap makes two lines stack on screen.
    const previous = out[out.length - 1];
    let start = previous ? Math.max(cue.startMs, previous.endMs) : cue.startMs;
    if (start >= limit) break;
    let end = cue.endMs > start ? cue.endMs : start + MIN_CUE_MS;
    end = Math.min(end, limit);
    if (end - start < MIN_CUE_MS) end = Math.min(start + MIN_CUE_MS, limit);
    // A clip that ends mid-cue would otherwise produce a zero-length final cue.
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

/** SubRip. `\r\n` line endings and the trailing blank line are what the format specifies and what
 *  the stricter players (VLC's legacy parser, Premiere's importer) actually require. */
export function buildSrt(cues: SubtitleCue[]): string {
  return (
    cues
      .map((cue, i) =>
        [`${i + 1}`, `${formatTimestamp(cue.startMs)} --> ${formatTimestamp(cue.endMs)}`, cue.text, ''].join('\r\n')
      )
      .join('\r\n') + '\r\n'
  );
}

/** WebVTT — what a `<track>` element in the dashboard's preview player can load directly.
 *  `align:center line:85%` keeps the line off the very bottom edge, where a player's own control
 *  bar sits. */
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

/** The cue text as flowing Hebrew prose — the form the deck agent reads when it builds slides from
 *  what was SAID rather than from what was written in the post. */
export function cuesToTranscript(cues: SubtitleCue[]): string {
  return cues
    .map((c) => c.text.split('\n').join(' ').replace(new RegExp(RLM, 'g'), '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── the model call ─────────────────────────────────────────────────────────────────────────

const SUBTITLE_SYSTEM_INSTRUCTION = `אתה מתמלל ומתרגם כתוביות מקצועי לעברית ישראלית.

המשימה: להאזין לפס הקול של הסרטון, לתמלל את מה שנאמר, ולהחזיר כתוביות בעברית עם תזמון מדויק.

${AUDIENCE_RULES}

חוקי תרגום — קריטיים:
1. תרגם את המשמעות, לא מילה במילה. כתוב עברית ישראלית טבעית כפי שאדם מקצועי מדבר, לא "תרגומית".
2. שמות מוצרים, חברות, כלים, פקודות, שמות קבצים וקיצורים טכניים נשארים באנגלית בדיוק כפי שנאמרו: Claude, Gemini, n8n, npm install, API, RAG, MCP. לעולם אל תתעתק אותם לאותיות עבריות.
3. אל תמציא דבר. אם קטע לא ברור או לא נשמע — דלג עליו, אל תשלים אותו מהדמיון. אם אין דיבור בסרטון כלל, החזר מערך cues ריק.
4. אל תוסיף פרשנות, הקדמה, סיכום או קריאה לפעולה. רק מה שנאמר בפועל.
5. אל תכתוב תיאורי סאונד ("[מוזיקה]", "[צחוק]") ואל תסמן דוברים, אלא אם יש יותר מדובר אחד ובלבול אמיתי בלי סימון.

חוקי תזמון — קריטיים:
1. כל כתובית מכסה משפט אחד או חלק משפט אחד: בין 1 ל-6 שניות, עד 80 תווים.
2. startSec ו-endSec הם שניות מתחילת הסרטון, מספרים עשרוניים (לדוגמה 12.4). endSec תמיד גדול מ-startSec.
3. הכתוביות ממוינות לפי הזמן ואינן חופפות זו לזו.
4. חתוך משפט ארוך לשתי כתוביות בגבול תחבירי (אחרי פסיק, לפני "אבל", לפני "כדי ש") — לא באמצע צירוף.

פורמט הפלט — JSON תקין בלבד, ללא Markdown וללא טקסט נוסף:
{
  "sourceLanguage": "en",
  "cues": [
    { "startSec": 0.4, "endSec": 3.1, "he": "הכתובית בעברית", "src": "the original line as spoken" }
  ]
}`;

/** The raw shape the model is asked for, before `normalizeCues` repairs it. */
interface RawSubtitleResponse {
  sourceLanguage?: unknown;
  cues?: unknown;
}

/** Download one mp4 rendition, refusing anything that is not an X video URL or that is too large to
 *  send inline. Returns the raw bytes plus the content type the CDN declared. */
export async function fetchVideoBytes(
  url: string,
  maxBytes = MAX_VIDEO_BYTES,
  timeoutMs = 45000
): Promise<{ bytes: Buffer; mimeType: string }> {
  if (!isXVideoUrl(url)) throw new Error('not an X video url');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Accept: 'video/mp4,video/*;q=0.9,*/*;q=0.8',
        Referer: 'https://x.com/',
      },
    });
    if (!res.ok) throw new Error(`video fetch failed: upstream ${res.status}`);
    // Checked BEFORE the body is read: a 60 MB rendition would otherwise be buffered in full just
    // to be thrown away, on a function whose memory is shared with every other agent action.
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > maxBytes) throw new Error(`video too large: ${Math.round(declared / 1048576)}MB`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > maxBytes) throw new Error(`video too large: ${Math.round(bytes.length / 1048576)}MB`);
    if (bytes.length < 1024) throw new Error('video fetch failed: empty body');
    return { bytes, mimeType: (res.headers.get('content-type') ?? '').split(';')[0].trim() || 'video/mp4' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Transcribe an X post's video and translate it into Hebrew subtitle cues.
 *
 * One model call does both: the mp4 travels as an inline part, and `fps: 1` on its video metadata
 * holds the visual sampling to one frame per second. That matters for cost as much as for latency —
 * the audio track is what carries the speech, and a tutorial screencast sampled at the default rate
 * is several times the tokens for no extra words.
 *
 * Throws for anything the operator can act on (missing key, oversized clip, rate limit); those keep
 * their classified status through api/agent-generate.ts's error handler. A clip with no speech in it
 * is NOT an error — it comes back as an empty cue list and the dashboard says so.
 */
export async function transcribeXVideo(input: {
  variant: XVideoVariant;
  durationMs: number;
  /** operator hint, e.g. "המונחים בעברית: prompt = פרומפט" */
  notes?: string;
}): Promise<SubtitleTrack> {
  if (!genAI) throw new Error('GEMINI_API_KEY not configured');
  const { variant, durationMs } = input;
  if (durationMs > MAX_VIDEO_SECONDS * 1000) {
    throw new Error(`video too long: ${Math.round(durationMs / 1000)}s (max ${MAX_VIDEO_SECONDS}s)`);
  }

  const { bytes, mimeType } = await fetchVideoBytes(variant.url);

  const response = await generateContentWithRetry({
    model: GEMINI_TEXT_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: { mimeType: mimeType.startsWith('video/') ? mimeType : 'video/mp4', data: bytes.toString('base64') },
            // One frame per second: enough for the model to tell a speaker from a screencast, far
            // below the default sampling rate that makes a long clip unaffordable.
            videoMetadata: { fps: 1 },
          },
          {
            text: [
              `אורך הסרטון: ${(durationMs / 1000).toFixed(1)} שניות.`,
              input.notes ? `הנחיות המפעיל: ${String(input.notes).slice(0, 400)}` : '',
              'תמלל את פס הקול ותרגם אותו לכתוביות בעברית לפי החוקים.',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      },
    ],
    config: {
      systemInstruction: SUBTITLE_SYSTEM_INSTRUCTION,
      temperature: 0.2,
      topP: 0.9,
      responseMimeType: 'application/json',
    },
  });

  const parsed = parseJsonOrThrow<RawSubtitleResponse>(stripCodeFence(requireText(response)), 'transcribeXVideo');
  const rawCues = Array.isArray(parsed.cues) ? parsed.cues : [];
  // A response that is structurally wrong (not a cue list at all) is a model-output failure the
  // caller can fall back on; a response with zero cues is a legitimately silent clip.
  if (!Array.isArray(parsed.cues)) throw new ModelOutputError('transcribeXVideo: response carried no cue array');

  const cues = normalizeCues(
    rawCues.map((c) => {
      const cue = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
      return {
        startMs: Math.round((Number(cue.startSec) || 0) * 1000),
        endMs: Math.round((Number(cue.endSec) || 0) * 1000),
        text: String(cue.he ?? ''),
        source: String(cue.src ?? '') || undefined,
      };
    }),
    durationMs
  );

  return {
    cues,
    sourceLanguage: String(parsed.sourceLanguage ?? '').slice(0, 12),
    durationMs,
    transcript: cuesToTranscript(cues),
  };
}
