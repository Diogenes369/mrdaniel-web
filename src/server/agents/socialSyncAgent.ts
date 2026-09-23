/**
 * SocialSyncAgent — pulls Daniel's own published content into the site's "tips" feed, read-only,
 * with no human in the loop (2026-09-23).
 *
 * ## Sources, and what each one can actually give (probed 2026-09-23)
 *
 *   • Guides — STATIC_GUIDES (src/server/leadMagnets.ts). Always available; a guide added there
 *     shows up on the homepage on the next sync with no other edit.
 *   • X @mrdaniel_ai — getXFeed() (src/server/xFeed.ts): free syndication → Grok x_search →
 *     Firebase snapshot. DISABLED by default since 2026-09-23 (see xLegEnabled): the Grok leg is
 *     paid. Set SOCIAL_SYNC_X=1 to turn it back on; nothing else needs to change.
 *   • Linktree linktr.ee/mrdaniel.ai — public page; the link list is embedded JSON. Only CONTENT
 *     links are kept (a guide, an article, a video) — profile links (X, Instagram, Threads, TikTok,
 *     LinkedIn, Spotify, the site root) are navigation, not content, and are dropped. As of the probe
 *     the tree holds only profile links, so this leg adds items once a content link is placed there.
 *   • LinkedIn — NOT fetched. Every profile/activity URL redirects to /authwall without a login,
 *     and logging in to scrape violates LinkedIn's terms. Reported as `blocked` in `sources` so the
 *     dashboard shows why, instead of the feed silently lacking it.
 *
 * Nothing here writes to any social network. Same three run triggers as modelUpdateAgent.ts; every
 * good run is written to Firebase `creator_feed_snapshot`.
 */
import { STATIC_GUIDES } from '../leadMagnets.js';
import { getXFeed } from '../xFeed.js';
import { readSyncSnapshot, writeSyncSnapshot } from '../../agent/firebaseServer.js';

export const LINKTREE_URL = 'https://linktr.ee/mrdaniel.ai';

export interface CreatorItem {
  id: string;
  kind: 'guide' | 'post' | 'link';
  title: string;
  blurb?: string;
  /** Site-relative (`/g/<slug>`) for guides; absolute https for posts and links. */
  url: string;
  publishedAt?: string;
}

export interface CreatorFeed {
  items: CreatorItem[];
  sources: {
    guides: { ok: boolean; count: number };
    x: { ok: boolean; count: number; via: string };
    linktree: { ok: boolean; count: number; error?: string };
    linkedin: { ok: false; reason: 'authwall' };
  };
  syncedAt: number;
  source: 'live' | 'snapshot';
}

function ttlMs(): number {
  const min = Number(process.env.SOCIAL_SYNC_TTL_MIN);
  return (Number.isFinite(min) && min >= 5 ? min : 60) * 60_000;
}

/**
 * The X leg is OFF unless `SOCIAL_SYNC_X=1` (decided 2026-09-23). Its fallback path is Grok
 * `x_search`, billed per post fetched, and the operator does not want paid X/xAI usage. Off means
 * no request at all — not a request whose result is thrown away — and `sources.x.via` reports
 * `disabled`, so the dashboard shows it as a choice rather than an outage.
 */
function xLegEnabled(): boolean {
  return process.env.SOCIAL_SYNC_X === '1';
}

/** Hosts whose links on the tree are profiles (navigation), not content. */
const PROFILE_HOST = /(^|\.)(x\.com|twitter\.com|instagram\.com|threads\.(?:com|net)|tiktok\.com|linkedin\.com|spotify\.com|facebook\.com|youtube\.com\/@)/i;

function guides(): CreatorItem[] {
  return STATIC_GUIDES.map((g) => ({
    id: `guide:${g.slug}`,
    kind: 'guide' as const,
    title: g.title.trim(),
    blurb: (g.subtitle ?? '').trim().slice(0, 160),
    url: `/g/${g.slug}`,
    publishedAt: g.publishedAt,
  }));
}

/** Pure: Linktree page HTML → content links. Exported for the regression test. */
export function parseLinktree(html: string): CreatorItem[] {
  const out: CreatorItem[] = [];
  const scripts = html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g);
  for (const m of scripts) {
    if (!m[1].includes('"links"')) continue;
    let data: unknown;
    try {
      data = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const links = findLinks(data);
    for (const l of links) {
      const url = String(l.url ?? '').trim();
      const title = String(l.title ?? '').trim();
      if (!title || !/^https?:\/\//i.test(url) || String(l.type ?? 'CLASSIC') !== 'CLASSIC') continue;
      let u: URL;
      try {
        u = new URL(url);
      } catch {
        continue;
      }
      if (PROFILE_HOST.test(u.hostname)) continue;
      // The site root (and its top-level pages) is navigation back to us, not new content.
      if (/(^|\.)mrdaniel\.co\.il$/i.test(u.hostname) && !/^\/(g|news|download)\//.test(u.pathname)) continue;
      u.protocol = 'https:';
      out.push({ id: `link:${l.id ?? u.href}`, kind: 'link', title, url: u.href });
    }
    if (out.length) break;
  }
  return out;
}

function findLinks(node: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findLinks(n);
      if (r.length) return r;
    }
    return [];
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'links' && Array.isArray(v) && v.length && typeof (v[0] as Record<string, unknown>)?.url === 'string') {
        return v as Array<Record<string, unknown>>;
      }
      const r = findLinks(v);
      if (r.length) return r;
    }
  }
  return [];
}

async function linktree(): Promise<{ items: CreatorItem[]; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(LINKTREE_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36', Accept: 'text/html' },
      signal: ctrl.signal,
    });
    if (!res.ok) return { items: [], error: `HTTP ${res.status}` };
    return { items: parseLinktree(await res.text()) };
  } catch (err) {
    return { items: [], error: (err as Error)?.message ?? String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/** One sync run. Never throws. */
export async function runSocialSync(): Promise<CreatorFeed> {
  const g = guides();
  const xOn = xLegEnabled();
  const [x, lt] = await Promise.all([
    xOn ? getXFeed().catch(() => null) : Promise.resolve(null),
    linktree(),
  ]);
  const posts: CreatorItem[] = (x?.posts ?? [])
    .filter((p) => /^https:\/\/x\.com\/mrdaniel_ai\/status\/\d+$/.test(p.url) && p.text.trim())
    .slice(0, 6)
    .map((p) => ({ id: `x:${p.id}`, kind: 'post' as const, title: p.text.replace(/\s+/g, ' ').trim().slice(0, 280), url: p.url, publishedAt: p.createdAt || undefined }));

  const feed: CreatorFeed = {
    // Newest content first: posts, then links from the tree, then the evergreen guides.
    items: [...posts, ...lt.items, ...g],
    sources: {
      guides: { ok: true, count: g.length },
      x: { ok: posts.length > 0, count: posts.length, via: xOn ? x?.source ?? 'error' : 'disabled' },
      linktree: { ok: !lt.error, count: lt.items.length, ...(lt.error ? { error: lt.error } : {}) },
      linkedin: { ok: false, reason: 'authwall' },
    },
    syncedAt: Date.now(),
    source: 'live',
  };

  // Only overwrite the snapshot when this run found at least as much external content as it holds
  // — a run where X and Linktree both failed must not erase posts the last good run found.
  const snap = await readSyncSnapshot('creator_feed_snapshot');
  // With the X leg switched off, old posts in the snapshot are not "content the last run found" but
  // content the operator turned off — they must not be kept alive by this comparison.
  const keepKind = (i: CreatorItem) => i.kind !== 'guide' && (xOn || i.kind !== 'post');
  const snapExternal = Array.isArray(snap?.items) ? (snap!.items as CreatorItem[]).filter(keepKind).length : 0;
  const external = posts.length + lt.items.length;
  if (external >= snapExternal || !snap) {
    await writeSyncSnapshot('creator_feed_snapshot', feed as unknown as Record<string, unknown>);
    return feed;
  }
  // Keep the snapshot's posts/links, but always the live guide list (it is code, never stale).
  const kept = (snap!.items as CreatorItem[]).filter(keepKind);
  return { ...feed, items: [...kept, ...g], source: 'snapshot' };
}

let memo: CreatorFeed | null = null;
let inFlight: Promise<CreatorFeed> | null = null;

export async function getCreatorFeed(force = false): Promise<CreatorFeed> {
  if (!force && memo && Date.now() - memo.syncedAt < ttlMs()) return memo;
  if (!inFlight) {
    inFlight = runSocialSync()
      .then((f) => {
        memo = f;
        return f;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export function creatorFeedCdnSeconds(): number {
  return Math.round(Math.min(ttlMs(), 30 * 60_000) / 1000);
}
