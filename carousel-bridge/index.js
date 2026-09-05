/**
 * carousel-bridge — local orchestrator for "Generate Designed Carousel with Hermes".
 *
 * WHY THIS EXISTS
 * The dashboard is a static SPA on Vercel and has no backend of its own. Two stages of this
 * pipeline can only run on Daniel's machine:
 *   - Hermes has no public endpoint (its gateway binds 127.0.0.1 and scales to zero after 2 min).
 *   - scripts/render_hebrew_banner.py needs local Python + Pillow + scripts/fonts/.
 * A Vercel function can reach neither, so the dashboard calls this service on localhost instead.
 *
 * PIPELINE (per job)
 *   1. Art direction  — one `hermes -z` call returns a JSON plan (concept, palette, per-slide
 *                       scene) derived from the article. This is the "Hermes decides autonomously"
 *                       step; Daniel only supplies an override if he wants one.
 *   2. Slide copy     — POST /api/agent-generate action:"carousel-studio" on the live site.
 *   3. Post copy      — POST /api/agent-generate action:"post-synthesize" (the refactored engine:
 *                       no markdown, 3-5 hashtags, ALT text).
 *   4. Visuals        — one `hermes -z` per slide producing a clean, TEXT-FREE frame.
 *   5. Hebrew overlay — scripts/render_hebrew_banner.py composites the RTL Hebrew headline.
 *
 * Image generation runs ~90s per slide, so jobs are async: POST returns a jobId, the dashboard
 * polls GET /carousel/job/:id.
 *
 * RUN (from the repo root, so `express` resolves from the root node_modules):
 *   node carousel-bridge/index.js
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// Load carousel-bridge/.env (then the repo-root .env) before reading any config below.
// Uses Node's built-in loader — no dotenv dependency. Existing process env always wins, so
// `ADMIN_API_SECRET=... node carousel-bridge/index.js` still overrides the file.
for (const envFile of [path.join(__dirname, '.env'), path.join(REPO_ROOT, '.env')]) {
  if (!fs.existsSync(envFile)) continue;
  try {
    process.loadEnvFile(envFile);
    console.log(`[carousel-bridge] loaded env from ${envFile}`);
  } catch (err) {
    console.warn(`[carousel-bridge] could not read ${envFile}: ${err.message}`);
  }
}
const OUTPUT_ROOT = path.join(__dirname, 'output');
const RENDER_SCRIPT = path.join(REPO_ROOT, 'scripts', 'render_hebrew_banner.py');

const PORT = Number(process.env.CAROUSEL_BRIDGE_PORT) || 8787;
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://mrdaniel.co.il';
const ADMIN_SECRET = process.env.ADMIN_API_SECRET || '';
const PYTHON = process.env.PYTHON_BIN || 'python';
const HERMES = process.env.HERMES_BIN || 'hermes';
// 10 minutes. A complex claymorphism render can exceed the old 5-minute ceiling, which
// surfaced in the modal as "hermes timed out after 300000ms" — the bridge's own error text
// relayed through job.error, not a client-side timeout (the dashboard sets none).
const HERMES_TIMEOUT_MS = Number(process.env.HERMES_TIMEOUT_MS) || 600_000;
const DEFAULT_SLIDES = 4;
const MAX_SLIDES = 8;

fs.mkdirSync(OUTPUT_ROOT, { recursive: true });

/** jobId -> job record. In-memory by design: this is a single-user local tool, and the PNGs
 *  themselves are on disk under output/<jobId>/ so a restart loses status, not artwork. */
const jobs = new Map();

// --- helpers ----------------------------------------------------------------------------------

/**
 * Resolve a bare command name to a concrete executable.
 *
 * These commands MUST be spawned WITHOUT `shell: true`. The Hermes prompts are multi-line and
 * contain quotes, hashes and braces; routing them through cmd.exe mangles the argument and Hermes
 * receives a truncated prompt (it printed its own --help and exited 2). Spawning the .exe directly
 * passes argv through untouched — but Node's non-shell spawn does not apply PATHEXT on Windows, so
 * `hermes` alone would not find `hermes.exe`. Hence this lookup.
 */
const binCache = new Map();
function resolveBin(name) {
  if (binCache.has(name)) return binCache.get(name);
  let found = name;
  if (path.isAbsolute(name) && fs.existsSync(name)) {
    found = name;
  } else {
    const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
    const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
    outer: for (const dir of dirs) {
      for (const ext of exts) {
        const candidate = path.join(dir, name + ext);
        if (fs.existsSync(candidate)) {
          found = candidate;
          break outer;
        }
      }
    }
  }
  binCache.set(name, found);
  return found;
}

function run(cmd, args, { timeoutMs = HERMES_TIMEOUT_MS, cwd = REPO_ROOT } = {}) {
  return new Promise((resolve, reject) => {
    const bin = resolveBin(cmd);
    // .cmd/.bat shims cannot be executed without a shell on modern Node; .exe can and must not be.
    const needsShell = /\.(cmd|bat)$/i.test(bin);
    const child = spawn(bin, args, {
      cwd,
      shell: needsShell,
      windowsVerbatimArguments: false,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (d) => (stdout += d.toString('utf8')));
    child.stderr.on('data', (d) => (stderr += d.toString('utf8')));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${cmd} exited ${code}: ${(stderr || stdout).slice(0, 600)}`));
    });
  });
}

/** Pull the first JSON object/array out of a model response that may be fenced or chatty. */
function extractJson(text) {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.search(/[[{]/);
  if (start === -1) throw new Error(`no JSON in Hermes response: ${text.slice(0, 200)}`);
  const opener = cleaned[start];
  const closer = opener === '{' ? '}' : ']';
  const end = cleaned.lastIndexOf(closer);
  if (end <= start) throw new Error(`unterminated JSON in Hermes response`);
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function callSite(action, body) {
  const res = await fetch(`${SITE_ORIGIN}/api/agent-generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(ADMIN_SECRET ? { 'x-admin-secret': ADMIN_SECRET } : {}),
    },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(`${action} failed (${res.status}): ${data.error || 'unknown'}`);
  }
  return data;
}

// --- pipeline stages --------------------------------------------------------------------------

const ART_DIRECTION_PROMPT = (article, slideCount, override) => `
You are the art director for an Instagram carousel about this news story.

TITLE: ${article.title}
SOURCE: ${article.source}
TOPIC: ${article.topic}
ARTICLE: ${String(article.articleText || '').slice(0, 2500)}

Decide the visual concept yourself — do not ask questions.
${override ? `\nThe user has requested this art direction: "${override}". Honour it.\n` : ''}
Constraints:
- 3D claymorphism / soft-clay render style, premium and warm, consistent across all slides.
- Every slide is 9:16 vertical and must contain NO TEXT, NO LETTERS, NO NUMBERS whatsoever.
- Every slide must leave generous empty negative space in the upper third for Hebrew copy.
- One coherent palette across the whole set; slides should read as one series.

Return ONLY valid JSON, no prose:
{"concept":"one sentence","palette":["#hex","#hex","#hex"],
 "textColor":"#hex readable on these slides",
 "slides":[${Array.from({ length: slideCount }, (_, i) => `{"index":${i},"scene":"detailed text-free image prompt for slide ${i + 1}"}`).join(',')}]}
`.trim();

async function generateArtDirection(article, slideCount, override) {
  const raw = await run(HERMES, ['-z', ART_DIRECTION_PROMPT(article, slideCount, override)]);
  const plan = extractJson(raw);
  if (!Array.isArray(plan.slides) || plan.slides.length === 0) {
    throw new Error('Hermes returned no slide plan');
  }
  return plan;
}

async function generateFrame(jobDir, index, scene, palette) {
  const outPath = path.join(jobDir, `frame_${String(index).padStart(2, '0')}.png`);
  const prompt = [
    `Generate ONE image and save it to ${outPath.replace(/\\/g, '/')}.`,
    `Style: 3D claymorphism, soft clay materials, premium studio lighting, 9:16 vertical.`,
    `Palette: ${(palette || []).join(', ')}.`,
    `Scene: ${scene}`,
    `ABSOLUTE REQUIREMENT: the image must contain NO text, NO letters, NO numbers, NO logos, NO watermarks.`,
    `Leave the upper third visually calm and mostly empty — Hebrew copy will be composited there afterwards.`,
    `Reply with only the absolute file path.`,
  ].join('\n');
  await run(HERMES, ['-z', prompt]);
  if (!fs.existsSync(outPath)) throw new Error(`Hermes did not write slide ${index} to ${outPath}`);
  return outPath;
}

async function overlayHebrew(framePath, jobDir, index, lines, textColor) {
  const outPath = path.join(jobDir, `slide_${String(index).padStart(2, '0')}.png`);
  const args = [
    RENDER_SCRIPT,
    '-i', framePath,
    '-o', outPath,
    '-l', ...lines.filter(Boolean),
    '--font', 'gveret',
    '--font-size', '46',
    '--start-y', '70',
    '--color', textColor || '#B4531E',
    '--outline', 'none',
  ];
  await run(PYTHON, args, { timeoutMs: 60_000 });
  if (!fs.existsSync(outPath)) throw new Error(`render script produced no output for slide ${index}`);
  return outPath;
}

async function runJob(job) {
  const jobDir = path.join(OUTPUT_ROOT, job.id);
  fs.mkdirSync(jobDir, { recursive: true });
  const { article, slideCount, override } = job.input;

  job.status = 'art-direction';
  job.plan = await generateArtDirection(article, slideCount, override);
  job.progress = { done: 0, total: slideCount };

  job.status = 'copywriting';
  const brief = [article.title, article.articleText].join('\n\n').slice(0, 4000);

  // Copy failures must NOT discard the artwork: image generation costs ~90s per slide, so a
  // transient 401/429 from the copy endpoint degrades to the article's own text and is reported
  // in `copyWarning` rather than throwing the whole job away.
  const [deckRes, postRes] = await Promise.allSettled([
    callSite('carousel-studio', {
      title: article.title, source: article.source, topic: article.topic, brief, takeaways: [],
    }),
    callSite('post-synthesize', {
      title: article.title, source: article.source, topic: article.topic,
      platform: 'instagram', articleText: article.articleText,
    }),
  ]);

  const warnings = [];
  if (deckRes.status === 'fulfilled' && Array.isArray(deckRes.value.deck)) {
    job.deck = deckRes.value.deck;
  } else {
    job.deck = [];
    warnings.push(`slide copy: ${deckRes.reason?.message || 'unavailable'}`);
  }
  if (postRes.status === 'fulfilled' && postRes.value.post) {
    job.post = postRes.value.post;
  } else {
    job.post = { body: article.articleText.slice(0, 400), hashtags: [], altText: '' };
    warnings.push(`post copy: ${postRes.reason?.message || 'unavailable'}`);
  }
  job.copyWarning = warnings.length ? warnings.join(' · ') : null;

  job.status = 'rendering';
  job.slides = [];
  for (let i = 0; i < slideCount; i++) {
    const plan = job.plan.slides[i] || job.plan.slides[job.plan.slides.length - 1];
    const copy = job.deck[i] || {};
    const lines = [copy.headline, copy.subhead].filter(Boolean);
    const frame = await generateFrame(jobDir, i, plan.scene, job.plan.palette);
    const slide = await overlayHebrew(frame, jobDir, i, lines.length ? lines : [article.title], job.plan.textColor);
    job.slides.push({
      index: i,
      url: `/carousel/file/${job.id}/${path.basename(slide)}`,
      headline: copy.headline || '',
      subhead: copy.subhead || '',
      scene: plan.scene,
    });
    job.progress = { done: i + 1, total: slideCount };
  }

  job.status = 'done';
  job.finishedAt = Date.now();
}

function startJob(input) {
  const job = {
    id: randomUUID().slice(0, 8),
    status: 'queued',
    input,
    progress: { done: 0, total: input.slideCount },
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  runJob(job).catch((err) => {
    job.status = 'error';
    job.error = err.message;
    console.error(`[carousel-bridge] job ${job.id} failed:`, err.message);
  });
  return job;
}

// --- server -----------------------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  // Local single-user tool. Open CORS so the dashboard works from localhost:5174 and from the
  // deployed Vercel dashboard alike; the service only ever binds 127.0.0.1.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'carousel-bridge',
    port: PORT,
    siteOrigin: SITE_ORIGIN,
    adminSecret: Boolean(ADMIN_SECRET),
    renderScript: fs.existsSync(RENDER_SCRIPT),
    hermesTimeoutMs: HERMES_TIMEOUT_MS,
    activeJobs: [...jobs.values()].filter((j) => !['done', 'error'].includes(j.status)).length,
  });
});

app.post('/carousel/generate', (req, res) => {
  const { article, slideCount, override } = req.body ?? {};
  if (!article?.title || String(article.articleText || '').trim().length < 60) {
    return res.status(400).json({ ok: false, error: 'article.title and article.articleText (>=60 chars) required' });
  }
  const count = Math.min(MAX_SLIDES, Math.max(1, Number(slideCount) || DEFAULT_SLIDES));
  const job = startJob({ article, slideCount: count, override: override ? String(override) : '' });
  res.json({ ok: true, jobId: job.id, slideCount: count });
});

app.get('/carousel/job/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: 'job not found' });
  res.json({
    ok: true,
    id: job.id,
    status: job.status,
    progress: job.progress,
    concept: job.plan?.concept || '',
    palette: job.plan?.palette || [],
    slides: job.slides || [],
    post: job.post || null,
    copyWarning: job.copyWarning || null,
    error: job.error || null,
  });
});

/** Re-run the visuals for a job with a new art direction from Daniel, reusing its copy. */
app.post('/carousel/adjust', (req, res) => {
  const { jobId, instruction } = req.body ?? {};
  const prev = jobs.get(jobId);
  if (!prev) return res.status(404).json({ ok: false, error: 'job not found' });
  if (!instruction || String(instruction).trim().length < 3) {
    return res.status(400).json({ ok: false, error: 'instruction required' });
  }
  const job = startJob({
    ...prev.input,
    override: [prev.input.override, String(instruction)].filter(Boolean).join('. '),
  });
  res.json({ ok: true, jobId: job.id, adjustedFrom: prev.id });
});

app.use('/carousel/file', express.static(OUTPUT_ROOT, { maxAge: '1h' }));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[carousel-bridge] listening on http://127.0.0.1:${PORT}`);
  console.log(`[carousel-bridge] site=${SITE_ORIGIN} adminSecret=${ADMIN_SECRET ? 'set' : 'MISSING'}`);
  if (!fs.existsSync(RENDER_SCRIPT)) console.warn(`[carousel-bridge] WARNING: ${RENDER_SCRIPT} not found`);
});
