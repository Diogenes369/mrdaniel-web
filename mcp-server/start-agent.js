#!/usr/bin/env node
/**
 * start-agent.js — the persistent local worker behind the MCP server.
 *
 * Runs the same operations the MCP tools expose (src/tasks.js), on a schedule, 24/7:
 *   - health    every AGENT_HEALTH_EVERY_MIN (15)  → alert on a state CHANGE only, not every tick
 *   - metrics   every AGENT_METRICS_EVERY_MIN (360) → snapshot to .agent-state/metrics-<date>.json
 *   - draft     once a day at AGENT_DRAFT_HOUR (09, Asia/Jerusalem; -1 disables) → one post into
 *               agent_queue as pending_approval. It never publishes.
 *   - site-sync every AGENT_SITE_SYNC_EVERY_MIN (60; 0 disables) → forces the site's creator-feed
 *               and model-catalog agents (runSiteSync below).
 *
 * Why a local worker and not another Vercel cron: the Hobby plan allows one daily cron and it is
 * already spent on the auto-publisher, and there are no free function slots (AGENTS.md). This
 * machine has neither limit.
 *
 * Run:  node start-agent.js            (foreground)
 *       node start-agent.js --once     (health + metrics once, then exit; add --draft to also queue a draft)
 *       npm run pm2:start              (24/7 with auto-restart; see ecosystem.config.cjs)
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './src/env.js';
import { getDb } from './src/db.js';
import { checkHealth, businessMetrics, generateDraft, writeHeartbeat } from './src/tasks.js';

const ONCE = process.argv.includes('--once');
fs.mkdirSync(config.stateDir, { recursive: true });
const LOG = path.join(config.stateDir, 'agent.log');
const LOCK = path.join(config.stateDir, 'agent.lock');
const STATE = path.join(config.stateDir, 'state.json');

function log(level, msg, extra) {
  const line = `${new Date().toISOString()} ${level.padEnd(5)} ${msg}${extra ? ` ${JSON.stringify(extra)}` : ''}`;
  console.log(line);
  try {
    // Rotate at ~5 MB so a months-long run cannot fill the disk.
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 5 * 1024 * 1024) fs.renameSync(LOG, `${LOG}.1`);
    fs.appendFileSync(LOG, `${line}\n`);
  } catch {
    // logging must never take the worker down
  }
}

// ─── single instance ────────────────────────────────────────────────────────────────────────
// Two workers would generate two drafts a day. The lock holds the PID; a stale lock (process gone)
// is taken over rather than blocking forever after a crash or reboot.
function acquireLock() {
  if (fs.existsSync(LOCK)) {
    const pid = Number(fs.readFileSync(LOCK, 'utf8'));
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = pid !== process.pid;
    } catch {
      alive = false;
    }
    if (alive) {
      log('error', `another agent is running (pid ${pid}) — exiting`);
      process.exit(1);
    }
  }
  fs.writeFileSync(LOCK, String(process.pid));
}

const readState = () => {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'));
  } catch {
    return {};
  }
};
const writeState = (patch) => fs.writeFileSync(STATE, JSON.stringify({ ...readState(), ...patch }, null, 2));

async function notify(text) {
  if (!config.notifyWebhook) return;
  try {
    await fetch(config.notifyWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  } catch (err) {
    log('warn', 'notify webhook failed', { error: String(err?.message ?? err) });
  }
}

// ─── tasks ──────────────────────────────────────────────────────────────────────────────────

async function runHealth() {
  const report = await checkHealth();
  const failing = Object.entries(report.checks).filter(([, c]) => !c.ok).map(([name]) => name);
  const prev = readState().failing ?? [];
  const changed = failing.join(',') !== prev.join(',');
  log(failing.length ? 'warn' : 'info', `health ${failing.length ? `FAILING: ${failing.join(', ')}` : 'ok'}`, failing.length ? report.checks : undefined);
  if (changed) {
    await notify(failing.length ? `⚠️ mrdaniel.co.il: ${failing.join(', ')} down` : '✅ mrdaniel.co.il: all checks back to normal');
  }
  writeState({ failing, lastHealth: report.ts });
  await writeHeartbeat({ health: failing.length ? 'degraded' : 'ok', failing });
}

async function runMetrics() {
  const m = await businessMetrics({ days: 7 });
  const file = path.join(config.stateDir, `metrics-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(file, JSON.stringify(m, null, 2));
  log('info', 'metrics snapshot', { file: path.basename(file), sessions: m.traffic?.sessions, leads7d: m.leads?.newInWindow, pending: m.queue?.pendingApproval });
  if ((m.leads?.staleNew ?? 0) > 0) await notify(`📥 ${m.leads.staleNew} leads still "new" after 48h`);
}

function israelNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 };
}

async function maybeDraft(force = false) {
  const { draftHour } = config.schedule;
  if (draftHour < 0 && !force) return;
  const { date, hour } = israelNow();
  // Once per Israel calendar day, at or after the configured hour — a machine that was asleep at
  // 09:00 still produces the day's draft when it wakes, instead of silently skipping the day.
  const state = readState();
  if (!force && (hour < draftHour || state.lastDraftDate === date)) return;
  // A failed draft used to be retried on every 10-minute tick for the rest of the day — on
  // 2026-09-17 that was a Gemini call every 10 min against a project whose credits were depleted.
  // Back off exponentially (20 min → 40 → 80 → … capped at 4 h), and give up for the day on a
  // failure that waiting cannot fix: depleted credits / spent daily quota / rejected secret.
  if (!force && state.draftRetryAt && Date.now() < state.draftRetryAt) return;
  if (!force && state.draftGaveUpDate === date) return;
  const r = await generateDraft();
  log(r.ok ? 'info' : 'error', `daily draft ${r.ok ? 'queued' : 'failed'}`, { topic: r.topic, status: r.status, result: r.ok ? r.result?.id : r.result });
  if (r.ok) {
    writeState({ lastDraftDate: date, draftFailures: 0, draftRetryAt: null, draftGaveUpDate: null });
    return;
  }
  const code = r.result?.code;
  const permanent = r.status === 401 || r.status === 402 || code === 'billing_exhausted' || code === 'quota_exhausted' || code === 'invalid_api_key';
  const failures = (date === state.draftFailureDate ? state.draftFailures ?? 0 : 0) + 1;
  const retryInMin = Math.min(240, 10 * 2 ** failures);
  writeState({
    draftFailureDate: date,
    draftFailures: failures,
    draftRetryAt: permanent ? null : Date.now() + retryInMin * 60_000,
    draftGaveUpDate: permanent ? date : null,
  });
  log('info', permanent ? `daily draft: not retrying today (${code ?? r.status})` : `daily draft: retry in ${retryInMin} min`);
  if (r.status === 401) await notify('🔑 agent-generate rejected the admin secret — update dashboard/.env');
  else if (code === 'billing_exhausted') await notify('💳 Gemini prepaid credits are depleted — top up in AI Studio; daily draft skipped');
}

/**
 * Forces the live site's two autonomous sync agents (src/server/agents/socialSyncAgent.ts and
 * modelUpdateAgent.ts) — the "24/7" half of their schedule. Vercel Hobby allows one DAILY cron, so
 * without this the site would only re-sync once a day or when a visitor arrives after the TTL.
 * Read-only on every social network; the site does the fetching, this only says "now".
 */
async function runSiteSync() {
  if (!config.adminSecret) {
    log('warn', 'site sync skipped: no admin secret (needed for ?refresh=1)');
    return;
  }
  const results = {};
  for (const action of ['creator-feed', 'models']) {
    try {
      const res = await fetch(`${config.siteOrigin}/api/news?action=${action}&refresh=1`, {
        headers: { 'x-admin-secret': config.adminSecret, Accept: 'application/json' },
        signal: AbortSignal.timeout(45_000),
      });
      const body = await res.json().catch(() => ({}));
      results[action] =
        action === 'models'
          ? { status: res.status, source: body.source, frontier: (body.frontier ?? []).map((m) => m.name) }
          : { status: res.status, items: body.items?.length ?? 0, x: body.sources?.x?.count, linktree: body.sources?.linktree?.count };
    } catch (err) {
      results[action] = { error: String(err?.message ?? err) };
    }
  }
  log('info', 'site sync', results);
  writeState({ lastSiteSync: new Date().toISOString(), lastSiteSyncResult: results });
}

// ─── loop ───────────────────────────────────────────────────────────────────────────────────

/** Runs `fn` now and then every `minutes`, never overlapping itself, and never letting a throw escape. */
function every(minutes, name, fn) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await fn();
    } catch (err) {
      log('error', `${name} threw`, { error: String(err?.stack ?? err) });
    } finally {
      running = false;
    }
  };
  void tick();
  return setInterval(tick, minutes * 60_000);
}

async function main() {
  log('info', `agent starting (${ONCE ? 'once' : 'daemon'})`, {
    site: config.siteOrigin,
    adminSecret: config.adminSecret ? 'set' : 'MISSING',
    schedule: config.schedule,
  });
  if (ONCE) {
    const db = await getDb();
    for (const [name, fn] of [['health', runHealth], ['metrics', runMetrics]]) {
      try {
        await fn();
      } catch (err) {
        log('error', `${name} threw`, { error: String(err?.message ?? err) });
      }
    }
    if (process.argv.includes('--draft')) await maybeDraft(true);
    await db.close?.();
    process.exit(0);
  }

  acquireLock();
  const timers = [
    every(config.schedule.healthEveryMin, 'health', runHealth),
    every(config.schedule.metricsEveryMin, 'metrics', runMetrics),
    every(10, 'draft', () => maybeDraft()),
    ...(config.schedule.siteSyncEveryMin > 0 ? [every(config.schedule.siteSyncEveryMin, 'site-sync', runSiteSync)] : []),
  ];

  const shutdown = async (signal) => {
    log('info', `agent stopping (${signal})`);
    timers.forEach(clearInterval);
    try {
      await writeHeartbeat({ health: 'stopped' });
      fs.rmSync(LOCK, { force: true });
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => log('error', 'unhandledRejection', { error: String(err?.stack ?? err) }));
}

main().catch((err) => {
  log('error', 'fatal', { error: String(err?.stack ?? err) });
  process.exit(1);
});
