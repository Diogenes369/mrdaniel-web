import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './env.js';
import { resolveInside } from './workspace.js';

/**
 * Figma REST — the READ half of the Figma integration.
 *
 * The REST API cannot mutate a node. Its only writes are comments, webhooks, dev resources and
 * (Enterprise-only) variables; there is no endpoint that sets `characters` on a text node or swaps
 * an image fill. Those live in the Plugin API, which runs inside the desktop app — see
 * `figma-bridge.js` and `figma-plugin/`. So everything here reads a file, resolves node ids, or
 * renders a node to PNG/SVG for the video pipeline.
 *
 * Auth is a personal access token sent as `X-Figma-Token`.
 */

const API = 'https://api.figma.com/v1';

function requireToken() {
  if (!config.figma.token) {
    throw new Error(
      'no Figma token — create one at figma.com/developers/api#access-tokens (scopes: file_content:read, file_dev_resources:read) and set FIGMA_TOKEN in mcp-server/.env'
    );
  }
  return config.figma.token;
}

async function figmaFetch(pathname, { timeoutMs = 30000 } = {}) {
  const token = requireToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${pathname}`, { headers: { 'X-Figma-Token': token } });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // Figma returns JSON for every documented error; a non-JSON body means a proxy or an outage
    }
    if (!res.ok) {
      const detail = json?.err ?? json?.message ?? text.slice(0, 200);
      if (res.status === 403) throw new Error(`figma 403: ${detail} — the token is invalid, expired, or missing the required scope`);
      if (res.status === 404) throw new Error(`figma 404: ${detail} — wrong file key, or the token's account cannot see that file`);
      if (res.status === 429) throw new Error(`figma 429: rate limited — back off and retry`);
      throw new Error(`figma ${res.status}: ${detail}`);
    }
    return json;
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`figma ${pathname} timed out after ${timeoutMs}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Accepts a file key, or any Figma URL, and returns `{ fileKey, nodeId }`.
 *
 * URLs carry the node id dash-separated (`node-id=12-345`) while every API endpoint wants it
 * colon-separated (`12:345`). Getting this wrong is the single most common cause of an empty
 * `nodes` object coming back from a request that otherwise looks fine, so it is normalised here.
 */
export function parseFigmaTarget(input) {
  const raw = (input ?? '').trim();
  if (!raw) throw new Error('a Figma file key or URL is required');
  if (!/^https?:\/\//i.test(raw)) return { fileKey: raw.replace(/^\/+|\/+$/g, ''), nodeId: null };

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`not a valid Figma URL: ${raw.slice(0, 120)}`);
  }
  // /file/KEY/name, /design/KEY/name, /board/KEY/name, /proto/KEY/name
  const match = url.pathname.match(/\/(?:file|design|board|proto|slides)\/([A-Za-z0-9]+)/);
  if (!match) throw new Error(`could not find a file key in ${raw.slice(0, 120)} — expected a /design/<key>/… or /file/<key>/… URL`);
  const nodeParam = url.searchParams.get('node-id');
  return { fileKey: match[1], nodeId: nodeParam ? normalizeNodeId(nodeParam) : null };
}

/** `12-345` (URL form) and `12:345` (API form) both normalise to `12:345`. */
export function normalizeNodeId(id) {
  const trimmed = String(id ?? '').trim();
  if (!trimmed) throw new Error('empty node id');
  return trimmed.includes(':') ? trimmed : trimmed.replace(/-/g, ':');
}

/** Which file to act on: an explicit argument, else FIGMA_FILE_KEY. */
function resolveFile(fileOrUrl) {
  if (fileOrUrl) return parseFigmaTarget(fileOrUrl);
  if (config.figma.fileKey) return parseFigmaTarget(config.figma.fileKey);
  throw new Error('no file — pass a Figma URL or file key, or set FIGMA_FILE_KEY in mcp-server/.env');
}

/** The token's own account. The cheapest call that proves the token works. */
export async function figmaWhoami() {
  const me = await figmaFetch('/me', { timeoutMs: 10000 });
  return { ok: true, id: me.id, email: me.email, handle: me.handle };
}

/**
 * A node tree, flattened to what a content pipeline actually needs: ids, names, types, and the
 * current text of every TEXT node. The full Figma document JSON is enormous (a real file is
 * megabytes) and is never worth handing to a model, so it is summarised rather than returned.
 *
 * `depth` is passed to Figma so the traversal is cut server-side.
 */
export async function figmaReadFile({ file, nodeId, depth = 4 } = {}) {
  const target = resolveFile(file);
  const wanted = nodeId ? normalizeNodeId(nodeId) : target.nodeId;

  let root;
  let fileMeta;
  if (wanted) {
    const res = await figmaFetch(`/files/${target.fileKey}/nodes?ids=${encodeURIComponent(wanted)}&depth=${depth}`);
    const entry = res.nodes?.[wanted];
    if (!entry) {
      throw new Error(`node ${wanted} not found in ${target.fileKey} — check the node-id (URL form 12-345 becomes 12:345)`);
    }
    root = entry.document;
    fileMeta = { name: res.name, lastModified: res.lastModified };
  } else {
    const res = await figmaFetch(`/files/${target.fileKey}?depth=${depth}`);
    root = res.document;
    fileMeta = { name: res.name, lastModified: res.lastModified, version: res.version };
  }

  const nodes = [];
  const textNodes = [];
  const imageNodes = [];
  walk(root, 0, (node, level) => {
    nodes.push({ id: node.id, name: node.name, type: node.type, depth: level });
    if (node.type === 'TEXT') {
      textNodes.push({ id: node.id, name: node.name, characters: node.characters ?? '' });
    }
    if (hasImageFill(node)) {
      imageNodes.push({ id: node.id, name: node.name, type: node.type });
    }
  });

  return {
    fileKey: target.fileKey,
    ...fileMeta,
    root: { id: root.id, name: root.name, type: root.type },
    counts: { nodes: nodes.length, text: textNodes.length, imageFills: imageNodes.length },
    textNodes,
    imageNodes,
    nodes: nodes.slice(0, 400),
    truncated: nodes.length > 400,
  };
}

function walk(node, level, visit) {
  if (!node) return;
  visit(node, level);
  for (const child of node.children ?? []) walk(child, level + 1, visit);
}

function hasImageFill(node) {
  return (node.fills ?? []).some((f) => f.type === 'IMAGE');
}

/**
 * Render nodes to PNG/SVG/JPG/PDF and download them into the workspace.
 *
 * Two round trips by design: `/v1/images` renders and returns S3 URLs that expire, which are then
 * fetched. Returning the URLs alone would hand the caller links that die before the video pipeline
 * reads them, so the bytes land on disk here.
 */
export async function figmaExport({ file, nodeIds, format = 'png', scale = 2, outDir = 'video-projects/_figma-assets' } = {}) {
  const target = resolveFile(file);
  const ids = (Array.isArray(nodeIds) ? nodeIds : [nodeIds])
    .filter(Boolean)
    .map(normalizeNodeId);
  if (!ids.length) {
    if (!target.nodeId) throw new Error('nodeIds is required (or pass a Figma URL containing node-id=…)');
    ids.push(target.nodeId);
  }
  if (format === 'svg' && scale !== 1) scale = 1; // SVG is resolution-independent; Figma rejects a scale

  const query = new URLSearchParams({ ids: ids.join(','), format, scale: String(scale) });
  const res = await figmaFetch(`/images/${target.fileKey}?${query}`, { timeoutMs: 120000 });
  if (res.err) throw new Error(`figma render failed: ${res.err}`);

  // resolveInside keeps the download inside the workspace — a caller cannot aim it at C:\Windows.
  const { target: dir, relative: dirRel } = resolveInside(outDir);
  await fs.mkdir(dir, { recursive: true });

  const assets = [];
  for (const id of ids) {
    const url = res.images?.[id];
    if (!url) {
      // Figma returns a null URL for a node it rendered as empty — usually a hidden layer
      assets.push({ nodeId: id, ok: false, error: 'figma returned no image for this node (hidden layer, or zero-size frame?)' });
      continue;
    }
    const name = `${id.replace(/:/g, '-')}.${format}`;
    try {
      const bytes = await downloadTo(url, path.join(dir, name));
      assets.push({ nodeId: id, ok: true, path: `${dirRel.replace(/\\/g, '/')}/${name}`, bytes });
    } catch (err) {
      assets.push({ nodeId: id, ok: false, error: String(err?.message ?? err) });
    }
  }

  return { fileKey: target.fileKey, format, scale, outDir, assets, ok: assets.every((a) => a.ok) };
}

async function downloadTo(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} from the render URL`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) throw new Error('render URL returned 0 bytes');
  await fs.writeFile(dest, buffer);
  return buffer.length;
}

/**
 * Design tokens lifted from a file's published styles: the palette and the type ramp.
 *
 * This is what keeps generated output on-brand without anybody re-typing hex codes — the video and
 * carousel renderers read these instead of hardcoding colours.
 */
export async function figmaReadStyles({ file } = {}) {
  const target = resolveFile(file);
  const res = await figmaFetch(`/files/${target.fileKey}?depth=2`);
  const styles = Object.entries(res.styles ?? {}).map(([id, s]) => ({ id, name: s.name, type: s.styleType, description: s.description || undefined }));
  return {
    fileKey: target.fileKey,
    name: res.name,
    colors: styles.filter((s) => s.type === 'FILL'),
    text: styles.filter((s) => s.type === 'TEXT'),
    effects: styles.filter((s) => s.type === 'EFFECT'),
    grids: styles.filter((s) => s.type === 'GRID'),
  };
}

/** Published components and their variant sets — the raw material for templated slides. */
export async function figmaReadComponents({ file } = {}) {
  const target = resolveFile(file);
  const [components, sets] = await Promise.all([
    figmaFetch(`/files/${target.fileKey}/components`).catch((e) => ({ error: String(e.message) })),
    figmaFetch(`/files/${target.fileKey}/component_sets`).catch((e) => ({ error: String(e.message) })),
  ]);
  const shape = (r) =>
    (r.meta?.components ?? r.meta?.component_sets ?? []).map((c) => ({
      key: c.key,
      nodeId: c.node_id,
      name: c.name,
      description: c.description || undefined,
    }));
  return {
    fileKey: target.fileKey,
    components: components.error ? [] : shape(components),
    componentSets: sets.error ? [] : shape(sets),
    ...(components.error ? { componentsError: components.error } : {}),
    ...(sets.error ? { componentSetsError: sets.error } : {}),
  };
}
