#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { config, REPO_ROOT } from './env.js';
import { getDb, toList, safeKey } from './db.js';
import { readFile, writeFile, listDir } from './workspace.js';
import { businessMetrics, generateDraft, checkHealth } from './tasks.js';
import { ollamaHealth, ollamaGenerate, ollamaJson, ollamaTranslate } from './ollama.js';
import { figmaWhoami, figmaReadFile, figmaExport, figmaReadStyles, figmaReadComponents } from './figma.js';
import { figmaBridgeStatus } from './figma-bridge.js';
import { injectText, swapImage, exportViaPlugin, setVariant, setLayerName, renderSlides } from './figma-inject.js';
import { CAPTION_RULES, captionSystemPrompt, checkCaption } from './copy-rules.js';

/**
 * mrdaniel.co.il ops over MCP (stdio). Register in Claude Desktop / Claude Code — see README.md.
 *
 * stdout is the JSON-RPC channel, so nothing here may console.log; diagnostics go to stderr.
 *
 * Write tools are scoped on purpose. The queue tools can add a draft and move an item between
 * review states, but nothing here publishes to a social network or emails a lead: those stay one
 * human click away in the dashboard.
 */

const server = new McpServer({ name: 'mrdaniel-ops', version: '1.0.0' });

const json = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const fail = (message) => ({ isError: true, content: [{ type: 'text', text: message }] });
const guard = (fn) => async (args) => {
  try {
    return await fn(args ?? {});
  } catch (err) {
    return fail(String(err?.message ?? err));
  }
};

/** Leads carry personal data. Masked unless the caller explicitly asks for the raw contact. */
function maskLead(lead, includePii) {
  if (includePii) return lead;
  const mask = (s, keep) => (typeof s === 'string' && s.length > keep ? `${s.slice(0, keep)}***` : s);
  return { ...lead, email: mask(lead.email, 2), phone: mask(lead.phone, 3), name: mask(lead.name, 2) };
}

// ─── files ──────────────────────────────────────────────────────────────────────────────────

server.registerTool(
  'fs_list',
  {
    title: 'List directory',
    description: `List a directory inside the workspace (${config.workspaceRoot}). Secrets, .git and node_modules are hidden.`,
    inputSchema: { path: z.string().default('.').describe('Path relative to the workspace root') },
    annotations: { readOnlyHint: true },
  },
  guard(async ({ path: p }) => json(await listDir(p)))
);

server.registerTool(
  'fs_read',
  {
    title: 'Read file',
    description: 'Read a UTF-8 text file inside the workspace (512 KB cap). .env files and credentials are refused.',
    inputSchema: { path: z.string().describe('Path relative to the workspace root') },
    annotations: { readOnlyHint: true },
  },
  guard(async ({ path: p }) => {
    const f = await readFile(p);
    return { content: [{ type: 'text', text: `// ${f.path} (${f.bytes} bytes)\n${f.content}` }] };
  })
);

server.registerTool(
  'fs_write',
  {
    title: 'Write file',
    description: 'Create, overwrite or append to a text file inside the workspace (1 MB cap). Use for reports, notes and drafts.',
    inputSchema: {
      path: z.string().describe('Path relative to the workspace root'),
      content: z.string(),
      append: z.boolean().default(false),
    },
    annotations: { destructiveHint: true },
  },
  guard(async ({ path: p, content, append }) => json(await writeFile(p, content, { append })))
);

// ─── metrics & health ───────────────────────────────────────────────────────────────────────

server.registerTool(
  'business_metrics',
  {
    title: 'Business metrics',
    description: 'Traffic, conversions, lead pipeline, publishing record and approval backlog for the last N days. Counts only, no personal data.',
    inputSchema: { days: z.number().int().min(1).max(90).default(7) },
    annotations: { readOnlyHint: true },
  },
  guard(async ({ days }) => json(await businessMetrics({ days })))
);

server.registerTool(
  'health_check',
  {
    title: 'Health check',
    description: 'Probes the site, /api/health, the dashboard, the news feed and the authenticated agent API. A 401 on "agent" means the admin secret was rotated.',
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  guard(async () => json(await checkHealth()))
);

// ─── Firebase RTDB ──────────────────────────────────────────────────────────────────────────

const QUEUE_STATUS = z.enum(['pending_approval', 'approved', 'rejected', 'handed-off']);

server.registerTool(
  'queue_list',
  {
    title: 'List agent queue',
    description: 'Items in agent_queue (content drafts and engagement drafts), newest first.',
    inputSchema: { status: QUEUE_STATUS.optional(), limit: z.number().int().min(1).max(200).default(20) },
    annotations: { readOnlyHint: true },
  },
  guard(async ({ status, limit }) => {
    const db = await getDb();
    const rows = toList(await db.readLast('agent_queue', 500)).filter((r) => !status || r.status === status);
    return json(rows.slice(0, limit));
  })
);

server.registerTool(
  'queue_set_status',
  {
    title: 'Set queue item status',
    description: 'Move an agent_queue item between review states. Does NOT publish anything.',
    inputSchema: { id: z.string().min(1), status: QUEUE_STATUS },
    annotations: { destructiveHint: false, idempotentHint: true },
  },
  guard(async ({ id, status }) => {
    const db = await getDb();
    const key = safeKey(id);
    if (!(await db.read(`agent_queue/${key}`))) return fail(`no agent_queue item ${key}`);
    await db.update(`agent_queue/${key}`, { status, reviewedAt: Date.now(), reviewedBy: 'mcp' });
    return json({ id: key, status });
  })
);

server.registerTool(
  'content_generate_draft',
  {
    title: 'Generate content draft',
    description:
      'Generate one post through the live site engine (same prompts and voice rules as the dashboard). Lands in agent_queue as pending_approval; never auto-publishes. Omit topic to use today\'s weekly_plan topic or the rotation.',
    inputSchema: {
      topic: z.string().optional(),
      platform: z.enum(['linkedin', 'instagram', 'tiktok']).default('linkedin'),
      format: z.enum(['post', 'carousel', 'video-script']).default('post'),
    },
    annotations: { openWorldHint: true },
  },
  guard(async (args) => json(await generateDraft(args)))
);

server.registerTool(
  'published_posts_list',
  {
    title: 'List published posts',
    description: 'The auto-publisher history (published_posts), newest first.',
    inputSchema: { limit: z.number().int().min(1).max(200).default(20), status: z.enum(['success', 'failed', 'pending_approval']).optional() },
    annotations: { readOnlyHint: true },
  },
  guard(async ({ limit, status }) => {
    const db = await getDb();
    const rows = toList(await db.readLast('published_posts', 300))
      .filter((r) => !status || r.status === status)
      .map(({ storySlides, ...rest }) => rest);
    return json(rows.slice(0, limit));
  })
);

server.registerTool(
  'leads_list',
  {
    title: 'List leads',
    description: 'Site leads, newest first. Contact details are masked unless includePii is true. Needs FIREBASE_SERVICE_ACCOUNT (the leads path is locked to admins).',
    inputSchema: {
      limit: z.number().int().min(1).max(200).default(20),
      status: z.enum(['new', 'contacted', 'qualified', 'won', 'lost']).optional(),
      includePii: z.boolean().default(false),
    },
    annotations: { readOnlyHint: true },
  },
  guard(async ({ limit, status, includePii }) => {
    const db = await getDb();
    const rows = toList(await db.readLast('leads', 1000)).filter((l) => !status || (l.status ?? 'new') === status);
    return json(rows.slice(0, limit).map((l) => maskLead(l, includePii)));
  })
);

server.registerTool(
  'lead_set_status',
  {
    title: 'Set lead status',
    description: 'Move a lead through the pipeline (new → contacted → qualified → won/lost). Needs FIREBASE_SERVICE_ACCOUNT.',
    inputSchema: { id: z.string().min(1), status: z.enum(['new', 'contacted', 'qualified', 'won', 'lost']) },
    annotations: { idempotentHint: true },
  },
  guard(async ({ id, status }) => {
    const db = await getDb();
    const key = safeKey(id);
    if (!(await db.read(`leads/${key}`))) return fail(`no lead ${key}`);
    await db.update(`leads/${key}`, { status });
    return json({ id: key, status });
  })
);

// ─── Ollama (local models) ──────────────────────────────────────────────────────────────────

server.registerTool(
  'ollama_models',
  {
    title: 'Ollama status',
    description: 'Version and installed models of the local Ollama instance. Use this first — every other ollama_* tool fails the same way if it is not running.',
    annotations: { readOnlyHint: true },
  },
  guard(async () => json(await ollamaHealth()))
);

server.registerTool(
  'ollama_generate',
  {
    title: 'Generate text locally',
    description:
      'Free-text generation on the local model. Nothing leaves the machine and it costs no Gemini quota, so use it for drafting, rewriting and dry-running a prompt. Content meant for publication should still go through content_generate_draft, which carries the live voice rules.',
    inputSchema: {
      prompt: z.string().min(1),
      system: z.string().optional().describe('System instruction — voice, role, constraints'),
      model: z.string().optional().describe('Defaults to OLLAMA_MODEL, else the first installed model'),
      temperature: z.number().min(0).max(2).default(0.7),
      maxTokens: z.number().int().min(16).max(8192).optional(),
    },
    annotations: { openWorldHint: false },
  },
  guard(async (args) => json(await ollamaGenerate(args)))
);

server.registerTool(
  'ollama_json',
  {
    title: 'Generate structured JSON locally',
    description:
      'Generation constrained to a JSON Schema — the sampler is restricted to the schema, so the result parses. Use for turning loose text into slide decks, caption sets or any typed payload.',
    inputSchema: {
      prompt: z.string().min(1),
      schema: z.record(z.string(), z.unknown()).describe('A JSON Schema object, e.g. { "type": "object", "properties": { … }, "required": [ … ] }'),
      system: z.string().optional(),
      model: z.string().optional(),
      temperature: z.number().min(0).max(2).default(0.2),
    },
    annotations: { openWorldHint: false },
  },
  guard(async (args) => json(await ollamaJson(args)))
);

server.registerTool(
  'ollama_translate',
  {
    title: 'Translate locally',
    description: 'Translate text, preserving line breaks, emoji, @handles and #hashtags. Defaults to Hebrew, the house language.',
    inputSchema: {
      text: z.string().min(1),
      to: z.string().default('Hebrew'),
      from: z.string().optional().describe('Omit to let the model detect it'),
      model: z.string().optional(),
    },
    annotations: { openWorldHint: false },
  },
  guard(async (args) => json(await ollamaTranslate(args)))
);

// ─── copy rules ─────────────────────────────────────────────────────────────────────────────

server.registerTool(
  'caption_check',
  {
    title: 'Check a caption',
    description:
      'Score a caption against the short-form rules: max 3 sentences, 45 words, one concrete CTA, no URLs, no AI clichés. Returns findings, not a verdict — run it on anything written for Instagram before it reaches the queue.',
    inputSchema: {
      text: z.string().min(1),
      platform: z.enum(['instagram', 'tiktok', 'linkedin']).default('instagram'),
    },
    annotations: { readOnlyHint: true },
  },
  guard(async ({ text, platform }) => json(checkCaption(text, { platform })))
);

server.registerTool(
  'caption_write',
  {
    title: 'Write a short caption locally',
    description:
      'Draft an Instagram/TikTok caption on the local model under the short-form rules, then check it and retry once if it breaks them. The heavy content belongs in the carousel slides, not here.',
    inputSchema: {
      topic: z.string().min(1).describe('What the post is about, or the carousel hook'),
      platform: z.enum(['instagram', 'tiktok']).default('instagram'),
      hasCarousel: z.boolean().default(true),
      model: z.string().optional(),
    },
    annotations: { openWorldHint: false },
  },
  guard(async ({ topic, platform, hasCarousel, model }) => {
    const system = captionSystemPrompt({ platform, hasCarousel });
    const attempts = [];
    let best = null;
    // Two passes at most: the second one is handed its own violations, which fixes length far more
    // reliably than re-rolling the same prompt at a higher temperature.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const prompt =
        attempt === 0
          ? `נושא: ${topic}\n\nכתוב את הכיתוב בעברית. החזר את הכיתוב בלבד.`
          : `נושא: ${topic}\n\nהכיתוב הקודם שלך היה:\n"${best.text}"\n\nהוא נפסל: ${best.check.issues.join('; ')}.\nכתוב אותו מחדש בעברית כך שיעמוד בכללים. החזר את הכיתוב בלבד.`;
      const result = await ollamaGenerate({ prompt, system, model, temperature: attempt === 0 ? 0.8 : 0.5, maxTokens: 220 });
      const text = result.text.trim().replace(/^["']|["']$/g, '');
      const check = checkCaption(text, { platform });
      attempts.push({ attempt: attempt + 1, text, issues: check.issues });
      best = { text, check, model: result.model };
      if (check.ok) break;
    }
    return json({ ok: best.check.ok, caption: best.text, stats: best.check.stats, issues: best.check.issues, rules: CAPTION_RULES, attempts });
  })
);

// ─── Figma: read & export (REST) ────────────────────────────────────────────────────────────

server.registerTool(
  'figma_whoami',
  {
    title: 'Figma token check',
    description: 'The account behind FIGMA_TOKEN. The cheapest call that proves the token works — run it before debugging anything else Figma.',
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  guard(async () => json(await figmaWhoami()))
);

server.registerTool(
  'figma_read_file',
  {
    title: 'Read a Figma file or node',
    description:
      'Flattened node tree: ids, names, types, and the current copy of every TEXT layer. Pass a Figma URL (node-id and all) or a file key. The full document JSON is megabytes, so this returns a summary.',
    inputSchema: {
      file: z.string().optional().describe('Figma URL or file key. Defaults to FIGMA_FILE_KEY'),
      nodeId: z.string().optional().describe('Limit to one node. URL form 12-345 and API form 12:345 both work'),
      depth: z.number().int().min(1).max(10).default(4),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  guard(async (args) => json(await figmaReadFile(args)))
);

server.registerTool(
  'figma_export',
  {
    title: 'Export Figma nodes',
    description:
      'Render nodes to PNG/SVG/JPG and download them into the workspace, ready for the video pipeline. Renders what Figma has saved — for a frame you just injected into, use figma_plugin_export instead.',
    inputSchema: {
      nodeIds: z.array(z.string()).optional().describe('Node ids. Omit if the file URL carries node-id='),
      file: z.string().optional(),
      format: z.enum(['png', 'svg', 'jpg', 'pdf']).default('png'),
      scale: z.number().min(0.01).max(4).default(2).describe('Ignored for svg'),
      outDir: z.string().default('video-projects/_figma-assets').describe('Workspace-relative'),
    },
    annotations: { openWorldHint: true },
  },
  guard(async (args) => json(await figmaExport(args)))
);

server.registerTool(
  'figma_styles',
  {
    title: 'Figma design tokens',
    description: "A file's published colour, text, effect and grid styles — the brand palette and type ramp, so generated output stops hardcoding hex codes.",
    inputSchema: { file: z.string().optional() },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  guard(async (args) => json(await figmaReadStyles(args)))
);

server.registerTool(
  'figma_components',
  {
    title: 'Figma components',
    description: 'Published components and variant sets in a file — the templates a content run can fill.',
    inputSchema: { file: z.string().optional() },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  guard(async (args) => json(await figmaReadComponents(args)))
);

// ─── Figma: inject & render (plugin bridge) ─────────────────────────────────────────────────

server.registerTool(
  'figma_bridge_status',
  {
    title: 'Figma bridge status',
    description:
      'Is the plugin bridge running, and is the Figma plugin attached to it? Every figma_inject_* tool needs both. Run this first when one of them fails.',
    annotations: { readOnlyHint: true },
  },
  guard(async () => json(await figmaBridgeStatus()))
);

server.registerTool(
  'figma_inject_text',
  {
    title: 'Inject copy into Figma',
    description:
      'Fill a template frame\'s TEXT layers by layer name, e.g. [{ "name": "headline", "text": "…" }]. Matching on names, not node ids, is what lets one template be duplicated per slide. Needs the bridge and the plugin (figma_bridge_status).',
    inputSchema: {
      entries: z.array(z.object({ name: z.string().optional(), nodeId: z.string().optional(), text: z.string() })).min(1),
      rootId: z.string().optional().describe('Frame to search within. Defaults to the current page'),
    },
    annotations: { destructiveHint: true },
  },
  guard(async (args) => json(await injectText(args)))
);

server.registerTool(
  'figma_swap_image',
  {
    title: 'Swap a Figma image fill',
    description: "Replace a node's image fill with a png/jpg/gif from the workspace (4 MB cap, Figma's own limit). The template's crop behaviour is preserved.",
    inputSchema: {
      nodeId: z.string().min(1),
      imagePath: z.string().min(1).describe('Workspace-relative path to the image'),
      scaleMode: z.enum(['FILL', 'FIT', 'CROP', 'TILE']).optional(),
    },
    annotations: { destructiveHint: true },
  },
  guard(async (args) => json(await swapImage(args)))
);

server.registerTool(
  'figma_set_variant',
  {
    title: 'Switch a Figma variant',
    description: 'Set a component instance\'s variant properties, e.g. { "Theme": "Dark", "Size": "Large" }.',
    inputSchema: { nodeId: z.string().min(1), properties: z.record(z.string(), z.string()) },
    annotations: { destructiveHint: true },
  },
  guard(async (args) => json(await setVariant(args)))
);

server.registerTool(
  'figma_set_layer_name',
  {
    title: 'Rename a Figma layer',
    description:
      'Rename a layer and pin the name. Template prep: Figma auto-renames a TEXT layer to its own content on every edit, so a layer must be named for what it IS ("headline", "cta") before figma_inject_text can target it by name on more than one run.',
    inputSchema: { nodeId: z.string().min(1), name: z.string().min(1).describe('What the layer is, not what it says') },
    annotations: { destructiveHint: true },
  },
  guard(async (args) => json(await setLayerName(args)))
);

server.registerTool(
  'figma_plugin_export',
  {
    title: 'Export a Figma node live',
    description:
      'Render a node through the plugin and save it to the workspace. Unlike figma_export this sees unsaved edits, so it is the one to use straight after an injection — REST would still render the template placeholder.',
    inputSchema: {
      nodeId: z.string().min(1),
      format: z.enum(['PNG', 'JPG', 'SVG']).default('PNG'),
      scale: z.number().min(0.5).max(4).default(2),
      outDir: z.string().default('video-projects/_figma-assets'),
      fileName: z.string().optional(),
    },
    annotations: { openWorldHint: false },
  },
  guard(async (args) => json(await exportViaPlugin(args)))
);

server.registerTool(
  'figma_render_slides',
  {
    title: 'Render a carousel from a Figma template',
    description:
      'For each slide: inject its copy into the template frame, then export it. Runs sequentially because every slide mutates the same Figma document. This is the whole pipeline in one call — deck in, PNGs on disk out.',
    inputSchema: {
      rootId: z.string().min(1).describe('The template frame to fill and render'),
      slides: z
        .array(z.object({ name: z.string().optional(), rootId: z.string().optional(), entries: z.array(z.object({ name: z.string().optional(), nodeId: z.string().optional(), text: z.string() })) }))
        .min(1),
      format: z.enum(['PNG', 'JPG']).default('PNG'),
      scale: z.number().min(0.5).max(4).default(2),
      outDir: z.string().default('video-projects/_figma-assets'),
    },
    annotations: { destructiveHint: true },
  },
  guard(async (args) => json(await renderSlides(args)))
);

// ─── resources ──────────────────────────────────────────────────────────────────────────────

server.registerResource(
  'agents-brief',
  'mrdaniel://docs/agents',
  { title: 'AGENTS.md', description: 'Repo brief: architecture, hard constraints, conventions', mimeType: 'text/markdown' },
  async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: await fs.readFile(path.join(REPO_ROOT, 'AGENTS.md'), 'utf8') }] })
);

server.registerResource(
  'metrics-weekly',
  'mrdaniel://metrics/weekly',
  { title: 'Metrics — last 7 days', mimeType: 'application/json' },
  async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(await businessMetrics({ days: 7 }), null, 2) }] })
);

server.registerResource(
  'queue-pending',
  'mrdaniel://queue/pending',
  { title: 'Drafts awaiting approval', mimeType: 'application/json' },
  async (uri) => {
    const db = await getDb();
    const rows = toList(await db.readLast('agent_queue', 500)).filter((r) => r.status === 'pending_approval');
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(rows, null, 2) }] };
  }
);

server.registerResource(
  'agent-log',
  'mrdaniel://agent/log',
  { title: 'Background worker log (tail)', mimeType: 'text/plain' },
  async (uri) => {
    const file = path.join(config.stateDir, 'agent.log');
    const text = await fs.readFile(file, 'utf8').catch(() => '(no log yet — start the worker with `npm run agent`)');
    return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: text.split('\n').slice(-200).join('\n') }] };
  }
);

// ─── prompts ────────────────────────────────────────────────────────────────────────────────

server.registerPrompt(
  'morning_ops_brief',
  { title: 'Morning ops brief', description: 'Health + metrics + backlog → a short prioritized to-do list' },
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Run health_check, business_metrics (7 days) and queue_list (pending_approval). Then give me, in Hebrew, a max-8-line brief: what is broken, which leads are going stale, how many drafts wait for approval, and the 3 things to do first today. No filler.',
        },
      },
    ],
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[mrdaniel-mcp] ready · workspace=${config.workspaceRoot} · adminSecret=${config.adminSecret ? 'set' : 'missing'}`);
