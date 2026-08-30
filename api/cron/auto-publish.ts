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
// Vercel Cron fires this hourly (see vercel.json). Each tick:
//   1. reads auto_publish_config (dashboard-owned)
//   2. bails unless the engine is active AND the current UTC hour is a configured slot AND that
//      slot hasn't already run today (slotKey de-dup in published_posts)
//   3. picks the newest news item in the target category that isn't already in published_posts
//   4. composes the caption(s) for the target platform(s) and picks the image URL
//   5. mode "full-auto"  → POSTs to the publish webhook, records the run (success/failed)
//      mode "drafts"     → records the run as pending_approval for the dashboard to approve
//
// Manual trigger: GET/POST with `x-admin-secret` and `?manual=1` runs steps 3-5 immediately,
// ignoring the active/slot gates (but still de-duping by news id).

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
    const slotKey = `${new Date().toISOString().slice(0, 10)}-${String(nowHourUTC).padStart(2, '0')}`;

    if (!manual) {
      if (!cfg.active) {
        res.status(200).json({ ok: true, skipped: 'paused' });
        return;
      }
      const slots = Array.isArray(cfg.slotsUTC) ? cfg.slotsUTC : [];
      if (!slots.includes(nowHourUTC)) {
        res.status(200).json({ ok: true, skipped: 'not-a-slot', nowHourUTC, slots });
        return;
      }
    }

    const history = await readPublishedPosts();
    const runs = Object.values(history);

    // Slot de-dup — a cron slot that already produced a run today does nothing on a retry.
    if (!manual && runs.some((r) => r.slotKey === slotKey && r.mode !== 'manual')) {
      res.status(200).json({ ok: true, skipped: 'slot-already-ran', slotKey });
      return;
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
        mode: manual ? 'manual' : mode,
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
