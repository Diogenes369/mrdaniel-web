/**
 * Live feed of @mrdaniel_ai's latest posts for the homepage.
 *
 * ## Sources, in order
 *
 * 1. `syndication.twitter.com/srv/timeline-profile/…` — the free endpoint X's own embed widget
 *    reads. Tried first because it costs nothing, but on 2026-09-21 it answered `429 Rate limit
 *    exceeded` to every request from every IP tested (even for @elonmusk), so it cannot be the
 *    only path.
 * 2. Grok with the server-side `x_search` tool restricted to the handle (xaiClient.ts). Reliable,
 *    but billed per post fetched ($5 / 1k posts from 2026-09-21) — which is why the result is cached
 *    for `X_FEED_TTL_MIN` (default 120 min) in memory, at the CDN (api/news.ts), and in Firebase.
 *    At the default that is ≤ 12 refreshes × 6 posts a day, well under a dollar.
 * 3. The last good snapshot in Firebase RTDB — what a cold instance serves while 1–2 are down.
 *
 * Every post is re-hydrated through the per-post syndication endpoint when it answers, so the text
 * shown is X's own (not the model's paraphrase) and the images are real.
 */
import { grokXSearch, isXaiConfigured, parseGrokJson } from './xaiClient.js';
import { importXPost, normalizeXUrl } from './xPostFetcher.js';
import { readXFeedSnapshot, writeXFeedSnapshot } from '../agent/firebaseServer.js';

export const X_HANDLE = 'mrdaniel_ai';
export const X_PROFILE_URL = `https://x.com/${X_HANDLE}`;
const MAX_POSTS = 6;

export interface XFeedPost {
  id: string;
  url: string;
  text: string;
  createdAt: string;
  images: string[];
  likes?: number;
  reposts?: number;
  replies?: number;
}

export interface XFeedPayload {
  handle: string;
  profileUrl: string;
  posts: XFeedPost[];
  source: 'syndication' | 'grok' | 'snapshot' | 'none';
  fetchedAt: number;
  /** Whether the Grok fallback is available (XAI_API_KEY set). */
  grokConfigured: boolean;
  note?: string;
}

function ttlMs(): number {
  const min = Number(process.env.X_FEED_TTL_MIN);
  return (Number.isFinite(min) && min >= 5 ? min : 120) * 60_000;
}

let memo: XFeedPayload | null = null;
let inFlight: Promise<XFeedPayload> | null = null;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

type Rec = Record<string, unknown>;
const asRec = (v: unknown): Rec => (v && typeof v === 'object' ? (v as Rec) : {});

function tweetToPost(t: Rec): XFeedPost | null {
  const id = String(t.id_str ?? t.id ?? '');
  const text = String(t.full_text ?? t.text ?? '')
    .replace(/https?:\/\/t\.co\/[A-Za-z0-9]+/g, '')
    .trim();
  if (!id || !text) return null;
  const media = (asRec(t.extended_entities).media ?? asRec(t.entities).media ?? []) as Rec[];
  return {
    id,
    url: `${X_PROFILE_URL}/status/${id}`,
    text,
    createdAt: new Date(String(t.created_at ?? Date.now())).toISOString(),
    images: (Array.isArray(media) ? media : []).map((m) => String(m.media_url_https ?? '')).filter(Boolean).slice(0, 4),
    likes: Number(t.favorite_count) || 0,
    reposts: Number(t.retweet_count) || 0,
    replies: Number(t.reply_count) || 0,
  };
}

/** Source 1. Returns [] on any failure (including the usual 429). */
async function fromSyndication(): Promise<XFeedPost[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${X_HANDLE}`, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    const html = await res.text();
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) return [];
    const data = JSON.parse(m[1]);
    const entries = (asRec(asRec(asRec(data.props).pageProps).timeline).entries ?? []) as Rec[];
    return entries
      .map((e) => asRec(asRec(e.content).tweet))
      .filter((t) => String(asRec(t.user).screen_name ?? '').toLowerCase() === X_HANDLE)
      .map(tweetToPost)
      .filter((p): p is XFeedPost => Boolean(p))
      .slice(0, MAX_POSTS);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Source 2: Grok + x_search. */
async function fromGrok(): Promise<XFeedPost[]> {
  if (!isXaiConfigured()) return [];
  const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const result = await grokXSearch({
    handles: [X_HANDLE],
    fromDate: from,
    prompt: `List the ${MAX_POSTS} most recent original posts (not replies, not reposts) by @${X_HANDLE} on X, newest first.
Return ONLY a JSON object: {"posts":[{"url":"https://x.com/${X_HANDLE}/status/<id>","text":"<the post text, verbatim>","createdAt":"<ISO 8601>"}]}.
Copy the text exactly as posted — do not translate, summarise or edit it. If there are no posts, return {"posts":[]}.`,
  });

  let rows: Rec[] = [];
  try {
    const parsed = asRec(parseGrokJson(result.text));
    rows = Array.isArray(parsed.posts) ? (parsed.posts as Rec[]) : [];
  } catch {
    rows = [];
  }
  // Citations are the ground truth for WHICH posts exist; the JSON supplies text/dates.
  const byId = new Map<string, XFeedPost>();
  for (const r of rows) {
    const target = normalizeXUrl(String(r.url ?? ''));
    if (!target) continue;
    byId.set(target.id, {
      id: target.id,
      url: `${X_PROFILE_URL}/status/${target.id}`,
      text: String(r.text ?? '').trim(),
      createdAt: String(r.createdAt ?? ''),
      images: [],
    });
  }
  for (const c of result.citations) {
    const target = normalizeXUrl(c);
    if (target && !byId.has(target.id) && target.handle.replace('@', '').toLowerCase() === X_HANDLE) {
      byId.set(target.id, { id: target.id, url: `${X_PROFILE_URL}/status/${target.id}`, text: '', createdAt: '', images: [] });
    }
  }
  return [...byId.values()].slice(0, MAX_POSTS);
}

/** Replaces model-sourced text with X's own, and adds images, wherever per-post syndication answers. */
async function hydrate(posts: XFeedPost[]): Promise<XFeedPost[]> {
  const out = await Promise.all(
    posts.map(async (p) => {
      try {
        const imported = await importXPost(p.url);
        if (!imported.ok) return p;
        const last = imported.items[imported.items.length - 1];
        return { ...p, text: last?.text || p.text, images: last?.images?.length ? last.images : p.images };
      } catch {
        return p;
      }
    }),
  );
  return out
    .filter((p) => p.text.length > 0)
    // Snowflake ids are time-ordered, so they sort correctly even when a date is missing.
    .sort((a, b) => b.id.length - a.id.length || (b.id > a.id ? 1 : b.id < a.id ? -1 : 0));
}

async function refresh(): Promise<XFeedPayload> {
  const base = { handle: X_HANDLE, profileUrl: X_PROFILE_URL, grokConfigured: isXaiConfigured(), fetchedAt: Date.now() };

  const synd = await fromSyndication();
  if (synd.length) {
    const payload: XFeedPayload = { ...base, posts: synd, source: 'syndication' };
    await writeXFeedSnapshot(payload as unknown as Record<string, unknown>);
    return payload;
  }

  try {
    const grok = await fromGrok();
    if (grok.length) {
      const posts = await hydrate(grok);
      if (posts.length) {
        const payload: XFeedPayload = { ...base, posts, source: 'grok' };
        await writeXFeedSnapshot(payload as unknown as Record<string, unknown>);
        return payload;
      }
    }
  } catch (err) {
    console.error('[x-feed] grok x_search failed:', (err as Error)?.message ?? err);
  }

  const snap = await readXFeedSnapshot();
  if (snap && Array.isArray(snap.posts) && snap.posts.length) {
    return { ...(snap as unknown as XFeedPayload), source: 'snapshot', grokConfigured: base.grokConfigured };
  }
  return {
    ...base,
    posts: [],
    source: 'none',
    note: base.grokConfigured ? 'לא נמצאו פוסטים עדכניים.' : 'הפיד החינמי של X חסום כרגע; הגדרת XAI_API_KEY תפעיל את Grok כמקור.',
  };
}

/** Cached entry point. `force` skips the memo (admin "refresh now"). */
export async function getXFeed(force = false): Promise<XFeedPayload> {
  if (!force && memo && Date.now() - memo.fetchedAt < ttlMs()) return memo;
  if (!inFlight) {
    inFlight = refresh()
      .then((p) => {
        // A 'none' result is not cached for the full TTL — the next visitor retries in 5 minutes.
        memo = p.source === 'none' ? { ...p, fetchedAt: Date.now() - ttlMs() + 5 * 60_000 } : p;
        return p;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export function xFeedCdnSeconds(): number {
  return Math.round(ttlMs() / 1000);
}
