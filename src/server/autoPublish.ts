import { getNewsItems, type NewsItem, type NewsTopic } from './newsFeed.js';
import { composeNewsPost, publishImageUrl, type SocialPlatform } from './newsPostComposer.js';
import {
  readAutoPublishConfig,
  readPublishedPosts,
  recordPublishedPost,
  agentFirebaseConfigured,
  type PublishedPostRecord,
} from '../agent/firebaseServer.js';

/**
 * Autonomous news auto-publisher core — a plain module (no HTTP handler) so it can be driven from
 * `api/agent-generate.ts` without adding a separate Serverless Function (Vercel Hobby caps a
 * deployment at 12 functions). `api/agent-generate.ts` calls `runAutoPublishCycle` from its daily
 * cron GET and exposes the `auto-publish-run` / `auto-publish-dispatch` POST actions for the
 * dashboard.
 */

const SITE_ORIGIN = 'https://mrdaniel.co.il';

const CATEGORY_TOPICS: Record<'cyber' | 'ai' | 'tech', NewsTopic[]> = {
  cyber: ['cyber'],
  ai: ['ai'],
  tech: ['cloud', 'general'],
};

const BLOCKED_HOST =
  /^(localhost|0\.0\.0\.0|\[?::1\]?|127(\.\d{1,3}){3}|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|169\.254(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})$/i;

export interface PublishPayload {
  platform: string;
  caption: string;
  hashtags?: string[];
  imageUrl: string;
  newsTitle: string;
  newsLink?: string;
  category?: string;
}

/** Forwards one payload to `webhookUrl` (Make.com / n8n / Buffer / Zapier). Never throws. */
export async function dispatchToWebhook(
  webhookUrl: string,
  payload: PublishPayload
): Promise<{ ok: boolean; status: number; detail: string }> {
  let target: URL;
  try {
    target = new URL(webhookUrl);
  } catch {
    return { ok: false, status: 0, detail: 'invalid webhook url' };
  }
  if ((target.protocol !== 'https:' && target.protocol !== 'http:') || BLOCKED_HOST.test(target.hostname)) {
    return { ok: false, status: 0, detail: 'blocked webhook host' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(target.toString(), {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'mrdaniel-auto-publisher', ...payload }),
    });
    return { ok: res.ok, status: res.status, detail: res.ok ? 'forwarded' : `webhook responded ${res.status}` };
  } catch (err) {
    return { ok: false, status: 0, detail: (err as Error)?.name === 'AbortError' ? 'webhook timeout' : 'webhook fetch failed' };
  } finally {
    clearTimeout(timer);
  }
}

/** The "publish one already-generated post" path — used by the dashboard's "אשר ופרסם" button. */
export async function dispatchPublish(
  payload: PublishPayload,
  webhookOverride?: string
): Promise<{ ok: boolean; error?: string; detail?: string; status?: number }> {
  if (!payload.platform || !payload.caption || !payload.newsTitle) {
    return { ok: false, error: 'missing platform / caption / newsTitle' };
  }
  const webhook = (webhookOverride?.trim() || (await readAutoPublishConfig())?.publishWebhookUrl || '').trim();
  if (!webhook) return { ok: false, error: 'no-webhook', detail: 'no publishWebhookUrl configured' };
  const result = await dispatchToWebhook(webhook, payload);
  return { ok: result.ok, detail: result.detail, status: result.status };
}

function normalizeTitle(t: string): string {
  return t.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 120);
}

function resolveCategory(cfg: 'cyber' | 'ai' | 'tech' | 'auto'): 'cyber' | 'ai' | 'tech' {
  if (cfg !== 'auto') return cfg;
  const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86_400_000);
  return (['cyber', 'ai', 'tech'] as const)[dayOfYear % 3];
}

function platformsFor(p: 'linkedin' | 'instagram' | 'all'): SocialPlatform[] {
  return p === 'all' ? ['linkedin', 'instagram'] : [p];
}

export interface RunOpts {
  /** 'cron' = the daily Vercel cron; 'scheduler' = external `?manual=1`; 'force' = dashboard "run now". */
  trigger: 'cron' | 'scheduler' | 'force';
}

export async function runAutoPublishCycle(opts: RunOpts): Promise<Record<string, unknown>> {
  if (!agentFirebaseConfigured) return { ok: false, error: 'firebase-not-configured' };

  const cfg = (await readAutoPublishConfig()) ?? {};
  const force = opts.trigger === 'force';
  const nowHourUTC = new Date().getUTCHours();
  const today = new Date().toISOString().slice(0, 10);
  const slotKey = `${today}-${String(nowHourUTC).padStart(2, '0')}`;

  if (!cfg.active && !force) return { ok: true, skipped: 'paused' };

  // External scheduler calls only post at the hours ticked in the panel.
  if (opts.trigger === 'scheduler') {
    const slots = Array.isArray(cfg.slotsUTC) ? cfg.slotsUTC : [];
    if (slots.length > 0 && !slots.includes(nowHourUTC)) {
      return { ok: true, skipped: 'not-a-slot', nowHourUTC, slots };
    }
  }

  const history = await readPublishedPosts();
  const runs = Object.values(history);

  // Once-per-scope guard (day for cron, day+hour for scheduler). `force` skips it.
  if (!force) {
    const already = runs.some((r) => {
      if (r.mode === 'manual' || r.mode === 'approved') return false;
      return opts.trigger === 'scheduler' ? r.slotKey === slotKey : (r.slotKey ?? '').slice(0, 10) === today;
    });
    if (already) return { ok: true, skipped: 'already-ran', scope: opts.trigger === 'scheduler' ? slotKey : today };
  }

  const publishedIds = new Set(runs.map((r) => r.newsId));
  const publishedTitles = new Set(runs.map((r) => normalizeTitle(r.newsTitle)));

  const category = resolveCategory((cfg.category ?? 'auto') as 'cyber' | 'ai' | 'tech' | 'auto');
  const wantedTopics = CATEGORY_TOPICS[category];

  const { items } = await getNewsItems();
  const candidate: NewsItem | undefined = items
    .filter((i) => wantedTopics.includes(i.topic))
    .find((i) => !publishedIds.has(i.id) && !publishedTitles.has(normalizeTitle(i.title)));

  if (!candidate) return { ok: true, skipped: 'nothing-new', category };

  const mode: 'full-auto' | 'drafts' = cfg.mode === 'full-auto' ? 'full-auto' : 'drafts';
  const imageUrl = publishImageUrl(candidate, SITE_ORIGIN);
  const platforms = platformsFor((cfg.platform ?? 'linkedin') as 'linkedin' | 'instagram' | 'all');

  const results: { platform: string; status: PublishedPostRecord['status']; detail: string; id: string | null }[] = [];

  for (const platform of platforms) {
    const post = composeNewsPost(candidate, platform);
    const base: Omit<PublishedPostRecord, 'status' | 'detail'> = {
      newsId: candidate.id,
      newsTitle: candidate.title,
      newsLink: candidate.link,
      category,
      topic: candidate.topic,
      platform,
      imageUrl,
      caption: post.fullText,
      hashtags: post.hashtags,
      mode: force ? 'manual' : mode,
      slotKey,
      createdAt: Date.now(),
    };

    if (mode === 'full-auto') {
      const webhook = (cfg.publishWebhookUrl ?? '').trim();
      if (!webhook) {
        const id = await recordPublishedPost({ ...base, status: 'failed', detail: 'no publishWebhookUrl configured' });
        results.push({ platform, status: 'failed', detail: 'no-webhook', id });
        continue;
      }
      const dispatch = await dispatchToWebhook(webhook, {
        platform,
        caption: post.fullText,
        hashtags: post.hashtags,
        imageUrl,
        newsTitle: candidate.title,
        newsLink: candidate.link,
        category,
      });
      const status: PublishedPostRecord['status'] = dispatch.ok ? 'success' : 'failed';
      const id = await recordPublishedPost({ ...base, status, detail: dispatch.detail });
      results.push({ platform, status, detail: dispatch.detail, id });
    } else {
      const id = await recordPublishedPost({ ...base, status: 'pending_approval', detail: 'awaiting admin approval' });
      results.push({ platform, status: 'pending_approval', detail: 'queued', id });
    }
  }

  return { ok: true, category, newsId: candidate.id, newsTitle: candidate.title, mode, results };
}
