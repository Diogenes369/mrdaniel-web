import { getNewsItems, type NewsItem, type NewsTopic } from '../../src/server/newsFeed.js';
import { composeNewsPost, publishImageUrl, type SocialPlatform } from '../../src/server/newsPostComposer.js';
import {
  readAutoPublishConfig,
  readPublishedPosts,
  recordPublishedPost,
  agentFirebaseConfigured,
  type PublishedPostRecord,
} from '../../src/agent/firebaseServer.js';
import { dispatchToWebhook } from '../publish-post.js';

// Autonomous news auto-publisher — the cron loop.
//
// Vercel Cron (Hobby) fires this ONCE daily at 13:00 UTC (see vercel.json). Each run:
//   1. reads auto_publish_config (dashboard-owned)
//   2. bails unless the engine is active AND no cron-origin run has happened yet today
//   3. picks the newest news item in the target category that isn't already in published_posts
//   4. composes the caption(s) for the target platform(s) and picks the image URL
//   5. mode "full-auto"  → POSTs to the publish webhook, records the run (success/failed)
//      mode "drafts"     → records the run as pending_approval for the dashboard to approve
//
// Higher frequency (2x / custom hours): Vercel Hobby can't schedule sub-daily crons, so point an
// external scheduler (Make.com / n8n / cron-job.org) at
// `POST /api/cron/auto-publish?manual=1` with the `x-admin-secret` header at the desired hours.
// The `slotsUTC` config is honoured for those `manual` calls (fromScheduler) so they only post at
// the hours you picked; the dashboard's "run now" button passes `manual=1&force=1` to bypass that.

const SITE_ORIGIN = 'https://mrdaniel.co.il';

const CATEGORY_TOPICS: Record<'cyber' | 'ai' | 'tech', NewsTopic[]> = {
  cyber: ['cyber'],
  ai: ['ai'],
  tech: ['cloud', 'general'],
};

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
}

function isCronAuthorized(req: any): boolean {
  const cronSecret = process.env.CRON_SECRET;
  return !cronSecret || req.headers?.authorization === `Bearer ${cronSecret}`;
}

function isAdminAuthorized(req: any): boolean {
  const configured = process.env.ADMIN_API_SECRET;
  if (!configured) return true;
  return req.headers?.['x-admin-secret'] === configured;
}

function normalizeTitle(t: string): string {
  return t.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 120);
}

/** Which category to target this tick — `auto` rotates cyber → ai → tech by day-of-year. */
function resolveCategory(cfg: 'cyber' | 'ai' | 'tech' | 'auto'): 'cyber' | 'ai' | 'tech' {
  if (cfg !== 'auto') return cfg;
  const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86_400_000);
  return (['cyber', 'ai', 'tech'] as const)[dayOfYear % 3];
}

function platformsFor(p: 'linkedin' | 'instagram' | 'all'): SocialPlatform[] {
  return p === 'all' ? ['linkedin', 'instagram'] : [p];
}

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const url = new URL(req.url ?? '/', 'http://localhost');
  const manual = url.searchParams.get('manual') === '1';
  // `force=1` (dashboard "run now") bypasses the slot-hour check on a manual call.
  const force = url.searchParams.get('force') === '1';

  if (manual ? !isAdminAuthorized(req) : !isCronAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  if (!agentFirebaseConfigured) {
    res.status(200).json({ ok: false, error: 'firebase-not-configured' });
    return;
  }

  try {
    const cfg = (await readAutoPublishConfig()) ?? {};
    const nowHourUTC = new Date().getUTCHours();
    const today = new Date().toISOString().slice(0, 10);
    const slotKey = `${today}-${String(nowHourUTC).padStart(2, '0')}`;

    if (!cfg.active && !manual) {
      res.status(200).json({ ok: true, skipped: 'paused' });
      return;
    }
    // Manual scheduler calls (no `force`) still respect the configured hours.
    if (manual && !force) {
      const slots = Array.isArray(cfg.slotsUTC) ? cfg.slotsUTC : [];
      if (slots.length > 0 && !slots.includes(nowHourUTC)) {
        res.status(200).json({ ok: true, skipped: 'not-a-slot', nowHourUTC, slots });
        return;
      }
    }

    const history = await readPublishedPosts();
    const runs = Object.values(history);

    // Once-a-day guard: the built-in Vercel cron fires daily, and a scheduler retry shouldn't
    // double-post the same slot. `force` (dashboard "run now") skips this.
    if (!force) {
      const scope = manual ? slotKey : today;
      const already = runs.some((r) => {
        if (r.mode === 'manual' || r.mode === 'approved') return false;
        return manual ? r.slotKey === slotKey : (r.slotKey ?? '').slice(0, 10) === today;
      });
      if (already) {
        res.status(200).json({ ok: true, skipped: 'already-ran', scope });
        return;
      }
    }

    const publishedIds = new Set(runs.map((r) => r.newsId));
    const publishedTitles = new Set(runs.map((r) => normalizeTitle(r.newsTitle)));

    const category = resolveCategory((cfg.category ?? 'auto') as 'cyber' | 'ai' | 'tech' | 'auto');
    const wantedTopics = CATEGORY_TOPICS[category];

    const { items } = await getNewsItems();
    const candidate: NewsItem | undefined = items
      .filter((i) => wantedTopics.includes(i.topic))
      .find((i) => !publishedIds.has(i.id) && !publishedTitles.has(normalizeTitle(i.title)));

    if (!candidate) {
      res.status(200).json({ ok: true, skipped: 'nothing-new', category });
      return;
    }

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
        // `force` (dashboard "run now") records as 'manual' so it never blocks a real cron run;
        // cron and scheduler calls record the publish mode so the day/slot guards can see them.
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

    res.status(200).json({ ok: true, category, newsId: candidate.id, newsTitle: candidate.title, mode, results });
  } catch (err) {
    console.error('[cron/auto-publish] error:', (err as Error)?.message ?? err);
    res.status(500).json({ ok: false, error: 'auto-publish failed' });
  }
}
