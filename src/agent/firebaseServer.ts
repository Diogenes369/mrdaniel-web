import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, push, set, update, get, query as dbQuery, orderByKey, limitToLast, type Database } from 'firebase/database';
import { getAdminDb } from './firebaseAdmin.js';

const STRATEGIC_CONTEXT_LIMIT = 10;

// Server-side (Node/Vercel Function) counterpart to src/lib/firebaseClient.ts — that file reads
// `import.meta.env.VITE_*`, a Vite build-time replacement that doesn't exist in a plain Node
// process, so a serverless function needs its own initializer reading `process.env.VITE_FIREBASE_*`
// directly. Vercel injects every configured project env var into every function's process.env
// regardless of a `VITE_` prefix — that prefix only controls what Vite inlines into the *browser*
// bundle, it doesn't restrict server-side process.env access — so reusing the same variable names
// here is intentional, not a mismatch.
const config = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.VITE_FIREBASE_DATABASE_URL,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

export const agentFirebaseConfigured = Boolean(config.apiKey && config.databaseURL);

let dbInstance: Database | null = null;

function getServerDb(): Database | null {
  if (!agentFirebaseConfigured) return null;
  if (!dbInstance) {
    // getApps() guard: a Vercel Function's module scope can be reused warm across invocations,
    // which would otherwise hit Firebase's "app already initialized" throw on the second call.
    const app = getApps()[0] ?? initializeApp(config, 'agent-server');
    dbInstance = getDatabase(app);
  }
  return dbInstance;
}

/** Requires an `agent_queue` read/write rule in the live database rules. Resolves to null
 * silently rather than throwing so a missing rule degrades to "queue item not saved", not a 500. */
export async function pushQueueItem(item: Record<string, unknown>): Promise<string | null> {
  const db = getServerDb();
  if (!db) return null;
  try {
    const result = await push(ref(db, 'agent_queue'), item);
    return result.key;
  } catch (err) {
    console.error('[agent] failed to push queue item:', err);
    return null;
  }
}

/** Raw shape of one `comment_dm_campaigns/<id>` row — see dashboard/src/lib/useCommentDmManager.ts,
 *  the source of truth for the fields a campaign can carry. Not access-controlled (same rules as
 *  `agent_queue`), so this reads with the plain client like pushQueueItem above, not privilegedDb(). */
export interface CommentDmCampaignRow {
  id: string;
  label?: string;
  keyword?: string;
  guideSlug?: string;
  active?: boolean;
  pageTitle?: string;
  pageSubtitle?: string;
  fileUrl?: string;
  previewImageUrl?: string;
  createdAt?: number;
}

/** Every `comment_dm_campaigns` row, for the public download route to resolve a guideSlug against.
 *  The collection is small (authored by hand in the dashboard), so reading it whole beats adding an
 *  `.indexOn` rule just to query by guideSlug. */
export async function readCommentDmCampaigns(): Promise<CommentDmCampaignRow[]> {
  const db = getServerDb();
  if (!db) return [];
  try {
    const snap = await get(ref(db, 'comment_dm_campaigns'));
    const raw = snap.val();
    if (!raw || typeof raw !== 'object') return [];
    return Object.entries(raw as Record<string, Omit<CommentDmCampaignRow, 'id'>>).map(([id, c]) => ({ id, ...c }));
  } catch (err) {
    console.error('[comment-dm] failed to read comment_dm_campaigns:', err);
    return [];
  }
}

export async function readAgentMode(): Promise<string | null> {
  const db = getServerDb();
  if (!db) return null;
  try {
    const snapshot = await get(ref(db, 'agent_config/mode'));
    return snapshot.exists() ? (snapshot.val() as string) : null;
  } catch (err) {
    console.error('[agent] failed to read agent mode:', err);
    return null;
  }
}

export async function readAgentWebhooks(): Promise<{ whatsapp?: string; telegram?: string } | null> {
  const db = getServerDb();
  if (!db) return null;
  try {
    const snapshot = await get(ref(db, 'agent_config/webhooks'));
    return snapshot.exists() ? (snapshot.val() as { whatsapp?: string; telegram?: string }) : null;
  } catch (err) {
    console.error('[agent] failed to read agent webhooks:', err);
    return null;
  }
}

export async function writeAutoPilotRunTimestamp(): Promise<void> {
  const db = getServerDb();
  if (!db) return;
  try {
    await set(ref(db, 'agent_config/lastAutoPilotRun'), Date.now());
  } catch (err) {
    console.error('[agent] failed to write last-run timestamp:', err);
  }
}

export async function readStrategicContext(): Promise<string[]> {
  const db = getServerDb();
  if (!db) return [];
  try {
    const snapshot = await get(ref(db, 'agent_config/strategicContext'));
    return snapshot.exists() ? (snapshot.val() as string[]) : [];
  } catch (err) {
    console.error('[agent] failed to read strategic context:', err);
    return [];
  }
}

/** Appends one freeform admin note (from a WhatsApp message that wasn't an action shortcut — see
 * api/agent-whatsapp-webhook.ts) to the rolling context window, trimming to the most recent
 * STRATEGIC_CONTEXT_LIMIT entries. */
export async function appendStrategicContext(note: string): Promise<void> {
  const db = getServerDb();
  if (!db) return;
  try {
    const existing = await readStrategicContext();
    const next = [...existing, note].slice(-STRATEGIC_CONTEXT_LIMIT);
    await set(ref(db, 'agent_config/strategicContext'), next);
  } catch (err) {
    console.error('[agent] failed to append strategic context:', err);
  }
}

/** Fetches the whole queue and returns the most recently created `pending_approval` item — used by
 * the WhatsApp webhook to resolve a bare "1"/"אשר" reply to a specific item without requiring the
 * admin to quote an ID over WhatsApp. Small linear scan is intentional: the queue is already
 * capped at ~100 recent items everywhere else it's read (see the dashboard's `limitToLast(100)`),
 * so this avoids requiring a Firebase query-index rule just for one lookup. */
export async function findLatestPendingQueueItem(): Promise<{ id: string; item: Record<string, unknown> } | null> {
  const db = getServerDb();
  if (!db) return null;
  try {
    const snapshot = await get(ref(db, 'agent_queue'));
    if (!snapshot.exists()) return null;
    const val = snapshot.val() as Record<string, Record<string, unknown>>;
    const pending = Object.entries(val)
      .filter(([, item]) => item.status === 'pending_approval')
      .sort(([, a], [, b]) => (b.createdAt as number) - (a.createdAt as number));
    if (pending.length === 0) return null;
    const [id, item] = pending[0];
    return { id, item };
  } catch (err) {
    console.error('[agent] failed to find latest pending queue item:', err);
    return null;
  }
}

export async function updateQueueItemStatus(id: string, status: string): Promise<void> {
  const db = getServerDb();
  if (!db) return;
  try {
    await update(ref(db, `agent_queue/${id}`), { status });
  } catch (err) {
    console.error('[agent] failed to update queue item status:', err);
  }
}

export async function updateQueueItemBody(id: string, body: string): Promise<void> {
  const db = getServerDb();
  if (!db) return;
  try {
    await update(ref(db, `agent_queue/${id}`), { body });
  } catch (err) {
    console.error('[agent] failed to update queue item body:', err);
  }
}

/** One-item WhatsApp "edit" flow state — see api/agent-whatsapp-webhook.ts's two-step edit flow
 * (reply "2"/"ערוך" sets this, the next non-shortcut message clears it and applies the edit). */
export async function readAwaitingEditFor(): Promise<string | null> {
  const db = getServerDb();
  if (!db) return null;
  try {
    const snapshot = await get(ref(db, 'agent_config/awaitingEditFor'));
    return snapshot.exists() ? (snapshot.val() as string) : null;
  } catch (err) {
    console.error('[agent] failed to read awaitingEditFor:', err);
    return null;
  }
}

export async function setAwaitingEditFor(id: string | null): Promise<void> {
  const db = getServerDb();
  if (!db) return;
  try {
    await set(ref(db, 'agent_config/awaitingEditFor'), id);
  } catch (err) {
    console.error('[agent] failed to set awaitingEditFor:', err);
  }
}

/** "Generate New Weekly Plan" always REPLACES the current plan wholesale (a full `set`, not a
 * `push`) — there is exactly one active weekly plan at a time, not a growing history. */
export async function writeWeeklyPlan(plan: object): Promise<boolean> {
  const db = getServerDb();
  if (!db) return false;
  try {
    await set(ref(db, 'weekly_plan'), plan);
    return true;
  } catch (err) {
    console.error('[agent] failed to write weekly plan:', err);
    return false;
  }
}

/** Requires a `video_jobs` read/write rule in the Firebase console (same pattern as `agent_queue`/
 * `weekly_plan` — see dashboard README). A video job persists here (not in memory) specifically
 * because Veo/Runway/HeyGen/Replicate generation takes longer than one serverless invocation can
 * usefully hold open — the dashboard polls GET /api/generate-video?id=... across many separate
 * cold-or-warm invocations, and this is the only state any of them share. */
export async function createVideoJob(id: string, job: Record<string, unknown>): Promise<boolean> {
  const db = getServerDb();
  if (!db) return false;
  try {
    await set(ref(db, `video_jobs/${id}`), job);
    return true;
  } catch (err) {
    console.error('[agent] failed to create video job:', err);
    return false;
  }
}

export async function readVideoJob(id: string): Promise<Record<string, unknown> | null> {
  const db = getServerDb();
  if (!db) return null;
  try {
    const snapshot = await get(ref(db, `video_jobs/${id}`));
    return snapshot.exists() ? (snapshot.val() as Record<string, unknown>) : null;
  } catch (err) {
    console.error('[agent] failed to read video job:', err);
    return null;
  }
}

export async function updateVideoJob(id: string, patch: Record<string, unknown>): Promise<void> {
  const db = getServerDb();
  if (!db) return;
  try {
    await update(ref(db, `video_jobs/${id}`), patch);
  } catch (err) {
    console.error('[agent] failed to update video job:', err);
  }
}

// ---------------------------------------------------------------------------
// Autonomous news auto-publisher (api/cron/auto-publish.ts, api/publish-post.ts)
// RTDB paths: `auto_publish_config` (dashboard-owned settings) and `published_posts`
// (append-only run history + dedup source). Same "add the rule in the Firebase console"
// caveat as agent_queue above.
// ---------------------------------------------------------------------------

export interface AutoPublishConfig {
  active?: boolean;
  /** UTC hours at which a cron tick should post — [] or absent = never. */
  slotsUTC?: number[];
  platform?: 'linkedin' | 'instagram' | 'all';
  category?: 'ai' | 'ai_models' | 'ai_agents' | 'auto';
  mode?: 'full-auto' | 'drafts';
  publishWebhookUrl?: string;
}

export interface PublishedPostRecord {
  newsId: string;
  newsTitle: string;
  newsLink: string;
  category: string;
  topic: string;
  platform: string;
  imageUrl: string;
  caption: string;
  hashtags: string[];
  status: 'success' | 'failed' | 'pending_approval';
  detail?: string;
  mode: string;
  slotKey: string; // `${YYYY-MM-DD}-${HH}` — de-dups a cron slot from re-running
  createdAt: number;
  /** 4-slide Instagram Story text payload (see src/server/storySlides.ts), rendered by the
   * dashboard's Story Studio. Also mirrored to `story_drafts/<newsId>`. */
  storySlides?: unknown[];
}

export async function readAutoPublishConfig(): Promise<AutoPublishConfig | null> {
  const db = getServerDb();
  if (!db) return null;
  try {
    const snapshot = await get(ref(db, 'auto_publish_config'));
    return snapshot.exists() ? (snapshot.val() as AutoPublishConfig) : {};
  } catch (err) {
    console.error('[auto-publish] failed to read config:', err);
    return null;
  }
}

/** Every history record — used both for the dashboard log and as the dedup source. */
export async function readPublishedPosts(): Promise<Record<string, PublishedPostRecord>> {
  const db = getServerDb();
  if (!db) return {};
  try {
    const snapshot = await get(ref(db, 'published_posts'));
    return snapshot.exists() ? (snapshot.val() as Record<string, PublishedPostRecord>) : {};
  } catch (err) {
    console.error('[auto-publish] failed to read published_posts:', err);
    return {};
  }
}

export async function recordPublishedPost(record: PublishedPostRecord): Promise<string | null> {
  const db = getServerDb();
  if (!db) return null;
  try {
    const result = await push(ref(db, 'published_posts'), record);
    return result.key;
  } catch (err) {
    console.error('[auto-publish] failed to record published post:', err);
    return null;
  }
}

export async function updatePublishedPost(id: string, patch: Partial<PublishedPostRecord>): Promise<void> {
  const db = getServerDb();
  if (!db) return;
  try {
    await update(ref(db, `published_posts/${id}`), patch);
  } catch (err) {
    console.error('[auto-publish] failed to update published post:', err);
  }
}

/** Mirrors the 4-slide Story payload to `story_drafts/<newsId>` (overwrites — one draft per item). */
export async function writeStoryDraft(newsId: string, payload: Record<string, unknown>): Promise<void> {
  const db = getServerDb();
  if (!db) return;
  try {
    await set(ref(db, `story_drafts/${newsId.replace(/[.#$\/[\]]/g, '_')}`), payload);
  } catch (err) {
    console.error('[auto-publish] failed to write story draft:', err);
  }
}

// ---------------------------------------------------------------------------
// Leads + email engine (api/leads.ts, src/server/emailEngine.ts)
// `leads`, `newsletter_signups`, `email_config` and `email_templates` hold PII or email settings
// and are to become admin-only (the rules lock in PROJECT_STATE.md §6), so everything below except
// recordEmailCampaign goes through privilegedDb().
// ---------------------------------------------------------------------------

/** The four operations the admin-only paths need, over whichever connection is available. */
interface PrivilegedDb {
  read(path: string): Promise<unknown>;
  readLast(path: string, count: number): Promise<unknown>;
  push(path: string, value: object): Promise<string | null>;
  update(path: string, patch: object): Promise<void>;
}

/**
 * The service-account connection (firebaseAdmin.ts) when FIREBASE_SERVICE_ACCOUNT is set. Until
 * then it is the anonymous client above, which only works while the live rules still leave these
 * paths open. That fallback is transitional: once the rules lock is deployed it is refused, so a
 * missing service account fails closed instead of quietly reopening anything.
 */
function privilegedDb(): PrivilegedDb | null {
  const admin = getAdminDb();
  if (admin) {
    return {
      read: async (path) => (await admin.ref(path).once('value')).val(),
      readLast: async (path, count) => (await admin.ref(path).orderByKey().limitToLast(count).once('value')).val(),
      push: async (path, value) => (await admin.ref(path).push(value)).key,
      update: (path, patch) => admin.ref(path).update(patch),
    };
  }
  const db = getServerDb();
  if (!db) return null;
  return {
    read: async (path) => (await get(ref(db, path))).val(),
    readLast: async (path, count) => (await get(dbQuery(ref(db, path), orderByKey(), limitToLast(count)))).val(),
    push: async (path, value) => (await push(ref(db, path), value)).key,
    update: (path, patch) => update(ref(db, path), patch),
  };
}

export interface EmailConfig {
  autoWelcome?: boolean;
  welcomeTemplateId?: string;
  fromName?: string;
}

export async function pushNewsletterSignup(record: Record<string, unknown>): Promise<string | null> {
  const db = privilegedDb();
  if (!db) return null;
  try {
    return await db.push('newsletter_signups', record);
  } catch (err) {
    console.error('[email] failed to push newsletter signup:', err);
    return null;
  }
}

function collectEmails(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const out = new Set<string>();
  for (const v of Object.values(node as Record<string, any>)) {
    const email = typeof v?.email === 'string' ? v.email.trim().toLowerCase() : '';
    if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) out.add(email);
  }
  return [...out];
}

export async function readNewsletterEmails(): Promise<string[]> {
  const db = privilegedDb();
  if (!db) return [];
  try {
    return collectEmails(await db.read('newsletter_signups'));
  } catch (err) {
    console.error('[email] failed to read newsletter_signups:', err);
    return [];
  }
}

export async function readLeadEmails(): Promise<string[]> {
  const db = privilegedDb();
  if (!db) return [];
  try {
    return collectEmails(await db.read('leads'));
  } catch (err) {
    console.error('[email] failed to read leads:', err);
    return [];
  }
}

/** Saves a lead from one of the site's own forms into `leads`. The caller has already validated and
 *  capped every field. Returns the new key, or null when the write failed or is not configured. */
export async function pushSiteLead(record: Record<string, unknown>): Promise<string | null> {
  const db = privilegedDb();
  if (!db) return null;
  try {
    return await db.push('leads', record);
  } catch (err) {
    console.error('[leads] failed to save site lead:', err);
    return null;
  }
}

/**
 * How many of the most recent leads a repeat ManyChat lead is looked for in. Bounded so the check
 * never downloads the whole `leads` node, and done in key order so it needs no `.indexOn` rule —
 * that would be one more manual Firebase-console step, and a missing one would fail every request.
 */
const MANYCHAT_DEDUPE_WINDOW = 500;

/**
 * Saves a ManyChat lead into `leads` — the list the dashboard's Leads tab and the email engine
 * already read — or updates the existing row when the same subscriber asked for the same guide
 * recently. `mcKey` is the caller's hash of (subscriber, guide). Push keys keep the list in time
 * order; a deterministic key per lead would sort every ManyChat row after all site leads and crowd
 * those out of the dashboard's `limitToLast` views.
 *
 * Returns null when Firebase is unconfigured or the write fails, so the caller can answer non-2xx
 * and ManyChat's test request shows the failure instead of a lead silently going nowhere.
 */
export async function upsertManychatLead(
  mcKey: string,
  record: Record<string, string>
): Promise<{ id: string; deduped: boolean } | null> {
  const db = privilegedDb();
  if (!db) return null;
  try {
    const now = Date.now();
    const rows = ((await db.readLast('leads', MANYCHAT_DEDUPE_WINDOW)) ?? {}) as Record<string, Record<string, unknown>>;
    const hit = Object.entries(rows).find(([, row]) => row?.mcKey === mcKey);
    if (hit) {
      const [id, row] = hit;
      // Fill gaps (an email given on the second pass) — never blank out what the first pass stored.
      const patch: Record<string, unknown> = { lastTs: now, count: (Number(row.count) || 1) + 1 };
      for (const [k, v] of Object.entries(record)) if (v && !row[k]) patch[k] = v;
      await db.update(`leads/${id}`, patch);
      return { id, deduped: true };
    }
    // Empty fields are left out, except name/email: every lead reader expects those two to exist.
    const fields = Object.fromEntries(Object.entries(record).filter(([k, v]) => v || k === 'name' || k === 'email'));
    const id = await db.push('leads', { ...fields, mcKey, ts: now, lastTs: now, count: 1 });
    return id ? { id, deduped: false } : null;
  } catch (err) {
    console.error('[leads] failed to save ManyChat lead:', err);
    return null;
  }
}

export async function readEmailConfig(): Promise<EmailConfig> {
  const db = privilegedDb();
  if (!db) return {};
  try {
    return ((await db.read('email_config')) ?? {}) as EmailConfig;
  } catch (err) {
    console.error('[email] failed to read email_config:', err);
    return {};
  }
}

export async function readEmailTemplate(id: string): Promise<{ subject?: string; html?: string; name?: string } | null> {
  const db = privilegedDb();
  if (!db || !id) return null;
  try {
    const tpl = await db.read(`email_templates/${id.replace(/[.#$\/[\]]/g, '_')}`);
    return (tpl ?? null) as { subject?: string; html?: string; name?: string } | null;
  } catch (err) {
    console.error('[email] failed to read email template:', err);
    return null;
  }
}

/** Records a campaign send into `email_campaigns` for the dashboard history. */
export async function recordEmailCampaign(record: Record<string, unknown>): Promise<void> {
  const db = getServerDb();
  if (!db) return;
  try {
    await push(ref(db, 'email_campaigns'), record);
  } catch (err) {
    console.error('[email] failed to record campaign:', err);
  }
}

// ---------------------------------------------------------------------------
// X feed snapshot (src/server/xFeed.ts)
// The last good @mrdaniel_ai timeline, so a cold function instance — or a day X rate-limits the
// free endpoint and no xAI key is set — still has something real to serve. Public data only.
// Needs an `x_feed_snapshot` read/write rule; without it both calls degrade to no-ops.
// ---------------------------------------------------------------------------

export async function readXFeedSnapshot(): Promise<Record<string, unknown> | null> {
  const db = getServerDb();
  if (!db) return null;
  try {
    const snap = await get(ref(db, 'x_feed_snapshot'));
    return snap.exists() ? (snap.val() as Record<string, unknown>) : null;
  } catch (err) {
    console.error('[x-feed] failed to read snapshot:', (err as Error)?.message ?? err);
    return null;
  }
}

export async function writeXFeedSnapshot(payload: Record<string, unknown>): Promise<void> {
  const db = getServerDb();
  if (!db) return;
  try {
    await set(ref(db, 'x_feed_snapshot'), payload);
  } catch (err) {
    console.error('[x-feed] failed to write snapshot:', (err as Error)?.message ?? err);
  }
}

// ---------------------------------------------------------------------------
// News snapshot (src/server/newsFeed.ts)
// The last good /api/news refresh, so a cold instance whose refresh comes back empty (every feed
// timing out, a WAF wave) still serves real stories instead of an empty grid. Public data only.
// Needs a `news_snapshot` read/write rule; without it both calls degrade to no-ops.
// ---------------------------------------------------------------------------

export async function readNewsSnapshot(): Promise<{ items: unknown[]; fetchedAt: number } | null> {
  const db = getServerDb();
  if (!db) return null;
  try {
    const snap = await get(ref(db, 'news_snapshot'));
    const val = snap.exists() ? (snap.val() as { items?: unknown[]; fetchedAt?: number }) : null;
    return val && Array.isArray(val.items) && typeof val.fetchedAt === 'number' ? { items: val.items, fetchedAt: val.fetchedAt } : null;
  } catch (err) {
    console.error('[news] failed to read snapshot:', (err as Error)?.message ?? err);
    return null;
  }
}

export async function writeNewsSnapshot(payload: { items: unknown[]; fetchedAt: number }): Promise<void> {
  const db = getServerDb();
  if (!db) return;
  try {
    // RTDB rejects `undefined` anywhere in the tree; a JSON round-trip drops those keys.
    await set(ref(db, 'news_snapshot'), JSON.parse(JSON.stringify(payload)));
  } catch (err) {
    console.error('[news] failed to write snapshot:', (err as Error)?.message ?? err);
  }
}
