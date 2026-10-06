#!/usr/bin/env node
/**
 * The sound of the Grok Bot reel. A soft pad that moves to a new chord with every slide, an airy
 * whoosh on each transition, a glass chime as the new slide lands, a small wooden "tok" when the
 * bot lands, and a bloom at the open and at the close. Everything is synthesized here, so the reel
 * carries no music anyone else owns, and the same cue sheet always gives the same sound.
 *
 * The score is the cue sheet scripts/render-grok-reel.mjs writes next to the video
 * (<name>.cues.json): the frame each slide came in on and each landing of the bot, so the sound
 * follows the picture to the frame. Run on its own, this re-scores an existing render in place;
 * the picture is copied, never re-encoded:
 *
 *   node scripts/reel-audio.mjs [reels/out/grok-bot-reel.mp4]
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RATE = 48000;
const TAU = Math.PI * 2;
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** Equal-power pan: -1 is hard left, +1 hard right. */
const panGains = (p) => [Math.sqrt((1 - p) / 2), Math.sqrt((1 + p) / 2)];

/** Seeded noise (mulberry32): the whooshes are random, but the same on every render. */
function noise(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

// One chord per slide, all in D major: the bass, then four voices in the middle of the keyboard, out
// of the chimes' way. The reel opens and closes on D; in between it walks the warm side of the key.
const CHORDS = {
  D: [38, 57, 61, 64, 66], // Dmaj9
  Bm: [35, 57, 62, 64, 66], // Bm11
  G: [43, 54, 57, 59, 62], // Gmaj9
  A: [45, 55, 57, 62, 64], // A7sus4, the one that leans forward
  Em: [40, 55, 59, 62, 66], // Em9
  Fsm: [42, 57, 61, 64, 66], // F#m7
};
const WALK = ['D', 'Bm', 'G', 'A', 'D', 'Fsm', 'G', 'A', 'Bm', 'G', 'Em', 'A', 'Bm', 'G', 'A'];
const chordAt = (i, last) => CHORDS[i === last ? 'D' : WALK[i % WALK.length]];

// A soft saw: seven harmonics falling off faster than a real saw, read from one table per sample.
const TABLE = 4096;
const SOFT_SAW = (() => {
  const t = new Float32Array(TABLE + 1);
  let peak = 0;
  for (let i = 0; i <= TABLE; i++) {
    let v = 0;
    for (let n = 1; n <= 7; n++) v += Math.sin((TAU * n * i) / TABLE) / n ** 1.7;
    t[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  for (let i = 0; i <= TABLE; i++) t[i] /= peak;
  return t;
})();
const readTable = (ph) => {
  const x = ph * TABLE;
  const i = x | 0;
  return SOFT_SAW[i] + (SOFT_SAW[i + 1] - SOFT_SAW[i]) * (x - i);
};

/** A stereo bus: the dry sound plus what it sends to the room and to the echo. */
function bus(n) {
  return { L: new Float32Array(n), R: new Float32Array(n), room: new Float32Array(n), echo: new Float32Array(n) };
}

// ── voices ────────────────────────────────────────────────────────────────────────────────────

/** The pad for one slide: fades in across its opening boundary, out across its closing one. */
function addPad(out, chord, t0, t1, fadeIn, fadeOut, gain) {
  const n = out.L.length;
  const s0 = Math.max(0, Math.floor((t0 - fadeIn / 2) * RATE));
  const s1 = Math.min(n, Math.ceil((t1 + fadeOut / 2) * RATE));
  // Sine in, cosine out over the same span as the neighbour's: an equal-power crossfade at each cut.
  const env = new Float32Array(Math.max(0, s1 - s0));
  for (let s = s0; s < s1; s++) {
    const t = s / RATE;
    const a = (t - (t0 - fadeIn / 2)) / fadeIn;
    const b = (t - (t1 - fadeOut / 2)) / fadeOut;
    env[s - s0] = Math.sin((Math.PI / 2) * smooth(a)) * Math.cos((Math.PI / 2) * smooth(b)) * gain;
  }
  const upper = chord.slice(1);
  upper.forEach((m, v) => {
    const f = midiHz(m);
    const [gl, gr] = panGains(((v / (upper.length - 1)) * 2 - 1) * 0.55);
    // Two copies a few cents apart, one per side: the slow beating between them is the width.
    let pa = (v * 0.37) % 1;
    let pb = (v * 0.61) % 1;
    const ia = (f * 0.9983) / RATE;
    const ib = (f * 1.0017) / RATE;
    for (let s = s0; s < s1; s++) {
      pa += ia;
      if (pa >= 1) pa -= 1;
      pb += ib;
      if (pb >= 1) pb -= 1;
      const e = env[s - s0];
      out.L[s] += readTable(pa) * e * gl;
      out.R[s] += readTable(pb) * e * gr;
    }
  });
  // The bass: a sine with its octave, so a phone speaker still hints at it.
  const fb = midiHz(chord[0]);
  for (let s = s0; s < s1; s++) {
    const t = s / RATE;
    const e = env[s - s0] * 0.55;
    const v = (Math.sin(TAU * fb * t) + 0.35 * Math.sin(TAU * 2 * fb * t)) * e;
    out.L[s] += v;
    out.R[s] += v;
  }
}

/** Air moving past: band-passed noise sweeping up and back down, travelling right to left. */
function addWhoosh(out, t, gain, seed) {
  const n = out.L.length;
  const rand = noise(seed);
  const len = Math.floor(0.8 * RATE);
  const s0 = Math.floor(Math.max(0, t - 0.06) * RATE);
  let low = 0;
  let band = 0;
  const damping = 1 / 0.9;
  for (let i = 0; i < len && s0 + i < n; i++) {
    const x = i / len;
    const fc = x < 0.42 ? 350 * (2800 / 350) ** smooth(x / 0.42) : 2800 * (1100 / 2800) ** ((x - 0.42) / 0.58);
    const f = 2 * Math.sin((Math.PI * fc) / RATE);
    low += f * band;
    band += f * (rand() - low - damping * band);
    const env = x < 0.42 ? smooth(x / 0.42) ** 1.6 : Math.exp(-((x - 0.42) / 0.58) * 4.2);
    const v = band * env * gain;
    const [gl, gr] = panGains(0.75 - 1.5 * x);
    out.L[s0 + i] += v * gl;
    out.R[s0 + i] += v * gr;
    out.room[s0 + i] += v * 0.35;
  }
}

// A glass bell: partials just off the harmonic series, the high ones dying first.
const BELL = [
  [1, 1, 1.9],
  [2.0, 0.28, 0.85],
  [3.01, 0.1, 0.42],
  [4.16, 0.05, 0.24],
  [5.43, 0.025, 0.15],
];
function addBell(out, t, midi, gain, pan, roomSend = 0.5, echoSend = 0.35) {
  const n = out.L.length;
  const s0 = Math.floor(t * RATE);
  const len = Math.floor(3.6 * RATE);
  const f0 = midiHz(midi);
  const [gl, gr] = panGains(pan);
  for (const [ratio, amp, decay] of BELL) {
    const w = (TAU * f0 * ratio) / RATE;
    if (f0 * ratio > 15000) continue;
    for (let i = 0; i < len && s0 + i < n; i++) {
      const tt = i / RATE;
      const v = Math.sin(w * i) * amp * Math.exp(-tt / decay) * Math.min(1, tt / 0.004) * gain;
      out.L[s0 + i] += v * gl;
      out.R[s0 + i] += v * gr;
      out.room[s0 + i] += v * roomSend;
      out.echo[s0 + i] += v * echoSend;
    }
  }
}

/** The bot touching down: a short wooden knock that drops a little in pitch. */
function addTok(out, t, midi, gain) {
  const n = out.L.length;
  const s0 = Math.floor(t * RATE);
  const len = Math.floor(0.32 * RATE);
  const f1 = midiHz(midi);
  let ph = 0;
  for (let i = 0; i < len && s0 + i < n; i++) {
    const tt = i / RATE;
    const f = f1 * (1 + 0.9 * Math.exp(-tt / 0.012));
    ph += (TAU * f) / RATE;
    const body = Math.sin(ph) + 0.25 * Math.sin(2 * ph);
    const v = body * Math.exp(-tt / 0.07) * Math.min(1, tt / 0.0015) * gain;
    out.L[s0 + i] += v;
    out.R[s0 + i] += v;
    out.room[s0 + i] += v * 0.25;
  }
}

/** A breath in before the first chime: noise opening up under the fade-in. */
function addSwell(out, t, dur, gain, seed) {
  const n = out.L.length;
  const rand = noise(seed);
  const s0 = Math.floor(t * RATE);
  const len = Math.floor(dur * RATE);
  let lp = 0;
  for (let i = 0; i < len && s0 + i < n; i++) {
    const x = i / len;
    const a = Math.exp((-TAU * (300 + 2200 * x * x)) / RATE);
    lp = (1 - a) * rand() + a * lp;
    const v = lp * smooth(x) ** 2 * (1 - smooth((x - 0.85) / 0.15)) * gain;
    out.L[s0 + i] += v;
    out.R[s0 + i] += v;
    out.room[s0 + i] += v * 0.5;
  }
}

// ── space ─────────────────────────────────────────────────────────────────────────────────────

/** Freeverb (Jezar's tuning, scaled to 48 kHz): eight damped combs and four all-passes a side. */
function freeverb(input, n, { room = 0.84, damp = 0.32, wet = 1 } = {}) {
  const k = RATE / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const alls = [556, 441, 341, 225];
  const fb = room * 0.28 + 0.7;
  const d1 = damp * 0.4;
  const d2 = 1 - d1;
  const side = (spread) => ({
    c: combs.map((s) => ({ b: new Float32Array(Math.round((s + spread) * k)), i: 0, z: 0 })),
    a: alls.map((s) => ({ b: new Float32Array(Math.round((s + spread) * k)), i: 0 })),
  });
  const sides = [side(0), side(23)];
  const out = [new Float32Array(n), new Float32Array(n)];
  for (let s = 0; s < n; s++) {
    const x = input[s] * 0.015;
    for (let ch = 0; ch < 2; ch++) {
      const sd = sides[ch];
      let acc = 0;
      for (const c of sd.c) {
        const y = c.b[c.i];
        c.z = y * d2 + c.z * d1;
        c.b[c.i] = x + c.z * fb;
        if (++c.i >= c.b.length) c.i = 0;
        acc += y;
      }
      for (const a of sd.a) {
        const b = a.b[a.i];
        a.b[a.i] = acc + b * 0.5;
        if (++a.i >= a.b.length) a.i = 0;
        acc = b - acc;
      }
      out[ch][s] = acc * 3 * wet;
    }
  }
  return out;
}

/** A ping-pong echo for the chimes, a little darker on every repeat. */
function pingPong(input, n, time = 0.36, feedback = 0.34) {
  const d = Math.round(time * RATE);
  const bl = new Float32Array(d);
  const br = new Float32Array(d);
  const out = [new Float32Array(n), new Float32Array(n)];
  const a = Math.exp((-TAU * 3600) / RATE);
  let zl = 0;
  let zr = 0;
  for (let s = 0, i = 0; s < n; s++) {
    const yl = bl[i];
    const yr = br[i];
    zl = (1 - a) * yr + a * zl;
    zr = (1 - a) * yl + a * zr;
    bl[i] = input[s] + zl * feedback;
    br[i] = zr * feedback;
    out[0][s] = yl;
    out[1][s] = yr;
    if (++i >= d) i = 0;
  }
  return out;
}

/** One-pole low-pass whose cutoff drifts slowly, so the pad breathes instead of droning. */
function breathe(x, n) {
  let z = 0;
  for (let s = 0; s < n; s++) {
    const fc = 1150 + 380 * Math.sin((TAU * 0.07 * s) / RATE);
    const a = Math.exp((-TAU * fc) / RATE);
    z = (1 - a) * x[s] + a * z;
    x[s] = z;
  }
}

// ── the score ─────────────────────────────────────────────────────────────────────────────────

/**
 * Builds the whole track from a cue sheet: { duration, cues: [{ type: 'slide'|'land', i, t }] },
 * times in seconds of video. Returns two Float32Array channels at RATE. `parts` keeps only some
 * layers (pad, swell, whoosh, bell, tok), for checking their levels one at a time.
 */
export function buildSoundtrack(sheet, { parts = null, normalize = true } = {}) {
  const on = (p) => !parts || parts.includes(p);
  const duration = sheet.duration;
  const n = Math.ceil(duration * RATE);
  const slides = sheet.cues.filter((c) => c.type === 'slide').sort((a, b) => a.t - b.t);
  const lands = sheet.cues.filter((c) => c.type === 'land');
  if (!slides.length) throw new Error('cue sheet has no slides');
  const last = sheet.slideCount ? sheet.slideCount - 1 : slides[slides.length - 1].i;

  const pad = bus(n);
  const fx = bus(n);

  // The pad: one chord per slide, crossfaded across each cut. Slow to arrive, slow to leave.
  slides.forEach((c, k) => {
    if (!on('pad')) return;
    const next = slides[k + 1];
    // The first chord rises out of silence over its first five seconds.
    const t0 = k === 0 ? 2.5 : c.t;
    const t1 = next ? next.t : duration;
    addPad(pad, chordAt(c.i, last), t0, t1, k === 0 ? 5 : 1.4, next ? 1.4 : 7, 0.036);
  });
  breathe(pad.L, n);
  breathe(pad.R, n);

  // The open: a breath, then the bot's arpeggio climbing out of it.
  if (on('swell')) addSwell(fx, 0, 0.55, 0.22, 7);
  if (on('bell')) [74, 78, 81, 85, 88].forEach((m, j) => addBell(fx, 0.35 + j * 0.13, m, 0.056 * (1 - j * 0.12), 0.5 - j * 0.25, 0.6, 0.3));

  // Every cut: the whoosh, then two or three notes of the new chord as the slide lands, right to left.
  slides.forEach((c, k) => {
    if (k === 0) return;
    const chord = chordAt(c.i, last);
    const up = chord.slice(1).map((m) => m + 12);
    if (on('whoosh')) addWhoosh(fx, c.t, 0.45, 101 + c.i);
    if (!on('bell')) return;
    if (c.i === last) {
      // The close: the whole D chord, slower, with more room around it.
      [74, 78, 81, 86].forEach((m, j) => addBell(fx, c.t + 0.34 + j * 0.16, m, 0.07, 0.45 - j * 0.3, 0.8, 0.4));
      return;
    }
    const motif = k % 2 ? [up[0], up[2], up[3]] : [up[1], up[3]];
    // Just after the whoosh peaks, so the notes land with the slide instead of under the air.
    motif.forEach((m, j) => addBell(fx, c.t + 0.32 + j * 0.095, m, 0.06 * (1 - j * 0.15), 0.3 - j * 0.3));
  });

  // The bot touching down on its new spot, pitched to the chord it lands in.
  if (on('tok')) for (const c of lands) addTok(fx, c.t, chordAt(c.i, last)[0] + 24, 0.14);

  const room = freeverb(Float32Array.from(fx.room, (v, s) => v + (pad.L[s] + pad.R[s]) * 0.18), n);
  const echo = pingPong(fx.echo, n);

  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const fadeIn = 0.02 * RATE;
  const fadeOut = 3.5 * RATE;
  let peak = 0;
  for (let s = 0; s < n; s++) {
    const g = Math.min(1, s / fadeIn) * Math.min(1, (n - s) / fadeOut);
    L[s] = (pad.L[s] + fx.L[s] + room[0][s] + echo[0][s] * 0.5) * g;
    R[s] = (pad.R[s] + fx.R[s] + room[1][s] + echo[1][s] * 0.5) * g;
    peak = Math.max(peak, Math.abs(L[s]), Math.abs(R[s]));
  }
  // Headroom for the loudness pass that follows; it sets the final level.
  const k = normalize && peak > 0 ? 0.5 / peak : 1;
  for (let s = 0; s < n; s++) {
    L[s] *= k;
    R[s] *= k;
  }
  return [L, R];
}

/**
 * A look-ahead peak limiter: the gain starts down 5 ms before a peak and comes back over 80 ms, so
 * the few chime peaks that would cross the ceiling are tucked under it without a click.
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

/** 32-bit float WAV, so nothing is rounded before the loudness pass. */
function writeWav(file, [L, R]) {
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

const TARGET_LUFS = -17;
const CEILING_DB = -2;

/** EBU R128 loudness and true peak of a WAV, as ffmpeg's loudnorm measures them. */
function measure(wav) {
  const report = ffmpeg(['-i', wav, '-af', 'loudnorm=print_format=json', '-f', 'null', '-']);
  const m = JSON.parse(report.slice(report.lastIndexOf('{'), report.lastIndexOf('}') + 1));
  return { loudness: +m.input_i, peak: +m.input_tp };
}

/**
 * Lays the soundtrack under `video` and writes `output` (which may be the same file). The picture
 * stream is copied. The sound is brought to -17 LUFS by plain gain, its few peaks tucked under
 * -2 dBFS by the limiter, then AAC 48 kHz: a level that sits with other reels without being pumped
 * by a compressor.
 */
export function scoreVideo(video, sheet, output) {
  const dir = mkdtempSync(path.join(tmpdir(), 'grok-reel-audio-'));
  try {
    const raw = path.join(dir, 'raw.wav');
    const track = buildSoundtrack(sheet);
    writeWav(raw, track);
    const gain = 10 ** ((TARGET_LUFS - measure(raw).loudness) / 20);
    for (const ch of track) for (let s = 0; s < ch.length; s++) ch[s] *= gain;
    limit(track, 10 ** (CEILING_DB / 20));
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
    rmSync(dir, { recursive: true, force: true });
  }
}

export const cuePath = (video) => video.replace(/\.mp4$/i, '') + '.cues.json';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const video = path.resolve(process.argv[2] || path.join(root, 'reels/out/grok-bot-reel.mp4'));
  const cues = cuePath(video);
  if (!existsSync(cues)) throw new Error(`no cue sheet at ${cues}; render the reel first`);
  const sheet = JSON.parse(readFileSync(cues, 'utf8'));
  const r = scoreVideo(video, sheet, video);
  console.log(`scored ${video}: ${sheet.cues.length} cues, ${r.loudness} LUFS, true peak ${r.peak} dBTP`);
}
