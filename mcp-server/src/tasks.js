import { getDb, toList, isPermissionError } from './db.js';
import { callAgent, checkHealth } from './site.js';
import { config } from './env.js';

/**
 * The operations both entry points share. The MCP tools call these on demand; start-agent.js calls
 * the same functions on a schedule, so "what the agent does at 09:00" and "what Claude does when
 * asked" can never diverge.
 */

const DAY = 86_400_000;

/** A read that degrades to a labelled gap instead of failing the whole report. */
async function soft(fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    return { ok: false, error: isPermissionError(err) ? 'permission denied (needs FIREBASE_SERVICE_ACCOUNT)' : String(err?.message ?? err) };
  }
}

function countBy(rows, key) {
  const out = {};
  for (const r of rows) {
    const k = String(r[key] ?? 'unknown');
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/**
 * Business metrics over the last `days`: traffic and conversions from `events`, the lead pipeline,
 * the publishing record and the approval backlog. Counts only — no names, emails or phones leave
 * this function, so the report is safe to paste anywhere.
 */
export async function businessMetrics({ days = 7 } = {}) {
  const db = await getDb();
  const since = Date.now() - days * DAY;
  const [events, leads, posts, queue] = await Promise.all([
    soft(async () => toList(await db.readLast('events', 5000)).filter((e) => (e.ts ?? 0) >= since)),
    soft(async () => toList(await db.readLast('leads', 2000))),
    soft(async () => toList(await db.readLast('published_posts', 500)).filter((p) => (p.createdAt ?? 0) >= since)),
    soft(async () => toList(await db.readLast('agent_queue', 500))),
  ]);

  const report = { windowDays: days, generatedAt: new Date().toISOString(), privileged: db.privileged };

  if (events.ok) {
    const ev = events.value;
    const sessions = new Set(ev.map((e) => e.sessionId).filter(Boolean));
    const pageviews = ev.filter((e) => e.type === 'pageview');
    const conversions = ev.filter((e) => e.type === 'conversion');
    const topPaths = Object.entries(countBy(pageviews, 'path'))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([path, views]) => ({ path, views }));
    report.traffic = {
      events: ev.length,
      sessions: sessions.size,
      pageviews: pageviews.length,
      conversions: conversions.length,
      conversionRate: sessions.size ? +(conversions.length / sessions.size * 100).toFixed(2) : 0,
      devices: countBy(ev.filter((e) => e.type === 'session_start'), 'device'),
      topPaths,
      note: ev.length >= 5000 ? 'capped at the last 5000 events — older traffic in the window is not counted' : undefined,
    };
  } else report.traffic = { error: events.error };

  if (leads.ok) {
    const all = leads.value;
    const recent = all.filter((l) => (l.ts ?? 0) >= since);
    report.leads = {
      newInWindow: recent.length,
      totalLoaded: all.length,
      byStatus: countBy(all.map((l) => ({ status: l.status ?? 'new' })), 'status'),
      bySource: countBy(recent, 'sourceSection'),
      staleNew: all.filter((l) => (l.status ?? 'new') === 'new' && (l.ts ?? 0) < Date.now() - 2 * DAY).length,
    };
  } else report.leads = { error: leads.error };

  if (posts.ok) {
    report.publishing = { inWindow: posts.value.length, byStatus: countBy(posts.value, 'status'), byPlatform: countBy(posts.value, 'platform') };
  } else report.publishing = { error: posts.error };

  if (queue.ok) {
    const pending = queue.value.filter((q) => q.status === 'pending_approval');
    report.queue = {
      byStatus: countBy(queue.value, 'status'),
      pendingApproval: pending.length,
      oldestPendingHours: pending.length ? Math.round((Date.now() - Math.min(...pending.map((p) => p.createdAt ?? Date.now()))) / 3_600_000) : 0,
    };
  } else report.queue = { error: queue.error };

  return report;
}

/** Today's planned topic from `weekly_plan`, if the dashboard generated one. */
async function plannedTopicForToday(db) {
  const plan = await db.read('weekly_plan').catch(() => null);
  const days = Array.isArray(plan?.days) ? plan.days : [];
  // Israel's weekday, not the machine's: the plan runs Sunday (0) → Saturday (6) in local time.
  const dow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })).getDay();
  const today = days.find((d) => d.dayIndex === dow);
  return today?.topic ? String(today.topic) : null;
}

/** Fallback rotation when there is no plan — one topic per weekday, stable across restarts. */
const ROTATION = [
  'סוכני AI שמחליפים משימה ידנית אחת בעסק קטן',
  'טעות אבטחה אחת שכמעט כל עסק קטן עושה בחשבונות הענן',
  'אוטומציה עם n8n או Make שחוסכת שעה ביום',
  'איך לבדוק שהגיבויים שלכם באמת עובדים',
  'Prompt injection: למה סוכן AI עם גישה למייל הוא סיכון',
  'המדדים שבאמת צריך לראות בדשבורד של אתר עסקי',
  'מה לבדוק לפני שמחברים כלי AI לנתוני לקוחות',
];

/**
 * Generates ONE draft into the approval queue via the live `generate-content` action.
 *
 * Never publishes: the site writes it to `agent_queue` as `pending_approval`, the same state a
 * dashboard-triggered draft lands in, and a human approves it from the dashboard or WhatsApp. An
 * autonomous loop that posts without review is one bad model day away from a public mistake.
 */
export async function generateDraft({ topic, platform = config.schedule.draftPlatform, format = 'post' } = {}) {
  const db = await getDb();
  const chosen =
    (topic && topic.trim()) ||
    (await plannedTopicForToday(db)) ||
    ROTATION[Math.floor(Date.now() / DAY) % ROTATION.length];
  const res = await callAgent('generate-content', { platform, topic: chosen, format });
  return { topic: chosen, platform, format, status: res.status, ok: res.ok && res.json?.ok !== false, result: res.json ?? res.error ?? res.text };
}

export { checkHealth };

/** Records a heartbeat the dashboard (or a later session) can read: `agent_runtime/local`. */
export async function writeHeartbeat(payload) {
  const db = await getDb();
  // The anonymous client has no write rule for this path; skipping beats a Firebase WARNING line
  // in the log every 15 minutes. The local state.json carries the same facts either way.
  if (!db.privileged) return;
  await soft(() => db.update('agent_runtime/local', { ...payload, ts: Date.now(), host: process.env.COMPUTERNAME || process.env.HOSTNAME || 'local' }));
}
