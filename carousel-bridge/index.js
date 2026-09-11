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
import { randomUUID, randomBytes } from 'node:crypto';
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
// Overridable so the retention sweep and the public routes can be exercised against a scratch
// directory without touching real job output.
const OUTPUT_ROOT = process.env.CAROUSEL_OUTPUT_ROOT
  ? path.resolve(process.env.CAROUSEL_OUTPUT_ROOT)
  : path.join(__dirname, 'output');
const RENDER_SCRIPT = path.join(REPO_ROOT, 'scripts', 'render_hebrew_banner.py');
const COMPOSE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'compose_slide.py');
const PDF_SCRIPT = path.join(REPO_ROOT, 'scripts', 'compile_pdf.py');

/**
 * Output presets. Hermes is asked for the matching aspect and the compositor normalises its frame
 * to these exact pixels, so the safe-zone fractions mean the same thing on every preset.
 */
const PRESETS = {
  portrait: { w: 1080, h: 1350, ratio: '4:5', label: 'Instagram / LinkedIn carousel' },
  story: { w: 1080, h: 1920, ratio: '9:16', label: 'Stories / TikTok / Reels' },
  square: { w: 1080, h: 1080, ratio: '1:1', label: 'Square' },
};
const DEFAULT_PRESET = 'portrait';

const PORT = Number(process.env.CAROUSEL_BRIDGE_PORT) || 8787;
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://mrdaniel.co.il';
const ADMIN_SECRET = process.env.ADMIN_API_SECRET || '';
const PYTHON = process.env.PYTHON_BIN || 'python';
const HERMES = process.env.HERMES_BIN || 'hermes';
// 15 minutes. Image generation under the sketchnote system with reserved zones routinely runs
// past 10 minutes; the ceiling surfaced in the modal as "hermes timed out after 600000ms" — the
// bridge's own error relayed through job.error, not a client-side timeout (the dashboard sets none).
const HERMES_TIMEOUT_MS = Number(process.env.HERMES_TIMEOUT_MS) || 900_000;

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
/** Clean Hebrew sans for the overlay. Override with RENDER_FONT=assistant|rubik. */
const RENDER_FONT = process.env.RENDER_FONT || 'opensans';
const DEFAULT_SLIDES = 4;
const MAX_SLIDES = 8;

const BUNDLE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'make_bundle.py');
/** Where published guides are registered. Public download IDs must survive a bridge restart, so
 *  unlike `jobs` this map is persisted to disk. */
const REGISTRY_PATH = path.join(OUTPUT_ROOT, 'published.json');
/** Unpublished job directories are swept after this long. 48h by default. */
const OUTPUT_RETENTION_MS = Number(process.env.OUTPUT_RETENTION_MS) || 48 * 60 * 60 * 1000;
/** A PUBLISHED guide's lifetime. 0 — the default — means it never expires: a lead-magnet link sits
 *  in Instagram comments and DMs for months, and a guide that 410s a week after the post breaks
 *  every one of them. Set GUIDE_TTL_MS (or pass `ttlHours` on publish) for a link that should lapse.
 *  A live guide's job directory is exempt from the sweep — otherwise the 48h sweep would silently
 *  404 a link already handed to a ManyChat subscriber — so disk use grows with published guides
 *  until one is unpublished. */
const GUIDE_TTL_MS = Number(process.env.GUIDE_TTL_MS) || 0;
/** How often the sweep runs while the process is alive. */
const PRUNE_INTERVAL_MS = Number(process.env.PRUNE_INTERVAL_MS) || 60 * 60 * 1000;
/** Public origin this bridge is reachable at (the tunnel), used to build absolute download URLs. */
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

fs.mkdirSync(OUTPUT_ROOT, { recursive: true });

/** jobId -> job record. In-memory by design: this is a single-user local tool, and the PNGs
 *  themselves are on disk under output/<jobId>/ so a restart loses status, not artwork. */
const jobs = new Map();

/** Public-download rate limiting. Declared here, beside `jobs`, because the startup retention
 *  sweep also sweeps these buckets — a `const` declared further down is still in the temporal
 *  dead zone at that point and throws on boot. */
const PUBLIC_RATE_WINDOW_MS = Number(process.env.PUBLIC_RATE_WINDOW_MS) || 5 * 60 * 1000;
const PUBLIC_RATE_MAX = Number(process.env.PUBLIC_RATE_MAX) || 60;
/** clientKey -> timestamps of requests inside the current window. */
const publicHits = new Map();

/**
 * guideId -> published guide record. Persisted, unlike `jobs`.
 *
 * A guideId is 32 hex chars (128 bits) from randomBytes, NOT the 8-char jobId. A public download
 * link is an unauthenticated capability: anyone holding it gets the file, so the identifier has to
 * be unguessable. The internal jobId is 32 bits and is handed around in dashboard URLs and logs —
 * fine for a local tool, not fine as a public secret. The two namespaces stay separate, and
 * nothing is reachable publicly until it is explicitly published.
 */
const published = new Map();

function loadRegistry() {
  try {
    if (!fs.existsSync(REGISTRY_PATH)) return;
    const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    for (const [guideId, rec] of Object.entries(raw || {})) published.set(guideId, rec);
    console.log(`[carousel-bridge] loaded ${published.size} published guide(s)`);
  } catch (err) {
    console.warn(`[carousel-bridge] could not read registry: ${err.message}`);
  }
}

function saveRegistry() {
  try {
    const obj = Object.fromEntries(published);
    fs.writeFileSync(`${REGISTRY_PATH}.tmp`, JSON.stringify(obj, null, 2), 'utf8');
    fs.renameSync(`${REGISTRY_PATH}.tmp`, REGISTRY_PATH); // atomic-ish: no torn reads
  } catch (err) {
    console.warn(`[carousel-bridge] could not write registry: ${err.message}`);
  }
}

/** A guide with no `expiresAt` (null — the default, see GUIDE_TTL_MS) is permanent. */
function isExpired(rec, now = Date.now()) {
  return Boolean(rec.expiresAt) && rec.expiresAt <= now;
}

/** jobIds that must survive the sweep because a live public link points at them. */
function protectedJobIds(now = Date.now()) {
  const keep = new Set();
  for (const rec of published.values()) if (!isExpired(rec, now)) keep.add(rec.jobId);
  return keep;
}

/**
 * Retention sweep: drops expired guide registrations, then deletes job directories that no live
 * guide depends on and that are older than OUTPUT_RETENTION_MS.
 *
 * Directory mtime is the age signal, not the in-memory job record — job status dies with the
 * process while the artwork does not, so after a restart the filesystem is the only thing that
 * still knows how old a job is.
 */
function pruneOutput() {
  const now = Date.now();
  sweepRateBuckets(now); // same timer: a limiter map that only grows is its own denial of service
  let droppedGuides = 0;
  for (const [guideId, rec] of published) {
    if (isExpired(rec, now)) {
      published.delete(guideId);
      droppedGuides++;
    }
  }
  if (droppedGuides) saveRegistry();

  const keep = protectedJobIds(now);
  let removed = 0;
  let freed = 0;
  let entries = [];
  try {
    entries = fs.readdirSync(OUTPUT_ROOT, { withFileTypes: true });
  } catch (err) {
    console.warn(`[carousel-bridge] sweep could not read output root: ${err.message}`);
    return { removed, freed, droppedGuides };
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue; // published.json and friends are files — never touched
    if (keep.has(entry.name)) continue;
    const dir = path.join(OUTPUT_ROOT, entry.name);
    try {
      const age = now - fs.statSync(dir).mtimeMs;
      if (age < OUTPUT_RETENTION_MS) continue;
      // An in-flight job must never have its directory pulled out from under it.
      const job = jobs.get(entry.name);
      if (job && !['done', 'error'].includes(job.status)) continue;
      freed += dirSize(dir);
      fs.rmSync(dir, { recursive: true, force: true });
      jobs.delete(entry.name);
      removed++;
    } catch (err) {
      console.warn(`[carousel-bridge] sweep could not remove ${entry.name}: ${err.message}`);
    }
  }
  if (removed || droppedGuides) {
    console.log(
      `[carousel-bridge] sweep: removed ${removed} dir(s), ${(freed / 1048576).toFixed(1)} MB, `
      + `expired ${droppedGuides} guide(s)`
    );
  }
  return { removed, freed, droppedGuides };
}

/** Recursive byte total, best-effort — only used for the sweep's log line. */
function dirSize(dir) {
  let total = 0;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      total += e.isDirectory() ? dirSize(full) : fs.statSync(full).size;
    }
  } catch {
    /* best effort */
  }
  return total;
}

loadRegistry();
pruneOutput(); // sweep once at startup, then on a timer
setInterval(pruneOutput, PRUNE_INTERVAL_MS).unref();

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
      // child.kill() only signals the direct child; hermes spawns helpers that survive it and
      // accumulate. taskkill /T /F takes the whole tree down on Windows.
      if (process.platform === 'win32' && child.pid) {
        try {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        } catch {
          child.kill();
        }
      } else {
        child.kill();
      }
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
/**
 * Parses JSON out of a model reply, repairing the malformations LLMs actually produce.
 *
 * The previous version did a naive slice between the first brace and the last closer and handed
 * that straight to JSON.parse, so a reply truncated mid-array surfaced as an unhandled
 * "Expected ',' or ']' after array element in JSON at position 4135" and killed the job.
 *
 * Repairs applied, in order, each retried against JSON.parse:
 *   1. strip code fences and any prose either side of the JSON
 *   2. balance unclosed strings, arrays and objects (the truncation case)
 *   3. remove trailing commas before a closer
 *   4. drop the last, presumably partial, array element
 * Returns null rather than throwing when nothing parses, so callers can fall back deliberately.
 */
function repairJson(raw) {
  const text = String(raw || '');
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.search(/[[{]/);
  if (start === -1) return null;

  const opener = cleaned[start];
  const closer = opener === '{' ? '}' : ']';
  const candidates = [];

  // 1. Straight slice to the last matching closer — correct when the reply is merely wrapped.
  const lastClose = cleaned.lastIndexOf(closer);
  if (lastClose > start) candidates.push(cleaned.slice(start, lastClose + 1));

  // 2. Balance whatever is open at the end of the payload (truncated replies).
  const body = cleaned.slice(start);
  const stack = [];
  let inString = false;
  let escaped = false;
  for (const ch of body) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  let balanced = body;
  if (inString) balanced += '"';
  balanced += stack.reverse().join('');
  candidates.push(balanced);

  // 3/4. Trailing-comma removal, and dropping a partial final element.
  const extra = [];
  for (const c of candidates) {
    extra.push(c.replace(/,\s*([}\]])/g, '$1'));
    const lastComma = c.lastIndexOf(',');
    if (lastComma > 0) {
      const trimmed = c.slice(0, lastComma);
      const st = [];
      let ins = false, esc = false;
      for (const ch of trimmed) {
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') { ins = !ins; continue; }
        if (ins) continue;
        if (ch === '{' || ch === '[') st.push(ch === '{' ? '}' : ']');
        else if (ch === '}' || ch === ']') st.pop();
      }
      extra.push(trimmed + (ins ? '"' : '') + st.reverse().join(''));
    }
  }

  for (const candidate of [...candidates, ...extra]) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* try the next repair */
    }
  }
  return null;
}

/**
 * Last-resort art direction, used when Hermes cannot return a usable plan even after a retry.
 *
 * Deliberately generic but on-brand and structurally valid, so a job degrades to a plainer
 * carousel instead of failing outright and showing the operator a raw parser error.
 */
function fallbackArtDirection(article, slideCount) {
  const subject = String(article.title || 'the topic').slice(0, 90);
  return {
    concept: `Fallback direction: a calm sketchnote canvas about "${subject}".`,
    palette: ['#F8F6EF', '#1A1A1A', '#E85A2A', '#2E9E8F'],
    typography: 'Clean modern Hebrew sans',
    layout: 'Small central vignette with generous empty margins',
    textColor: '#1A1A1A',
    fallback: true,
    slides: Array.from({ length: slideCount }, (_, i) => ({
      index: i,
      visualQuery: 'modern technology workspace',
      scene:
        'A cute 2D hand-drawn clay-free robot character in charcoal ink on textured cream paper, '
        + 'small and centred in the middle third of the canvas, beside one simple prop such as a '
        + 'screen, a gauge or a checklist. Generous empty paper on all sides. Top 25% and bottom '
        + '20% completely clean. No letters, no words, no numerals anywhere.',
    })),
  };
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
/**
 * Instagram content extraction — official oEmbed only.
 *
 * Anonymous scraping of instagram.com does not work and is not attempted. Verified against a
 * public post: the deprecated api.instagram.com/oembed endpoint 302s, /embed/captioned returns a
 * JavaScript shell with no caption or og: tags, and the plain permalink carries no og:description.
 * The remaining ways through — spoofing the internal X-IG-App-ID API, or driving a headless
 * browser past the login modal — circumvent Meta's access controls and breach their platform
 * terms, so they are deliberately not implemented.
 *
 * The supported path is Meta's own oEmbed Read endpoint, which returns the caption for public
 * posts and requires an app access token:
 *   1. Create an app at developers.facebook.com and add the "oEmbed Read" product.
 *   2. Put `INSTAGRAM_OEMBED_TOKEN=<app-id>|<client-token>` in carousel-bridge/.env.
 * Without a token this returns null and the caller falls back to asking for a manual paste.
 */
const IG_URL_RE = /(?:instagram\.com|instagr\.am)\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i;

function isInstagramUrl(url) {
  return IG_URL_RE.test(String(url || ''));
}

async function fetchInstagramOEmbed(url) {
  const token = process.env.INSTAGRAM_OEMBED_TOKEN || '';
  if (!token) return null;
  const endpoint =
    'https://graph.facebook.com/v21.0/instagram_oembed'
    + `?url=${encodeURIComponent(url)}&omitscript=true&access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(15_000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      console.warn(`[carousel-bridge] oEmbed rejected: ${data.error?.message || res.status}`);
      return null;
    }
    // `title` carries the caption for public posts; author_name is stripped later by the rebrander.
    const caption = String(data.title || '').trim();
    if (caption.length < 20) return null;
    return { title: caption.split('\n')[0].slice(0, 120), body: caption, source: 'instagram.com' };
  } catch (err) {
    console.warn(`[carousel-bridge] oEmbed failed: ${err.message}`);
    return null;
  }
}

/** Guidance shown verbatim in the modal when an Instagram link cannot be read. */
const IG_PASTE_HINT =
  'Instagram blocks link scraping. Please copy & paste the post caption directly into the text box. '
  + '\u05d0\u05d9\u05e0\u05e1\u05d8\u05d2\u05e8\u05dd \u05d7\u05d5\u05e1\u05de\u05ea \u05e9\u05dc\u05d9\u05e4\u05ea \u05ea\u05d5\u05db\u05df \u05de\u05e7\u05d9\u05e9\u05d5\u05e8. '
  + '\u05d4\u05e2\u05ea\u05d9\u05e7\u05d5 \u05d5\u05d4\u05d3\u05d1\u05d9\u05e7\u05d5 \u05d0\u05ea \u05db\u05d9\u05ea\u05d5\u05d1 \u05d4\u05e4\u05d5\u05e1\u05d8 \u05d9\u05e9\u05d9\u05e8\u05d5\u05ea \u05dc\u05ea\u05d9\u05d1\u05ea \u05d4\u05d8\u05e7\u05e1\u05d8.';

/**
 * Threads (threads.net / threads.com) source extraction.
 *
 * WHAT THE OFFICIAL API CAN AND CANNOT DO — verified against graph.threads.net:
 * - oEmbed (`/v1.0/oembed`) exists and returns a single post, but it rejects an
 *   `app-id|app-secret` app token outright ("Cannot parse access token"). Threads requires a USER
 *   access token obtained through OAuth; app credentials alone authenticate nothing.
 * - The reply-chain edges (`/{id}/replies`, `/{id}/conversation`) are scoped to the AUTHENTICATED
 *   user's own threads. There is no supported way to read another account's post plus its reply
 *   chain. So the full-thread fetch works for Daniel's own posts once a user token is present, and
 *   is simply unavailable for anyone else's — no scraping fallback is attempted, since that would
 *   mean circumventing Meta's access controls.
 *
 * Configure by putting a user token in THREADS_USER_TOKEN (carousel-bridge/.env). THREADS_APP_ID /
 * THREADS_APP_SECRET are read and used to build the OAuth URL and to exchange a short-lived token,
 * but are not themselves sufficient to read anything.
 */
const THREADS_URL_RE = /(?:threads\.net|threads\.com)\/@([\w.]+)\/post\/([A-Za-z0-9_-]+)/i;
const THREADS_API = 'https://graph.threads.net/v1.0';

function isThreadsUrl(url) {
  return THREADS_URL_RE.test(String(url || ''));
}

function threadsConfig() {
  return {
    appId: process.env.THREADS_APP_ID || '',
    appSecret: process.env.THREADS_APP_SECRET || '',
    userToken: process.env.THREADS_USER_TOKEN || '',
  };
}

async function threadsGet(pathname, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${THREADS_API}${pathname}?${qs}`, { signal: AbortSignal.timeout(20_000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `threads api ${res.status}`);
  }
  return data;
}

/**
 * Primary post plus its ordered reply chain, flattened into one source payload.
 *
 * Replies are numbered so the rebrander can turn each into its own slide, which is what makes a
 * "thread of steps" convert cleanly into a numbered carousel.
 */
async function fetchThreadsChain(url) {
  const { userToken } = threadsConfig();
  if (!userToken) return null;

  const m = THREADS_URL_RE.exec(url);
  if (!m) return null;
  const [, handle, shortcode] = m;

  try {
    // Resolve the permalink to a media id, then read the post and its replies.
    const lookup = await threadsGet('/me/threads', {
      fields: 'id,permalink,text,timestamp',
      limit: '50',
      access_token: userToken,
    });
    const post = (lookup.data || []).find((t) => String(t.permalink || '').includes(shortcode));
    if (!post) {
      // Not one of Daniel's own posts — the API cannot reach another account's thread.
      return { unavailable: `@${handle}'s thread is not readable via the Threads API (it only exposes your own posts).` };
    }

    const replies = await threadsGet(`/${post.id}/replies`, {
      fields: 'id,text,timestamp,is_reply_owned_by_me',
      limit: '50',
      access_token: userToken,
    });

    // Keep only the author's own replies, in chronological order: that is the actual thread,
    // as opposed to other people's comments on it.
    const chain = (replies.data || [])
      .filter((r) => r.is_reply_owned_by_me !== false && String(r.text || '').trim())
      .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')))
      .map((r) => String(r.text).trim());

    const numbered = chain.map((t, i) => `${i + 1}. ${t}`).join('\n\n');
    const body = [String(post.text || '').trim(), numbered].filter(Boolean).join('\n\n');

    return {
      title: String(post.text || '').split('\n')[0].slice(0, 120),
      body,
      source: 'threads.net',
      steps: chain.length,
    };
  } catch (err) {
    console.warn(`[carousel-bridge] threads api failed: ${err.message}`);
    return null;
  }
}

/** Single post via oEmbed. Needs a user token; app credentials alone are rejected. */
async function fetchThreadsOEmbed(url) {
  const { userToken } = threadsConfig();
  if (!userToken) return null;
  try {
    const data = await threadsGet('/oembed', { url, access_token: userToken, omitscript: 'true' });
    const text = String(data.title || data.html || '').replace(/<[^>]+>/g, ' ').trim();
    if (text.length < 20) return null;
    return { title: text.split('\n')[0].slice(0, 120), body: text, source: 'threads.net' };
  } catch (err) {
    console.warn(`[carousel-bridge] threads oembed failed: ${err.message}`);
    return null;
  }
}

const THREADS_PASTE_HINT =
  'Threads could not be read automatically. The Threads API only exposes your OWN posts and needs '
  + 'THREADS_USER_TOKEN (an OAuth user token, not the app secret). Copy & paste the thread text '
  + 'directly into the text box instead.';

const LINKEDIN_URL_RE = /linkedin\.com\/(?:posts|feed\/update|pulse)\//i;

function isLinkedInUrl(url) {
  return LINKEDIN_URL_RE.test(String(url || ''));
}

/**
 * Strips social-platform chrome so only the post body reaches the rebrander.
 *
 * A scraped LinkedIn page carries far more than the post: reaction and comment counts, connection
 * degrees, follow buttons, timestamps, "see more"/"show translation" affordances, the comment
 * thread itself, and sign-in prompts. All of it used to be handed to the translator, which then
 * dutifully turned "1,234 likes · 56 comments" into Hebrew slides.
 *
 * Everything here is line-oriented and conservative: a line is dropped only when it matches a
 * chrome pattern outright, never merely because it is short, so genuine post copy survives.
 */
const CHROME_LINE_RE = [
  // Reactions, comments, reposts, impressions — with or without thousands separators.
  /^[\s•·]*[\d,.]+\s*(likes?|reactions?|comments?|reposts?|shares?|impressions?|views?)\b/i,
  /^[\s•·]*(like|comment|repost|share|send|follow|following|connect|subscribe)\s*$/i,
  // Connection degree / promoted / timestamps.
  /^[\s•·]*(\d+(st|nd|rd|th)\+?|promoted|sponsored)\s*$/i,
  /^[\s•·]*\d+\s*(second|minute|hour|day|week|month|year)s?\s*(ago)?\s*[•·]?\s*(edited)?\s*$/i,
  /^[\s•·]*\d+\s*(s|m|h|d|w|mo|y)\s*[•·]?\s*(edited)?\s*$/i,
  // Expand / translate / more affordances.
  /^[\s•·]*(see more|show more|see less|…more|show translation|see translation|load more comments|view \d+ (more )?comments?)\s*$/i,
  // Auth walls and app nags.
  /^[\s•·]*(sign in|join now|new to linkedin\?|create account|report this post|feed post number \d+)/i,
  // Comment attributions: "Name (title) 2h" style leading lines inside a thread.
  /^[\s•·]*(reply|replies|\d+ repl(y|ies))\s*$/i,
  // Hebrew relative timestamps: "3 שבועות", "לפני 5 ימים", "שבוע · ערוך".
  /^[\s•·]*(לפני\s+)?\d+\s*(שניו?ת|דקו?ת|שעו?ת|ימים|יום|שבועו?ת|חודשי?ם|שני?ם)\s*[•·]?\s*(ערוך)?\s*$/,
  /^[\s•·]*(אהבתי|תגובה|שתף|שלח|עקוב|עוקב|התחבר|הצג תרגום|ראה עוד|קרא עוד)\s*$/,
  /^[\s•·]*[\d,.]+\s*(תגובות|תגובות|שיתופים|צפיות|לייקים)\s*$/,
  // A line that is nothing but hashtags — the source's own tag block, not narrative.
  /^[\s•·]*(#[\w֐-׿][\w֐-׿-]*[\s,]*){2,}$/,
  // Byline with an honorific or credential, on its own line.
  /^[\s•·]*(dr\.?|prof\.?|mr\.?|ms\.?|mrs\.?)\s+[A-Z֐-׿][\w֐-׿'-]*(\s+[A-Z֐-׿][\w֐-׿'-]*){0,3}\s*(,\s*(PhD|MD|MBA|CPA))?\s*$/i,
];

/** Everything from these markers onward is the comment thread, not the post. */
const COMMENTS_START_RE =
  /^\s*(most relevant|most recent|top comments?|all comments?|add a comment|\d+\s+comments?)\s*$/i;

/**
 * Author header: a LinkedIn scrape opens with the poster's name then their pipe-separated
 * professional headline ("Jane Cohen" / "CTO | AI | SaaS"). Detected as that specific PAIR rather
 * than by guessing at names, so a genuine hook is never mistaken for a byline.
 */
/** A bare personal name occupying its own line: 2-4 capitalised words, no sentence punctuation. */
const NAME_LINE_RE =
  /^[A-Z֐-׿][\w֐-׿'-]*(\s+[A-Z֐-׿][\w֐-׿'-]*){1,3}$/;

function dropAuthorHeader(lines) {
  const firstContent = lines.findIndex((l) => l.trim());
  if (firstContent === -1) return lines;

  // A name alone on the first content line is a byline. Requires no terminal punctuation and no
  // verb-ish length, so a real hook ("Most teams reach for a bigger instance") is never matched.
  const first = lines[firstContent].trim();
  if (NAME_LINE_RE.test(first) && first.length <= 42 && !/[.!?:,]$/.test(first)) {
    lines = lines.slice(firstContent + 1);
  }

  // Re-find the first content line: removing the name above shifts everything up, and the
  // professional headline may now BE that first line (this is why it previously survived).
  const head = lines.findIndex((l) => l.trim());
  if (head === -1) return lines;
  const headlineAt = lines.findIndex(
    (l, i) =>
      i >= head &&
      i <= head + 2 &&
      /\S\s*\|\s*\S/.test(l) &&
      l.trim().length < 90
  );
  if (headlineAt === -1) return lines;
  return lines.slice(headlineAt + 1);
}

function isolatePostBody(text) {
  const lines = dropAuthorHeader(String(text || '').split(/\r?\n/));
  const kept = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (COMMENTS_START_RE.test(line)) break; // comment thread begins — stop here
    if (!line) { kept.push(''); continue; }
    if (CHROME_LINE_RE.some((re) => re.test(line))) continue;
    kept.push(line);
  }
  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s*hashtag\s*#/gi, ' #')   // LinkedIn renders tags as "hashtag#foo"
    .trim();
}

async function importSource(url) {
  // Instagram first: the generic og:/readability extractor cannot see past the login wall, so the
  // official oEmbed endpoint is the only route that returns a caption.
  if (isInstagramUrl(url)) {
    const viaOEmbed = await fetchInstagramOEmbed(url);
    if (viaOEmbed) return viaOEmbed;
  }

  // Threads: prefer the full post + ordered reply chain, then the single-post oEmbed. Both return
  // null when unconfigured or when the post belongs to someone else, and fall through below.
  if (isThreadsUrl(url)) {
    const chain = await fetchThreadsChain(url);
    if (chain && chain.body) {
      console.log(`[carousel-bridge] threads: post + ${chain.steps} reply step(s), ${chain.body.length} chars`);
      return chain;
    }
    if (chain && chain.unavailable) console.warn(`[carousel-bridge] ${chain.unavailable}`);
    const single = await fetchThreadsOEmbed(url);
    if (single) return single;
  }

  const { imported } = await callSite('import-url', { url });
  const title = String(imported?.title || '').trim();
  // Strip platform chrome and any comment thread before anything downstream sees the text.
  const rawBody = String(imported?.body || '').trim();
  const body = isolatePostBody(rawBody);
  if (isLinkedInUrl(url) && rawBody.length !== body.length) {
    console.log(`[carousel-bridge] linkedin: isolated post body, ${rawBody.length} -> ${body.length} chars`);
  }
  if (body.length < 60 && title.length < 10) {
    if (isThreadsUrl(url)) {
      throw new Error(THREADS_PASTE_HINT);
    }
    if (isInstagramUrl(url)) {
      throw new Error(
        IG_PASTE_HINT
        + (process.env.INSTAGRAM_OEMBED_TOKEN
          ? ' (oEmbed is configured but returned nothing — the post may be private or deleted.)'
          : ' (Set INSTAGRAM_OEMBED_TOKEN in carousel-bridge/.env to read public captions automatically.)')
      );
    }
    throw new Error(`could not extract readable content from ${url}`);
  }
  return { title, body, source: String(imported?.source || '') };
}

// --- pipeline stages --------------------------------------------------------------------------

/**
 * The one design system every generated carousel must follow.
 *
 * Replaces the previous claymorphism direction outright. Two things were wrong with it: the output
 * was decorative rather than explanatory (soft abstract blobs that could accompany any story), and
 * it fought the Hebrew overlay for space. This system is a 2D sketchnote/infographic language whose
 * imagery must literally depict the specific story, with reserved empty zones for the Hebrew that
 * Pillow composites afterwards.
 */
const DESIGN_SYSTEM = `MANDATORY DESIGN SYSTEM — these rules override any style you would otherwise choose.

BANNED, without exception. If any of these appear the slide is rejected:
clay, claymorphism, plasticine, "3D render", 3D, octane, blender, abstract shapes, soft organic
forms, blobs, orbs, glossy spheres, floating pebbles, generic gradient backgrounds, decorative
swirls. Do not produce a pretty abstract image. Produce an explanatory diagram.

VISUAL STYLE:
Clean 2D hand-drawn technical illustration — sketchnote / visual-notes style, as if a skilled
designer drew the concept with fine ink pens on paper. Confident charcoal ink linework of even
weight, flat fills, no photorealism, no 3D shading, no bevels, no drop shadows beyond a light
1-2px offset. Background is a textured light cream paper (#F8F6EF) with subtle fibre grain.

COLOUR PALETTE — use these and nothing else:
- Background: #F8F6EF cream paper
- Ink / text / linework: #1A1A1A charcoal
- Primary accent (headers, numbered badges, footer banner): #E85A2A vibrant orange
- Secondary accent (checks, positive metrics, supporting fills): teal/green #2E9E8F
- Highlight: subtle yellow #F5C542, used sparingly as a marker-pen emphasis

CONTAINERS:
Hand-drawn charcoal ink boxes with rounded corners frame every step, metric and section. Lines look
drawn, not vector-perfect — slight wobble is correct. Boxes sit on the cream background with clear
breathing room between them.

ICONS AND CHARACTERS:
Friendly, cute 2D AI robot characters drawn in the same ink style — simple rounded bodies, small
expressive faces, no 3D. Alongside them use screens/monitors, hourglasses, checklists, progress
bars, gauges, padlocks, shields, magnifying glasses, documents, receipts, and directional arrows.
Characters must be DOING the thing the slide is about.

LAYOUT SCHEMA — every slide follows this vertical structure:
1. TOP HEADER ZONE: leave the top ~22% visually clean and uncluttered. A bold Hebrew headline is
   composited there afterwards, so put NO text and no busy detail in that band — at most a thin
   orange rule or a small badge at its edge.
2. CONTENT AREA (middle ~55%): 1 to 4 hand-drawn cards/boxes carrying the illustration. For
   sequential steps, mark each card with a filled circular ORANGE badge holding a numeral (1, 2, 3).
   For comparisons, use side-by-side boxes so two figures can be set against each other.
   Numerals and symbols may be drawn; Hebrew words must not.
3. FOOTER BANNER (bottom ~18%): a filled horizontal banner in orange (#E85A2A) or teal (#2E9E8F),
   with rounded ink corners, left visually clean inside — a Hebrew takeaway line is composited into
   it afterwards.

TEXT RULE — absolute:
Draw NO glyphs of ANY kind: no letters in any language, no words, no NUMERALS, no digits, no
percentages, no labels, no logos, no watermarks. Symbols carrying no text (arrows, ticks, gauge
needles, progress fills) are fine. Every number and every word is composited afterwards by a
precision typography pass, so anything you draw appears TWICE and collides.

RESERVED ZONES — absolute, and the single most important rule here:
This is a BACKGROUND for typography, not a finished illustration. Compose it like a premium
editorial poster whose words have not been set yet.
- Keep the artwork SMALL and CENTRAL. One focused vignette occupying roughly the middle third of
  the canvas, generous empty paper all around it. Do not fill the frame.
- The top ~25% must be clean paper: no linework, no texture, no character, nothing. A large Hebrew
  headline is set there afterwards.
- The bottom ~20% must be clean paper for the same reason.
- Inside any card or container you draw, the lower half must be empty paper — the drawing lives in
  its upper half only.
- Nothing may sit behind where text will go. Text is composited with no backing panel, so anything
  you draw in a reserved zone will show through the letters and ruin them.
Err heavily towards emptiness. A sparse, calm canvas with one small robot and a lot of paper is
CORRECT; a rich, busy, edge-to-edge illustration is WRONG no matter how attractive it looks.`;

/**
 * Forces literal, story-specific imagery. The failure mode this exists to prevent is a beautiful
 * generic illustration that would suit any article equally well.
 */
const METAPHOR_RULES = `VISUAL METAPHOR MAPPING — do this before you design anything:
Read the story and name its core subject, technology or tension. Then map that subject to concrete
drawable objects. Every element on the slide must illustrate THIS story; if an element would fit an
unrelated article just as well, replace it.

Worked examples of the required literalness:
- Database speed / query optimisation -> a cute robot sprinting with a stopwatch in hand beside a
  speedometer gauge whose needle swings from red into green.
- Cybersecurity / data privacy / a breach -> a robot holding a shield, a closed padlock over a
  document stack, a safe with its dial drawn.
- Cost savings / cloud efficiency -> a robot studying a long receipt through a magnifying glass,
  next to a spreadsheet grid with a descending arrow.
- Model launch / new AI capability -> a robot at a monitor showing a rising progress bar, with a
  checklist of ticked capabilities beside it.
- Acquisition / two companies merging -> two robots shaking hands over a document, with two boxes
  joining into one.

Apply the same literal treatment to whatever this story actually is. State your mapping in the
"concept" field so it is auditable.`;

/**
 * Compact style directive for the per-slide image call.
 *
 * The frame prompt must NOT carry the full DESIGN_SYSTEM: inlining all ~3k characters of it made a
 * single frame exceed the 600s Hermes timeout. The art-direction step has already baked the system
 * into each `scene`, so this only restates the non-negotiables the image model must not drift on.
 */
const FRAME_STYLE = [
  'Style: clean 2D hand-drawn technical illustration, sketchnote / visual-notes look.',
  'Confident charcoal ink linework, flat fills, textured cream paper background #F8F6EF.',
  'Palette: #F8F6EF cream, #1A1A1A charcoal ink, #E85A2A orange accents, #2E9E8F teal, #F5C542 highlight.',
  'Hand-drawn rounded ink boxes frame each card. Cute 2D robot characters, gauges, checklists, arrows.',
  'NOT clay, NOT claymorphism, NOT 3D, NOT abstract blobs or organic shapes, no gradients, no photorealism.',
  'Draw NO letters, NO words and NO numerals anywhere — all typography is composited separately and would collide.',
  'Keep artwork SMALL and CENTRAL — one vignette in the middle third, generous empty paper all around.',
  'Top 25% and bottom 20% must be completely clean paper: no linework, no texture, nothing behind the text.',
  'Err towards emptiness: a sparse calm canvas is correct, an edge-to-edge illustration is wrong.',
].join(' ');

const ART_DIRECTION_PROMPT = (article, slideCount, override, referencePath, aspect = '4:5') => `
You are the art director for a Hebrew Instagram infographic carousel about this news story.

TITLE: ${article.title}
SOURCE: ${article.source}
TOPIC: ${article.topic}
ARTICLE: ${String(article.articleText || '').slice(0, 2500)}

${METAPHOR_RULES}

${DESIGN_SYSTEM}

Plan ${slideCount} slide(s), ${aspect} vertical, as one coherent series that walks the reader through the
story: open with the situation, develop the mechanism or the numbers, close on the implication.
Decide everything yourself — do not ask questions.
${override ? `\nThe user has additionally requested: "${override}". Honour it, but never at the cost of the banned-terms rule or the layout schema.\n` : ''}
${
  referencePath
    ? `\nDESIGN REFERENCE: first open and study the image at ${referencePath.replace(/\\/g, "/")}.
Adopt its structural framing, spacing rhythm and type feel where they do not conflict with the
mandatory system above. The palette and the 2D sketchnote style are NOT negotiable — if the
reference is 3D, photographic or claymorphic, take only its layout and ignore its rendering style.
Do NOT copy its subject matter.\n`
    : ''
}
For each slide also give "visualQuery": 2-5 plain English words naming a CONCRETE, PHOTOGRAPHABLE
scene that matches that slide's idea — "server rack cabling", "developer writing code on laptop",
"cloud data centre aisle". Physical subjects only; no abstractions, no Hebrew, no brand names. It is
used to retrieve a stock photograph when a photographic style is selected.

For each slide, "scene" must be a complete, self-contained image prompt that names the concrete
drawn objects (which robot, doing what, holding what, next to which gauge/box/arrow), the card
count and their arrangement, where the numerals sit, and the footer banner colour. Restate the
"no lettering, numerals only" rule inside every scene.

Return ONLY valid JSON, no prose:
{"concept":"one sentence naming the story's core subject and the visual metaphor you mapped it to",
 "palette":["#F8F6EF","#1A1A1A","#E85A2A","#2E9E8F"],
 "typography":"one phrase","layout":"one phrase",
 "textColor":"#1A1A1A",
 "slides":[${Array.from({ length: slideCount }, (_, i) => `{"index":${i},"scene":"detailed drawn-imagery prompt for slide ${i + 1}, no lettering","visualQuery":"2-5 English words naming a concrete photographable scene for slide ${i + 1}, e.g. server rack cabling"}`).join(',')}]}
`.trim();

/**
 * Visual styles offered in the dashboard.
 *
 * `source: 'hermes'` draws the background with the image model; `source: 'photo'` pulls a
 * contextually matched stock photograph instead, which is what "Tips & Guides" wanted — a real
 * server rack behind a slide about cabling rather than an abstract drawing of one.
 */
const STYLES = {
  sketchnote: { label: 'סקצ׳נוט מצויר', source: 'hermes' },
  'dark-minimal': { label: 'טק מינימליסטי כהה', source: 'photo', tone: 'dark moody minimal technology' },
  photoreal: { label: 'צילום קונטקסטואלי', source: 'photo', tone: 'professional photography' },
  'concept-art': { label: 'אמנות קונספט מאוירת', source: 'hermes' },
  enterprise: { label: 'ארגוני בקונטרסט גבוה', source: 'photo', tone: 'bright clean corporate' },
};
const DEFAULT_STYLE = 'sketchnote';

/**
 * Contextually matched stock photo for one slide.
 *
 * `visualQuery` comes from the art-direction plan — a concrete scene ("server rack cabling",
 * "developer writing code on a modern laptop") rather than the slide's Hebrew text, which searches
 * badly. Returns null on any failure so the caller can fall back to a Hermes-drawn frame.
 */
async function fetchContextPhoto(jobDir, index, visualQuery, tone, preset) {
  const query = [visualQuery, tone].filter(Boolean).join(' ').trim();
  if (!query) return null;
  const orientation = preset === 'square' ? 'square' : 'portrait';
  const url =
    `${SITE_ORIGIN}/api/pexels-search?query=${encodeURIComponent(query)}`
    + `&orientation=${orientation}`;
  try {
    const res = await fetch(url, {
      headers: ADMIN_SECRET ? { 'x-admin-secret': ADMIN_SECRET } : {},
      signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.photoUrl) {
      console.warn(`[carousel-bridge] photo search failed for "${query}": ${data.error || res.status}`);
      return null;
    }
    const img = await fetch(data.photoUrl, { signal: AbortSignal.timeout(30_000) });
    if (!img.ok) return null;
    const outPath = path.join(jobDir, `frame_${String(index).padStart(2, '0')}.png`);
    fs.writeFileSync(outPath, Buffer.from(await img.arrayBuffer()));
    if (!isCompletePng(outPath)) {
      // Pexels serves JPEG; Pillow reads it regardless of the .png name, but the PNG validator
      // would reject it, so only the existence check applies here.
      if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 1024) return null;
    }
    console.log(`[carousel-bridge] slide ${index}: photo backdrop "${data.usedQuery || query}"`);
    return { path: outPath, credit: data.photographer || '', query: data.usedQuery || query };
  } catch (err) {
    console.warn(`[carousel-bridge] photo fetch failed: ${err.message}`);
    return null;
  }
}

async function generateArtDirection(article, slideCount, override, referencePath, aspect) {
  const prompt = ART_DIRECTION_PROMPT(article, slideCount, override, referencePath, aspect);

  // Two attempts, then a valid default. A malformed or truncated plan must never reach the
  // dashboard as a raw parser error — the job degrades to a plainer carousel instead.
  for (let attempt = 1; attempt <= 2; attempt++) {
    let raw = '';
    try {
      raw = await run(HERMES, ['-z', prompt]);
    } catch (err) {
      console.warn(`[carousel-bridge] art direction attempt ${attempt}/2 failed: ${err.message}`);
      continue;
    }
    const plan = repairJson(raw);
    if (plan && Array.isArray(plan.slides) && plan.slides.length > 0) {
      if (plan.slides.length < slideCount) {
        // Short plan: repeat the final scene rather than rendering fewer slides than requested.
        const last = plan.slides[plan.slides.length - 1];
        while (plan.slides.length < slideCount) {
          plan.slides.push({ ...last, index: plan.slides.length });
        }
      }
      return plan;
    }
    console.warn(
      `[carousel-bridge] art direction attempt ${attempt}/2 returned unusable JSON`
      + ` (${String(raw || '').length} chars): ${String(raw || '').slice(0, 300)}`
    );
  }

  console.warn('[carousel-bridge] art direction falling back to default visual direction');
  return fallbackArtDirection(article, slideCount);
}

async function generateFrame(jobDir, index, scene, palette, referencePath, aspect = '4:5') {
  const outPath = path.join(jobDir, `frame_${String(index).padStart(2, '0')}.png`);
  // Defensive: runJob creates this, but generateFrame is the only thing that depends on it
  // existing, and a missing directory would surface as the same opaque "no usable frame".
  fs.mkdirSync(jobDir, { recursive: true });

  const prompt = [
    `Generate ONE image and save it to ${outPath.replace(/\\/g, '/')}.`,
    `Format: ${aspect} vertical.`,
    FRAME_STYLE,
    `Palette for this set: ${(palette || []).join(', ')}.`,
    ...(referencePath
      ? [`Match the design language of the reference image at ${referencePath.replace(/\\/g, '/')} — its palette, spacing rhythm and structural framing. Do not copy its subject matter.`]
      : []),
    `Scene: ${scene}`,
    `ABSOLUTE REQUIREMENT: draw NO letters, NO words and NO numerals or digits anywhere, plus no logos or watermarks. All type and all numbers are composited afterwards — anything you draw appears twice.`,
    `Keep the artwork small and central. The top ~25% and bottom ~20% must be completely clean paper — Hebrew type is composited there with NO backing panel, so anything drawn in those bands shows through the letters.`,
    `Err heavily towards emptiness: sparse and calm is correct, edge-to-edge is wrong.`,
    `Generate the image EXACTLY ONCE. Save it, then reply with only the absolute file path and stop.`,
    `Do not review, critique, regenerate or iterate on the image — one generation only.`,
  ].join('\n');

  // Two attempts. Image generation fails intermittently — the model declines, writes to a path of
  // its own choosing, or returns prose instead of a file — and a single miss should not sink a job
  // that has already spent minutes on the preceding slides.
  let lastOutput = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      lastOutput = await run(HERMES, ['-z', prompt]);
    } catch (err) {
      // A timeout that still produced a complete file is a success — see isCompletePng.
      if (isCompletePng(outPath)) {
        console.warn(`[carousel-bridge] slide ${index}: ${err.message} — frame is complete on disk, using it.`);
        return outPath;
      }
      lastOutput = err.message;
      console.warn(`[carousel-bridge] slide ${index} attempt ${attempt}/2 failed: ${err.message}`);
      continue;
    }

    if (isCompletePng(outPath)) return outPath;

    // Hermes exited cleanly but the expected file is not there. It commonly saved somewhere else
    // and named that path in its reply, so try to recover it before burning another attempt.
    const recovered = recoverFrame(lastOutput, jobDir, outPath);
    if (recovered) {
      console.warn(`[carousel-bridge] slide ${index}: recovered frame from ${recovered}`);
      return outPath;
    }

    // Nothing usable. Log what Hermes actually said — previously this was swallowed entirely,
    // which is why the failure read as an unexplained "no usable frame".
    console.error(
      `[carousel-bridge] slide ${index} attempt ${attempt}/2 produced no file at ${outPath}\n`
      + `  hermes output: ${(lastOutput || '(empty)').slice(0, 1200)}`
    );
  }

  throw new Error(
    `Hermes produced no usable frame for slide ${index} at ${outPath}. `
    + `Last Hermes output: ${(lastOutput || '(empty)').slice(0, 400)}`
  );
}

/**
 * Salvages a frame Hermes wrote somewhere other than the requested path.
 *
 * Looks first for an absolute path named in its reply, then for any PNG that appeared in the job
 * directory in the last few minutes. Either is copied into place so the pipeline can continue.
 */
function recoverFrame(hermesOutput, jobDir, outPath) {
  const claimed = String(hermesOutput || '').match(/[A-Za-z]:[\\/][^\r\n"'`<>|]+?\.png/i);
  if (claimed) {
    const candidate = claimed[0].replace(/\//g, path.sep);
    if (candidate !== outPath && isCompletePng(candidate)) {
      fs.copyFileSync(candidate, outPath);
      return candidate;
    }
  }
  try {
    // No recency filter: every job gets its own directory, so any complete non-slide PNG sitting
    // in it belongs to this job. (An mtime window was tried and rejected — it silently discarded
    // valid frames, since copyFileSync preserves the source timestamp on Windows.)
    const stray = fs.readdirSync(jobDir)
      .filter((f) => f.toLowerCase().endsWith('.png') && !f.startsWith('slide_'))
      .map((f) => path.join(jobDir, f))
      .filter((f) => f !== outPath && isCompletePng(f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    if (stray) {
      fs.copyFileSync(stray, outPath);
      return stray;
    }
  } catch {
    /* directory unreadable — fall through to the caller's error */
  }
  return null;
}

/**
 * Composites the Hebrew into the two zones the design system reserves: a headline in the clean top
 * band, and a takeaway inside the footer banner. Two passes because they differ in position, colour
 * and line budget.
 *
 * Both use --max-lines so the type shrinks to fit its band. Previously the whole deck entry
 * (headline + subhead) was dumped at the top at a fixed 52px, which wrapped to ~10 lines and ran
 * straight across the illustration and into the banner.
 */
/**
 * Pass 2 — precision typography via scripts/compose_slide.py.
 *
 * Every element gets an explicit rectangle and is auto-fitted inside it on BOTH axes, so text
 * cannot overflow its band or land on the artwork. Numbered badges are drawn here and only here;
 * Pass 1 is forbidden from drawing any glyph, which is what produced duplicated numbers.
 */
async function composeSlide(framePath, jobDir, index, copy, opts) {
  const outPath = path.join(jobDir, `slide_${String(index).padStart(2, '0')}.png`);
  const cards = (copy.cards || []).slice(0, 4);
  // Cards occupy the middle band; text lands in the lower 45% of each, which Pass 1 leaves empty.
  const boxes = {
    1: [[0.12, 0.27, 0.88, 0.62]],
    2: [[0.10, 0.27, 0.49, 0.62], [0.51, 0.27, 0.90, 0.62]],
    3: [[0.10, 0.26, 0.90, 0.40], [0.10, 0.42, 0.90, 0.56], [0.10, 0.58, 0.90, 0.72]],
    4: [[0.10, 0.26, 0.49, 0.44], [0.51, 0.26, 0.90, 0.44], [0.10, 0.46, 0.49, 0.64], [0.51, 0.46, 0.90, 0.64]],
  }[Math.max(1, cards.length)] || [];

  const spec = {
    input: framePath,
    output: outPath,
    font: opts.font || RENDER_FONT,
    palette: opts.palette || 'brand',
    preset: opts.preset || DEFAULT_PRESET,
    style: opts.style || DEFAULT_STYLE,
    headline: copy.headline || '',
    footer: copy.footer || '',
    footerBox: [0.07, 0.78, 0.93, 0.90],
    drawFooterBox: true,
    cards: cards.map((c, i) => ({
      box: boxes[i] || boxes[boxes.length - 1],
      number: cards.length > 1 ? i + 1 : undefined,
      text: typeof c === 'string' ? c : c.text || '',
    })),
    ...(opts.fontScale ? { fontScale: opts.fontScale } : {}),
  };
  const specPath = path.join(jobDir, `spec_${String(index).padStart(2, '0')}.json`);
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2), 'utf8');
  await run(PYTHON, [COMPOSE_SCRIPT, '--spec', specPath], { timeoutMs: 60_000 });
  if (!fs.existsSync(outPath)) throw new Error(`compositor produced no output for slide ${index}`);
  return outPath;
}

/**
 * Pass 3 — automated vision QA.
 *
 * Hermes looks at the composited slide and reports whether type overlaps artwork, overflows its
 * band, or reads with poor contrast. On failure the caller re-composites with tighter settings.
 * Advisory by design: a QA call that itself fails must never sink a finished slide.
 */
async function visionQa(slidePath) {
  const prompt = [
    `Open the image at ${slidePath.replace(/\\/g, '/')} and inspect it as a layout reviewer.`,
    `Check exactly four things:`,
    `1. Does any text overlap illustration, linework or a character, instead of sitting on clear ground?`,
    `2. Does any text run outside its container, off the canvas, or past the top or bottom edge?`,
    `3. Is every glyph clean and fully formed — no empty boxes, no clipped or cut-off letters?`,
    `4. Is text contrast against its background strong enough to read comfortably?`,
    `Reply with ONLY this JSON, no prose:`,
    `{"pass":true|false,"overlap":true|false,"overflow":true|false,"brokenGlyphs":true|false,"lowContrast":true|false,"note":"one short sentence"}`,
  ].join('\n');
  try {
    const raw = await run(HERMES, ['-z', prompt], { timeoutMs: 180_000 });
    const verdict = repairJson(raw) || {};
    return {
      pass: verdict.pass !== false,
      overlap: Boolean(verdict.overlap),
      overflow: Boolean(verdict.overflow),
      brokenGlyphs: Boolean(verdict.brokenGlyphs),
      lowContrast: Boolean(verdict.lowContrast),
      note: String(verdict.note || ''),
    };
  } catch (err) {
    console.warn(`[carousel-bridge] vision QA skipped: ${err.message}`);
    return { pass: true, skipped: true, note: 'QA unavailable' };
  }
}

/**
 * True when `file` is a complete PNG: signature intact and terminated by an IEND chunk. Guards the
 * timeout-salvage path against half-written files.
 */
function isCompletePng(file) {
  try {
    if (!fs.existsSync(file)) return false;
    const { size } = fs.statSync(file);
    if (size < 1024) return false;
    const fd = fs.openSync(file, 'r');
    try {
      const head = Buffer.alloc(8);
      fs.readSync(fd, head, 0, 8, 0);
      if (head.toString('hex') !== '89504e470d0a1a0a') return false;
      const tail = Buffer.alloc(12);
      fs.readSync(fd, tail, 0, 12, size - 12);
      return tail.includes('IEND');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

/** Pixel height of a PNG, read from the IHDR header — avoids pulling in an image library. */
async function imageSize(file) {
  const fd = await fs.promises.open(file, 'r');
  try {
    const buf = Buffer.alloc(24);
    await fd.read(buf, 0, 24, 0);
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } finally {
    await fd.close();
  }
}

/**
 * Instagram Post Rebrander — 1:1 Hebrew translation with all third-party branding removed.
 *
 * Distinct from the normal carousel path, which SYNTHESISES new copy from an article. Here the
 * source post is authoritative: every step, number and claim survives, only the language and the
 * branding change. So this deliberately does not call carousel-studio.
 *
 * Instagram serves a login wall to unauthenticated fetches, so import-url usually yields og:
 * metadata (a caption excerpt) rather than the full post body. Whatever it returns is passed
 * through verbatim to the translator; `sourceChars` is reported so a thin extraction is visible
 * rather than silently producing a thin carousel.
 */
const REBRAND_SYSTEM = `You are translating a social post into Hebrew for a different brand.

ABSOLUTE RULES:
1. ONE-TO-ONE TRANSLATION. Every step, number, statistic, tool name, claim and ordering in the
   source must survive into the Hebrew. Do not summarise, merge, drop or reorder steps. Do not add
   steps, opinions or claims that are not in the source. If the source lists 7 items, output 7.
2. COMPLETE UNBRANDING. Remove every trace of the original author and publisher: account handles
   (@names), personal and company names, product names used as self-promotion, watermarks,
   logos described in text, "follow me", "link in bio", "save this post", "credit to", hashtags
   belonging to the original brand, and any call to action pointing anywhere other than the new
   brand. Keep third-party TECHNICAL product names when they are part of the information itself
   (e.g. "Postgres", "Figma") — those are facts, not branding.
3. NATURAL, HIGH-CONVERTING HEBREW. Localise, do not transliterate. Write the way an Israeli
   practitioner actually speaks: direct second person plural, active voice, short sentences.
   Technical terms may stay in Latin script inside a Hebrew sentence. No markdown, no asterisks.
   Each slide headline must earn the swipe on its own — concrete and specific, never a label like
   "שלב 2" or "טיפ נוסף". Read every line aloud in your head first; if it sounds like Google
   Translate, rewrite it. Preserve the source's meaning exactly while making the Hebrew sound
   native, and never invent a claim to make a line punchier.
4. Each slide is one discrete step or idea from the source, in the source's original order.
5. THREADED SOURCES. If the text arrives as a numbered chain ("1. ... 2. ... 3. ..."), that
   numbering is the thread's own reply order and is authoritative: emit exactly one slide per
   numbered entry, in that order, never merging two entries into one slide or splitting one across
   two. Any text before "1." is the opening post and becomes the set's title and first slide's
   framing, not a step of its own.

Return ONLY valid JSON, no prose:
{"title":"Hebrew headline for the whole set",
 "slides":[{"headline":"short Hebrew headline","cards":["one or two short Hebrew lines"],"footer":"short Hebrew takeaway"}],
 "caption":"full Hebrew caption, unbranded, ready to post",
 "hashtags":["#tag","#tag","#tag"],
 "removed":["what branding you stripped, for audit"]}`;

/**
 * Which mode the rebrander runs in. A source that is already Hebrew does not need translating —
 * it needs rewriting into a punchier, better-structured post — so the two cases get different
 * instructions rather than one prompt that tries to cover both.
 */
function detectSourceLanguage(text) {
  const sample = String(text || '').slice(0, 4000);
  const hebrew = (sample.match(/[֐-׿]/g) || []).length;
  const latin = (sample.match(/[A-Za-z]/g) || []).length;
  return hebrew >= 20 && hebrew >= latin * 0.5 ? 'he' : 'en';
}

const CONCISION_RULES = `LENGTH — this is a slide carousel, not an article:
- Every headline: at most 8 words. Every card line: at most 18 words, one idea.
- The footer takeaway: one short sentence.
- Cut ruthlessly. Ceremony, throat-clearing, restated context and "as we all know" openings all go.
- Prefer a concrete noun and an active verb over an adjective. Numbers beat adjectives.
- If a sentence survives with fewer words, it must be written with fewer words.
Never output a wall of text. If the source rambles, the carousel must not.`;

const ENRICH_RULES = `THE SOURCE IS ALREADY HEBREW. Do not translate it — CONDENSE and POLISH it.
- Keep every fact, number, step and claim the source makes. Add none.
- Sharpen the opening into a real hook: a concrete claim, a surprising number, or a question the
  reader wants answered. Never a label like "טיפים" or "שלב 1".
- Restructure into clear, well-spaced beats — one idea per slide, in a logical order the reader can
  follow. Expand a terse line into a full, readable sentence where the source was clipped.
- Executive tone: confident, specific, professional. No hype, no filler, no emoji stacking.
- Where the source is vague, make it concrete using only what is already there.
- Tighten: keep the substance, drop the padding. Personal brand voice — first-hand, specific,
  written by a practitioner who has done the thing, not a summariser describing it.`;

const TRANSLATE_RULES = `THE SOURCE IS NOT HEBREW. Translate and ADAPT it into Hebrew.
- Localise, do not transliterate: write the way an Israeli professional actually writes.
- Preserve every step, number and claim exactly, in the source's order.
- Adapt idioms and cultural references rather than rendering them literally.
- Technical terms may stay in Latin script inside a Hebrew sentence.
- SUMMARISE while translating: distil each idea to its sharpest form rather than rendering every
  clause. Structure the result as a hook followed by tight, scannable points.`;

async function rebrandSource(sourceText, sourceTitle, slideCount) {
  const lang = detectSourceLanguage(sourceText);
  const prompt = [
    lang === 'he' ? ENRICH_RULES : TRANSLATE_RULES,
    '',
    CONCISION_RULES,
    '',
    `SOURCE POST TITLE: ${sourceTitle || '(none)'}`,
    '',
    'SOURCE POST TEXT:',
    '"""',
    String(sourceText || '').slice(0, 6000),
    '"""',
    '',
    `Produce exactly ${slideCount} slides, preserving the source's own order and every step it contains.`,
  ].join('\n');

  const raw = await run(HERMES, ['-z', `${REBRAND_SYSTEM}\n\n${prompt}`], { timeoutMs: 300_000 });
  const out = repairJson(raw);
  if (!out || !Array.isArray(out.slides) || out.slides.length === 0) {
    throw new Error(
      'the translator did not return usable slides. Try again, or shorten the source text.'
    );
  }
  return {
    sourceLanguage: lang,
    title: String(out.title || sourceTitle || ''),
    slides: out.slides.map((sl) => ({
      headline: String(sl.headline || ''),
      cards: (Array.isArray(sl.cards) ? sl.cards : [sl.body || '']).map(String).filter(Boolean).slice(0, 4),
      footer: String(sl.footer || ''),
    })),
    caption: String(out.caption || ''),
    hashtags: (Array.isArray(out.hashtags) ? out.hashtags : []).map(String).slice(0, 5),
    removed: (Array.isArray(out.removed) ? out.removed : []).map(String),
  };
}

async function runJob(job) {
  const jobDir = path.join(OUTPUT_ROOT, job.id);
  fs.mkdirSync(jobDir, { recursive: true });
  const { slideCount, override, referenceImage, sourceUrl } = job.input;
  const preset = PRESETS[job.input.preset] || PRESETS[DEFAULT_PRESET];
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
  job.plan = await generateArtDirection(article, slideCount, override, referencePath, preset.ratio);
  job.progress = { done: 0, total: slideCount };

  // --- Instagram Rebrander: 1:1 translation replaces synthesis entirely -------------------
  if (job.input.mode === 'rebrand') {
    job.status = 'rebranding';
    if (String(article.articleText || '').trim().length < 40) {
      throw new Error(
        'nothing to rebrand - the source yielded no readable text. Instagram serves a login wall '
        + 'to unauthenticated fetches, so paste the caption into the text field instead.'
      );
    }
    const rebrand = await rebrandSource(article.articleText, article.title, slideCount);
    job.deck = rebrand.slides.map((sl) => ({ headline: sl.headline, subhead: sl.footer, bullets: sl.cards }));
    job.input.slideCopy = rebrand.slides.map((sl) => ({
      headline: sl.headline, cards: sl.cards, footer: sl.footer,
    }));
    job.post = { body: rebrand.caption, hashtags: rebrand.hashtags, altText: '' };
    job.rebrand = {
      removed: rebrand.removed,
      sourceChars: article.articleText.length,
      title: rebrand.title,
      sourceLanguage: rebrand.sourceLanguage,
      mode: rebrand.sourceLanguage === 'he' ? 'enrich' : 'translate',
    };
    job.copyWarning = null;
  } else {

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
  }

  job.status = 'rendering';
  job.slides = [];
  for (let i = 0; i < slideCount; i++) {
    const plan = job.plan.slides[i] || job.plan.slides[job.plan.slides.length - 1];
    const copy = job.deck[i] || {};
    // Photographic styles source the backdrop from Pexels using the slide's own visual context;
    // drawn styles keep Hermes as the background engine. A failed photo search falls back to
    // Hermes rather than failing the slide.
    const style = STYLES[job.input.style] || STYLES[DEFAULT_STYLE];
    let frame = null;
    let photo = null;
    if (style.source === 'photo') {
      photo = await fetchContextPhoto(jobDir, i, plan.visualQuery, style.tone, job.input.preset);
      if (photo) frame = photo.path;
    }
    if (!frame) {
      frame = await generateFrame(jobDir, i, plan.scene, job.plan.palette, referencePath, preset.ratio);
    }

    // Slide copy, either as edited by Daniel in the dashboard editor or straight from the deck.
    const edited = (job.input.slideCopy || [])[i] || {};
    const content = {
      headline: edited.headline || copy.headline || article.title,
      footer: edited.footer || copy.subhead || '',
      cards: edited.cards || (Array.isArray(copy.bullets) && copy.bullets.length
        ? copy.bullets.slice(0, 4)
        : [copy.body || copy.quote || ''].filter(Boolean)),
    };

    let slide = await composeSlide(frame, jobDir, i, content, {
      font: job.input.font, palette: job.input.palette, preset: job.input.preset,
      style: job.input.style,
    });

    // Vision QA, with one corrective re-composite. Overflow/overlap are the failures a tighter
    // fit can actually fix, so only those trigger a retry.
    let qa = job.input.skipQa ? { pass: true, skipped: true } : await visionQa(slide);
    if (!qa.pass && (qa.overflow || qa.overlap)) {
      job.qaRetries = (job.qaRetries || 0) + 1;
      slide = await composeSlide(frame, jobDir, i, content, {
        font: job.input.font, palette: job.input.palette, preset: job.input.preset,
        style: job.input.style, fontScale: 0.82,
      });
      qa = await visionQa(slide);
    }

    job.slides.push({
      index: i,
      url: `/carousel/file/${job.id}/${path.basename(slide)}`,
      headline: content.headline,
      subhead: content.footer,
      cards: content.cards,
      scene: plan.scene,
      visualQuery: plan.visualQuery || '',
      photoCredit: photo?.credit || '',
      qa,
    });
    job.progress = { done: i + 1, total: slideCount };
  }

  // LinkedIn document post: one PDF of every slide, in order. Non-fatal — a PDF failure must not
  // discard a carousel that rendered correctly.
  try {
    const pdfPath = path.join(jobDir, `carousel-${job.id}.pdf`);
    await run(PYTHON, [PDF_SCRIPT, '--dir', jobDir, '--out', pdfPath], { timeoutMs: 60_000 });
    if (fs.existsSync(pdfPath)) job.pdfUrl = `/carousel/file/${job.id}/${path.basename(pdfPath)}`;
  } catch (err) {
    console.warn(`[carousel-bridge] PDF compilation skipped: ${err.message}`);
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
  // Public download routes are world-readable by design (ManyChat, mail clients and link previews
  // all fetch with no Origin or an unpredictable one). Everything else stays on the allow-list:
  // those routes can reach Hermes, and `*` there would let any web page drive this machine.
  if (req.path.startsWith('/public/')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
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
    presets: Object.keys(PRESETS),
    styles: Object.keys(STYLES),
    tokenRequired: Boolean(BRIDGE_TOKEN),
    instagramOEmbed: Boolean(process.env.INSTAGRAM_OEMBED_TOKEN),
    threadsApp: Boolean(process.env.THREADS_APP_ID && process.env.THREADS_APP_SECRET),
    // App credentials alone read nothing; a user OAuth token is what makes Threads work.
    threadsUserToken: Boolean(process.env.THREADS_USER_TOKEN),
    activeJobs: [...jobs.values()].filter((j) => !['done', 'error'].includes(j.status)).length,
  });
});

app.post('/carousel/generate', (req, res) => {
  const { article, slideCount, override, referenceImage, sourceUrl } = req.body ?? {};
  const rawSource = typeof sourceUrl === 'string' ? sourceUrl.trim() : '';

  // The source field accepts EITHER a link or a pasted caption, so the discriminator is an
  // explicit scheme. A looser pattern (host.tld anywhere) misread captions as URLs — "Node.js
  // tips" and "check ai.com for more" both matched — and pasted text was rejected outright with
  // "not a valid URL". Anything without http(s):// is now simply treated as the source text.
  const hasUrl = /^https?:\/\//i.test(rawSource);
  const pastedText = !hasUrl && rawSource.length >= 40 ? rawSource : '';

  // Inline article text, a pasted caption, and a URL are three ways to supply the same thing.
  const inlineText = String(article?.articleText || '').trim();
  const sourceText = inlineText.length >= 40 ? inlineText : pastedText;

  if (!hasUrl && !sourceText) {
    return res.status(400).json({
      ok: false,
      error: rawSource
        ? `source text is too short (${rawSource.length} chars, need 40+). Paste the full caption, or give an http(s):// link.`
        : 'provide an http(s):// link, or paste the caption text (40+ chars).',
    });
  }
  const count = Math.min(MAX_SLIDES, Math.max(1, Number(slideCount) || DEFAULT_SLIDES));
  const job = startJob({
    article: {
      title: article?.title || (sourceText ? sourceText.split('\n')[0].slice(0, 120) : ''),
      source: article?.source || (hasUrl ? 'link' : 'pasted'),
      topic: article?.topic || 'general',
      // Pasted caption stands in as the article text so the rebrander translates it directly.
      articleText: sourceText || '',
    },
    slideCount: count,
    override: override ? String(override) : '',
    referenceImage: referenceImage ? String(referenceImage) : '',
    sourceUrl: hasUrl ? rawSource : '',
    // Editor-supplied per-slide copy; when absent the deck's own copy is used.
    slideCopy: Array.isArray(req.body?.slideCopy) ? req.body.slideCopy : null,
    font: typeof req.body?.font === 'string' ? req.body.font : '',
    palette: typeof req.body?.palette === 'string' ? req.body.palette : 'brand',
    skipQa: Boolean(req.body?.skipQa),
    // 'rebrand' = 1:1 unbranded Hebrew translation of a source post; otherwise synthesis.
    mode: req.body?.mode === 'rebrand' ? 'rebrand' : 'article',
    preset: PRESETS[req.body?.preset] ? req.body.preset : DEFAULT_PRESET,
    style: STYLES[req.body?.style] ? req.body.style : DEFAULT_STYLE,
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
    usedFallbackDirection: Boolean(job.plan?.fallback),
    layout: job.plan?.layout || '',
    imported: job.imported || null,
    usedReference: Boolean(job.reference),
    deck: job.deck || [],
    rebrand: job.rebrand || null,
    preset: job.input?.preset || DEFAULT_PRESET,
    style: job.input?.style || DEFAULT_STYLE,
    pdfUrl: job.pdfUrl || null,
    qaRetries: job.qaRetries || 0,
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

/**
 * Redesign — re-render an existing job's slides in a different visual style.
 *
 * The approved copy is untouched: it is re-read from the job's own slide records, so a redesign
 * can never alter wording that has already been reviewed. Only the backdrop and the typographic
 * composition change. Passing `slideIndex` redesigns one slide; omitting it does the whole set.
 */
app.post('/carousel/redesign', async (req, res) => {
  const { jobId, style, preset, font, palette, slideIndex } = req.body ?? {};
  const job = jobs.get(jobId);
  if (!job) return res.status(404).json({ ok: false, error: 'job not found' });
  if (!Array.isArray(job.slides) || job.slides.length === 0) {
    return res.status(400).json({ ok: false, error: 'job has no rendered slides yet' });
  }
  if (style && !STYLES[style]) {
    return res.status(400).json({ ok: false, error: `unknown style: ${style}` });
  }

  // Applied to the job so a later redesign or PDF rebuild stays consistent.
  if (style) job.input.style = style;
  if (PRESETS[preset]) job.input.preset = preset;
  if (font) job.input.font = font;
  if (palette) job.input.palette = palette;

  const targets =
    Number.isInteger(slideIndex) ? job.slides.filter((s) => s.index === slideIndex) : job.slides;
  if (targets.length === 0) return res.status(400).json({ ok: false, error: 'no such slide' });

  res.json({ ok: true, jobId: job.id, redesigning: targets.map((t) => t.index) });

  // Continue after responding: a redesign is as slow as a render, and the dashboard polls anyway.
  (async () => {
    const jobDir = path.join(OUTPUT_ROOT, job.id);
    const activeStyle = STYLES[job.input.style] || STYLES[DEFAULT_STYLE];
    job.status = 'rendering';
    job.progress = { done: 0, total: targets.length };
    try {
      for (let n = 0; n < targets.length; n++) {
        const slide = targets[n];
        const plan = job.plan?.slides?.[slide.index] || {};
        let frame = path.join(jobDir, `frame_${String(slide.index).padStart(2, '0')}.png`);
        let photo = null;
        if (activeStyle.source === 'photo') {
          photo = await fetchContextPhoto(
            jobDir, slide.index, slide.visualQuery || plan.visualQuery, activeStyle.tone, job.input.preset
          );
          if (photo) frame = photo.path;
        } else if (!fs.existsSync(frame)) {
          frame = await generateFrame(
            jobDir, slide.index, plan.scene || '', job.plan?.palette, null,
            (PRESETS[job.input.preset] || PRESETS[DEFAULT_PRESET]).ratio
          );
        }
        // Copy is read back from the slide record — never regenerated.
        await composeSlide(
          frame, jobDir, slide.index,
          { headline: slide.headline, footer: slide.subhead, cards: slide.cards || [] },
          { font: job.input.font, palette: job.input.palette, preset: job.input.preset, style: job.input.style }
        );
        if (photo) slide.photoCredit = photo.credit;
        // Cache-bust so the dashboard re-fetches the replaced file.
        slide.url = `/carousel/file/${job.id}/slide_${String(slide.index).padStart(2, '0')}.png?v=${Date.now()}`;
        job.progress = { done: n + 1, total: targets.length };
      }
      job.status = 'done';
    } catch (err) {
      job.status = 'error';
      job.error = `redesign failed: ${err.message}`;
      console.error(`[carousel-bridge] redesign ${job.id} failed:`, err.message);
    }
  })();
});

/**
 * Publish a finished job as a public guide.
 *
 * Token-gated: minting a public link is an admin action. It is the ONLY way anything under
 * output/ becomes reachable without a token, which keeps the public surface an explicit,
 * per-guide decision rather than a property of the whole directory.
 */
app.post('/carousel/publish', async (req, res) => {
  const { jobId, ttlHours, title } = req.body ?? {};
  if (!/^[a-f0-9]{8}$/i.test(String(jobId || ''))) {
    return res.status(400).json({ ok: false, error: 'valid jobId required' });
  }
  const job = jobs.get(jobId);
  const jobDir = path.join(OUTPUT_ROOT, String(jobId));

  // A job the registry no longer holds in memory (bridge restarted) is still publishable as long
  // as its directory has slides — the artwork outlives the process, so publishing should too.
  if (!fs.existsSync(jobDir)) return res.status(404).json({ ok: false, error: 'job not found' });
  if (job && !['done', 'error'].includes(job.status)) {
    return res.status(409).json({ ok: false, error: `job is still ${job.status}` });
  }

  const guideId = randomBytes(16).toString('hex'); // 128 bits
  const zipPath = path.join(jobDir, `guide-${guideId}.zip`);
  const caption = [job?.post?.body || '', (job?.post?.hashtags || []).join(' ')]
    .filter(Boolean).join('\n\n');
  const guideTitle = String(title || job?.article?.title || 'guide').slice(0, 120);

  try {
    await run(
      PYTHON,
      [BUNDLE_SCRIPT, '--dir', jobDir, '--out', zipPath, '--caption', caption, '--title', guideTitle],
      { timeoutMs: 120_000 }
    );
  } catch (err) {
    return res.status(500).json({ ok: false, error: `bundling failed: ${err.message}` });
  }
  if (!fs.existsSync(zipPath)) {
    return res.status(500).json({ ok: false, error: 'bundler produced no archive' });
  }

  const hours = Number(ttlHours);
  const ttl = Number.isFinite(hours) && hours > 0
    ? Math.min(hours, 24 * 365) * 3600_000
    : GUIDE_TTL_MS;

  // Slide filenames are recorded at publish time so the public file route can validate against a
  // known list instead of ever joining a caller-supplied path onto the output root.
  const dirFiles = fs.readdirSync(jobDir);
  const slideFiles = dirFiles.filter((f) => /^slide_\d{2}\.png$/.test(f)).sort();
  const pdfFile = dirFiles.find((f) => /^carousel-.+\.pdf$/.test(f)) || null;

  // Slide headlines captured at publish time so the public landing page can list what the guide
  // actually covers. Read from the job record, which only exists in memory — a guide published
  // after a bridge restart has no headlines available and the page falls back to generic value
  // points rather than showing an empty section.
  const topics = Array.isArray(job?.slides)
    ? job.slides.map((sl) => String(sl.headline || '').trim()).filter(Boolean).slice(0, 6)
    : [];

  // Full per-slide copy, so the public landing page can render the guide's REAL content as an
  // editorial article rather than padding a bare headline with invented prose. Everything here was
  // already reviewed and composited onto the slide itself, so publishing it reveals nothing new.
  const sections = Array.isArray(job?.slides)
    ? job.slides.map((sl, i) => ({
        index: i,
        headline: String(sl.headline || '').trim(),
        subhead: String(sl.subhead || '').trim(),
        cards: (Array.isArray(sl.cards) ? sl.cards : [])
          .map((c) => (typeof c === 'string' ? c : String(c?.text || '')).trim())
          .filter(Boolean)
          .slice(0, 4),
      })).filter((sec) => sec.headline || sec.subhead || sec.cards.length)
    : [];

  const record = {
    guideId,
    jobId: String(jobId),
    title: guideTitle,
    topics,
    sections,
    zip: path.basename(zipPath),
    slides: slideFiles,
    pdf: pdfFile,
    createdAt: Date.now(),
    // null = permanent: no ttlHours and no GUIDE_TTL_MS leaves ttl at 0.
    expiresAt: ttl > 0 ? Date.now() + ttl : null,
  };
  published.set(guideId, record);
  saveRegistry();

  res.json({
    ok: true,
    guideId,
    expiresAt: record.expiresAt,
    slides: slideFiles.length,
    downloadPath: `/public/download/${guideId}`,
    downloadUrl: PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/public/download/${guideId}` : null,
  });
});

/** Revoke a published guide immediately. Token-gated — unpublishing is an admin action too. */
app.post('/carousel/unpublish', (req, res) => {
  const guideId = String(req.body?.guideId || '');
  if (!published.has(guideId)) {
    return res.status(404).json({ ok: false, error: 'guide not found' });
  }
  published.delete(guideId);
  saveRegistry();
  res.json({ ok: true, revoked: guideId });
});

/** Published guides, for the dashboard. Token-gated: this is the index the public must not have. */
app.get('/carousel/published', (_req, res) => {
  const now = Date.now();
  res.json({
    ok: true,
    guides: [...published.values()]
      .filter((r) => !isExpired(r, now))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({
        guideId: r.guideId, jobId: r.jobId, title: r.title, slides: r.slides.length,
        hasPdf: Boolean(r.pdf), createdAt: r.createdAt, expiresAt: r.expiresAt,
        downloadPath: `/public/download/${r.guideId}`,
      })),
  });
});

// --- public, unauthenticated read-only surface ------------------------------------------------
//
// Everything below is reachable with no token. Three rules hold it safe:
//   1. Only a 32-hex guideId is accepted, and it must already be in the registry — an unpublished
//      job is not addressable here at all.
//   2. No caller-supplied string is ever joined onto a filesystem path. Filenames come from the
//      registry record captured at publish time and are re-validated before use.
//   3. Expired guides answer 410 and serve nothing.

/**
 * Sliding-window rate limiter for the public download surface.
 *
 * These routes are the only unauthenticated way into this process, and they serve multi-megabyte
 * files off a home connection — an external script looping on a leaked guideId would saturate the
 * uplink long before it exhausted anything else. The budget is per client, generous enough that a
 * human clicking through a guide never notices and a link preview fetching metadata never trips it.
 *
 * In-memory and per-process by design: the bridge is a single instance, so a shared store would add
 * a dependency for no gain. The bucket map is swept on the same timer as everything else, because a
 * limiter that grows one entry per attacker IP is itself the denial of service.
 */

/**
 * Identifies the caller behind the tunnel.
 *
 * Every request arrives from cloudflared on loopback, so the socket address is the same for
 * everyone and useless as a key. Cloudflare overwrites `CF-Connecting-IP` on the way in, which
 * makes it the one forwarded header a client cannot forge here. `X-Forwarded-For` is only consulted
 * as a fallback and only its first hop; the socket address is the last resort, which is also the
 * correct answer for a direct loopback caller.
 */
function clientKey(req) {
  const cf = req.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = req.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function sweepRateBuckets(now = Date.now()) {
  for (const [key, hits] of publicHits) {
    const live = hits.filter((t) => now - t < PUBLIC_RATE_WINDOW_MS);
    if (live.length === 0) publicHits.delete(key);
    else publicHits.set(key, live);
  }
}

app.use('/public', (req, res, next) => {
  const now = Date.now();
  const key = clientKey(req);
  const hits = (publicHits.get(key) || []).filter((t) => now - t < PUBLIC_RATE_WINDOW_MS);

  if (hits.length >= PUBLIC_RATE_MAX) {
    // Retry-After is computed from the OLDEST hit in the window — that is the moment a slot frees.
    const retryAfter = Math.max(1, Math.ceil((PUBLIC_RATE_WINDOW_MS - (now - hits[0])) / 1000));
    publicHits.set(key, hits);
    res.setHeader('Retry-After', String(retryAfter));
    res.setHeader('X-RateLimit-Limit', String(PUBLIC_RATE_MAX));
    res.setHeader('X-RateLimit-Remaining', '0');
    console.warn(`[carousel-bridge] rate limited ${key} on ${req.path}`);
    return res.status(429).json({ ok: false, error: 'too many requests', retryAfter });
  }

  hits.push(now);
  publicHits.set(key, hits);
  res.setHeader('X-RateLimit-Limit', String(PUBLIC_RATE_MAX));
  res.setHeader('X-RateLimit-Remaining', String(PUBLIC_RATE_MAX - hits.length));
  next();
});

const GUIDE_ID_RE = /^[a-f0-9]{32}$/;

/** Resolves a guide, or writes the correct error response and returns null. */
function resolveGuide(req, res) {
  const guideId = String(req.params.guideId || '');
  if (!GUIDE_ID_RE.test(guideId)) {
    res.status(400).json({ ok: false, error: 'malformed guide id' });
    return null;
  }
  const rec = published.get(guideId);
  // Unknown and expired answer distinctly: a subscriber whose link aged out deserves to be told it
  // expired rather than that it never existed.
  if (!rec) {
    res.status(404).json({ ok: false, error: 'guide not found' });
    return null;
  }
  if (isExpired(rec)) {
    published.delete(guideId);
    saveRegistry();
    res.status(410).json({ ok: false, error: 'guide expired' });
    return null;
  }
  return rec;
}

/** Sends one file from a guide's directory with download headers. */
function sendGuideFile(res, rec, filename, downloadName, disposition = 'attachment') {
  const root = path.resolve(OUTPUT_ROOT, rec.jobId);
  const full = path.resolve(root, filename);
  // Defence in depth: even though `filename` came from the registry, confirm the resolved path is
  // still inside the job directory before opening it.
  if (full !== root && !full.startsWith(root + path.sep)) {
    return res.status(400).json({ ok: false, error: 'invalid path' });
  }
  if (!fs.existsSync(full)) {
    return res.status(404).json({ ok: false, error: 'file is no longer available' });
  }
  // RFC 6266/5987. A header value is Latin-1, so a Hebrew title cannot ride in `filename=` — it
  // silently degrades to dashes. Send an ASCII-folded name for old clients AND `filename*` with the
  // real UTF-8 name percent-encoded, which every current browser prefers.
  const asciiName = downloadName.replace(/[^ -~]/g, '').replace(/[\\"]/g, '').trim()
    || `guide-${rec.guideId.slice(0, 8)}${path.extname(downloadName)}`;
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`
  );
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(full);
}

/** Metadata only — lets the site's /api/download route answer without proxying the bytes. */
app.get('/public/guide/:guideId', (req, res) => {
  const rec = resolveGuide(req, res);
  if (!rec) return;
  res.json({
    ok: true,
    guideId: rec.guideId,
    title: rec.title,
    slides: rec.slides.length,
    hasPdf: Boolean(rec.pdf),
    topics: rec.topics || [],
    sections: rec.sections || [],
    createdAt: rec.createdAt,
    expiresAt: rec.expiresAt || null,
    zipPath: `/public/download/${rec.guideId}`,
  });
});

/** The ZIP bundle — the main public artefact. */
app.get('/public/download/:guideId', (req, res) => {
  const rec = resolveGuide(req, res);
  if (!rec) return;
  const safeTitle = (rec.title || 'guide').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 60) || 'guide';
  sendGuideFile(res, rec, rec.zip, `${safeTitle}-${rec.guideId.slice(0, 8)}.zip`);
});

/** The LinkedIn document PDF, when the job produced one. */
app.get('/public/download/:guideId/pdf', (req, res) => {
  const rec = resolveGuide(req, res);
  if (!rec) return;
  if (!rec.pdf) return res.status(404).json({ ok: false, error: 'this guide has no PDF' });
  sendGuideFile(res, rec, rec.pdf, `${rec.guideId.slice(0, 8)}.pdf`);
});

/** One slide by 1-based position. An index, never a filename — the caller never names a path. */
app.get('/public/download/:guideId/slide/:n', (req, res) => {
  const rec = resolveGuide(req, res);
  if (!rec) return;
  const n = Number(req.params.n);
  if (!Number.isInteger(n) || n < 1 || n > rec.slides.length) {
    return res.status(404).json({ ok: false, error: `slide out of range (1-${rec.slides.length})` });
  }
  const filename = rec.slides[n - 1];
  if (!/^slide_\d{2}\.png$/.test(filename)) {
    return res.status(500).json({ ok: false, error: 'corrupt registry entry' });
  }
  // `inline`, not `attachment`: this route feeds the <img> on the public landing page. Desktop
  // browsers ignore Content-Disposition on a subresource, but in-app webviews (Instagram's
  // especially — the main referrer for these links) are not reliable about that.
  sendGuideFile(res, rec, filename, `slide-${String(n).padStart(2, '0')}.png`, 'inline');
});

app.use('/carousel/file', express.static(OUTPUT_ROOT, { maxAge: '1h' }));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[carousel-bridge] listening on http://127.0.0.1:${PORT}`);
  console.log(`[carousel-bridge] site=${SITE_ORIGIN} adminSecret=${ADMIN_SECRET ? 'set' : 'MISSING'}`);
  if (!fs.existsSync(RENDER_SCRIPT)) console.warn(`[carousel-bridge] WARNING: ${RENDER_SCRIPT} not found`);
});
