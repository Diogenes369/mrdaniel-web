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
const COMPOSE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'compose_slide.py');

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

async function importSource(url) {
  // Instagram first: the generic og:/readability extractor cannot see past the login wall, so the
  // official oEmbed endpoint is the only route that returns a caption.
  if (isInstagramUrl(url)) {
    const viaOEmbed = await fetchInstagramOEmbed(url);
    if (viaOEmbed) return viaOEmbed;
  }

  const { imported } = await callSite('import-url', { url });
  const title = String(imported?.title || '').trim();
  const body = String(imported?.body || '').trim();
  if (body.length < 60 && title.length < 10) {
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

RESERVED ZONES — absolute:
Inside every card, confine the illustration to the UPPER 55% and leave the LOWER 45% visibly empty
— plain paper ground, no linework, no texture, no character overlapping it. Text is composited into
that empty region. A card whose drawing fills its whole interior is wrong. Keep the top ~22% header
band and the footer banner interior completely clear for the same reason.`;

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
  'Inside each card confine the drawing to its upper 55% and leave the lower 45% as empty paper for text.',
].join(' ');

const ART_DIRECTION_PROMPT = (article, slideCount, override, referencePath) => `
You are the art director for a Hebrew Instagram infographic carousel about this news story.

TITLE: ${article.title}
SOURCE: ${article.source}
TOPIC: ${article.topic}
ARTICLE: ${String(article.articleText || '').slice(0, 2500)}

${METAPHOR_RULES}

${DESIGN_SYSTEM}

Plan ${slideCount} slide(s), 9:16 vertical, as one coherent series that walks the reader through the
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
For each slide, "scene" must be a complete, self-contained image prompt that names the concrete
drawn objects (which robot, doing what, holding what, next to which gauge/box/arrow), the card
count and their arrangement, where the numerals sit, and the footer banner colour. Restate the
"no lettering, numerals only" rule inside every scene.

Return ONLY valid JSON, no prose:
{"concept":"one sentence naming the story's core subject and the visual metaphor you mapped it to",
 "palette":["#F8F6EF","#1A1A1A","#E85A2A","#2E9E8F"],
 "typography":"one phrase","layout":"one phrase",
 "textColor":"#1A1A1A",
 "slides":[${Array.from({ length: slideCount }, (_, i) => `{"index":${i},"scene":"detailed drawn-imagery prompt for slide ${i + 1}, no lettering"}`).join(',')}]}
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
  // Defensive: runJob creates this, but generateFrame is the only thing that depends on it
  // existing, and a missing directory would surface as the same opaque "no usable frame".
  fs.mkdirSync(jobDir, { recursive: true });

  const prompt = [
    `Generate ONE image and save it to ${outPath.replace(/\\/g, '/')}.`,
    `Format: 9:16 vertical.`,
    FRAME_STYLE,
    `Palette for this set: ${(palette || []).join(', ')}.`,
    ...(referencePath
      ? [`Match the design language of the reference image at ${referencePath.replace(/\\/g, '/')} — its palette, spacing rhythm and structural framing. Do not copy its subject matter.`]
      : []),
    `Scene: ${scene}`,
    `ABSOLUTE REQUIREMENT: draw NO letters, NO words and NO numerals or digits anywhere, plus no logos or watermarks. All type and all numbers are composited afterwards — anything you draw appears twice.`,
    `Leave the top ~22% band and the footer banner interior completely clear, and inside every card leave the lower 45% as empty paper — Hebrew is composited into those zones.`,
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
    const verdict = extractJson(raw);
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
3. NATURAL HEBREW. Idiomatic and readable, not a literal word-for-word calque. Technical terms may
   stay in Latin script inside a Hebrew sentence. No markdown, no asterisks.
4. Each slide is one discrete step or idea from the source, in the source's original order.

Return ONLY valid JSON, no prose:
{"title":"Hebrew headline for the whole set",
 "slides":[{"headline":"short Hebrew headline","cards":["one or two short Hebrew lines"],"footer":"short Hebrew takeaway"}],
 "caption":"full Hebrew caption, unbranded, ready to post",
 "hashtags":["#tag","#tag","#tag"],
 "removed":["what branding you stripped, for audit"]}`;

async function rebrandSource(sourceText, sourceTitle, slideCount) {
  const prompt = [
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
  const out = extractJson(raw);
  if (!Array.isArray(out.slides) || out.slides.length === 0) {
    throw new Error('rebrand returned no slides');
  }
  return {
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
    job.rebrand = { removed: rebrand.removed, sourceChars: article.articleText.length, title: rebrand.title };
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
    const frame = await generateFrame(jobDir, i, plan.scene, job.plan.palette, referencePath);

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
      font: job.input.font, palette: job.input.palette,
    });

    // Vision QA, with one corrective re-composite. Overflow/overlap are the failures a tighter
    // fit can actually fix, so only those trigger a retry.
    let qa = job.input.skipQa ? { pass: true, skipped: true } : await visionQa(slide);
    if (!qa.pass && (qa.overflow || qa.overlap)) {
      job.qaRetries = (job.qaRetries || 0) + 1;
      slide = await composeSlide(frame, jobDir, i, content, {
        font: job.input.font, palette: job.input.palette, fontScale: 0.82,
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
      qa,
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
    instagramOEmbed: Boolean(process.env.INSTAGRAM_OEMBED_TOKEN),
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
    deck: job.deck || [],
    rebrand: job.rebrand || null,
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

app.use('/carousel/file', express.static(OUTPUT_ROOT, { maxAge: '1h' }));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[carousel-bridge] listening on http://127.0.0.1:${PORT}`);
  console.log(`[carousel-bridge] site=${SITE_ORIGIN} adminSecret=${ADMIN_SECRET ? 'set' : 'MISSING'}`);
  if (!fs.existsSync(RENDER_SCRIPT)) console.warn(`[carousel-bridge] WARNING: ${RENDER_SCRIPT} not found`);
});
