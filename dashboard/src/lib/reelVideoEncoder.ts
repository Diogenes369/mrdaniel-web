import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { loadImage, getLogo, loadFont, wrapRtl, BRAND_GREEN, CHARCOAL } from './newsImageComposer';
import { sanitizeHebrewText } from './hebrewTextSanitizer';
import type { ReelBeat } from './reelRenderService';

/**
 * Step B — the video compositor. Renders a 9:16 vertical MP4 entirely in the browser:
 *   Canvas (Ken-Burns pan/zoom over each beat's Pexels image + burned-in animated Hebrew
 *   captions) → WebCodecs `VideoEncoder`/`AudioEncoder` → `mp4-muxer` → one MP4 `Blob`.
 *
 * Why client-side rather than a server render (Remotion/FFmpeg): this project runs on Vercel
 * Hobby serverless functions (12-function cap, no persistent process, no headless-Chromium/FFmpeg
 * binary available) — a real Remotion/FFmpeg render needs exactly that, and standing up a Remotion
 * Lambda / dedicated render server is a genuinely separate infrastructure project, not a function
 * body. WebCodecs + mp4-muxer is the one path that produces a real, standards-compliant MP4 with
 * NO new infrastructure: it's supported in current desktop Chrome/Edge (feature-detected below;
 * unsupported browsers get an honest error, not a silent failure).
 *
 * Audio: Gemini TTS returns raw 16-bit PCM. Rather than wrapping it in a WAV container and round-
 * tripping through `AudioContext.decodeAudioData` (another source of subtle bugs), the PCM bytes
 * are decoded to Float32 samples directly here — the format is already known exactly (see
 * `decodePcmBeat`) — and fed straight into `AudioEncoder`.
 */

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const AUDIO_SAMPLE_RATE = 24000; // Gemini's native-TTS output rate; beats are resampled to this if they ever differ.

export interface RenderResult {
  blob: Blob;
  durationSec: number;
  hasAudio: boolean;
}

export function isReelVideoSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

// ── PCM decode / resample / merge ───────────────────────────────────────────────────────────

interface BeatAudio {
  samples: Float32Array | null;
  sampleRate: number;
  durationSec: number;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Gemini's TTS MIME carries the real sample rate, e.g. "audio/L16;codec=pcm;rate=24000" — parsed
 * rather than assumed, so a future model/version change with a different rate still decodes right. */
function decodePcmBeat(beat: ReelBeat): BeatAudio {
  if (!beat.audioBase64) return { samples: null, sampleRate: AUDIO_SAMPLE_RATE, durationSec: beat.estimatedDurationSec };
  const rateMatch = /rate=(\d+)/.exec(beat.audioMimeType || '');
  const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : AUDIO_SAMPLE_RATE;
  const bytes = base64ToBytes(beat.audioBase64);
  const n = Math.floor(bytes.byteLength / 2); // 16-bit samples
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
  const durationSec = Math.max(n / sampleRate, 0.6);
  return { samples, sampleRate, durationSec };
}

function resampleLinear(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || samples.length === 0) return samples;
  const ratio = toRate / fromRate;
  const outLen = Math.max(1, Math.round(samples.length * ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i / ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(samples.length - 1, i0 + 1);
    const frac = srcPos - i0;
    out[i] = samples[i0] * (1 - frac) + samples[i1] * frac;
  }
  return out;
}

/** One continuous Float32 track spanning the whole reel's timeline — silence (zero-fill, the
 * Float32Array default) for any beat that has no voiceover. */
function mergeAudio(beatAudio: BeatAudio[], totalDurationSec: number): Float32Array {
  const out = new Float32Array(Math.ceil(totalDurationSec * AUDIO_SAMPLE_RATE));
  let cursor = 0;
  for (const ba of beatAudio) {
    const beatSamples = Math.round(ba.durationSec * AUDIO_SAMPLE_RATE);
    if (ba.samples) {
      const resampled = resampleLinear(ba.samples, ba.sampleRate, AUDIO_SAMPLE_RATE);
      const n = Math.min(resampled.length, beatSamples, out.length - cursor);
      if (n > 0) out.set(resampled.subarray(0, n), cursor);
    }
    cursor += beatSamples;
  }
  return out;
}

// ── frame drawing ──────────────────────────────────────────────────────────────────────────

/** Cover-crop `img` into the full canvas, shrinking the source rect further as `zoom` grows past
 * 1 — a slow Ken-Burns push-in without any canvas transform math (so there's nothing to get wrong
 * with save/restore or accumulated transforms across 900+ frames). */
function drawCoverZoomed(ctx: CanvasRenderingContext2D, img: HTMLImageElement, zoom: number) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!iw || !ih) return;
  const canvasRatio = WIDTH / HEIGHT;
  const imgRatio = iw / ih;
  let sw: number, sh: number, sx: number, sy: number;
  if (imgRatio > canvasRatio) {
    sh = ih;
    sw = sh * canvasRatio;
    sx = (iw - sw) / 2;
    sy = 0;
  } else {
    sw = iw;
    sh = sw / canvasRatio;
    sx = 0;
    sy = (ih - sh) / 2;
  }
  const zsw = sw / zoom;
  const zsh = sh / zoom;
  const zsx = sx + (sw - zsw) / 2;
  const zsy = sy + (sh - zsh) / 2;
  ctx.drawImage(img, zsx, zsy, zsw, zsh, 0, 0, WIDTH, HEIGHT);
}

function paintFallbackBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = CHARCOAL;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const g = ctx.createRadialGradient(WIDTH * 0.5, HEIGHT * 0.35, WIDTH * 0.1, WIDTH * 0.5, HEIGHT * 0.5, WIDTH * 0.9);
  g.addColorStop(0, 'rgba(118,185,0,0.14)');
  g.addColorStop(1, 'rgba(118,185,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

async function ensureFonts() {
  await Promise.all([loadFont('800 64px Rubik'), loadFont('700 40px Rubik'), loadFont('500 34px Heebo'), loadFont('700 26px Heebo')]);
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  beat: ReelBeat,
  img: HTMLImageElement | null,
  logo: HTMLImageElement | null,
  localT: number,
  beatDuration: number,
  beatIndex: number,
  totalBeats: number
) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  if (img) drawCoverZoomed(ctx, img, 1 + 0.12 * Math.min(1, beatDuration > 0 ? localT / beatDuration : 0));
  else paintFallbackBackground(ctx);

  // Dark gradients top + bottom for legibility over any photo.
  const top = ctx.createLinearGradient(0, 0, 0, HEIGHT * 0.28);
  top.addColorStop(0, 'rgba(6,8,13,0.75)');
  top.addColorStop(1, 'rgba(6,8,13,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, WIDTH, HEIGHT * 0.28);
  const bottom = ctx.createLinearGradient(0, HEIGHT * 0.52, 0, HEIGHT);
  bottom.addColorStop(0, 'rgba(6,8,13,0)');
  bottom.addColorStop(1, 'rgba(6,8,13,0.94)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, HEIGHT * 0.52, WIDTH, HEIGHT * 0.48);

  // Progress rail — which beat we're on.
  const railY = 56;
  const gap = 8;
  const segW = (WIDTH - 120 - gap * (totalBeats - 1)) / totalBeats;
  for (let i = 0; i < totalBeats; i++) {
    ctx.fillStyle = i <= beatIndex ? BRAND_GREEN : 'rgba(255,255,255,0.25)';
    const x = 60 + i * (segW + gap);
    ctx.beginPath();
    ctx.roundRect(x, railY, segW, 5, 2.5);
    ctx.fill();
  }

  // Brand mark, top-right.
  if (logo) {
    const h = 46;
    const w = h * (logo.naturalWidth / logo.naturalHeight || 3);
    ctx.drawImage(logo, WIDTH - 60 - w, 90, w, h);
  }

  // Headline (onScreenText) — fades/rises in over the beat's first 0.35s.
  const introP = Math.min(1, localT / 0.35);
  ctx.save();
  ctx.globalAlpha = introP;
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const headline = sanitizeHebrewText(beat.caption || '');
  let px = 76;
  let lines = wrapRtl(ctx, headline, WIDTH - 140);
  for (let attempt = 0; attempt < 10 && (lines.length > 4 || px < 34); attempt++) {
    ctx.font = `800 ${Math.round(px)}px Rubik, Heebo, sans-serif`;
    lines = wrapRtl(ctx, headline, WIDTH - 140);
    if (lines.length <= 4) break;
    px *= 0.9;
  }
  ctx.font = `800 ${Math.round(px)}px Rubik, Heebo, sans-serif`;
  const lh = px * 1.22;
  let hy = HEIGHT * 0.42 - ((lines.length - 1) * lh) / 2 + (1 - introP) * 18;
  for (const line of lines) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(line, WIDTH / 2 + 2, hy + 3);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(line, WIDTH / 2, hy);
    hy += lh;
  }
  ctx.restore();

  // Subtitle (voiceover) — only when it says something the headline doesn't already show.
  const voice = sanitizeHebrewText(beat.voiceover || '');
  if (voice && voice.trim() !== headline.trim()) {
    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.font = '500 32px Heebo, Rubik, sans-serif';
    const subLines = wrapRtl(ctx, voice, WIDTH - 180).slice(0, 3);
    const subLh = 42;
    const panelH = subLines.length * subLh + 44;
    const panelY = HEIGHT - 170 - panelH;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(80, panelY, WIDTH - 160, panelH, 20);
    ctx.fill();
    ctx.stroke();
    let sy = panelY + 40;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (const line of subLines) {
      ctx.fillText(line, WIDTH / 2, sy);
      sy += subLh;
    }
    ctx.restore();
  }

  // Footer domain.
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.font = '700 26px Heebo, Rubik, sans-serif';
  ctx.fillStyle = 'rgba(226,232,240,0.7)';
  ctx.fillText('mrdaniel.co.il', WIDTH / 2, HEIGHT - 56);
}

// ── main render ─────────────────────────────────────────────────────────────────────────────

export async function renderReelVideo(
  beats: ReelBeat[],
  onProgress?: (pct: number, stage: 'video' | 'audio' | 'mux') => void
): Promise<RenderResult> {
  if (!isReelVideoSupported()) {
    throw new Error('הדפדפן הזה לא תומך בקידוד וידאו בדפדפן (WebCodecs). נסו בגרסה עדכנית של Chrome או Edge.');
  }
  if (beats.length === 0) throw new Error('אין שקפים לרינדור');

  const beatAudio = beats.map(decodePcmBeat);
  const [images, logo] = await Promise.all([Promise.all(beats.map((b) => (b.imageUrl ? loadImage(b.imageUrl) : Promise.resolve(null)))), getLogo()]);
  await ensureFonts();

  const starts: number[] = [];
  let cursor = 0;
  for (const ba of beatAudio) {
    starts.push(cursor);
    cursor += ba.durationSec;
  }
  const totalDurationSec = cursor;
  const totalFrames = Math.max(1, Math.ceil(totalDurationSec * FPS));
  const hasAudio = beatAudio.some((b) => b.samples && b.samples.length > 0);

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: WIDTH, height: HEIGHT, frameRate: FPS },
    audio: hasAudio ? { codec: 'aac', numberOfChannels: 1, sampleRate: AUDIO_SAMPLE_RATE } : undefined,
    fastStart: 'in-memory',
  });

  const videoConfigCandidates: VideoEncoderConfig[] = [
    { codec: 'avc1.640028', width: WIDTH, height: HEIGHT, bitrate: 6_000_000, framerate: FPS },
    { codec: 'avc1.42001f', width: WIDTH, height: HEIGHT, bitrate: 4_000_000, framerate: FPS },
  ];
  let videoConfig: VideoEncoderConfig | null = null;
  for (const candidate of videoConfigCandidates) {
    const support = await VideoEncoder.isConfigSupported(candidate);
    if (support.supported) {
      videoConfig = candidate;
      break;
    }
  }
  if (!videoConfig) throw new Error('הדפדפן לא תומך בקידוד H.264 ברזולוציה הזו');

  let videoEncoderError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      videoEncoderError = e;
      console.error('[reel-video] video encoder error:', e);
    },
  });
  videoEncoder.configure(videoConfig);

  let audioEncoder: AudioEncoder | null = null;
  if (hasAudio) {
    const audioConfig: AudioEncoderConfig = { codec: 'mp4a.40.2', sampleRate: AUDIO_SAMPLE_RATE, numberOfChannels: 1, bitrate: 96_000 };
    const support = await AudioEncoder.isConfigSupported(audioConfig);
    if (support.supported) {
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => console.error('[reel-video] audio encoder error:', e),
      });
      audioEncoder.configure(audioConfig);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const findBeatIndex = (tSec: number) => {
    for (let i = starts.length - 1; i >= 0; i--) if (tSec >= starts[i]) return i;
    return 0;
  };

  for (let f = 0; f < totalFrames; f++) {
    if (videoEncoderError) throw videoEncoderError;
    const tSec = f / FPS;
    const beatIndex = findBeatIndex(tSec);
    drawFrame(ctx, beats[beatIndex], images[beatIndex], logo, tSec - starts[beatIndex], beatAudio[beatIndex].durationSec, beatIndex, beats.length);

    const frame = new VideoFrame(canvas, { timestamp: Math.round(tSec * 1e6), duration: Math.round(1e6 / FPS) });
    videoEncoder.encode(frame, { keyFrame: f % (FPS * 2) === 0 });
    frame.close();

    // Backpressure: don't let the encode queue balloon ahead of real encoding work.
    while (videoEncoder.encodeQueueSize > 30) {
      await new Promise((r) => setTimeout(r, 10));
    }
    if (f % 4 === 0) await new Promise((r) => setTimeout(r, 0)); // keep the tab responsive
    onProgress?.(Math.round((f / totalFrames) * 78), 'video');
  }
  await videoEncoder.flush();
  videoEncoder.close();

  if (audioEncoder) {
    const merged = mergeAudio(beatAudio, totalDurationSec);
    const CHUNK = 4800; // 0.2s @ 24kHz
    for (let i = 0; i < merged.length; i += CHUNK) {
      const slice = merged.slice(i, Math.min(merged.length, i + CHUNK));
      const data = new AudioData({
        format: 'f32',
        sampleRate: AUDIO_SAMPLE_RATE,
        numberOfFrames: slice.length,
        numberOfChannels: 1,
        timestamp: Math.round((i / AUDIO_SAMPLE_RATE) * 1e6),
        data: slice,
      });
      audioEncoder.encode(data);
      data.close();
      while (audioEncoder.encodeQueueSize > 30) {
        await new Promise((r) => setTimeout(r, 10));
      }
      onProgress?.(78 + Math.round((i / merged.length) * 17), 'audio');
    }
    await audioEncoder.flush();
    audioEncoder.close();
  }

  onProgress?.(97, 'mux');
  muxer.finalize();
  const blob = new Blob([target.buffer], { type: 'video/mp4' });
  onProgress?.(100, 'mux');
  return { blob, durationSec: totalDurationSec, hasAudio };
}
