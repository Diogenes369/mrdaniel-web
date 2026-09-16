import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './env.js';

/**
 * Sandboxed file access for the MCP tools.
 *
 * An MCP client is a model acting on this machine, so the boundary is enforced here, not trusted to
 * the prompt: every path is resolved against the workspace root and rejected if it escapes it
 * (`..`, absolute paths, symlink-free prefix check), and secrets are unreadable even inside it.
 * The deny list is the set of things in this repo that hold credentials — `.env*`, the WhatsApp
 * session, service-account JSON, `.vercel` — plus `.git` and `node_modules`, which are never what
 * a business-ops task needs and are huge.
 */

const MAX_READ_BYTES = 512 * 1024;
const MAX_WRITE_BYTES = 1024 * 1024;

const DENY = [
  /(^|[\\/])\.env(\.|$)/i,
  /(^|[\\/])\.vercel([\\/]|$)/i,
  /(^|[\\/])\.git([\\/]|$)/i,
  /(^|[\\/])node_modules([\\/]|$)/i,
  /(^|[\\/])auth_session([\\/]|$)/i,
  /(^|[\\/])\.agent-state[\\/]agent\.lock$/i,
  /service[-_]?account.*\.json$/i,
  /\.(pem|key|p12|pfx)$/i,
];

export function resolveInside(rel) {
  const root = config.workspaceRoot;
  const target = path.resolve(root, String(rel ?? '.'));
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`path escapes the workspace root: ${rel}`);
  }
  if (DENY.some((re) => re.test(relative))) {
    throw new Error(`path is on the deny list (secrets / VCS / dependencies): ${rel}`);
  }
  return { target, relative: relative || '.' };
}

export async function readFile(rel) {
  const { target, relative } = resolveInside(rel);
  const stat = await fs.stat(target);
  if (!stat.isFile()) throw new Error(`not a file: ${relative}`);
  if (stat.size > MAX_READ_BYTES) throw new Error(`file is ${stat.size} bytes; the read cap is ${MAX_READ_BYTES}`);
  return { path: relative, bytes: stat.size, content: await fs.readFile(target, 'utf8') };
}

export async function writeFile(rel, content, { append = false } = {}) {
  const { target, relative } = resolveInside(rel);
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > MAX_WRITE_BYTES) throw new Error(`content is ${bytes} bytes; the write cap is ${MAX_WRITE_BYTES}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (append) await fs.appendFile(target, content, 'utf8');
  else await fs.writeFile(target, content, 'utf8');
  return { path: relative, bytes, mode: append ? 'append' : 'overwrite' };
}

export async function listDir(rel = '.', { limit = 300 } = {}) {
  const { target, relative } = resolveInside(rel);
  const entries = await fs.readdir(target, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const childRel = path.join(relative === '.' ? '' : relative, e.name);
    if (DENY.some((re) => re.test(childRel))) continue;
    out.push({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' });
    if (out.length >= limit) break;
  }
  return { path: relative, entries: out.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1)) };
}
