import type { Platform } from '../agent/types.js';

export interface SocialPostPayload {
  platform: Platform;
  caption: string;
  hashtags?: string[];
  mediaUrls?: string[];
  /** Optional external identifier for tracking. */
  publishId?: string;
  /** Targeted publish time in ISO-8601; server may ignore/schedule. */
  scheduledAt?: string;
  /** Optional source article title/link for audit trail. */
  sourceTitle?: string;
  sourceLink?: string;
  category?: string;
}

export interface PublishResult {
  ok: boolean;
  status: 'accepted' | 'queued' | 'published' | 'skipped' | 'failed';
  publishId?: string;
  platform: Platform;
  provider: 'webhook' | 'instagram-graph' | 'none';
  message?: string;
  receivedAt: string;
}

const WEBHOOK_ENABLED = String(process.env.SOCIAL_PUBLISH_WEBHOOK_ENABLED ?? 'false').toLowerCase() === 'true';
const WEBHOOK_URL = process.env.SOCIAL_PUBLISH_WEBHOOK_URL?.trim() || '';
const INSTAGRAM_ENABLED = String(process.env.INSTAGRAM_PUBLISH_ENABLED ?? 'false').toLowerCase() === 'true';

export function isSocialPublisherConfigured(): boolean {
  return WEBHOOK_ENABLED && WEBHOOK_URL.length > 0;
}

export function isInstagramPublishEnabled(): boolean {
  return INSTAGRAM_ENABLED;
}

async function postJson(url: string, payload: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout?.(12_000) ?? undefined,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function publishSocialPost(payload: SocialPostPayload): Promise<PublishResult> {
  const receivedAt = new Date().toISOString();
  const publishId = payload.publishId ?? `sp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (isInstagramPublishEnabled()) {
    try {
      const igResult = await publishToInstagramGraph(payload, publishId);
      return { ...igResult, publishId, receivedAt };
    } catch (err) {
      console.error('[social-publisher] instagram graph publish failed:', err);
    }
  }

  if (isSocialPublisherConfigured()) {
    const ok = await postJson(WEBHOOK_URL, {
      type: 'social-post',
      publishId,
      platform: payload.platform,
      caption: payload.caption,
      hashtags: payload.hashtags ?? [],
      mediaUrls: payload.mediaUrls ?? [],
      scheduledAt: payload.scheduledAt,
      sourceTitle: payload.sourceTitle,
      sourceLink: payload.sourceLink,
      category: payload.category,
    });
    if (ok) {
      return { ok: true, status: 'accepted', publishId, platform: payload.platform, provider: 'webhook', receivedAt };
    }
    return { ok: false, status: 'failed', publishId, platform: payload.platform, provider: 'webhook', message: 'webhook rejected request', receivedAt };
  }

  return { ok: false, status: 'skipped', publishId, platform: payload.platform, provider: 'none', message: 'no publisher configured', receivedAt };
}

async function publishToInstagramGraph(payload: SocialPostPayload, publishId: string): Promise<PublishResult> {
  const accessToken = process.env.INSTAGRAM_GRAPH_ACCESS_TOKEN?.trim();
  const igUserId = process.env.INSTAGRAM_GRAPH_USER_ID?.trim();
  if (!accessToken || !igUserId) {
    return { ok: false, status: 'skipped', publishId, platform: payload.platform, provider: 'instagram-graph', message: 'missing instagram graph credentials', receivedAt: new Date().toISOString() };
  }

  const imageUrl = payload.mediaUrls?.[0]?.trim();
  if (!imageUrl) {
    return { ok: false, status: 'skipped', publishId, platform: payload.platform, provider: 'instagram-graph', message: 'missing media url for instagram container', receivedAt: new Date().toISOString() };
  }

  const caption = [payload.caption, payload.hashtags?.length ? payload.hashtags.join(' ') : ''].filter(Boolean).join('\n\n');

  const containerRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
    method: 'POST',
    headers: { accept: 'application/json' },
    body: new URLSearchParams({
      image_url: imageUrl,
      caption,
      access_token: accessToken,
    }),
  });
  const containerJson = (await containerRes.json()) as { id?: string; error?: { message?: string } };
  if (!containerRes.ok || !containerJson.id) {
    return { ok: false, status: 'failed', publishId, platform: payload.platform, provider: 'instagram-graph', message: containerJson.error?.message ?? 'container creation failed', receivedAt: new Date().toISOString() };
  }

  const publishRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { accept: 'application/json' },
    body: new URLSearchParams({
      creation_id: containerJson.id,
      access_token: accessToken,
    }),
  });
  const publishJson = (await publishRes.json()) as { id?: string; error?: { message?: string } };
  if (!publishRes.ok || !publishJson.id) {
    return { ok: false, status: 'failed', publishId, platform: payload.platform, provider: 'instagram-graph', message: publishJson.error?.message ?? 'publish failed', receivedAt: new Date().toISOString() };
  }

  return { ok: true, status: 'published', publishId, platform: payload.platform, provider: 'instagram-graph', receivedAt: new Date().toISOString() };
}
