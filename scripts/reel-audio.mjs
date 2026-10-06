#!/usr/bin/env node
/**
 * The sound of the Grok Bot reel: the music and every sound effect, laid under the picture.
 *
 * The score is rendered in headless Chrome by scripts/reel-score.js, which plays the deck's own
 * sound recipes (public/grok-deck/js/sfx.js, the same ones the website plays live) at the cues the
 * render recorded, under a minimal groove that keeps time with the slides. All of it is
 * synthesized, so the reel carries no music anyone else owns, and the same cue sheet always gives
 * the same sound. This file then masters it (plain gain to -16 LUFS, a look-ahead limiter for the
 * few peaks) and muxes it with the picture, which is copied, never re-encoded.
 *
 * Run on its own, it re-scores an existing render from its cue sheet (<name>.cues.json):
 *
 *   node scripts/reel-audio.mjs [reels/out/grok-bot-reel.mp4]
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openChrome } from './lib/headless.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SFX_JS = path.join(ROOT, 'public/grok-deck/js/sfx.js');
const SCORE_JS = path.join(ROOT, 'scripts/reel-score.js');
export const RATE = 48000;
const TARGET_LUFS = -16;
const CEILING_DB = -1.5;

/** Renders the score in a fresh page of `chrome` and returns [left, right] Float32Arrays. */
export async function renderScore(chrome, sheet, opts = {}) {
  const page = await chrome.newPage();
  try {
    await page.evaluate(readFileSync(SFX_JS, 'utf8'));
    await page.evaluate(readFileSync(SCORE_JS, 'utf8'));
    const frames = await page.evaluate(`GrokReelScore.render(${JSON.stringify(sheet)}, ${JSON.stringify(opts)})`, { awaitPromise: true });
    const L = new Float32Array(frames);
    const R = new Float32Array(frames);
    const size = 1 << 20;
    for (let i = 0; i * size < frames; i++) {
      const buf = Buffer.from(await page.evaluate(`GrokReelScore.chunk(${i}, ${size})`), 'base64');
      const f = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
      for (let k = 0, s = i * size; k < f.length; k += 2, s++) {
        L[s] = f[k];
        R[s] = f[k + 1];
      }
    }
    return [L, R];
  } finally {
    page.close();
  }
}

/**
 * A look-ahead peak limiter: the gain starts down 5 ms before a peak and comes back over 80 ms, so
 * the few peaks that would cross the ceiling are tucked under it without a click.
 */
function limit([L, R], ceiling) {
  const n = L.length;
  const ahead = Math.round(0.005 * RATE);
  const want = new Float32Array(n).fill(1);
  for (let s = 0; s < n; s++) {
    const p = Math.max(Math.abs(L[s]), Math.abs(R[s]));
    if (p <= ceiling) continue;
    const g = ceiling / p;
    for (let k = Math.max(0, s - ahead); k <= s; k++) if (g < want[k]) want[k] = g;
  }
  const attack = 1 - Math.exp(-1 / (0.001 * RATE));
  const release = Math.exp(-1 / (0.08 * RATE));
  let g = 1;
  for (let s = 0; s < n; s++) {
    const w = want[s];
    g = w < g ? g + (w - g) * attack : w + (g - w) * release;
    L[s] = Math.max(-ceiling, Math.min(ceiling, L[s] * g));
    R[s] = Math.max(-ceiling, Math.min(ceiling, R[s] * g));
  }
}

/** 32-bit float WAV, so nothing is rounded before the AAC encoder. */
export function writeWav(file, [L, R]) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 8);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 8, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 8, 28);
  buf.writeUInt16LE(8, 32);
  buf.writeUInt16LE(32, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 8, 40);
  for (let s = 0, o = 44; s < n; s++, o += 8) {
    buf.writeFloatLE(L[s], o);
    buf.writeFloatLE(R[s], o + 4);
  }
  writeFileSync(file, buf);
}

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-y', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}\n${(r.stderr || '').slice(-2000)}`);
  return r.stderr || '';
}

/** EBU R128 loudness and true peak of a WAV, as ffmpeg's loudnorm measures them. */
export function measure(wav) {
  const report = ffmpeg(['-i', wav, '-af', 'loudnorm=print_format=json', '-f', 'null', '-']);
  const m = JSON.parse(report.slice(report.lastIndexOf('{'), report.lastIndexOf('}') + 1));
  return { loudness: +m.input_i, peak: +m.input_tp };
}

/** Plain gain to the target loudness, then the limiter. In place. */
export function master(track, dir) {
  const raw = path.join(dir, 'raw.wav');
  writeWav(raw, track);
  const gain = 10 ** ((TARGET_LUFS - measure(raw).loudness) / 20);
  for (const ch of track) for (let s = 0; s < ch.length; s++) ch[s] *= gain;
  limit(track, 10 ** (CEILING_DB / 20));
}

/**
 * Scores `video` and writes `output` (which may be the same file). Uses `chrome` when given (the
 * render passes its own browser), otherwise opens one for the job.
 */
export async function scoreVideo(video, sheet, output, { chrome } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'grok-reel-audio-'));
  const own = chrome ? null : await openChrome({ port: 9472, width: 400, height: 400 });
  try {
    const track = await renderScore(chrome || own, sheet);
    master(track, dir);
    const wav = path.join(dir, 'score.wav');
    writeWav(wav, track);
    const m = measure(wav);
    const tmp = path.join(dir, 'out.mp4');
    ffmpeg([
      '-i', video, '-i', wav, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '192k', '-ar', String(RATE), '-shortest', '-movflags', '+faststart', tmp,
    ]);
    try {
      renameSync(tmp, output);
    } catch {
      copyFileSync(tmp, output); // the temp dir sits on another volume
    }
    return m;
  } finally {
    if (own) own.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

export const cuePath = (video) => video.replace(/\.mp4$/i, '') + '.cues.json';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const video = path.resolve(process.argv[2] || path.join(ROOT, 'reels/out/grok-bot-reel.mp4'));
  const cues = cuePath(video);
  if (!existsSync(cues)) throw new Error(`no cue sheet at ${cues}; render the reel first`);
  const sheet = JSON.parse(readFileSync(cues, 'utf8'));
  const r = await scoreVideo(video, sheet, video);
  console.log(`scored ${video}: ${sheet.cues.length} cues, ${r.loudness} LUFS, true peak ${r.peak} dBTP`);
}
