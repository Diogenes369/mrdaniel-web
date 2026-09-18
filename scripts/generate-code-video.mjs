#!/usr/bin/env node
/**
 * generate-code-video — the mechanical half of a code-based video showcase.
 *
 * The creative half is the `/brag` skill (~/.claude/skills/brag), which reads the repo, writes a
 * storyboard and authors a HyperFrames composition. A skill is instructions for an agent, not a
 * binary: nothing here can "call brag". What this script owns is everything around it that is
 * deterministic and easy to get wrong on Windows:
 *
 *   brief    → a code brief for the target modules / commit range, so a run starts from facts
 *   scaffold → a HyperFrames project in the run directory, at the right resolution
 *   check    → the single gate that must pass before a render
 *   render   → local render (headless Chrome + FFmpeg, no HeyGen account) + poster frame
 *   publish  → copy the mp4/jpg where the dashboard can serve it
 *
 * Runs live in video-projects/<stamp>-<slug>/ (gitignored). Published videos land in
 * dashboard/public/generated-videos/, which Vite copies into the dashboard build as-is.
 *
 * Usage:
 *   node scripts/generate-code-video.mjs doctor
 *   node scripts/generate-code-video.mjs brief --paths mcp-server,src/agent --since HEAD~20
 *   node scripts/generate-code-video.mjs scaffold --run <dir> [--format vertical]
 *   node scripts/generate-code-video.mjs check   --run <dir>
 *   node scripts/generate-code-video.mjs render  --run <dir> [--publish]
 *   node scripts/generate-code-video.mjs publish --run <dir>
 *   node scripts/generate-code-video.mjs list
 *
 * `start` = brief + scaffold, and prints the prompt to hand to the agent.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNS_DIR = path.join(ROOT, 'video-projects');
const PUBLISH_DIR = path.join(ROOT, 'dashboard', 'public', 'generated-videos');
/** Pinned so a run months from now renders with the CLI it was authored against. */
const HYPERFRAMES = 'hyperframes@0.8.48';

const FORMATS = { landscape: 'landscape', vertical: 'portrait', square: 'square' };

// ─── plumbing ───────────────────────────────────────────────────────────────────────────────

const die = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const [flag, inline] = a.slice(2).split('=');
    const next = argv[i + 1];
    if (inline !== undefined) out[flag] = inline;
    else if (next && !next.startsWith('--')) out[flag] = argv[++i];
    else out[flag] = true;
  }
  return out;
}

/**
 * Run a command with the child's stdio wired straight through.
 *
 * `npx` on Windows is npx.cmd, and since Node 20 spawning a .cmd without a shell throws EINVAL, so
 * that one command goes through `shell: true`. A shell means the arguments are concatenated rather
 * than passed as a vector, and this repo lives under "C:\Projects\My Website" — every argument is
 * therefore quoted on the way in. git and ffmpeg are real executables and need none of this.
 */
const quoteWin = (a) => (/[\s&()[\]{}^=;!'+,`~|<>]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a);

function run(cmd, args, { cwd = ROOT, capture = false } = {}) {
  const shell = process.platform === 'win32' && cmd === 'npx';
  // Under a shell the whole invocation goes as one pre-quoted string: passing an argv array with
  // `shell: true` is deprecated (DEP0190) precisely because Node would concatenate it unquoted.
  const r = spawnSync(shell ? [cmd, ...args].map(quoteWin).join(' ') : cmd, shell ? [] : args, {
    cwd,
    shell,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: '1' },
  });
  if (r.error) die(`${cmd} could not start: ${r.error.message}`);
  if (capture) return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  return { code: r.status ?? 1, out: '' };
}

const hf = (args, opts) => run('npx', ['-y', HYPERFRAMES, ...args], opts);
const git = (args) => run('git', args, { capture: true }).out.trim();

const stamp = () =>
  new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+$/, '').replace(/-(\d\d)-(\d\d)$/, '$1$2');

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'showcase';

/** Resolve --run: an absolute path, a path relative to cwd, or a directory name under video-projects/. */
function resolveRun(args, { mustExist = true } = {}) {
  const raw = args.run ?? args._[1];
  if (!raw || raw === true) die('missing --run <dir> (see `list`)');
  const candidates = [path.resolve(raw), path.join(RUNS_DIR, String(raw))];
  const found = candidates.find((c) => fs.existsSync(c));
  if (!found && mustExist) die(`no such run directory: ${raw}`);
  return found ?? candidates[0];
}

const composition = (runDir) => path.join(runDir, 'composition');

// ─── brief ──────────────────────────────────────────────────────────────────────────────────

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.css', '.html', '.json', '.md']);
const SKIP_DIR = new Set(['node_modules', '.git', 'dist', '.vite', '__pycache__', 'video-projects', '.vercel', '.agent-state', 'generated-videos']);
/** Generated bulk: it dwarfs hand-written code by line count and tells a story about nothing. */
const SKIP_FILE = /^(package-lock\.json|.*\.lock|.*-lock\.json)$/i;

/** Walk a target path and summarise it: file count, lines, and the biggest files (the load-bearing ones). */
function summarise(absPath) {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIR.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (SOURCE_EXT.has(path.extname(e.name)) && !SKIP_FILE.test(e.name)) files.push(full);
    }
  };
  const stat = fs.statSync(absPath);
  if (stat.isDirectory()) walk(absPath);
  else files.push(absPath);

  const rows = files.map((f) => {
    const text = fs.readFileSync(f, 'utf8');
    return { rel: path.relative(ROOT, f).replace(/\\/g, '/'), lines: text.split('\n').length, ext: path.extname(f) };
  });
  const byExt = {};
  for (const r of rows) byExt[r.ext] = (byExt[r.ext] ?? 0) + r.lines;
  return {
    files: rows.length,
    lines: rows.reduce((n, r) => n + r.lines, 0),
    byExt: Object.entries(byExt).sort((a, b) => b[1] - a[1]),
    top: rows.sort((a, b) => b.lines - a.lines).slice(0, 12),
  };
}

function buildBrief({ targets, since, runDir, title }) {
  const lines = [`# Code brief — ${title}`, '', `Generated: ${new Date().toISOString()}`, `Repo: ${ROOT}`, ''];

  const head = git(['rev-parse', '--short', 'HEAD']);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  lines.push(`Branch: \`${branch}\` @ \`${head}\``, '');

  for (const t of targets) {
    const abs = path.resolve(ROOT, t);
    if (!fs.existsSync(abs)) die(`target path does not exist: ${t}`);
    const s = summarise(abs);
    lines.push(
      `## ${t}`,
      '',
      `- ${s.files} source files · ${s.lines.toLocaleString()} lines`,
      `- Mix: ${s.byExt.map(([ext, n]) => `${ext} ${n.toLocaleString()}`).join(' · ')}`,
      '',
      '### Biggest files (usually the ones worth showing)',
      '',
      ...s.top.map((f) => `- \`${f.rel}\` — ${f.lines} lines`),
      ''
    );
    const readme = ['README.md', 'AGENTS.md'].map((n) => path.join(abs, n)).find((p) => fs.existsSync(p));
    if (readme) {
      const head6 = fs.readFileSync(readme, 'utf8').split('\n').slice(0, 20).join('\n');
      lines.push(`### ${path.relative(ROOT, readme).replace(/\\/g, '/')} (head)`, '', '```markdown', head6, '```', '');
    }
  }

  if (since) {
    const range = `${since}..HEAD`;
    const log = git(['log', '--no-merges', '--pretty=format:- %h %s', range, '--', ...targets]);
    const stat = git(['diff', '--shortstat', range, '--', ...targets]);
    lines.push(`## Commits in \`${range}\``, '', log || '- (none touching these paths)', '', `Diff: ${stat || '(empty)'}`, '');
  }

  const file = path.join(runDir, 'code-brief.md');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  return file;
}

// ─── commands ───────────────────────────────────────────────────────────────────────────────

function cmdDoctor() {
  const skill = path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.claude', 'skills');
  const need = ['brag', 'hyperframes-core', 'hyperframes-animation', 'hyperframes-creative', 'hyperframes-keyframes', 'hyperframes-cli'];
  console.log('Skills:');
  for (const n of need) {
    const ok = fs.existsSync(path.join(skill, n, 'SKILL.md'));
    console.log(`  ${ok ? '✓' : '✗'} ${n}${ok ? '' : '  → npx hyperframes skills   (brag: see docs/code-video.md)'}`);
  }
  console.log('\nHyperFrames doctor:');
  return hf(['doctor']).code === 0 ? 0 : 0; // doctor exits non-zero on optional misses; never fail the wrapper on it
}

function cmdBrief(args) {
  const targets = String(args.paths ?? args.path ?? '.')
    .split(',')
    .map((s) => s.trim().replace(/\\/g, '/'))
    .filter(Boolean);
  const title = args.title && args.title !== true ? String(args.title) : targets.join(' + ');
  const runDir = args.run && args.run !== true ? resolveRun(args, { mustExist: false }) : path.join(RUNS_DIR, `${stamp()}-${slugify(title)}`);
  const file = buildBrief({ targets, since: args.since && args.since !== true ? String(args.since) : null, runDir, title });
  console.log(`✓ brief   ${path.relative(ROOT, file).replace(/\\/g, '/')}`);
  console.log(`  run dir ${path.relative(ROOT, runDir).replace(/\\/g, '/')}`);
  return { runDir, file };
}

function cmdScaffold(args) {
  const runDir = resolveRun(args, { mustExist: false });
  const comp = composition(runDir);
  if (fs.existsSync(path.join(comp, 'index.html'))) {
    console.log(`= composition already exists at ${path.relative(ROOT, comp).replace(/\\/g, '/')}`);
    return runDir;
  }
  const format = String(args.format ?? 'landscape');
  const resolution = FORMATS[format] ?? die(`--format must be one of ${Object.keys(FORMATS).join(', ')}`);
  fs.mkdirSync(runDir, { recursive: true });
  const { code } = hf(['init', 'composition', '--non-interactive', '--resolution', resolution, '--skill', 'brag'], { cwd: runDir });
  if (code !== 0) die('hyperframes init failed');
  console.log(`✓ scaffold ${path.relative(ROOT, comp).replace(/\\/g, '/')} (${resolution})`);
  return runDir;
}

function cmdCheck(args) {
  const comp = composition(resolveRun(args));
  if (!fs.existsSync(comp)) die(`no composition in that run — scaffold it first`);
  const { code } = hf(['check'], { cwd: comp });
  if (code !== 0) die('hyperframes check failed — fix the errors above before rendering');
  console.log('✓ check passed');
}

function cmdRender(args) {
  const runDir = resolveRun(args);
  const comp = composition(runDir);
  if (!fs.existsSync(comp)) die('no composition in that run — scaffold it first');
  const mp4 = path.join(runDir, 'brag.mp4');
  const { code } = hf(['render', '-o', mp4], { cwd: comp });
  if (code !== 0) die('render failed');
  if (!fs.existsSync(mp4)) die('render reported success but produced no file');

  // Poster: first frame is enough for a wrapper default; /brag picks a better one during delivery.
  const jpg = path.join(runDir, 'brag.jpg');
  if (!fs.existsSync(jpg)) {
    run('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-frames:v', '1', '-q:v', '3', jpg], { capture: true });
  }
  console.log(`✓ render  ${path.relative(ROOT, mp4).replace(/\\/g, '/')} (${(fs.statSync(mp4).size / 1024).toFixed(0)} KB)`);
  if (args.publish) cmdPublish({ ...args, run: runDir });
  return mp4;
}

function cmdPublish(args) {
  const runDir = resolveRun(args);
  const mp4 = path.join(runDir, 'brag.mp4');
  if (!fs.existsSync(mp4)) die('nothing to publish — render first');
  const name = slugify(args.name && args.name !== true ? args.name : path.basename(runDir));
  fs.mkdirSync(PUBLISH_DIR, { recursive: true });
  const out = path.join(PUBLISH_DIR, `${name}.mp4`);
  fs.copyFileSync(mp4, out);
  const jpg = path.join(runDir, 'brag.jpg');
  if (fs.existsSync(jpg)) fs.copyFileSync(jpg, path.join(PUBLISH_DIR, `${name}.jpg`));
  console.log(`✓ publish /generated-videos/${name}.mp4`);
  return out;
}

function cmdList() {
  if (!fs.existsSync(RUNS_DIR)) return console.log('(no runs yet)');
  for (const d of fs.readdirSync(RUNS_DIR).sort().reverse()) {
    const dir = path.join(RUNS_DIR, d);
    if (!fs.statSync(dir).isDirectory()) continue;
    const marks = [
      fs.existsSync(path.join(dir, 'code-brief.md')) && 'brief',
      fs.existsSync(path.join(dir, 'composition', 'index.html')) && 'composition',
      fs.existsSync(path.join(dir, 'brag-plan.md')) && 'plan',
      fs.existsSync(path.join(dir, 'brag.mp4')) && 'mp4',
    ].filter(Boolean);
    console.log(`  ${d}  [${marks.join(' · ') || 'empty'}]`);
  }
}

function cmdStart(args) {
  const { runDir, file } = cmdBrief(args);
  cmdScaffold({ ...args, run: runDir });
  const rel = path.relative(ROOT, runDir).replace(/\\/g, '/');
  console.log(
    [
      '',
      'Next — hand the creative half to the agent:',
      '',
      `  /brag --tone polished`,
      `  Use ${rel}/code-brief.md as the source material, write the plan to ${rel}/,`,
      `  and author the composition in ${rel}/composition/.`,
      '',
      `Then: node scripts/generate-code-video.mjs render --run ${path.basename(runDir)} --publish`,
      '',
    ].join('\n')
  );
  void file;
}

const COMMANDS = { doctor: cmdDoctor, brief: cmdBrief, scaffold: cmdScaffold, check: cmdCheck, render: cmdRender, publish: cmdPublish, list: cmdList, start: cmdStart };

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
if (!cmd || args.help) {
  console.log(
    `generate-code-video — code → showcase video (HyperFrames + the /brag skill)\n\n` +
      `  doctor                                   check skills and render dependencies\n` +
      `  start    --paths <a,b> [--since <rev>]   brief + scaffold a new run\n` +
      `  brief    --paths <a,b> [--since <rev>]   (re)write the code brief only\n` +
      `  scaffold --run <dir> [--format vertical] scaffold the HyperFrames project\n` +
      `  check    --run <dir>                     the pre-render gate\n` +
      `  render   --run <dir> [--publish]         render locally, then optionally publish\n` +
      `  publish  --run <dir> [--name <slug>]     copy mp4/jpg to dashboard/public/generated-videos\n` +
      `  list                                     show runs and how far each got\n`
  );
  process.exit(args.help ? 0 : 1); // bare invocation is a usage error; --help is not
}
if (!COMMANDS[cmd]) die(`unknown command: ${cmd}`);
COMMANDS[cmd](args);
