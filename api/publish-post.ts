import { readAutoPublishConfig } from '../src/agent/firebaseServer.js';

// Publishing gateway. Forwards a generated post (caption + image URL + metadata) to a single
// outbound webhook — Make.com / n8n / Buffer / Zapier / a custom endpoint — which handles the
// actual account posting. The webhook URL comes from the request body or, if omitted, from
// `auto_publish_config/publishWebhookUrl` in Firebase.
//
// Called two ways:
//   • by api/cron/auto-publish.ts (server-to-server, x-admin-secret)
//   • by the dashboard's "אשר ופרסם" button on a pending-approval run (x-admin-secret)

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
}

function isAdminAuthorized(req: any): boolean {
  const configured = process.env.ADMIN_API_SECRET;
  if (!configured) return true;
  return req.headers?.['x-admin-secret'] === configured;
}

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

/** Forwards one payload to `webhookUrl`. Never throws — returns a status the caller records. */
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
    const detail = res.ok ? 'forwarded' : `webhook responded ${res.status}`;
    return { ok: res.ok, status: res.status, detail };
  } catch (err) {
    return { ok: false, status: 0, detail: (err as Error)?.name === 'AbortError' ? 'webhook timeout' : 'webhook fetch failed' };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  if (!isAdminAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const body = (typeof req.body === 'object' && req.body) || {};
  const { platform, caption, imageUrl, newsTitle } = body as Record<string, unknown>;
  if (!platform || !caption || !newsTitle) {
    res.status(400).json({ ok: false, error: 'missing platform / caption / newsTitle' });
    return;
  }

  const webhookUrl =
    (typeof body.webhookUrl === 'string' && body.webhookUrl.trim()) ||
    (await readAutoPublishConfig())?.publishWebhookUrl ||
    '';

  if (!webhookUrl) {
    res.status(200).json({ ok: false, error: 'no-webhook', detail: 'no publishWebhookUrl configured' });
    return;
  }

  const result = await dispatchToWebhook(webhookUrl, {
    platform: String(platform),
    caption: String(caption),
    hashtags: Array.isArray(body.hashtags) ? (body.hashtags as string[]) : [],
    imageUrl: String(imageUrl ?? ''),
    newsTitle: String(newsTitle),
    newsLink: typeof body.newsLink === 'string' ? body.newsLink : undefined,
    category: typeof body.category === 'string' ? body.category : undefined,
  });

  res.status(200).json(result);
}
