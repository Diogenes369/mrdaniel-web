/**
 * ArticlePrecomputeAgent — every article in the feed is fetched, parsed and summarised in the
 * BACKGROUND, before anyone clicks it (2026-09-23).
 *
 * Before this, the article modal called /api/news/analyze on click: a publisher fetch (up to 14 s)
 * plus a model call (~7 s) while the reader watched a spinner, fast only once the CDN happened to
 * hold that article. Now:
 *
 *   background  → runPrecompute(): newest un-analysed feed items → generateArticleInsights() →
 *                 Firebase `article_insights/<key>` (one child per article)
 *   on click    → the modal reads the stored JSON from a bulk map the page prefetched while idle
 *                 (`GET /api/news?action=insights`, CDN-cached). No fetch, no model, no wait.
 *
 * An article the agent has not reached yet opens instantly too — on the deterministic teaser
 * sections (src/lib/newsAnalysis.ts) — and picks up the full analysis on a later visit. Nothing on
 * the click path can start a generation any more (see handleAnalyze in api/news.ts).
 *
 * Triggers (no single one is load-bearing): the local 24/7 worker every AGENT_PRECOMPUTE_EVERY_MIN
 * (default 10), the daily Vercel cron, and `POST /api/news?action=precompute` with the admin secret.
 *
 * Quota: the chain in newsInsights.ts is on free per-model daily quotas (flash-lite 3.1 and 3.5,
 * ~500/day each). A batch stops at its first rate-limit so a busy hour cannot burn the day, and an
 * article that keeps failing is retried a bounded number of times, not forever.
 */
import { createHash } from 'node:crypto';
import { getNewsItems, type NewsItem } from './newsFeed.js';
import { generateArticleInsights, isInsightsConfigured, type ArticleInsights } from './newsInsights.js';
import { readArticleInsights, writeArticleInsight } from '../agent/firebaseServer.js';

/** What is stored per article. `i` is absent while the article has only failed attempts. */
interface StoredInsight {
  link: string;
  /** ms epoch of the last successful analysis. */
  at?: number;
  i?: Omit<ArticleInsights, 'cached'>;
  /** Failed attempts so far, and when the last one happened. */
  fails?: number;
  failedAt?: number;
}

/** What the modal gets per article id. */
export type ModalInsights = Omit<ArticleInsights, 'cached'>;

/** Firebase hands back untyped JSON; this is the one place it is read as StoredInsight. */
async function readStored(): Promise<Record<string, StoredInsight>> {
  return (await readArticleInsights()) as unknown as Record<string, StoredInsight>;
}

const MAX_FAILS = 3;
const RETRY_AFTER_MS = 3 * 60 * 60 * 1000;
/** Stored analyses for articles that left the feed are dropped after this. */
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/** Stable per-article key: the link, not the title (titles are rewritten by translation). */
export function insightKey(link: string): string {
  return createHash('sha1').update(link).digest('hex').slice(0, 16);
}

/**
 * Only a failure that is the ARTICLE's fault counts against it: the model answered but the answer
 * was unusable for this text, or the item has no usable title. Everything else — a 429, a 503
 * "high demand", every engine down, a timeout, a network error — is the providers' state, not the
 * article's, and must neither burn one of its bounded retries nor keep the batch hammering.
 * (First version inverted this and matched only 429 wording; a morning of Gemini 503s marked
 * healthy articles as failing — 2026-09-23.)
 */
function isArticleFault(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /did not return a usable|title is missing|too short to analyze/i.test(m);
}

export interface PrecomputeResult {
  ok: boolean;
  done: number;
  failed: number;
  pending: number;
  /** `rate-limit` covers every provider-side stop: 429, 503, all engines down, timeouts. */
  stoppedBy?: 'budget' | 'rate-limit' | 'not-configured';
  ms: number;
}

/**
 * One batch. Newest articles first (they are the ones being clicked), until `maxItems` or the
 * wall-clock budget — sized to finish inside api/news.ts's 90 s function limit. Never throws.
 */
export async function runPrecompute(opts: { maxItems?: number; budgetMs?: number } = {}): Promise<PrecomputeResult> {
  const t0 = Date.now();
  const maxItems = opts.maxItems ?? 4;
  const budgetMs = opts.budgetMs ?? 70_000;
  if (!isInsightsConfigured()) return { ok: false, done: 0, failed: 0, pending: 0, stoppedBy: 'not-configured', ms: 0 };

  const [{ items }, stored] = await Promise.all([getNewsItems(), readStored()]);
  const now = Date.now();
  const byTime = [...items].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const todo = byTime.filter((item) => {
    const s = stored[insightKey(item.link)];
    if (!s) return true;
    if (s.i) return false;
    return (s.fails ?? 0) < MAX_FAILS && now - (s.failedAt ?? 0) > RETRY_AFTER_MS;
  });

  let done = 0;
  let failed = 0;
  let stoppedBy: PrecomputeResult['stoppedBy'];
  for (const item of todo) {
    if (done + failed >= maxItems) break;
    // Each analysis can take ~20 s worst case (14 s fetch + model); do not start one that won't finish.
    if (Date.now() - t0 > budgetMs - 22_000) {
      stoppedBy = 'budget';
      break;
    }
    const key = insightKey(item.link);
    try {
      const insights = await generateArticleInsights({
        title: item.title,
        summary: item.summary,
        excerpt: item.excerpt,
        source: item.source,
        topic: item.topic,
        link: item.link,
      });
      const { cached: _cached, ...value } = insights;
      await writeArticleInsight(key, { link: item.link, at: Date.now(), i: value } satisfies StoredInsight);
      done++;
    } catch (err) {
      const prev = stored[key];
      if (!isArticleFault(err)) {
        // The providers are down or throttled — not this article's fault. Stop the batch; the
        // next trigger (≤10 min away) tries again with the article's record untouched.
        stoppedBy = 'rate-limit';
        console.warn('[precompute] engines unavailable, stopping batch:', ((err as Error)?.message ?? String(err)).slice(0, 200));
        break;
      }
      failed++;
      await writeArticleInsight(key, { link: item.link, fails: (prev?.fails ?? 0) + 1, failedAt: Date.now() } satisfies StoredInsight);
      console.warn(`[precompute] ${item.id} failed:`, (err as Error)?.message ?? err);
    }
  }

  // Housekeeping: drop analyses of articles that left the feed a week ago.
  const live = new Set(items.map((i) => insightKey(i.link)));
  await Promise.all(
    Object.entries(stored)
      .filter(([k, v]) => !live.has(k) && now - Number(v.at ?? v.failedAt ?? 0) > KEEP_MS)
      .map(([k]) => writeArticleInsight(k, null))
  );

  const pending = Math.max(0, todo.length - done - failed);
  memo = null; // the bulk map is now stale
  return { ok: true, done, failed, pending, ...(stoppedBy ? { stoppedBy } : {}), ms: Date.now() - t0 };
}

let memo: { at: number; map: Record<string, ModalInsights> } | null = null;
const MEMO_MS = 2 * 60 * 1000;

/**
 * Every stored analysis for an article currently in the feed, keyed by the feed item's `id` (what
 * the frontend has). Read-only — this never generates.
 */
export async function getInsightsMap(): Promise<{ map: Record<string, ModalInsights>; coverage: { analysed: number; total: number } }> {
  const [{ items }, stored] = await Promise.all([getNewsItems(), memo && Date.now() - memo.at < MEMO_MS ? Promise.resolve(null) : readStored()]);
  let map: Record<string, ModalInsights>;
  if (stored === null && memo) {
    map = memo.map;
  } else {
    map = {};
    for (const item of items as NewsItem[]) {
      const s = (stored ?? {})[insightKey(item.link)];
      if (s?.i) map[item.id] = s.i;
    }
    memo = { at: Date.now(), map };
  }
  return { map, coverage: { analysed: Object.keys(map).length, total: items.length } };
}

/** Single-article lookup for the legacy /api/news/analyze URL. Read-only. */
export async function getStoredInsight(link: string): Promise<ModalInsights | null> {
  const stored = await readStored();
  const s = stored[insightKey(link)];
  return s?.i ?? null;
}
