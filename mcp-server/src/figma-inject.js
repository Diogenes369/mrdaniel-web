import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveInside } from './workspace.js';
import { figmaPluginCommand } from './figma-bridge.js';

/**
 * Write-side Figma operations: the plugin bridge plus local files.
 *
 * Images go in from disk and renders come out to disk, so neither the model nor the MCP transport
 * ever carries a megabyte of base64 — the tools exchange workspace paths instead.
 */

/** Figma's own limit for `createImage`. Larger uploads fail inside the plugin with a vague error. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const IMAGE_TYPES = { '.png': 'PNG', '.jpg': 'JPEG', '.jpeg': 'JPEG', '.gif': 'GIF' };

/**
 * Fill a template's TEXT layers by layer name.
 *
 * Layer names are the contract, not node ids: duplicating a template frame in Figma gives every
 * copy new ids but keeps the names, so a pipeline keyed on names survives the duplication that
 * producing N carousel slides requires.
 */
export async function injectText({ rootId, entries, port } = {}) {
  if (!Array.isArray(entries) || !entries.length) throw new Error('entries is required: [{ name, text }]');
  for (const entry of entries) {
    if (!entry?.name && !entry?.nodeId) throw new Error('each entry needs a name or a nodeId');
    if (typeof entry.text !== 'string') throw new Error(`entry "${entry.name ?? entry.nodeId}" has no text string`);
  }
  const result = await figmaPluginCommand('set_texts', { rootId, entries }, { port });
  // A missing layer is reported, not thrown: one stale name should not discard nine good injections.
  return { ...result, ok: (result.missing ?? []).length === 0 };
}

/** Replace a node's image fill with a file from the workspace. */
export async function swapImage({ nodeId, imagePath, scaleMode, port } = {}) {
  if (!nodeId) throw new Error('nodeId is required');
  if (!imagePath) throw new Error('imagePath is required (a path inside the workspace)');
  const { target, relative } = resolveInside(imagePath);

  const ext = path.extname(target).toLowerCase();
  if (!IMAGE_TYPES[ext]) throw new Error(`${relative} is not an image Figma accepts (png, jpg, gif)`);
  const stat = await fs.stat(target);
  if (stat.size > MAX_IMAGE_BYTES) throw new Error(`${relative} is ${(stat.size / 1e6).toFixed(1)} MB; Figma's createImage cap is 4 MB`);

  const base64 = (await fs.readFile(target)).toString('base64');
  const result = await figmaPluginCommand('swap_image', { nodeId, imageBase64: base64, scaleMode }, { port, timeoutMs: 60000 });
  return { ...result, source: relative, sourceBytes: stat.size };
}

/**
 * Render a node through the plugin and save the bytes.
 *
 * Use this rather than the REST export whenever an injection just happened: REST renders what
 * Figma's servers have, and an unsaved local edit is not there yet, so REST would quietly return
 * the template's placeholder copy.
 */
export async function exportViaPlugin({ nodeId, format = 'PNG', scale = 2, outDir = 'video-projects/_figma-assets', fileName, port } = {}) {
  if (!nodeId) throw new Error('nodeId is required');
  const result = await figmaPluginCommand('export_node', { nodeId, format, scale }, { port, timeoutMs: 120000 });

  const ext = String(result.format ?? format).toLowerCase() === 'svg' ? 'svg' : String(result.format ?? format).toLowerCase();
  const name = fileName || `${String(nodeId).replace(/:/g, '-')}.${ext}`;
  const { target: dir, relative: dirRel } = resolveInside(outDir);
  await fs.mkdir(dir, { recursive: true });
  const bytes = Buffer.from(result.base64, 'base64');
  await fs.writeFile(path.join(dir, name), bytes);

  return { nodeId, name: result.name, format: result.format, bytes: bytes.length, path: `${dirRel.replace(/\\/g, '/')}/${name}` };
}

/** Switch a component instance to another variant, e.g. { Theme: 'Dark' }. */
export async function setVariant({ nodeId, properties, port } = {}) {
  if (!nodeId) throw new Error('nodeId is required');
  if (!properties || typeof properties !== 'object') throw new Error('properties is required, e.g. { "Theme": "Dark" }');
  return figmaPluginCommand('set_variant', { nodeId, properties }, { port });
}

/**
 * Fill a template, render it, and hand back the file — the whole reason the bridge exists.
 *
 * Sequential by necessity: the plugin mutates one shared document, so overlapping slide renders
 * would race each other's text into the wrong frame.
 */
export async function renderSlides({ rootId, slides, format = 'PNG', scale = 2, outDir, port } = {}) {
  if (!Array.isArray(slides) || !slides.length) throw new Error('slides is required: [{ name, entries: [{ name, text }] }]');
  const rendered = [];
  for (const [index, slide] of slides.entries()) {
    const injected = await injectText({ rootId: slide.rootId ?? rootId, entries: slide.entries, port });
    const asset = await exportViaPlugin({
      nodeId: slide.rootId ?? rootId,
      format,
      scale,
      outDir,
      fileName: `${String(index + 1).padStart(2, '0')}-${slugify(slide.name ?? `slide-${index + 1}`)}.${format.toLowerCase()}`,
      port,
    });
    rendered.push({ slide: slide.name ?? `slide-${index + 1}`, applied: injected.appliedCount, missing: injected.missing, ...asset });
  }
  return { count: rendered.length, slides: rendered, ok: rendered.every((r) => !r.missing?.length) };
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'slide';
}
