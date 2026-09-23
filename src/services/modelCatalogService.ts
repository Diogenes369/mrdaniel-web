import { useQuery } from '@tanstack/react-query';
import type { ModelVendor } from '../data/aiAgents';

/**
 * The live model catalog written by ModelUpdateAgent (src/server/agents/modelUpdateAgent.ts),
 * served at `/api/news?action=models`. Mirrors that module's `ModelEntry` / `ModelCatalog`.
 *
 * `SEED_FRONTIER` duplicates the server seed so the site shows correct names even before the
 * endpoint answers (first paint, offline, an old deployment without the action). Verified
 * 2026-09-23 against OpenRouter's index and each lab's announcement.
 */
export interface ModelEntry {
  id: string;
  name: string;
  vendor: string;
  releasedAt: string;
}

export interface ModelCatalog {
  frontier: ModelEntry[];
  models: ModelEntry[];
  syncedAt: number;
  source: 'openrouter' | 'snapshot' | 'seed';
}

export const SEED_FRONTIER: ModelEntry[] = [
  { id: 'openai/gpt-6-luna', name: 'GPT-6 Luna', vendor: 'OpenAI', releasedAt: '2026-09-22' },
  { id: 'anthropic/claude-opus-5.5', name: 'Claude Opus 5.5', vendor: 'Anthropic', releasedAt: '2026-09-22' },
  { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash', vendor: 'Google', releasedAt: '2026-09-02' },
  { id: 'x-ai/grok-4.7', name: 'Grok 4.7', vendor: 'xAI', releasedAt: '2026-09-21' },
];

const SEED: ModelCatalog = { frontier: SEED_FRONTIER, models: SEED_FRONTIER, syncedAt: Date.parse('2026-09-23T00:00:00Z'), source: 'seed' };

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
