/**
 * FFmpeg/ffprobe helpers for the reel pipeline. Synchronous on purpose: every step here is a
 * one-shot local process inside a CLI run, and ordering matters more than concurrency.
 */
import { spawnSync } from 'node:child_process';

function run(cmd: string, args: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

export function probeDuration(file: string): number {
  const r = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  const d = Number(r.stdout.trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error(`ffprobe could not read a duration from ${file}`);
  return d;
}

/**
 * Where speech actually is, from FFmpeg's silencedetect. Pauses shorter than 0.22s are ignored:
 * those are the gaps between words, not between phrases.
 */
export function speechSpans(file: string, durationSec: number): { start: number; end: number }[] {
  const r = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'silencedetect=noise=-38dB:d=0.22', '-f', 'null', '-']);
  const starts = [...r.stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...r.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const spans: { start: number; end: number }[] = [];
  let cursor = 0;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] - cursor > 0.05) spans.push({ start: cursor, end: starts[i] });
    cursor = ends[i] ?? durationSec;
  }
  if (durationSec - cursor > 0.05) spans.push({ start: cursor, end: durationSec });
  return spans.length ? spans : [{ start: 0, end: durationSec }];
}

/**
 * PNG sequence → H.264 plate with the bloom pass. The glow lives here rather than in Blender's
 * compositor because Blender 5.x reworked that API; this filter graph is the same on any version.
 * `screen` blending of a blurred copy lifts only what is already bright (the emissive lines), so
 * the slate stays black.
 */
export function encodePlate(framesDir: string, fps: number, outFile: string): void {
  const r = run('ffmpeg', [
    '-y', '-v', 'error',
    '-framerate', String(fps),
    '-i', `${framesDir}/frame_%04d.png`,
    // `format=gbrp` FIRST: without it FFmpeg negotiates the blend in YUV, and `screen` applied to
    // the chroma planes shifts every hue — the first sample plate came out magenta. The blend has
    // to run on real R/G/B; the conversion to yuv420p (explicit BT.709, tagged below) comes last.
    '-filter_complex',
    '[0]format=gbrp,split[a][b];[b]gblur=sigma=14[g];[a][g]blend=all_mode=screen:all_opacity=0.85,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-movflags', '+faststart',
    outFile,
  ]);
  if (r.code !== 0) throw new Error(`ffmpeg plate encode failed: ${r.stderr.slice(-600)}`);
}
