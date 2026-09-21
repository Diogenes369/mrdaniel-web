/**
 * X write client — likes, reposts, replies and threads for @mrdaniel_ai. SCAFFOLD, LOCKED.
 *
 * Nothing calls this until the operator supplies X Developer credentials. It needs, in Vercel env:
 *   X_API_KEY, X_API_SECRET            — the app's consumer key pair
 *   X_ACCESS_TOKEN, X_ACCESS_SECRET    — @mrdaniel_ai's user token, generated with Read+Write
 *   X_WRITE_ENABLED=1                  — the explicit kill switch; off unless set
 * The free/Premium X *account* tier is not API access; writes need a Developer project whose plan
 * includes POST /2/tweets (and /likes, /retweets for engagement).
 *
 * Quality gates live here, not in the caller, so no path can skip them:
 *   - every action targets an AI-relevant post (`isOnTopic`) — no generic engagement,
 *   - hard daily caps well under X's automation limits (likes 20, reposts 5, replies 10, posts 6),
 *   - no action on the same post twice, no replies that are only an emoji / "great post",
 *   - X's automation rules forbid automated bulk/indiscriminate liking; the caps + topic gate are
 *     what keep this on the "curated, human-reviewed" side. Replies and posts are meant to be
 *     queued from the dashboard and approved by the operator, not fired blind.
 *
 * Auth is OAuth 1.0a user context (HMAC-SHA1), implemented with node:crypto — no new dependency.
 */
import { createHmac, randomBytes } from 'node:crypto';

const API = 'https://api.x.com/2';

export const X_DAILY_CAPS = { like: 20, repost: 5, reply: 10, post: 6 } as const;
export type XWriteAction = keyof typeof X_DAILY_CAPS;

const REQUIRED_ENV = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'] as const;

export function xWriteStatus(): { enabled: boolean; missing: string[] } {
  const missing: string[] = REQUIRED_ENV.filter((k) => !(process.env[k] || '').trim());
  if (process.env.X_WRITE_ENABLED !== '1') missing.push('X_WRITE_ENABLED=1');
  return { enabled: missing.length === 0, missing };
}

export class XWriteLockedError extends Error {
  readonly code = 'x_write_locked';
  constructor(readonly missing: string[]) {
    super(`X writes are locked — missing: ${missing.join(', ')}`);
  }
}

const AI_TOPIC_RE = /\b(ai|a\.i\.|llm|gpt|claude|gemini|grok|llama|mistral|openai|anthropic|deepmind|xai|agent(?:s|ic)?|rag|mcp|fine-?tun|inference|transformer|diffusion|model)\b|בינה מלאכותית|מודל(?:י)? שפה|סוכנ(?:י|ים)/i;
const LOW_EFFORT_REPLY_RE = /^(?:[\p{Emoji}\s!.]+|great (?:post|thread)|so true|this!?|agreed|love (?:it|this)|פוסט מעולה|אחלה|מסכים)\.?$/iu;

export function isOnTopic(text: string): boolean {
  return AI_TOPIC_RE.test(text);
}

/** The gate every action passes. `usedToday` comes from the caller's persisted counter. */
export function checkEngagement(action: XWriteAction, targetText: string, usedToday: number, replyText = ''): string | null {
  if (usedToday >= X_DAILY_CAPS[action]) return `daily cap reached for ${action} (${X_DAILY_CAPS[action]})`;
  if (action !== 'post' && !isOnTopic(targetText)) return 'target post is not about AI';
  if ((action === 'reply' || action === 'post') && (replyText.trim().length < 20 || LOW_EFFORT_REPLY_RE.test(replyText.trim()))) {
    return 'text is too thin to publish';
  }
  return null;
}

// ─── OAuth 1.0a ─────────────────────────────────────────────────────────────────────────────

const pct = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function oauthHeader(method: string, url: string, creds: { key: string; secret: string; token: string; tokenSecret: string }, nonce = randomBytes(16).toString('hex'), ts = Math.floor(Date.now() / 1000).toString()): string {
  const params: Record<string, string> = {
    oauth_consumer_key: creds.key,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: ts,
    oauth_token: creds.token,
    oauth_version: '1.0',
  };
  const u = new URL(url);
  const all: [string, string][] = [...Object.entries(params), ...[...u.searchParams.entries()]];
  const paramString = all
    .map(([k, v]) => [pct(k), pct(v)])
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const base = [method.toUpperCase(), pct(`${u.origin}${u.pathname}`), pct(paramString)].join('&');
  const signature = createHmac('sha1', `${pct(creds.secret)}&${pct(creds.tokenSecret)}`).update(base).digest('base64');
  return 'OAuth ' + Object.entries({ ...params, oauth_signature: signature }).map(([k, v]) => `${pct(k)}="${pct(v)}"`).join(', ');
}

async function xCall(method: 'POST' | 'GET', path: string, body?: unknown): Promise<Record<string, unknown>> {
  const status = xWriteStatus();
  if (!status.enabled) throw new XWriteLockedError(status.missing);
  const url = `${API}${path}`;
  const creds = {
    key: process.env.X_API_KEY!.trim(),
    secret: process.env.X_API_SECRET!.trim(),
    token: process.env.X_ACCESS_TOKEN!.trim(),
    tokenSecret: process.env.X_ACCESS_SECRET!.trim(),
  };
  const res = await fetch(url, {
    method,
    headers: { Authorization: oauthHeader(method, url, creds), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`X API ${res.status}: ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

let cachedUserId = '';
async function myUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const me = await xCall('GET', '/users/me');
  cachedUserId = String((me.data as { id?: string } | undefined)?.id ?? '');
  if (!cachedUserId) throw new Error('X API: /users/me returned no id');
  return cachedUserId;
}

export async function likePost(postId: string): Promise<void> {
  await xCall('POST', `/users/${await myUserId()}/likes`, { tweet_id: postId });
}

export async function repostPost(postId: string): Promise<void> {
  await xCall('POST', `/users/${await myUserId()}/retweets`, { tweet_id: postId });
}

export async function replyToPost(postId: string, text: string): Promise<string> {
  const r = await xCall('POST', '/tweets', { text, reply: { in_reply_to_tweet_id: postId } });
  return String((r.data as { id?: string } | undefined)?.id ?? '');
}

/** Posts a thread in order; returns the ids. Media upload is not wired (needs the v2 media endpoint). */
export async function postThread(texts: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const text of texts) {
    const r = await xCall('POST', '/tweets', ids.length ? { text, reply: { in_reply_to_tweet_id: ids[ids.length - 1] } } : { text });
    ids.push(String((r.data as { id?: string } | undefined)?.id ?? ''));
  }
  return ids;
}
