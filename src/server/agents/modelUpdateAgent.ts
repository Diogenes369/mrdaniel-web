/**
 * ModelUpdateAgent — keeps the site's "which models are current" list in sync with the industry,
 * with no human in the loop (2026-09-23).
 *
 * ## Source: OpenRouter's public model index, not news headlines
 *
 * `GET https://openrouter.ai/api/v1/models` is keyless JSON listing every model the aggregator
 * serves, with the provider's own display name and a `created` timestamp. A model appears there the
 * day it ships (verified 2026-09-23: GPT-6 Luna/Sol and Claude Opus 5.5 dated 2026-09-22, Grok 4.7
 * 2026-09-21). That makes it an authoritative list of models that EXIST.
 *
 * Extracting model names from news headlines was the alternative, and it is the wrong tool: a
 * headline mentions rumours, leaks and "coming weeks" models as often as released ones, and an
 * extractor cannot tell them apart. A name on this site is a claim to a client that they can build
 * on it, so the list comes only from a source that serves the model.
 *
 * ## Run triggers (see socialSyncAgent.ts for the same three)
 *   1. the daily Vercel cron (api/agent-generate.ts GET),
 *   2. the local 24/7 worker, hourly (mcp-server/start-agent.js → `?action=models&refresh=1`),
 *   3. any request after `MODEL_SYNC_TTL_MIN` (default 360) has passed.
 * Every good run is written to Firebase `model_catalog`; a failed run serves that snapshot, and with
 * no snapshot the verified seed below — the list is never empty and never invented.
 */
import { readSyncSnapshot, writeSyncSnapshot } from '../../agent/firebaseServer.js';

export interface ModelEntry {
  /** OpenRouter id, e.g. `openai/gpt-6-luna`. */
  id: string;
  /** Display name without the vendor prefix, e.g. `GPT-6 Luna`. */
  name: string;
  vendor: string;
  /** ISO date (YYYY-MM-DD) the model became available. */
  releasedAt: string;
  contextLength?: number;
}

export interface ModelCatalog {
  /** The newest model of each frontier lab — what the site names as "current". */
  frontier: ModelEntry[];
  /** Up to 3 recent models per tracked vendor, newest first. */
  models: ModelEntry[];
  syncedAt: number;
  source: 'openrouter' | 'snapshot' | 'seed';
  note?: string;
}

/** Vendors the site tracks, in display order. The first four are the "frontier" row. */
const VENDORS: Array<{ prefix: string; label: string; frontier: boolean }> = [
  { prefix: 'openai', label: 'OpenAI', frontier: true },
  { prefix: 'anthropic', label: 'Anthropic', frontier: true },
  { prefix: 'google', label: 'Google', frontier: true },
  { prefix: 'x-ai', label: 'xAI', frontier: true },
  { prefix: 'meta', label: 'Meta', frontier: false },
  { prefix: 'meta-llama', label: 'Meta', frontier: false },
  { prefix: 'deepseek', label: 'DeepSeek', frontier: false },
  { prefix: 'mistralai', label: 'Mistral', frontier: false },
  { prefix: 'qwen', label: 'Qwen', frontier: false },
];

/** Variants that are the same model on a different billing/serving path, or not a chat model. */
const VARIANT = /contributor|preview|-exp\b|experimental|audio|image|embed|tts|realtime|search|guard|moderation|-free\b|online|codex|instruct-beta/i;
/** Ids: `:batch`/`:free` routing suffixes and OpenAI's "-pro" tiers are variants of the same model. */
const EXCLUDE_ID = new RegExp(`:|^openai\\/.+-pro$|${VARIANT.source}`, 'i');
/** Display names carry a "Vendor: " prefix, so the id's `:` rule must not apply to them. */
const EXCLUDE_NAME = new RegExp(`\\(batch\\)|^OpenAI: .+ Pro$|${VARIANT.source}`, 'i');

const PER_VENDOR = 3;

/**
 * Verified 2026-09-23 against OpenRouter and each lab's announcement. Served only when there has
 * never been a successful sync — the first run replaces it.
 */
export const SEED_CATALOG: ModelCatalog = {
  frontier: [
    { id: 'openai/gpt-6-luna', name: 'GPT-6 Luna', vendor: 'OpenAI', releasedAt: '2026-09-22' },
    { id: 'anthropic/claude-opus-5.5', name: 'Claude Opus 5.5', vendor: 'Anthropic', releasedAt: '2026-09-22' },
    { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash', vendor: 'Google', releasedAt: '2026-09-02' },
    { id: 'x-ai/grok-4.7', name: 'Grok 4.7', vendor: 'xAI', releasedAt: '2026-09-21' },
  ],
  models: [
    { id: 'openai/gpt-6-luna', name: 'GPT-6 Luna', vendor: 'OpenAI', releasedAt: '2026-09-22' },
    { id: 'openai/gpt-6-sol', name: 'GPT-6 Sol', vendor: 'OpenAI', releasedAt: '2026-09-22' },
    { id: 'openai/gpt-6-astra', name: 'GPT-6 Astra', vendor: 'OpenAI', releasedAt: '2026-09-04' },
    { id: 'anthropic/claude-opus-5.5', name: 'Claude Opus 5.5', vendor: 'Anthropic', releasedAt: '2026-09-22' },
    { id: 'anthropic/claude-fable-5.1', name: 'Claude Fable 5.1', vendor: 'Anthropic', releasedAt: '2026-09-01' },
    { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash', vendor: 'Google', releasedAt: '2026-09-02' },
    { id: 'x-ai/grok-4.7', name: 'Grok 4.7', vendor: 'xAI', releasedAt: '2026-09-21' },
    { id: 'meta/muse-spark-1.3', name: 'Muse Spark 1.3', vendor: 'Meta', releasedAt: '2026-09-02' },
  ],
  syncedAt: Date.parse('2026-09-23T00:00:00Z'),
  source: 'seed',
};

function ttlMs(): number {
  const min = Number(process.env.MODEL_SYNC_TTL_MIN);
  return (Number.isFinite(min) && min >= 10 ? min : 360) * 60_000;
}

interface RawModel {
  id?: unknown;
  name?: unknown;
  created?: unknown;
  context_length?: unknown;
}

/** Pure: raw OpenRouter rows → catalog. Exported for the regression test. */
export function curateModels(rows: RawModel[], now = Date.now()): ModelCatalog {
  const byVendor = new Map<string, ModelEntry[]>();
  for (const r of rows) {
    const id = typeof r.id === 'string' ? r.id : '';
    const created = Number(r.created);
    if (!id || !Number.isFinite(created) || EXCLUDE_ID.test(id)) continue;
    const vendor = VENDORS.find((v) => id.startsWith(`${v.prefix}/`));
    if (!vendor) continue;
    const rawName = typeof r.name === 'string' ? r.name : id.split('/')[1];
    if (EXCLUDE_NAME.test(rawName)) continue;
    const entry: ModelEntry = {
      id,
      name: rawName.replace(/^[^:]+:\s*/, '').trim(),
      vendor: vendor.label,
      releasedAt: new Date(created * 1000).toISOString().slice(0, 10),
      contextLength: Number(r.context_length) || undefined,
    };
    const list = byVendor.get(vendor.label) ?? [];
    list.push(entry);
    byVendor.set(vendor.label, list);
  }

  const labels = [...new Set(VENDORS.map((v) => v.label))];
  const models: ModelEntry[] = [];
  const frontier: ModelEntry[] = [];
  for (const label of labels) {
    const list = (byVendor.get(label) ?? []).sort((a, b) => b.releasedAt.localeCompare(a.releasedAt) || a.name.localeCompare(b.name));
    models.push(...list.slice(0, PER_VENDOR));
    if (VENDORS.some((v) => v.label === label && v.frontier) && list[0]) frontier.push(list[0]);
  }
  return { frontier, models, syncedAt: now, source: 'openrouter' };
}

async function fetchOpenRouter(): Promise<RawModel[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', { headers: { Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`openrouter responded ${res.status}`);
    const json = (await res.json()) as { data?: RawModel[] };
    return Array.isArray(json.data) ? json.data : [];
  } finally {
    clearTimeout(timer);
  }
}

let memo: ModelCatalog | null = null;
let inFlight: Promise<ModelCatalog> | null = null;

/** One sync run. Never throws: a failure falls back to the snapshot, then the seed. */
export async function runModelUpdate(): Promise<ModelCatalog> {
  try {
    const catalog = curateModels(await fetchOpenRouter());
    // A catalog missing a frontier lab means the index answered with something unexpected — do
    // not overwrite a good snapshot with a partial one.
    if (catalog.frontier.length >= 3) {
      await writeSyncSnapshot('model_catalog', catalog as unknown as Record<string, unknown>);
      return catalog;
    }
    console.warn('[model-sync] openrouter returned an incomplete catalog; keeping the last snapshot');
  } catch (err) {
    console.error('[model-sync] run failed:', (err as Error)?.message ?? err);
  }
  const snap = await readSyncSnapshot('model_catalog');
  if (snap && Array.isArray(snap.frontier) && snap.frontier.length) {
    return { ...(snap as unknown as ModelCatalog), source: 'snapshot' };
  }
  return { ...SEED_CATALOG, note: 'עדיין לא הושלם סנכרון ראשון' };
}

/** Cached entry point for the API. `force` skips the TTL (cron, worker, admin). */
export async function getModelCatalog(force = false): Promise<ModelCatalog> {
  if (!force && memo && Date.now() - memo.syncedAt < ttlMs()) return memo;
  if (!inFlight) {
    inFlight = runModelUpdate()
      .then((c) => {
        // A fallback result is retried after 10 minutes instead of a full TTL.
        memo = c.source === 'openrouter' ? c : { ...c, syncedAt: Date.now() - ttlMs() + 10 * 60_000 };
        return c;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export function modelCatalogCdnSeconds(): number {
  return Math.round(Math.min(ttlMs(), 60 * 60_000) / 1000);
}
