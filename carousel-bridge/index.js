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

/**
 * Shared token required on every /carousel route.
 *
 * This service spawns `hermes -z` with caller-supplied text (`override`, /carousel/adjust
 * instructions) — that is a prompt fed to an agent with tool-calling and code execution on this
 * machine. On loopback that is fine; reachable from the internet through a tunnel it is a remote
 * code execution path. So: no token, no tunnel. The server refuses to serve non-loopback traffic
 * unless BRIDGE_TOKEN is set.
 */
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || '';
/** Comma-separated origins allowed to call the bridge. Defaults to localhost dev + the dashboard. */
const ALLOWED_ORIGINS = (process.env.BRIDGE_ALLOWED_ORIGINS ||
  'http://localhost:5174,http://127.0.0.1:5174')
  .split(',').map((o) => o.trim()).filter(Boolean);
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

/** Max decoded size of an uploaded design reference. Base64 inflates ~33%, hence the 12mb body cap. */
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;
const REFERENCE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** Writes a `data:image/...;base64,...` payload to the job dir so Hermes can read it from disk. */
function saveReferenceImage(dataUrl, jobDir) {
  const m = /^data:([\w/+.-]+);base64,(.+)$/s.exec(String(dataUrl || '').trim());
  if (!m) throw new Error('referenceImage must be a base64 data URL');
  const ext = REFERENCE_TYPES[m[1].toLowerCase()];
  if (!ext) throw new Error(`unsupported reference image type: ${m[1]} (png/jpeg/webp only)`);
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_REFERENCE_BYTES) {
    throw new Error(`reference image is ${(buf.length / 1e6).toFixed(1)}MB; max is 8MB`);
  }
  const out = path.join(jobDir, `reference.${ext}`);
  fs.writeFileSync(out, buf);
  return out;
}

/**
 * Pulls readable content out of a URL via the site's existing import-url action (og: tags plus a
 * readability pass — see src/server/contentImport.ts). Reused rather than scraping here so both
 * paths share one extractor.
 */
async function importSource(url) {
  const { imported } = await callSite('import-url', { url });
  const title = String(imported?.title || '').trim();
  const body = String(imported?.body || '').trim();
  if (body.length < 60 && title.length < 10) {
    throw new Error(`could not extract readable content from ${url}`);
  }
  return { title, body, source: String(imported?.source || '') };
}

// --- pipeline stages --------------------------------------------------------------------------

const ART_DIRECTION_PROMPT = (article, slideCount, override, referencePath) => `
You are the art director for an Instagram carousel about this news story.

TITLE: ${article.title}
SOURCE: ${article.source}
TOPIC: ${article.topic}
ARTICLE: ${String(article.articleText || '').slice(0, 2500)}

Decide the visual concept yourself — do not ask questions.
${override ? `\nThe user has requested this art direction: "${override}". Honour it.\n` : ''}
${
  referencePath
    ? `\nDESIGN REFERENCE: first open and study the image at ${referencePath.replace(/\\/g, "/")}.
Extract its design language: colour palette, typographic feel and weight, how text blocks are
positioned and framed, spacing rhythm, and the overall structural composition. Every slide you plan
must follow that same design language. Base "palette" and "textColor" on the colours you actually
see in the reference, and describe the matching type/layout treatment in "typography" and "layout".
Do NOT copy its subject matter, only its style, structure and framing.\n`
    : ''
}
Constraints:
- 3D claymorphism / soft-clay render style, premium and warm, consistent across all slides.
- Every slide is 9:16 vertical and must contain NO TEXT, NO LETTERS, NO NUMBERS whatsoever.
- Every slide must leave generous empty negative space in the upper third for Hebrew copy.
- One coherent palette across the whole set; slides should read as one series.

Return ONLY valid JSON, no prose:
{"concept":"one sentence","palette":["#hex","#hex","#hex"],
 "typography":"one phrase describing the type treatment","layout":"one phrase describing the composition",
 "textColor":"#hex readable on these slides",
 "slides":[${Array.from({ length: slideCount }, (_, i) => `{"index":${i},"scene":"detailed text-free image prompt for slide ${i + 1}"}`).join(',')}]}
`.trim();

async function generateArtDirection(article, slideCount, override, referencePath) {
  const raw = await run(HERMES, ['-z', ART_DIRECTION_PROMPT(article, slideCount, override, referencePath)]);
  const plan = extractJson(raw);
  if (!Array.isArray(plan.slides) || plan.slides.length === 0) {
    throw new Error('Hermes returned no slide plan');
  }
  return plan;
}

async function generateFrame(jobDir, index, scene, palette, referencePath) {
  const outPath = path.join(jobDir, `frame_${String(index).padStart(2, '0')}.png`);
  const prompt = [
    `Generate ONE image and save it to ${outPath.replace(/\\/g, '/')}.`,
    `Style: 3D claymorphism, soft clay materials, premium studio lighting, 9:16 vertical.`,
    `Palette: ${(palette || []).join(', ')}.`,
    ...(referencePath
      ? [`Match the design language of the reference image at ${referencePath.replace(/\\/g, '/')} — its palette, spacing rhythm and structural framing. Do not copy its subject matter.`]
      : []),
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
  const { slideCount, override, referenceImage, sourceUrl } = job.input;
  let article = job.input.article;

  // Reference screenshot: written to disk first so Hermes can open it during art direction.
  let referencePath = null;
  if (referenceImage) {
    referencePath = saveReferenceImage(referenceImage, jobDir);
    job.reference = path.basename(referencePath);
  }

  // A source URL replaces the article text with the real content behind the link, so both the
  // art direction and the copy are grounded in it rather than in whatever the caller typed.
  if (sourceUrl) {
    job.status = 'importing';
    const imported = await importSource(sourceUrl);
    article = {
      ...article,
      title: imported.title || article.title,
      source: imported.source || article.source,
      articleText: imported.body || article.articleText,
    };
    job.imported = { title: article.title, source: article.source, chars: article.articleText.length };
  }
  job.article = { title: article.title, source: article.source };

  job.status = 'art-direction';
  job.plan = await generateArtDirection(article, slideCount, override, referencePath);
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
    const frame = await generateFrame(jobDir, i, plan.scene, job.plan.palette, referencePath);
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
// Reference screenshots arrive as base64 data URLs, which inflate ~33% over the raw file.
app.use(express.json({ limit: '12mb' }));
app.use((req, res, next) => {
  // Reflect only allow-listed origins. `*` is deliberately NOT used: with a tunnel in front, any
  // web page could otherwise drive Hermes on this machine from a visitor's browser.
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*'); // curl / server-to-server
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-bridge-token');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

/** Token gate on everything that can reach Hermes. /health stays open so the UI can probe it. */
app.use('/carousel', (req, res, next) => {
  if (!BRIDGE_TOKEN) {
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    if (!local) {
      return res.status(503).json({
        ok: false,
        error: 'BRIDGE_TOKEN is not set — refusing non-loopback requests. Set it before tunneling.',
      });
    }
    return next();
  }
  // Rendered slides are fetched by <img src> and by the ZIP bundler's plain fetch(), neither of
  // which can attach a header — so the file route (and only the file route) also accepts the token
  // as `?t=`. Without this the gate 401s every image: the slider shows broken thumbnails and the
  // ZIP silently bundles the 52-byte JSON error body under each .png name.
  const fromQuery = req.path.startsWith('/file/') ? String(req.query.t || '') : '';
  const supplied = req.get('x-bridge-token') || fromQuery;
  if (supplied !== BRIDGE_TOKEN) return res.status(401).json({ ok: false, error: 'bad or missing x-bridge-token' });
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
    tokenRequired: Boolean(BRIDGE_TOKEN),
    activeJobs: [...jobs.values()].filter((j) => !['done', 'error'].includes(j.status)).length,
  });
});

app.post('/carousel/generate', (req, res) => {
  const { article, slideCount, override, referenceImage, sourceUrl } = req.body ?? {};
  // A sourceUrl supplies the article text itself, so the inline text requirement only applies
  // when no URL was given.
  const hasUrl = typeof sourceUrl === 'string' && /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}/i.test(sourceUrl.trim());
  if (!article?.title && !hasUrl) {
    return res.status(400).json({ ok: false, error: 'article.title or a valid sourceUrl is required' });
  }
  if (!hasUrl && String(article?.articleText || '').trim().length < 60) {
    return res.status(400).json({ ok: false, error: 'article.articleText (>=60 chars) required when no sourceUrl is given' });
  }
  if (sourceUrl && !hasUrl) {
    return res.status(400).json({ ok: false, error: `not a valid URL: ${String(sourceUrl).slice(0, 80)}` });
  }
  const count = Math.min(MAX_SLIDES, Math.max(1, Number(slideCount) || DEFAULT_SLIDES));
  const job = startJob({
    article: article || { title: '', source: '', topic: 'general', articleText: '' },
    slideCount: count,
    override: override ? String(override) : '',
    referenceImage: referenceImage ? String(referenceImage) : '',
    sourceUrl: hasUrl ? sourceUrl.trim() : '',
  });
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
    typography: job.plan?.typography || '',
    layout: job.plan?.layout || '',
    imported: job.imported || null,
    usedReference: Boolean(job.reference),
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
