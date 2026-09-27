import { useQuery, useQueryClient } from '@tanstack/react-query';

export type NewsTopic = 'ai' | 'ai_models' | 'ai_agents' | 'general';

export interface NewsItem {
  id: string;
  slug: string;
  source: string;
  category: string;
  topic: NewsTopic;
  title: string;
  link: string;
  excerpt: string;
  summary: string;
  publishedAt: string;
  /** Optional lead image from the feed (see server/newsFeed.ts `extractImage`). */
  image?: string;
}

interface NewsResponse {
  items: NewsItem[];
  updatedAt: string;
}

// v4: `/api/news` is now the sanitized Hebrew AI stream by default (see server/newsFeed.ts
// `sanitizeAndKeep`). Bumped so every browser drops its pre-filter cache — which still holds
// English / off-topic items for up to 24h — and re-fetches the clean feed on the next load.
// (v3 added the `topic` field.)
const CACHE_KEY = 'dbb-news-feed-cache-v5';
// Was 24h, which made a returning visitor see yesterday's feed while the server had fresh stories
// (reported as "news stuck for days", 2026-09-22). 10 min matches the CDN's own max-age.
const CACHE_TTL_MS = 10 * 60 * 1000;

interface NewsCacheShape {
  items: NewsItem[];
  fetchedAt: number;
}

function readCache(): NewsCacheShape | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NewsCacheShape>;
    if (!Array.isArray(parsed.items) || typeof parsed.fetchedAt !== 'number') return null;
    return parsed as NewsCacheShape;
  } catch {
    return null;
  }
}

function writeCache(items: NewsItem[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ items, fetchedAt: Date.now() } satisfies NewsCacheShape));
  } catch {
    // localStorage unavailable (private mode / quota) — caching is a nice-to-have, not required
  }
}

declare global {
  interface Window {
    /** Started by the inline script in index.html before the bundle loads; null on failure. */
    __newsPrefetch?: Promise<NewsResponse | null>;
  }
}

/** The index.html head prefetch, handed out once — a later refetch must hit the network. */
async function takePrefetched(): Promise<NewsResponse | null> {
  if (typeof window === 'undefined' || !window.__newsPrefetch) return null;
  const pending = window.__newsPrefetch;
  window.__newsPrefetch = undefined;
  return pending.catch(() => null);
}

export async function fetchNews(): Promise<NewsItem[]> {
  const cached = readCache();
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.items;
  }

  try {
    let data = await takePrefetched();
    if (!data) {
      const res = await fetch('/api/news');
      if (!res.ok) throw new Error(`news endpoint responded ${res.status}`);
      data = (await res.json()) as NewsResponse;
    }
    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length > 0) writeCache(items);
    return items;
  } catch (err) {
    console.error('[news] failed to fetch /api/news:', err);
    if (cached) return cached.items; // serve stale cache rather than an empty grid
    throw err;
  }
}

/** A cache older than this is not shown even as a placeholder — a day-old feed reads as broken. */
const INITIAL_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function initialFromCache(): NewsCacheShape | undefined {
  const cached = readCache();
  return cached && cached.items.length && Date.now() - cached.fetchedAt < INITIAL_MAX_AGE_MS ? cached : undefined;
}

export function useNewsFeed() {
  return useQuery({
    queryKey: ['news-feed'],
    queryFn: fetchNews,
    // A returning visitor gets the last feed on the FIRST render instead of a skeleton. Reading
    // the cache inside queryFn (as before) still cost a loading frame, because a query always
    // starts in `pending` until its function resolves. `initialDataUpdatedAt` carries the real age,
    // so a cache past `staleTime` is shown AND refetched in the background at once.
    initialData: () => initialFromCache()?.items,
    initialDataUpdatedAt: () => initialFromCache()?.fetchedAt,
    staleTime: CACHE_TTL_MS,
    gcTime: CACHE_TTL_MS * 2,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

async function fetchNewsItemBySlug(slug: string): Promise<NewsItem> {
  try {
    const res = await fetch(`/api/news/item/${encodeURIComponent(slug)}`);
    if (!res.ok) throw new Error(`article not found (${res.status})`);
    const data: { item: NewsItem } = await res.json();
    return data.item;
  } catch (err) {
    console.error(`[news] failed to fetch /api/news/item/${slug}:`, err);
    throw err;
  }
}

/** Instant when navigating from the grid (item is already in the list's query cache); falls
 *  back to a server lookup for a direct page load, refresh, or shared link. */
export function useNewsArticle(slug: string | undefined) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['news-feed-item', slug],
    queryFn: async () => {
      if (!slug) throw new Error('missing slug');
      const listed = queryClient.getQueryData<NewsItem[]>(['news-feed']);
      const fromList = listed?.find((item) => item.slug === slug);
      if (fromList) return fromList;
      return fetchNewsItemBySlug(slug);
    },
    enabled: !!slug,
    staleTime: CACHE_TTL_MS,
    retry: 1,
  });
}

/** Rough reading time in whole minutes (~220 wpm, whitespace-tokenised so it works for Hebrew and
 *  English alike). Always at least 1. Computed client-side from an item's summary/excerpt — the news
 *  data pipeline itself is left untouched. */
export function readingTimeMin(text: string): number {
  const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));

  const minutes = Math.floor(diffSec / 60);
  const hours = Math.floor(diffSec / 3600);
  const days = Math.floor(diffSec / 86400);

  if (days >= 1) return `לפני ${days} ${days === 1 ? 'יום' : 'ימים'}`;
  if (hours >= 1) return `לפני ${hours} ${hours === 1 ? 'שעה' : 'שעות'}`;
  if (minutes >= 1) return `לפני ${minutes} ${minutes === 1 ? 'דקה' : 'דקות'}`;
  return 'הרגע';
}
