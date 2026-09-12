import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { getLogo } from './newsImageComposer';
import { drawTipSlide, boxFor } from './techTipRenderer';
import { ensureDeckFonts } from './designAssets';
import type { TechTipDeck } from './techTipsApi';

/**
 * Motion Studio — turns a Tech Tip deck into an animated 9:16 MP4.
 *
 * Same client-side pipeline as reelVideoEncoder.ts (Canvas → WebCodecs → mp4-muxer; see that file
 * for why a server-side Remotion/FFmpeg render isn't viable on Vercel Hobby), but the frames are
 * pure VECTOR/CANVAS slide animation rather than photo Ken-Burns: each slide is a scene whose body
 * content rises + fades in, holds, then crossfades out into the next.
 *
 * Audio is a PROCEDURALLY SYNTHESISED ambient bed — a detuned drone triad plus a soft pulse,
 * generated here as raw samples. It is deliberately NOT a licensed music track: there's no music
 * library or rights-cleared asset in this project, and shipping one would be a licensing decision,
 * not a code one. Swap `synthesizeAmbientBed` for a decoded audio file if a licensed track is ever
 * added.
 */

const FPS = 30;
const AUDIO_SAMPLE_RATE = 48000;

export interface MotionOptions {
  width?: number;
  height?: number;
  /** Seconds each slide holds on screen. */
  secondsPerSlide?: number;
  /** Crossfade duration between slides, in seconds. */
  transitionSec?: number;
  /** Include the procedural ambient audio bed. */
  music?: boolean;
  backgrounds?: (HTMLImageElement | null)[];
}

export interface MotionResult {
  blob: Blob;
  durationSec: number;
  hasAudio: boolean;
}

export function isMotionSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

// ─── procedural ambient bed ─────────────────────────────────────────────────────────────────

/** A calm, non-distracting tech drone: three detuned sines (A2/E3/A3) under a slow tremolo, plus a
 * short filtered click every 0.8s for pulse. Fades in/out so it never starts or stops abruptly. */
function synthesizeAmbientBed(durationSec: number): Float32Array {
  const n = Math.ceil(durationSec * AUDIO_SAMPLE_RATE);
  const out = new Float32Array(n);
  const partials = [
    { f: 110.0, a: 0.5 },
    { f: 164.81, a: 0.32 },
    { f: 220.0, a: 0.22 },
    { f: 329.63, a: 0.1 },
  ];
  const pulsePeriod = 0.8;
  for (let i = 0; i < n; i++) {
    const t = i / AUDIO_SAMPLE_RATE;
    // drone with slow tremolo + a touch of detune drift
    let v = 0;
    for (const p of partials) {
      const drift = 1 + 0.0015 * Math.sin(2 * Math.PI * 0.07 * t + p.f);
      v += p.a * Math.sin(2 * Math.PI * p.f * drift * t);
    }
    v *= 0.16 * (0.82 + 0.18 * Math.sin(2 * Math.PI * 0.11 * t));

    // soft pulse
    const inPulse = t % pulsePeriod;
    if (inPulse < 0.12) {
      const env = Math.exp(-inPulse * 34);
      v += 0.05 * env * Math.sin(2 * Math.PI * 660 * inPulse);
    }

    // global fade in / out
    const fade = Math.min(1, t / 1.2) * Math.min(1, Math.max(0, (durationSec - t) / 1.5));
    out[i] = Math.max(-1, Math.min(1, v * fade));
  }
  return out;
}

// ─── render ─────────────────────────────────────────────────────────────────────────────────

export async function renderTipDeckVideo(
  deck: TechTipDeck,
  opts: MotionOptions = {},
  onProgress?: (pct: number, stage: 'video' | 'audio' | 'mux') => void
): Promise<MotionResult> {
  if (!isMotionSupported()) {
    throw new Error('הדפדפן הזה לא תומך בקידוד וידאו בדפדפן (WebCodecs). נסו בגרסה עדכנית של Chrome או Edge.');
  }
  if (!deck.slides.length) throw new Error('אין שקופיות לרינדור');

  const W = opts.width ?? 1080;
  const H = opts.height ?? 1920;
  const perSlide = Math.max(1.6, Math.min(8, opts.secondsPerSlide ?? 3.2));
  const transition = Math.max(0.2, Math.min(1.2, opts.transitionSec ?? 0.5));
  const withMusic = opts.music !== false;

  const b = boxFor(W, H);
  const logo = await getLogo();
  // Same warm-up the still export runs — every frame of the reel is painted by drawTipSlide, so a
  // face that has not loaded yet would ship the wrong type into the video, not just one PNG.
  await ensureDeckFonts();

  const totalDurationSec = deck.slides.length * perSlide;
  const totalFrames = Math.max(1, Math.ceil(totalDurationSec * FPS));

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: W, height: H, frameRate: FPS },
    audio: withMusic ? { codec: 'aac', numberOfChannels: 1, sampleRate: AUDIO_SAMPLE_RATE } : undefined,
    fastStart: 'in-memory',
  });

  const candidates: VideoEncoderConfig[] = [
    { codec: 'avc1.640028', width: W, height: H, bitrate: 6_000_000, framerate: FPS },
    { codec: 'avc1.42001f', width: W, height: H, bitrate: 4_000_000, framerate: FPS },
  ];
  let videoConfig: VideoEncoderConfig | null = null;
  for (const c of candidates) {
    if ((await VideoEncoder.isConfigSupported(c)).supported) {
      videoConfig = c;
      break;
    }
  }
  if (!videoConfig) throw new Error('הדפדפן לא תומך בקידוד H.264 ברזולוציה הזו');

  let encoderError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e;
      console.error('[motion-studio] video encoder error:', e);
    },
  });
  videoEncoder.configure(videoConfig);

  let audioEncoder: AudioEncoder | null = null;
  if (withMusic) {
    const audioConfig: AudioEncoderConfig = { codec: 'mp4a.40.2', sampleRate: AUDIO_SAMPLE_RATE, numberOfChannels: 1, bitrate: 128_000 };
    if ((await AudioEncoder.isConfigSupported(audioConfig)).supported) {
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => console.error('[motion-studio] audio encoder error:', e),
      });
      audioEncoder.configure(audioConfig);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  for (let f = 0; f < totalFrames; f++) {
    if (encoderError) throw encoderError;
    const t = f / FPS;
    const idx = Math.min(deck.slides.length - 1, Math.floor(t / perSlide));
    const local = t - idx * perSlide;
    // Body content rises+fades in over `transition`, holds, then fades out over the last
    // `transition` of the scene — the slide chrome itself stays put so the deck reads continuous.
    const intro = Math.min(1, local / transition);
    const outro = idx === deck.slides.length - 1 ? 0 : Math.max(0, (local - (perSlide - transition)) / transition);
    drawTipSlide(ctx, b, deck.slides[idx], idx, deck.slides.length, opts.backgrounds?.[idx] ?? null, logo, { intro, outro });

    const frame = new VideoFrame(canvas, { timestamp: Math.round(t * 1e6), duration: Math.round(1e6 / FPS) });
    videoEncoder.encode(frame, { keyFrame: f % (FPS * 2) === 0 });
    frame.close();

    while (videoEncoder.encodeQueueSize > 30) await new Promise((r) => setTimeout(r, 10));
    if (f % 4 === 0) await new Promise((r) => setTimeout(r, 0));
    onProgress?.(Math.round((f / totalFrames) * 78), 'video');
  }
  await videoEncoder.flush();
  videoEncoder.close();

  if (audioEncoder) {
    const bed = synthesizeAmbientBed(totalDurationSec);
    const CHUNK = 9600; // 0.2s @ 48kHz
    for (let i = 0; i < bed.length; i += CHUNK) {
      const slice = bed.slice(i, Math.min(bed.length, i + CHUNK));
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
      while (audioEncoder.encodeQueueSize > 30) await new Promise((r) => setTimeout(r, 10));
      onProgress?.(78 + Math.round((i / bed.length) * 17), 'audio');
    }
    await audioEncoder.flush();
    audioEncoder.close();
  }

  onProgress?.(97, 'mux');
  muxer.finalize();
  const blob = new Blob([target.buffer], { type: 'video/mp4' });
  onProgress?.(100, 'mux');
  return { blob, durationSec: totalDurationSec, hasAudio: Boolean(audioEncoder) };
}
