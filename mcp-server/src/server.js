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
