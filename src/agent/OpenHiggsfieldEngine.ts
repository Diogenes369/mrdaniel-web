import { MODELS, getModel, parseSettings } from './openhiggsfield/catalog/index.js';
import type { GenerationPlane, MediaItem, MediaRole, ModelEntry, Surface } from './openhiggsfield/catalog/types.js';
import { PlatformError, createPlatformClient } from './openhiggsfield/platform.js';
import { toPlatform } from './openhiggsfield/to-platform.js';

/**
 * Image and video generation through OpenHiggsfield AI's platform layer — 38 models (8 image,
 * 30 video) behind one brief.
 *
 * This is the bridge between our synthesis pipeline (carousels, stories, reels, dashboard media)
 * and the studio cloned into vendor/open-higgsfield. It does NOT run that Next app: the studio's
 * generation layer is a thin, framework-free client over a queue API, so the useful half is
 * vendored into ./openhiggsfield (see its README and scripts/sync-openhiggsfield.mjs) and called
 * straight from our own Vercel functions. Nothing here depends on a second server being up.
 *
 * Division of labour, deliberately kept identical to upstream so a refresh can't silently change
 * behaviour:
 *   - ./openhiggsfield/catalog      which models exist, and the settings each one actually accepts
 *   - ./openhiggsfield/to-platform  brief -> submit path + request body (image_urls, aspect_ratio…)
 *   - ./openhiggsfield/platform     POST /{model}, GET /requests/{id}/status, `Authorization: Key …`
 *   - this file                     keys, validation, polling, and a result shape our code speaks
 *
 * Like VideoGenerationEngine.ts, this NEVER pretends the platform is reachable when its keys are
 * missing and never turns a platform error into a fake success: a run that fails comes back with
 * status 'error' and the platform's own reason.
 */

export type HiggsfieldStatus = 'queued' | 'processing' | 'done' | 'error';

/** One generation request as our code describes it: a model, a prompt, optional input media by
 * role (plain public URLs), and whichever of the model's own settings we want to override. */
export interface HiggsfieldBrief {
  model: string;
  prompt: string;
  /** Public URLs per role. Roles the chosen model doesn't declare are rejected, not ignored, so a
   * silently dropped start frame can't look like a successful text-to-video run. */
  media?: Partial<Record<MediaRole, string[]>>;
  settings?: Record<string, unknown>;
}

export interface HiggsfieldModelInfo {
  id: string;
  label: string;
  surface: Surface;
  /** Max inputs the model accepts per role, e.g. `{ start: 1, reference: 8 }`. */
  roles: Partial<Record<MediaRole, number>>;
  /** Settings allow-list, straight from the catalog — an enum's values, a range's bounds. */
  settings: Record<
    string,
    { type: string; default: unknown; values?: readonly string[]; min?: number; max?: number }
  >;
}

export interface HiggsfieldRun {
  requestId: string;
  model: string;
  surface: Surface;
  status: HiggsfieldStatus;
  /** The platform's own status word ('queued' | 'in_progress' | 'completed' | 'nsfw' | …). */
  platformStatus: string;
  /** Finished media, images first then video — the only field callers normally need. */
  urls: string[];
  images: string[];
  video?: string;
  error?: string;
}

/** Statuses the platform never moves off again — upstream's own list (src/generation/poll.ts). */
const TERMINAL = new Set(['completed', 'failed', 'nsfw', 'canceled']);
const DEFAULT_POLL_MS = 4000;
/** Upstream gives a run 10 minutes; a Vercel function can't wait that long, so waitForHiggsfieldRun
 * caps itself and hands the requestId back instead of calling a live run a timeout. */
const DEFAULT_WAIT_MS = 150_000;

const clean = (value: string | undefined) => (typeof value === 'string' ? value.trim() : '');

function baseUrl(): string {
  return clean(process.env.HF_API_BASE_URL);
}

function apiKey(): string {
  return clean(process.env.HF_API_KEY);
}

/** Which env vars are missing, in the words of .env.example — reported, never guessed around. An
 * `id:secret` shape is required by the platform's auth header, so a key without the colon is
 * reported as missing rather than sent and rejected with a 401. */
export function describeMissingHiggsfieldKeys(): string[] {
  const missing: string[] = [];
  if (!baseUrl()) {
    missing.push('HF_API_BASE_URL (the generation platform origin, e.g. https://queue.fal.run)');
  }
  const key = apiKey();
  if (!key) missing.push('HF_API_KEY (the platform key, in id:secret form)');
  else if (!/^[^:\s]+:[^:\s]+$/.test(key)) missing.push('HF_API_KEY is set but is not in id:secret form');
  return missing;
}

export function higgsfieldConfigured(): boolean {
  return describeMissingHiggsfieldKeys().length === 0;
}

export function printMissingHiggsfieldKeysMessage(): void {
  const missing = describeMissingHiggsfieldKeys();
  if (missing.length === 0) return;
  console.error(
    '[openhiggsfield] not configured — image/video generation is unavailable. Missing:\n  - ' +
      missing.join('\n  - ') +
      '\nSee .env.example (OpenHiggsfield section) and docs/openhiggsfield-bridge.md.'
  );
}

/** The catalog as data: what Hermes or the dashboard should choose from. `search` matches id and
 * label, so 'kling', 'seedance' or 'soul' narrows the list the way the studio's picker does. */
export function listHiggsfieldModels(opts: { surface?: Surface; search?: string } = {}): HiggsfieldModelInfo[] {
  const needle = clean(opts.search).toLowerCase();
  return MODELS.filter((model) => (opts.surface ? model.surface === opts.surface : true))
    .filter((model) => !needle || `${model.id} ${model.label}`.toLowerCase().includes(needle))
    .map(describeModel);
}

export function describeHiggsfieldModel(id: string): HiggsfieldModelInfo {
  return describeModel(getModel(id));
}

function describeModel(model: ModelEntry): HiggsfieldModelInfo {
  const settings: HiggsfieldModelInfo['settings'] = {};
  for (const [key, field] of Object.entries(model.settings)) {
    settings[key] =
      field.type === 'enum'
        ? { type: 'enum', default: field.default, values: field.values }
        : field.type === 'range'
          ? { type: 'range', default: field.default, min: field.min, max: field.max }
          : { type: 'boolean', default: field.default };
  }
  return { id: model.id, label: model.label, surface: model.surface, roles: model.roles, settings };
}

/** Builds the same `{ model, prompt, media, settings }` object the studio's composer hands its
 * server action — role caps and settings allow-lists enforced by the catalog, not by us. */
function toPlane(brief: HiggsfieldBrief): { plane: GenerationPlane; model: ModelEntry } {
  const model = getModel(brief.model);
  const text = clean(brief.prompt);
  if (!text) throw new Error('prompt is empty');

  const media: GenerationPlane['media'] = {};
  for (const [role, urls] of Object.entries(brief.media ?? {}) as [MediaRole, string[] | undefined][]) {
    const list = (urls ?? []).map(clean).filter(Boolean);
    if (list.length === 0) continue;
    const max = model.roles[role];
    if (!max) throw new Error(`${model.id} takes no '${role}' input (accepts: ${describeRoles(model)})`);
    if (list.length > max) {
      throw new Error(`${model.id} takes at most ${max} '${role}' input(s), got ${list.length}`);
    }
    for (const url of list) {
      if (!/^https?:\/\//i.test(url)) {
        throw new Error(`'${role}' input must be a public http(s) URL, got ${url}`);
      }
    }
    media[role] = list.map((url, index): MediaItem => ({ id: `${role}-${index}`, url, role }));
  }

  return {
    model,
    plane: { model: model.id, prompt: { text }, media, settings: parseSettings(model, brief.settings ?? {}) },
  };
}

function describeRoles(model: ModelEntry): string {
  const roles = Object.entries(model.roles);
  return roles.length ? roles.map(([role, max]) => `${role}x${max}`).join(', ') : 'text only';
}

function client() {
  const missing = describeMissingHiggsfieldKeys();
  if (missing.length > 0) {
    printMissingHiggsfieldKeysMessage();
    throw new Error(`OpenHiggsfield is not configured — missing ${missing.join('; ')}`);
  }
  return createPlatformClient({ apiKey: apiKey(), baseUrl: baseUrl() });
}

/** Queues a generation and returns immediately with its requestId. Real runs take ~20s (image) to
 * several minutes (4K video), which is why nothing here blocks on completion by default. */
export async function startHiggsfieldRun(brief: HiggsfieldBrief): Promise<HiggsfieldRun> {
  const { plane, model } = toPlane(brief);
  const { path, body } = toPlatform(plane);
  const queued = await client().submit(path, body);
  return {
    requestId: queued.requestId,
    model: model.id,
    surface: model.surface,
    status: TERMINAL.has(queued.status) ? mapStatus(queued.status) : 'queued',
    platformStatus: queued.status,
    urls: [],
    images: [],
  };
}

/** One poll. `model`/`surface` are only echoed back when the caller knows them — the status
 * endpoint doesn't report which model produced the run. */
export async function checkHiggsfieldRun(
  requestId: string,
  context: { model?: string; surface?: Surface } = {}
): Promise<HiggsfieldRun> {
  const status = await client().status(requestId);
  const images = (status.images ?? []).map((image) => image.url);
  const video = status.video?.url;
  const failed = status.status === 'failed' || status.status === 'nsfw' || status.status === 'canceled';
  return {
    requestId: status.requestId || requestId,
    model: context.model ?? '',
    surface: context.surface ?? (video ? 'video' : 'image'),
    status: mapStatus(status.status),
    platformStatus: status.status,
    urls: [...images, ...(video ? [video] : [])],
    images,
    ...(video ? { video } : {}),
    ...(failed || status.error !== undefined ? { error: reason(status.status, status.error) } : {}),
  };
}

/** Polls an already-queued run until the platform reaches a terminal status or `timeoutMs` runs
 * out. A timeout comes back as 'processing' with the requestId still valid — the run is alive on
 * the platform and can be polled again later; it is not an error and not a failure. */
export async function waitForHiggsfieldRun(
  run: Pick<HiggsfieldRun, 'requestId'> & { model?: string; surface?: Surface },
  opts: { timeoutMs?: number; pollMs?: number } = {}
): Promise<HiggsfieldRun> {
  const deadline = Date.now() + Math.max(1000, opts.timeoutMs ?? DEFAULT_WAIT_MS);
  const pollMs = Math.max(1000, opts.pollMs ?? DEFAULT_POLL_MS);
  let last = await checkHiggsfieldRun(run.requestId, run);
  while (last.status === 'queued' || last.status === 'processing') {
    if (Date.now() + pollMs > deadline) return last;
    await sleep(pollMs);
    last = await checkHiggsfieldRun(run.requestId, run);
  }
  return last;
}

/** Queue + wait in one call, for callers that can afford to block (a dashboard request, an MCP
 * tool, a synthesis step that needs the URL before it can lay out a slide). */
export async function generateHiggsfieldMedia(
  brief: HiggsfieldBrief,
  opts: { timeoutMs?: number; pollMs?: number } = {}
): Promise<HiggsfieldRun> {
  const started = await startHiggsfieldRun(brief);
  if (started.status === 'error' || started.status === 'done') return started;
  return waitForHiggsfieldRun(started, opts);
}

function mapStatus(platformStatus: string): HiggsfieldStatus {
  if (platformStatus === 'completed') return 'done';
  if (platformStatus === 'failed' || platformStatus === 'nsfw' || platformStatus === 'canceled') return 'error';
  return platformStatus === 'queued' ? 'queued' : 'processing';
}

function reason(platformStatus: string, error: unknown): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object') {
    const detail = (error as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    return JSON.stringify(error);
  }
  if (platformStatus === 'nsfw') return 'the platform flagged the prompt or result as NSFW';
  if (platformStatus === 'canceled') return 'the run was canceled on the platform';
  return 'the platform reported a failed run without a reason';
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export { PlatformError };
export type { MediaRole, Surface };
