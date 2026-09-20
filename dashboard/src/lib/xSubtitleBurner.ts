import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { ensureDeckFonts, FONT_BODY } from './designAssets';
import { cueAt, type SubtitleCue } from './xSubtitleFormat';

/**
 * Burn Hebrew subtitles into an X post's video — entirely in the operator's browser.
 *
 * ## Why this is client-side
 *
 * Hard-subtitling normally means FFmpeg (`-vf subtitles=he.srt`), which this project cannot run:
 * a serverless function on the Hobby plan has neither the binary budget nor the CPU seconds, and
 * `api/agent-generate.ts` is a SHARED function that twenty other actions queue behind. The
 * dashboard, meanwhile, already ships a full Canvas → WebCodecs → `mp4-muxer` encoder for the
 * Motion Studio reel (`motionStudioService.ts`), and the same pipeline burns a caption onto
 * existing footage just as well as it paints a slide. So the render runs where the operator already
 * is, costs the server nothing, and needs no new dependency.
 *
 * Two facts make it work at all, both verified live on 2026-09-21:
 *   - `video.twimg.com` reflects the requesting origin in `Access-Control-Allow-Origin`, so the mp4
 *     can be fetched cross-origin and drawn onto a canvas WITHOUT tainting it. A tainted canvas
 *     cannot be read back, and the whole burn would die at the first `VideoFrame(canvas)`.
 *   - It honours range requests, so the single fetch below is a normal cacheable download.
 *
 * ## How frames are captured, and the one real limitation
 *
 * The clip is PLAYED, muted, and every presented frame is captured through
 * `requestVideoFrameCallback`, which hands back that frame's exact `mediaTime`. That timestamp — not
 * the capture rate — is what goes into the encoder, so A/V sync survives even when the browser drops
 * frames under load: the output is simply variable-frame-rate, which mp4 handles natively.
 *
 * The limitation that follows: capture runs in REAL TIME (a 90-second clip takes ~90 seconds), and a
 * backgrounded tab throttles `requestVideoFrameCallback`, which stalls it. The caller is expected to
 * say so in the UI. The alternative — seeking frame by frame — is deterministic but several times
 * slower, and demuxing the mp4 ourselves would mean adding mp4box.js for one feature.
 *
 * Audio is decoded from the SAME downloaded bytes via `decodeAudioData` and re-encoded to AAC
 * independently of the video pass, so the two are joined by timestamp rather than by capture order.
 */

/** Frames beyond this are not worth re-encoding in a tab: past a couple of minutes the operator is
 *  editing a video, not repurposing a clip, and the real-time capture becomes the bottleneck. */
export const MAX_BURN_SECONDS = 300;

/** Subtitle band geometry, as a fraction of the output height. The band sits above the bottom edge
 *  so a player's control bar and Instagram's own UI chrome do not cover the text. */
const BAND_BOTTOM_FRACTION = 0.08;

export interface BurnOptions {
  /** Longest edge of the output. The source is letterboxed into this box, never stretched. */
  maxWidth?: number;
  /** Output aspect. 'source' keeps the clip's own; the others letterbox onto a solid backdrop, which
   *  is what a 16:9 screencast needs before it can be posted as a reel or an in-feed video. */
  aspect?: 'source' | '9:16' | '1:1' | '4:5';
  /** Subtitle type size as a fraction of the output height. */
  fontScale?: number;
  /** Keep the clip's original audio. Off produces a silent MP4, which is what a screencast with a
   *  non-Hebrew voiceover usually wants once the subtitles carry the meaning. */
  audio?: boolean;
}

export interface BurnResult {
  blob: Blob;
  width: number;
  height: number;
  durationSec: number;
  hasAudio: boolean;
  /** frames actually encoded — below `durationSec * 30` when the browser dropped some */
  frames: number;
}

export type BurnStage = 'download' | 'video' | 'audio' | 'mux';

export function isBurnSupported(): boolean {
  return (
    typeof VideoEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof HTMLVideoElement !== 'undefined' &&
    'requestVideoFrameCallback' in HTMLVideoElement.prototype
  );
}

/** Output box for the chosen aspect, both edges rounded to even numbers — H.264 chroma subsampling
 *  requires it, and an odd dimension is rejected by the encoder outright. */
function outputBox(srcW: number, srcH: number, aspect: NonNullable<BurnOptions['aspect']>, maxWidth: number) {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const ratio = aspect === '9:16' ? 9 / 16 : aspect === '1:1' ? 1 : aspect === '4:5' ? 4 / 5 : srcW / srcH;
  // For a portrait target the CAP applies to the height, or a 9:16 output would come out 1080×1920
  // only by accident of the source being wide.
  const width = aspect === 'source' ? Math.min(srcW, maxWidth) : ratio >= 1 ? Math.min(maxWidth, srcW) : Math.round(maxWidth * ratio);
  return { width: even(width), height: even(width / ratio) };
}

/** Draw one source frame letterboxed into the output box, centred, never stretched. */
function drawLetterboxed(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  outW: number,
  outH: number
): void {
  ctx.fillStyle = '#08090E';
  ctx.fillRect(0, 0, outW, outH);
  const scale = Math.min(outW / srcW, outH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  ctx.drawImage(source, (outW - w) / 2, (outH - h) / 2, w, h);
}

/**
 * Paint one subtitle cue over the frame.
 *
 * Deliberately NOT a translucent bar across the whole width: a per-line pill sized to its own text
 * keeps as much of a screencast visible as possible, which is the whole point of subtitling a
 * tutorial. `direction = 'rtl'` plus the RLM the cue text already carries is what keeps a line that
 * opens on a Latin product name from being laid out backwards — the same bidi problem the deck
 * renderer solves, in the one place a canvas can still get it wrong.
 */
function drawCue(ctx: CanvasRenderingContext2D, cue: SubtitleCue, outW: number, outH: number, fontScale: number): void {
  const lines = cue.text.split('\n').filter(Boolean);
  if (!lines.length) return;

  const fontPx = Math.max(14, Math.round(outH * fontScale));
  const lineHeight = Math.round(fontPx * 1.38);
  const padX = Math.round(fontPx * 0.55);
  const padY = Math.round(fontPx * 0.28);
  const radius = Math.round(fontPx * 0.32);
  const gap = Math.round(fontPx * 0.18);

  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${fontPx}px ${FONT_BODY}`;

  const blockHeight = lines.length * lineHeight + (lines.length - 1) * gap;
  let y = outH - Math.round(outH * BAND_BOTTOM_FRACTION) - blockHeight + lineHeight / 2;

  for (const line of lines) {
    const textWidth = ctx.measureText(line).width;
    const boxW = Math.min(outW - padX * 2, textWidth + padX * 2);
    const boxH = lineHeight + padY;
    const boxX = (outW - boxW) / 2;
    const boxY = y - boxH / 2;

    ctx.fillStyle = 'rgba(6, 8, 13, 0.78)';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, radius);
    ctx.fill();

    // A hairline keeps the pill legible over a white screencast, where the dark fill alone reads as
    // a smudge rather than as a caption.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = Math.max(1, Math.round(fontPx * 0.04));
    ctx.stroke();

    ctx.fillStyle = '#F5F7FA';
    ctx.fillText(line, outW / 2, y, boxW - padX);
    y += lineHeight + gap;
  }
  ctx.restore();
}

/** Decode the clip's audio from the bytes already downloaded, so the file is fetched once. Returns
 *  null when the container has no audio track or the browser cannot decode it — a silent output is
 *  a far better outcome than a failed render. */
async function decodeAudio(bytes: ArrayBuffer): Promise<AudioBuffer | null> {
  try {
    const AudioCtor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return null;
    const ctx = new AudioCtor();
    // decodeAudioData consumes the buffer, so it gets its own copy — the same bytes still back the
    // object URL the <video> element is playing from.
    const decoded = await ctx.decodeAudioData(bytes.slice(0));
    await ctx.close();
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

/** Interleave an AudioBuffer's channels into the single f32 array `AudioData` expects. */
function interleave(buffer: AudioBuffer, channels: number): Float32Array {
  if (channels === 1) return buffer.getChannelData(0).slice();
  const out = new Float32Array(buffer.length * channels);
  const data = Array.from({ length: channels }, (_c, i) => buffer.getChannelData(i));
  for (let frame = 0; frame < buffer.length; frame++) {
    for (let c = 0; c < channels; c++) out[frame * channels + c] = data[c][frame];
  }
  return out;
}

/**
 * Burn `cues` into `videoUrl` and return a finished MP4.
 *
 * `videoUrl` must already have been validated as an `video.twimg.com` mp4 by the caller
 * (`isXVideoUrl` in xImportApi.ts) — this function downloads and decodes whatever it is handed.
 */
export async function burnSubtitles(
  videoUrl: string,
  cues: SubtitleCue[],
  opts: BurnOptions = {},
  onProgress?: (pct: number, stage: BurnStage) => void
): Promise<BurnResult> {
  if (!isBurnSupported()) {
    throw new Error('הדפדפן הזה לא תומך בצריבת כתוביות (WebCodecs). נסו בגרסה עדכנית של Chrome או Edge.');
  }

  onProgress?.(1, 'download');
  const response = await fetch(videoUrl, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error(`הורדת הסרטון נכשלה (${response.status}).`);
  const bytes = await response.arrayBuffer();
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));

  // Warmed before the first frame is drawn: a Hebrew face that loads mid-render would ship half the
  // clip in a fallback font. Same warm-up the deck exporter runs.
  await ensureDeckFonts();

  const video = document.createElement('video');
  video.src = blobUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  // Belt and braces: the source is CORS-open, and this makes the element's own fetch use the same
  // mode so a cached opaque response can never taint the canvas.
  video.crossOrigin = 'anonymous';

  const cleanup = () => {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(blobUrl);
  };

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('לא ניתן לפענח את הסרטון בדפדפן.'));
    });

    const srcW = video.videoWidth;
    const srcH = video.videoHeight;
    const durationSec = Number.isFinite(video.duration) ? video.duration : 0;
    if (!srcW || !srcH) throw new Error('לא ניתן לקרוא את מידות הסרטון.');
    if (durationSec > MAX_BURN_SECONDS) {
      throw new Error(
        `הסרטון ארוך מדי לצריבה בדפדפן (${Math.round(durationSec)} שניות). המגבלה היא ${MAX_BURN_SECONDS / 60} דקות — הורידו קובץ SRT במקום.`
      );
    }

    const { width: W, height: H } = outputBox(srcW, srcH, opts.aspect ?? 'source', opts.maxWidth ?? 1080);
    const fontScale = opts.fontScale ?? 0.045;
    const wantAudio = opts.audio !== false;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('canvas 2d context unavailable');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const audioBuffer = wantAudio ? await decodeAudio(bytes) : null;
    const audioChannels = audioBuffer ? Math.min(2, audioBuffer.numberOfChannels) : 0;

    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: 'avc', width: W, height: H },
      audio: audioBuffer
        ? { codec: 'aac', numberOfChannels: audioChannels, sampleRate: audioBuffer.sampleRate }
        : undefined,
      fastStart: 'in-memory',
    });

    const candidates: VideoEncoderConfig[] = [
      { codec: 'avc1.640028', width: W, height: H, bitrate: 6_000_000 },
      { codec: 'avc1.42001f', width: W, height: H, bitrate: 4_000_000 },
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
        console.error('[x-subtitle-burner] video encoder error:', e);
      },
    });
    videoEncoder.configure(videoConfig);

    // ── capture pass ──────────────────────────────────────────────────────────────────────────
    // Real time, one encode per presented frame. `mediaTime` is the frame's true position in the
    // clip, so a dropped frame shortens the frame list without shifting anything that follows it.
    let frames = 0;
    let lastMediaTime = -1;
    await new Promise<void>((resolve, reject) => {
      const rvfc = video as HTMLVideoElement & {
        requestVideoFrameCallback: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
      };

      // A keyframe every ~2 seconds of SOURCE time keeps the output seekable without bloating it.
      // Measured in media time rather than in frames, because the frame rate here is whatever the
      // browser managed to present.
      let lastKeyframeAt = -Infinity;

      const onFrame = (_now: number, meta: { mediaTime: number }) => {
        if (encoderError) {
          reject(encoderError);
          return;
        }
        // The browser occasionally re-presents the same frame (a stall, a repaint); encoding it
        // twice emits two chunks with the same timestamp, which the muxer rejects.
        if (meta.mediaTime > lastMediaTime) {
          lastMediaTime = meta.mediaTime;
          drawLetterboxed(ctx, video, srcW, srcH, W, H);
          const cue = cueAt(cues, meta.mediaTime * 1000);
          if (cue) drawCue(ctx, cue, W, H, fontScale);
          const keyFrame = meta.mediaTime - lastKeyframeAt >= 2;
          if (keyFrame) lastKeyframeAt = meta.mediaTime;
          const frame = new VideoFrame(canvas, { timestamp: Math.round(meta.mediaTime * 1e6) });
          videoEncoder.encode(frame, { keyFrame });
          frame.close();
          frames++;
          onProgress?.(Math.min(74, 2 + Math.round((meta.mediaTime / Math.max(durationSec, 0.001)) * 72)), 'video');
        }
        if (!video.ended) rvfc.requestVideoFrameCallback(onFrame);
      };

      video.onended = () => resolve();
      video.onerror = () => reject(new Error('הנגינה נכשלה באמצע הצריבה.'));
      rvfc.requestVideoFrameCallback(onFrame);
      video.play().catch((e) => reject(new Error(`לא ניתן להפעיל את הסרטון לצריבה: ${(e as Error).message}`)));
    });

    if (encoderError) throw encoderError;
    if (!frames) throw new Error('לא נלכדו פריימים — ודאו שהלשונית נשארת בחזית במהלך הצריבה.');
    await videoEncoder.flush();
    videoEncoder.close();

    // ── audio pass ────────────────────────────────────────────────────────────────────────────
    let audioEncoder: AudioEncoder | null = null;
    if (audioBuffer) {
      const audioConfig: AudioEncoderConfig = {
        codec: 'mp4a.40.2',
        sampleRate: audioBuffer.sampleRate,
        numberOfChannels: audioChannels,
        bitrate: 128_000,
      };
      if ((await AudioEncoder.isConfigSupported(audioConfig)).supported) {
        audioEncoder = new AudioEncoder({
          output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
          error: (e) => console.error('[x-subtitle-burner] audio encoder error:', e),
        });
        audioEncoder.configure(audioConfig);

        const pcm = interleave(audioBuffer, audioChannels);
        const framesPerChunk = Math.round(audioBuffer.sampleRate * 0.2);
        const samplesPerChunk = framesPerChunk * audioChannels;
        for (let offset = 0; offset < pcm.length; offset += samplesPerChunk) {
          const slice = pcm.subarray(offset, Math.min(pcm.length, offset + samplesPerChunk));
          const frameIndex = offset / audioChannels;
          const data = new AudioData({
            format: 'f32',
            sampleRate: audioBuffer.sampleRate,
            numberOfFrames: slice.length / audioChannels,
            numberOfChannels: audioChannels,
            timestamp: Math.round((frameIndex / audioBuffer.sampleRate) * 1e6),
            data: slice.slice(),
          });
          audioEncoder.encode(data);
          data.close();
          while (audioEncoder.encodeQueueSize > 30) await new Promise((r) => setTimeout(r, 10));
          onProgress?.(75 + Math.round((offset / pcm.length) * 20), 'audio');
        }
        await audioEncoder.flush();
        audioEncoder.close();
      }
    }

    onProgress?.(97, 'mux');
    muxer.finalize();
    onProgress?.(100, 'mux');
    return {
      blob: new Blob([target.buffer], { type: 'video/mp4' }),
      width: W,
      height: H,
      durationSec,
      hasAudio: Boolean(audioEncoder),
      frames,
    };
  } finally {
    cleanup();
  }
}
