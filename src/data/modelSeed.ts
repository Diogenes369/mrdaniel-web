/**
 * The model catalog's shared shape and its verified seed — imported by BOTH the server agent
 * (src/server/agents/modelUpdateAgent.ts) and the site (src/services/modelCatalogService.ts), so the
 * two can no longer drift the way two hand-kept copies did.
 *
 * The seed is served only when there has never been a successful sync (server) and as the first
 * paint before `/api/news?action=models` answers (site). It was produced by running `curateModels`
 * over OpenRouter's live index on 2026-10-03 — copied, not written: every name, date, context size
 * and capability below is what the index reported that day.
 */

/**
 * What a model is good at, derived from OpenRouter's own metadata — never from a description or a
 * headline (see `deriveCaps` in modelUpdateAgent.ts for the exact signal behind each one).
 */
export type ModelCap = 'code' | 'fast' | 'reasoning' | 'video' | 'open';

export interface ModelEntry {
  /** OpenRouter id, e.g. `openai/gpt-6-luna`. */
  id: string;
  /** Display name without the vendor prefix, e.g. `GPT-6 Luna`. */
  name: string;
  vendor: string;
  /** ISO date (YYYY-MM-DD) the model became available. */
  releasedAt: string;
  contextLength?: number;
  /** Primary focus first. Absent on a snapshot written before 2026-10-03. */
  caps?: ModelCap[];
}

export const SEED_SYNCED_AT = Date.parse('2026-10-03T00:00:00Z');

export const SEED_MODELS: ModelEntry[] = [
  { id: 'openai/gpt-6.1-sol', name: 'GPT-6.1 Sol', vendor: 'OpenAI', releasedAt: '2026-09-29', contextLength: 1050000, caps: ['reasoning'] },
  { id: 'openai/gpt-6-luna', name: 'GPT-6 Luna', vendor: 'OpenAI', releasedAt: '2026-09-22', contextLength: 1050000, caps: ['reasoning'] },
  { id: 'openai/gpt-6-sol', name: 'GPT-6 Sol', vendor: 'OpenAI', releasedAt: '2026-09-22', contextLength: 1050000, caps: ['reasoning'] },
  { id: 'anthropic/claude-sonnet-5.5', name: 'Claude Sonnet 5.5', vendor: 'Anthropic', releasedAt: '2026-09-28', contextLength: 1000000, caps: ['reasoning'] },
  { id: 'anthropic/claude-opus-5.5', name: 'Claude Opus 5.5', vendor: 'Anthropic', releasedAt: '2026-09-22', contextLength: 1000000, caps: ['reasoning'] },
  { id: 'anthropic/claude-fable-5.1', name: 'Claude Fable 5.1', vendor: 'Anthropic', releasedAt: '2026-09-01', contextLength: 1000000, caps: ['reasoning'] },
  { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash', vendor: 'Google', releasedAt: '2026-09-02', contextLength: 1048576, caps: ['fast', 'reasoning', 'video'] },
  { id: 'google/gemini-3.7-flash', name: 'Gemini 3.7 Flash', vendor: 'Google', releasedAt: '2026-08-13', contextLength: 1048576, caps: ['fast', 'reasoning', 'video'] },
  { id: 'google/gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', vendor: 'Google', releasedAt: '2026-07-21', contextLength: 1048576, caps: ['fast', 'reasoning', 'video'] },
  { id: 'x-ai/grok-4.7', name: 'Grok 4.7', vendor: 'xAI', releasedAt: '2026-09-21', contextLength: 500000, caps: ['reasoning'] },
  { id: 'x-ai/grok-4.6', name: 'Grok 4.6', vendor: 'xAI', releasedAt: '2026-08-12', contextLength: 500000, caps: ['reasoning'] },
  { id: 'x-ai/grok-4.5', name: 'Grok 4.5', vendor: 'xAI', releasedAt: '2026-07-08', contextLength: 500000, caps: ['reasoning'] },
  { id: 'meta/muse-spark-1.3', name: 'Muse Spark 1.3', vendor: 'Meta', releasedAt: '2026-09-02', contextLength: 1048576, caps: ['reasoning', 'video'] },
  { id: 'meta/muse-glimmer-30b', name: 'Muse Glimmer 30B', vendor: 'Meta', releasedAt: '2026-08-09', contextLength: 131072, caps: ['reasoning', 'open'] },
  { id: 'meta/muse-spark-1.2', name: 'Muse Spark 1.2', vendor: 'Meta', releasedAt: '2026-08-05', contextLength: 1048576, caps: ['reasoning', 'video'] },
  { id: 'deepseek/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', vendor: 'DeepSeek', releasedAt: '2026-09-10', contextLength: 1048576, caps: ['fast', 'reasoning', 'open'] },
  { id: 'deepseek/deepseek-v4-pro-0813', name: 'DeepSeek V4 Pro 0813', vendor: 'DeepSeek', releasedAt: '2026-08-12', contextLength: 1048576, caps: ['reasoning', 'open'] },
  { id: 'deepseek/deepseek-v4-flash-0731', name: 'DeepSeek V4 Flash 0731', vendor: 'DeepSeek', releasedAt: '2026-07-31', contextLength: 1048576, caps: ['fast', 'reasoning', 'open'] },
  { id: 'mistralai/mistral-medium-3-5', name: 'Mistral Medium 3.5', vendor: 'Mistral', releasedAt: '2026-04-30', contextLength: 262144, caps: ['reasoning'] },
  { id: 'mistralai/mistral-small-2603', name: 'Mistral Small 4', vendor: 'Mistral', releasedAt: '2026-03-16', contextLength: 262144, caps: ['fast', 'reasoning', 'open'] },
  { id: 'mistralai/devstral-2512', name: 'Devstral 2 2512', vendor: 'Mistral', releasedAt: '2025-12-09', contextLength: 262144, caps: ['code', 'open'] },
  { id: 'qwen/qwen3.8-max-prime', name: 'Qwen3.8 Max Prime', vendor: 'Qwen', releasedAt: '2026-09-23', contextLength: 1000000, caps: ['reasoning', 'video'] },
  { id: 'qwen/qwen3.8-omni-flash', name: 'Qwen3.8 Omni Flash', vendor: 'Qwen', releasedAt: '2026-09-21', contextLength: 1000000, caps: ['fast', 'reasoning', 'video'] },
  { id: 'qwen/qwen3.8-max-0902', name: 'Qwen3.8 Max (0902)', vendor: 'Qwen', releasedAt: '2026-09-03', contextLength: 1000000, caps: ['reasoning', 'video'] },
  { id: 'moonshotai/kimi-k3', name: 'Kimi K3', vendor: 'Moonshot AI', releasedAt: '2026-07-16', contextLength: 1048576, caps: ['reasoning', 'video', 'open'] },
  { id: 'moonshotai/kimi-k2.7-code', name: 'Kimi K2.7 Code', vendor: 'Moonshot AI', releasedAt: '2026-06-12', contextLength: 262144, caps: ['code', 'reasoning', 'open'] },
  { id: 'moonshotai/kimi-k2.6', name: 'Kimi K2.6', vendor: 'Moonshot AI', releasedAt: '2026-04-20', contextLength: 262144, caps: ['reasoning', 'open'] },
  { id: 'z-ai/glm-5.3-prime', name: 'GLM 5.3 Prime', vendor: 'Z.ai', releasedAt: '2026-09-23', contextLength: 1000000, caps: ['reasoning'] },
  { id: 'z-ai/glm-5.3-flashx', name: 'GLM 5.3 FlashX', vendor: 'Z.ai', releasedAt: '2026-09-18', contextLength: 1048576, caps: ['fast', 'reasoning', 'video'] },
  { id: 'z-ai/glm-5.3-flash', name: 'GLM 5.3 Flash', vendor: 'Z.ai', releasedAt: '2026-08-26', contextLength: 1048576, caps: ['fast', 'reasoning', 'video', 'open'] },
];

/** The newest model of each frontier lab, in display order. */
export const SEED_FRONTIER: ModelEntry[] = ['OpenAI', 'Anthropic', 'Google', 'xAI'].map(
  (vendor) => SEED_MODELS.find((m) => m.vendor === vendor)!,
);
