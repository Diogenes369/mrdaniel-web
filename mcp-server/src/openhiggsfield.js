import { config } from './env.js';
import { callAgent } from './site.js';

/**
 * OpenHiggsfield AI (image + video generation) as Hermes sees it — the `higgsfield-*` actions of
 * /api/agent-generate. See docs/openhiggsfield-bridge.md.
 *
 * Like content generation, this goes through the live site rather than calling the platform from
 * this machine: HF_API_KEY is a deployed secret, and the catalog, field mapping and polling all
 * live in src/agent/OpenHiggsfieldEngine.ts — a local copy of that request path would drift from
 * what the dashboard produces. Every call needs the admin secret, because agent-generate gates the
 * whole endpoint and because a run is billable on the platform.
 */

/** callAgent answers `{ ok, status, json }` rather than throwing, so unwrap it into the error an
    MCP tool should report — with the two failures worth naming: a rotated secret and missing env. */
function unwrap(answer, what) {
  if (answer.ok) return answer.json ?? {};
  const detail = answer.json?.error || answer.error || answer.text || `HTTP ${answer.status}`;
  if (answer.status === 401) {
    throw new Error(
      `${what}: admin secret rejected — it was probably rotated; update mcp-server/.env or dashboard/.env`
    );
  }
  if (answer.status === 503 && Array.isArray(answer.json?.missingKeys)) {
    throw new Error(`${what}: ${detail} — missing env on the site: ${answer.json.missingKeys.join('; ')}`);
  }
  throw new Error(`${what}: ${detail}`);
}

function requireSecret() {
  if (config.adminSecret) return;
  throw new Error(
    'no admin secret — set ADMIN_API_SECRET in mcp-server/.env (or keep VITE_ADMIN_API_SECRET in dashboard/.env)'
  );
}

/** The catalog: 38 models with the settings and input roles each one accepts. Also reports whether
    the site holds the platform keys, so "nothing generated" never looks like a bug here. */
export async function higgsfieldModels({ surface, search } = {}) {
  requireSecret();
  const answer = unwrap(await callAgent('higgsfield-models', { surface, search }, 30000), 'higgsfield-models');
  return {
    configured: answer.configured === true,
    ...(answer.configured === false ? { missingKeys: answer.missingKeys ?? [] } : {}),
    counts: answer.counts,
    models: (answer.models ?? []).map((model) => ({
      id: model.id,
      label: model.label,
      surface: model.surface,
      inputs: model.roles,
      settings: model.settings,
    })),
  };
}

/**
 * Queues one generation. `wait` (default) blocks until the platform finishes and returns the media
 * URLs; `wait: false` returns the requestId for higgsfield_status to pick up — which is what a long
 * video run needs, since those outlast the site function's own 120s ceiling.
 */
export async function higgsfieldGenerate({ model, prompt, media, settings, wait = true, timeoutSeconds = 85 }) {
  requireSecret();
  const capped = Math.min(85, Math.max(10, Number(timeoutSeconds) || 85));
  const answer = unwrap(
    await callAgent(
      'higgsfield-generate',
      { model, prompt, media, settings, wait, timeoutMs: capped * 1000 },
      (capped + 25) * 1000
    ),
    'higgsfield-generate'
  );
  return { ...answer.run, ...(answer.note ? { note: answer.note } : {}) };
}

/** One poll of a queued run. Same shape as higgsfieldGenerate's answer. */
export async function higgsfieldStatus({ requestId }) {
  requireSecret();
  const answer = unwrap(await callAgent('higgsfield-status', { requestId }, 30000), 'higgsfield-status');
  return answer.run;
}
