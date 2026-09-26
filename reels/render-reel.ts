/**
 * render-reel — the hybrid 3D reel pipeline, end to end (reels/README.md).
 *
 *   scene spec (JSON) ─┬─► Blender CLI (bpy template)  → PNG frames → FFmpeg bloom → plate.mp4
 *                      ├─► voice (ElevenLabs | Gemini)  → voice.(mp3|wav) + word timings
 *                      └─► HyperFrames composition      → Hebrew headline, captions, note, end card
 *                                                         over the plate, with the voice → MP4
 *
 * Usage:
 *   npm run reel -- reels/scenes/sample-agent.json [--draft] [--voice auto|elevenlabs|gemini]
 *                  [--plate-frames <dir>] [--no-render]
 *
 *   --draft          half-resolution, 12-sample plate — for checking timing, not for posting
 *   --plate-frames   reuse an already-rendered frame directory instead of running Blender
 *   --no-render      stop after writing the HyperFrames project (open it with `npx hyperframes preview`)
 *
 * Runs land in video-projects/reel-<stamp>-<slug>/ (gitignored, same convention as
 * scripts/generate-code-video.mjs); the finished MP4 is copied to reels/out/.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { encodePlate } from './lib/media.js';
import { synthesizeVoice, type VoiceChoice } from './lib/voice.js';
import { prepareFonts } from './lib/fonts.js';
import { buildComposition, type ReelSpec } from './lib/composition.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'reels', '.cache');
const OUT = path.join(ROOT, 'reels', 'out');
/** Pinned so a reel re-rendered later uses the CLI it was built against. Bumped to the latest
 *  release on 2026-09-26 (scripts/generate-code-video.mjs keeps its own pin). */
const HYPERFRAMES = 'hyperframes@0.8.78';

// ─── args ────────────────────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const specPath = argv.find((a) => a.endsWith('.json'));
if (!specPath) die('usage: npm run reel -- <scene.json> [--draft] [--voice auto|elevenlabs|gemini] [--plate-frames <dir>] [--no-render]');
const spec = JSON.parse(fs.readFileSync(path.resolve(specPath!), 'utf8')) as ReelSpec;
const draft = flag('draft');
const voiceChoice = (opt('voice') ?? 'auto') as VoiceChoice;

function die(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}
const step = (msg: string) => console.log(`\n▸ ${msg}`);

/**
 * npx on Windows is npx.cmd, and spawning a .cmd without a shell throws EINVAL since Node 20 —
 * the same workaround scripts/generate-code-video.mjs uses.
 */
function run(cmd: string, args: string[], cwd = ROOT): number {
  const shell = process.platform === 'win32' && cmd === 'npx';
  const q = (s: string) => (/[\s"&|<>^]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
  const r = spawnSync(shell ? [cmd, ...args].map(q).join(' ') : cmd, shell ? [] : args, { cwd, stdio: 'inherit', shell });
  if (r.error) throw r.error;
  return r.status ?? 1;
}

/** BLENDER_PATH, then `blender` on PATH, then the newest winget/installer location. */
function findBlender(): string {
  if (process.env.BLENDER_PATH && fs.existsSync(process.env.BLENDER_PATH)) return process.env.BLENDER_PATH;
  const onPath = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['blender'], { encoding: 'utf8' });
  if (onPath.status === 0 && onPath.stdout.trim()) return onPath.stdout.trim().split(/\r?\n/)[0];
  const base = 'C:\\Program Files\\Blender Foundation';
  if (fs.existsSync(base)) {
    const versions = fs
      .readdirSync(base)
      .filter((d) => fs.existsSync(path.join(base, d, 'blender.exe')))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    if (versions.length) return path.join(base, versions[0], 'blender.exe');
  }
  die('Blender not found — install it (winget install BlenderFoundation.Blender) or set BLENDER_PATH');
}

// ─── pipeline ────────────────────────────────────────────────────────────────────────────────

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const runName = `reel-${stamp}-${spec.slug}`;
const runsDir = path.join(ROOT, 'video-projects');
fs.mkdirSync(runsDir, { recursive: true });

step(`HyperFrames project → video-projects/${runName}`);
if (run('npx', ['-y', HYPERFRAMES, 'init', runName, '--non-interactive', '--resolution', 'portrait'], runsDir) !== 0) die('hyperframes init failed');
const project = path.join(runsDir, runName);
const assets = path.join(project, 'assets');
fs.mkdirSync(assets, { recursive: true });

// 1. 3D plate
let framesDir = opt('plate-frames') ? path.resolve(opt('plate-frames')!) : '';
if (!framesDir) {
  framesDir = path.join(CACHE, runName, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });
  const blender = findBlender();
  const frames = Math.round(spec.durationSec * spec.fps);
  step(`Blender ${spec.template}: ${frames} frames${draft ? ' (draft)' : ''} — ${blender}`);
  const t0 = Date.now();
  const code = run(blender, [
    '-b', '--factory-startup',
    '-P', path.join(ROOT, 'reels', 'blender', `${spec.template}.py`),
    '--',
    '--out', framesDir,
    '--frames', String(frames),
    '--fps', String(spec.fps),
    '--scale', draft ? '50' : '100',
    '--samples', draft ? '12' : '24',
    '--seed', String(spec.seed ?? 7),
  ]);
  if (code !== 0) die(`Blender exited ${code}`);
  console.log(`  rendered in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
step('FFmpeg: frames → plate.mp4 (+ bloom)');
encodePlate(framesDir, spec.fps, path.join(assets, 'plate.mp4'));

// 2. voice
step(`Voice (${voiceChoice})`);
const voice = await synthesizeVoice(spec.voice.text, assets, voiceChoice);
fs.writeFileSync(path.join(project, 'words.json'), JSON.stringify(voice, null, 2));
console.log(`  ${voice.provider}: ${voice.durationSec.toFixed(2)}s, ${voice.words.length} words, timings ${voice.timing}`);
if (spec.voice.offsetSec + voice.durationSec > spec.durationSec - 1.4) {
  console.warn(`  ! the voice runs to ${(spec.voice.offsetSec + voice.durationSec).toFixed(1)}s — the end card will be squeezed; shorten the script or lengthen durationSec`);
}

// 3. composition
step('Fonts + composition');
const fontCss = await prepareFonts(CACHE, assets);
fs.writeFileSync(
  path.join(project, 'index.html'),
  buildComposition({ spec, fontCss, plateFile: 'plate.mp4', voiceFile: path.basename(voice.file), voiceDurationSec: voice.durationSec, words: voice.words })
);

step('hyperframes check');
// A failed check is fatal: its errors are exactly the renders that come out blank or silent while
// the preview looks fine (e.g. html_dir_attribute_breaks_render), so rendering anyway wastes the
// run and ships nothing usable. --force overrides for debugging.
if (run('npx', ['-y', HYPERFRAMES, 'check'], project) !== 0 && !flag('force')) die('hyperframes check failed — fix the findings above (or pass --force)');

if (flag('no-render')) {
  console.log(`\n✓ project ready: ${project}\n  preview: cd "${project}" && npx ${HYPERFRAMES} preview`);
  process.exit(0);
}

// 4. render
step('hyperframes render');
fs.mkdirSync(OUT, { recursive: true });
const mp4 = path.join(OUT, `${spec.slug}${draft ? '-draft' : ''}.mp4`);
if (run('npx', ['-y', HYPERFRAMES, 'render', '-o', mp4], project) !== 0) die('render failed');
console.log(`\n✓ ${mp4}`);
