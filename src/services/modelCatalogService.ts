import { useQuery } from '@tanstack/react-query';
import type { ModelVendor } from '../data/aiAgents';
import { SEED_FRONTIER, SEED_MODELS, SEED_SYNCED_AT, type ModelEntry } from '../data/modelSeed';

/**
 * The live model catalog written by ModelUpdateAgent (src/server/agents/modelUpdateAgent.ts),
 * served at `/api/news?action=models`. Mirrors that module's `ModelCatalog`; the entry type and the
 * seed are shared with it (src/data/modelSeed.ts), so the site shows correct names even before the
 * endpoint answers (first paint, offline, an old deployment without the action).
 */
export type { ModelCap, ModelEntry } from '../data/modelSeed';
export { SEED_FRONTIER };

export interface ModelCatalog {
  frontier: ModelEntry[];
  models: ModelEntry[];
  syncedAt: number;
  source: 'openrouter' | 'snapshot' | 'seed';
}

const SEED: ModelCatalog = { frontier: SEED_FRONTIER, models: SEED_MODELS, syncedAt: SEED_SYNCED_AT, source: 'seed' };

async function fetchCatalog(): Promise<ModelCatalog> {
  try {
    const res = await fetch('/api/news?action=models', { headers: { Accept: 'application/json' } });
    if (!res.ok) return SEED;
    const data = (await res.json()) as Partial<ModelCatalog> & { ok?: boolean };
    const valid = (m: unknown): m is ModelEntry =>
      !!m && typeof (m as ModelEntry).name === 'string' && typeof (m as ModelEntry).vendor === 'string';
    const frontier = Array.isArray(data.frontier) ? data.frontier.filter(valid) : [];
    if (!data.ok || frontier.length < 3) return SEED;
    return {
      frontier,
      models: Array.isArray(data.models) ? data.models.filter(valid) : frontier,
      syncedAt: Number(data.syncedAt) || Date.now(),
      source: data.source ?? 'openrouter',
    };
  } catch {
    return SEED;
  }
}

export function useModelCatalog() {
  return useQuery({
    queryKey: ['model-catalog'],
    queryFn: fetchCatalog,
    placeholderData: SEED,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 0,
  });
}

/** The current model name for a lab, e.g. 'Anthropic' → 'Claude Opus 5.5'. */
export function currentModel(catalog: ModelCatalog | undefined, vendor: ModelVendor): string {
  const list = catalog?.frontier ?? SEED_FRONTIER;
  return list.find((m) => m.vendor === vendor)?.name ?? SEED_FRONTIER.find((m) => m.vendor === vendor)?.name ?? vendor;
}
