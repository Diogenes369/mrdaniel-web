import { config } from './env.js';

/**
 * The live site's API, as the dashboard calls it. Content generation deliberately goes through the
 * production `/api/agent-generate` rather than calling Gemini from this machine: GEMINI_API_KEY is a
 * Vercel-only secret, and the prompts, voice rules, security guard and queue writes all live there —
 * a local copy would drift from what the dashboard produces.
 */

async function timed(url, init = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // non-JSON body (HTML page, proxy error) — the status code still says what happened
    }
    return { ok: res.ok, status: res.status, ms: Date.now() - started, json, text: json ? undefined : text.slice(0, 300) };
  } catch (err) {
    return { ok: false, status: 0, ms: Date.now() - started, error: err?.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

/** POST an action to /api/agent-generate with the admin secret. */
export async function callAgent(action, body = {}, timeoutMs = 120000) {
  if (!config.adminSecret) {
    return { ok: false, status: 0, error: 'no admin secret — set ADMIN_API_SECRET in mcp-server/.env (or keep VITE_ADMIN_API_SECRET in dashboard/.env)' };
  }
  return timed(
    `${config.siteOrigin}/api/agent-generate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': config.adminSecret },
      body: JSON.stringify({ action, ...body }),
    },
    timeoutMs
  );
}

/**
 * Reachability of everything the business runs on. `agent` uses `parse-thread` with pasted text: it
 * authenticates, exercises the function, and costs no Gemini quota — the cheapest call that proves
 * the admin secret is still valid (a 401 there is the "secret was rotated" signal).
 */
export async function checkHealth() {
  const [site, api, dashboard, news, agent] = await Promise.all([
    timed(config.siteOrigin, { method: 'GET' }, 15000),
    timed(`${config.siteOrigin}/api/health`, { method: 'GET' }, 10000),
    timed(config.dashboardUrl, { method: 'GET' }, 15000),
    // 45s: a cold instance fetches ~16 RSS feeds before answering (measured 8s cold, 0.3s warm, one
    // 20s+ outlier on 2026-09-16) — a tighter probe pages on cold starts, not outages.
    timed(`${config.siteOrigin}/api/news`, { method: 'GET' }, 45000),
    callAgent('parse-thread', { rawText: 'health probe — first line\n\nsecond line of the probe thread text for the fetcher' }, 20000),
  ]);
  const summarize = (r) => ({ ok: r.ok, status: r.status, ms: r.ms, ...(r.error ? { error: r.error } : {}) });
  const checks = { site: summarize(site), api: summarize(api), dashboard: summarize(dashboard), news: summarize(news), agent: summarize(agent) };
  if (agent.status === 401) checks.agent.hint = 'admin secret rejected — it was probably rotated; update dashboard/.env or mcp-server/.env';
  return { ok: Object.values(checks).every((c) => c.ok), ts: Date.now(), checks };
}
