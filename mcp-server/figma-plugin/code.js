/* eslint-env browser */
/* global figma, __html__ */

/**
 * mrdaniel content bridge — the Figma plugin sandbox.
 *
 * This half has the Figma API but no network. `ui.html` has the network but no Figma API. So the
 * socket lives in the UI iframe and every command arrives here as a postMessage:
 *
 *   bridge :3055  ──ws──▶  ui.html  ──postMessage──▶  code.js (this file)  ──▶  figma.*
 *
 * Load it with Plugins → Development → Import plugin from manifest… → pick manifest.json.
 * The UI window must stay open: closing it kills the socket.
 */

figma.showUI(__html__, { width: 320, height: 200 });

figma.ui.onmessage = async (msg) => {
  if (msg.type !== 'command') return;
  try {
    const data = await run(msg.command, msg.params || {});
    figma.ui.postMessage({ type: 'result', id: msg.id, ok: true, data });
  } catch (err) {
    figma.ui.postMessage({ type: 'result', id: msg.id, ok: false, error: String((err && err.message) || err) });
  }
};

async function run(command, params) {
  switch (command) {
    case 'ping':
      return { pong: true, file: figma.root.name, page: figma.currentPage.name };
    case 'get_document_info':
      return getDocumentInfo();
    case 'get_selection':
      return getSelection();
    case 'get_text_nodes':
      return getTextNodes(params);
    case 'set_text':
      return setText(params);
    case 'set_texts':
      return setTexts(params);
    case 'swap_image':
      return swapImage(params);
    case 'set_variant':
      return setVariant(params);
    case 'export_node':
      return exportNode(params);
    default:
      throw new Error('unknown command: ' + command);
  }
}

// ─── reads ──────────────────────────────────────────────────────────────────────────────────

async function getDocumentInfo() {
  // documentAccess:"dynamic-page" means pages are lazy; anything that walks them must await this.
  await figma.loadAllPagesAsync();
  return {
    name: figma.root.name,
    currentPage: { id: figma.currentPage.id, name: figma.currentPage.name },
    pages: figma.root.children.map((p) => ({ id: p.id, name: p.name, childCount: p.children.length })),
  };
}

function getSelection() {
  return {
    page: figma.currentPage.name,
    nodes: figma.currentPage.selection.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      characters: n.type === 'TEXT' ? n.characters : undefined,
    })),
  };
}

/**
 * Every TEXT node under `nodeId` (or the current page), with its layer name and current copy.
 *
 * The layer name is the contract with the content pipeline: a frame whose layers are named
 * `headline`, `body`, `cta` can be filled by name instead of by fragile node ids that change
 * whenever the template is duplicated.
 */
async function getTextNodes(params) {
  const root = params.nodeId ? await mustGetNode(params.nodeId) : figma.currentPage;
  if (root.type !== 'PAGE' && typeof root.findAllWithCriteria !== 'function') {
    return { root: root.name, textNodes: root.type === 'TEXT' ? [describeText(root)] : [] };
  }
  const found = root.findAllWithCriteria({ types: ['TEXT'] });
  return { root: root.name, textNodes: found.map(describeText) };
}

function describeText(node) {
  return {
    id: node.id,
    name: node.name,
    characters: node.characters,
    fontSize: node.fontSize === figma.mixed ? 'mixed' : node.fontSize,
    width: Math.round(node.width),
    height: Math.round(node.height),
  };
}

// ─── writes ─────────────────────────────────────────────────────────────────────────────────

/**
 * Set one text node's copy.
 *
 * Figma refuses to touch `characters` until every font in the node is loaded, and a node with mixed
 * styling has more than one — hence getRangeAllFontNames rather than a single fontName. This is the
 * step that silently fails in most naive integrations.
 */
async function setText(params) {
  const node = await mustGetNode(params.nodeId);
  if (node.type !== 'TEXT') throw new Error('node ' + params.nodeId + ' is a ' + node.type + ', not TEXT');
  if (typeof params.text !== 'string') throw new Error('text must be a string');

  await loadFontsFor(node);
  const before = node.characters;
  node.characters = params.text;
  if (params.autoResize) node.textAutoResize = params.autoResize; // NONE | HEIGHT | WIDTH_AND_HEIGHT
  return { id: node.id, name: node.name, before: before, after: node.characters };
}

/**
 * Batch fill by layer name — the call the content pipeline actually uses.
 *
 * `entries` is `[{ name | nodeId, text }]`. Names are matched against TEXT layers under `rootId`.
 * A name that matches nothing is reported rather than thrown, so one stale layer name in a template
 * does not discard the other nine correct injections.
 */
async function setTexts(params) {
  const root = params.rootId ? await mustGetNode(params.rootId) : figma.currentPage;
  const entries = params.entries || [];
  if (!entries.length) throw new Error('entries is required: [{ name | nodeId, text }]');

  const byName = new Map();
  if (typeof root.findAllWithCriteria === 'function') {
    for (const node of root.findAllWithCriteria({ types: ['TEXT'] })) {
      if (!byName.has(node.name)) byName.set(node.name, node);
    }
  }

  const applied = [];
  const missing = [];
  for (const entry of entries) {
    const node = entry.nodeId ? await figma.getNodeByIdAsync(entry.nodeId) : byName.get(entry.name);
    if (!node || node.type !== 'TEXT') {
      missing.push(entry.nodeId || entry.name);
      continue;
    }
    await loadFontsFor(node);
    const before = node.characters;
    node.characters = String(entry.text);
    applied.push({ id: node.id, name: node.name, before: before, after: node.characters });
  }
  return { root: root.name, applied: applied, missing: missing, appliedCount: applied.length };
}

async function loadFontsFor(node) {
  const fonts = node.getRangeAllFontNames(0, Math.max(node.characters.length, 1));
  for (const font of fonts) await figma.loadFontAsync(font);
}

/**
 * Replace a node's image fill with new bytes (base64 from the caller).
 *
 * Figma uploads the bytes and hands back a hash; the fill is then rewritten pointing at it. The
 * existing fill's scaleMode and opacity are preserved so a template's crop behaviour survives.
 */
async function swapImage(params) {
  const node = await mustGetNode(params.nodeId);
  if (!('fills' in node)) throw new Error('node ' + params.nodeId + ' (' + node.type + ') cannot have fills');
  if (!params.imageBase64) throw new Error('imageBase64 is required');

  const bytes = base64ToBytes(params.imageBase64);
  const image = figma.createImage(bytes);
  const existing = Array.isArray(node.fills) ? node.fills.find((f) => f.type === 'IMAGE') : null;

  node.fills = [
    {
      type: 'IMAGE',
      imageHash: image.hash,
      scaleMode: params.scaleMode || (existing && existing.scaleMode) || 'FILL',
      opacity: existing && existing.opacity !== undefined ? existing.opacity : 1,
    },
  ];
  const size = await image.getSizeAsync();
  return { id: node.id, name: node.name, imageHash: image.hash, width: size.width, height: size.height };
}

/** Switch a component instance to another variant, e.g. { Size: 'Large', Theme: 'Dark' }. */
async function setVariant(params) {
  const node = await mustGetNode(params.nodeId);
  if (node.type !== 'INSTANCE') throw new Error('node ' + params.nodeId + ' is a ' + node.type + ', not an INSTANCE');
  if (!params.properties || typeof params.properties !== 'object') throw new Error('properties is required, e.g. { "Size": "Large" }');
  node.setProperties(params.properties);
  return { id: node.id, name: node.name, properties: node.componentProperties };
}

/**
 * Render a node to bytes and hand them back base64.
 *
 * This is the same pixels as a REST `/v1/images` export, but it sees unsaved edits — the injection
 * that just happened has not been pushed to Figma's servers yet, so REST would render the old copy.
 */
async function exportNode(params) {
  const node = await mustGetNode(params.nodeId);
  if (typeof node.exportAsync !== 'function') throw new Error('node ' + params.nodeId + ' (' + node.type + ') cannot be exported');
  const format = (params.format || 'PNG').toUpperCase();
  const settings = format === 'SVG' ? { format: 'SVG' } : { format: format, constraint: { type: 'SCALE', value: params.scale || 2 } };
  const bytes = await node.exportAsync(settings);
  return { id: node.id, name: node.name, format: format, bytes: bytes.length, base64: bytesToBase64(bytes) };
}

// ─── helpers ────────────────────────────────────────────────────────────────────────────────

async function mustGetNode(id) {
  if (!id) throw new Error('nodeId is required');
  const node = await figma.getNodeByIdAsync(id);
  if (!node) throw new Error('no node ' + id + ' in this file (is the right file open?)');
  return node;
}

// The plugin sandbox has no atob/btoa and no Buffer, so both directions are done by hand.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(base64) {
  const clean = String(base64).replace(/^data:[^,]+,/, '').replace(/[^A-Za-z0-9+/=]/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((clean.length / 4) * 3 - padding);
  let byte = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const chunk = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) | ((B64.indexOf(clean[i + 2]) & 63) << 6) | (B64.indexOf(clean[i + 3]) & 63);
    bytes[byte++] = (chunk >> 16) & 255;
    if (byte < bytes.length) bytes[byte++] = (chunk >> 8) & 255;
    if (byte < bytes.length) bytes[byte++] = chunk & 255;
  }
  return bytes;
}

function bytesToBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const c = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | (b === undefined ? 0 : b >> 4)];
    out += b === undefined ? '=' : B64[((b & 15) << 2) | (c === undefined ? 0 : c >> 6)];
    out += c === undefined ? '=' : B64[c & 63];
  }
  return out;
}
