import { useQuery, useQueryClient } from '@tanstack/react-query';

export type NewsTopic = 'ai' | 'cyber' | 'cloud' | 'general';

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
}

interface NewsResponse {
  items: NewsItem[];
  updatedAt: string;
}

// v3: added the `topic` classification field (AI / cyber / cloud) — bump to invalidate any
// pre-existing browser cache written by an older shape.
const CACHE_KEY = 'dbb-cyber-news-cache-v3';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // refresh at most once a day per browser

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

export async function fetchNews(): Promise<NewsItem[]> {
  const cached = readCache();
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.items;
  }

  try {
    const res = await fetch('/api/news');
    if (!res.ok) throw new Error(`news endpoint responded ${res.status}`);
    const data: NewsResponse = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length > 0) writeCache(items);
    return items;
  } catch (err) {
    console.error('[news] failed to fetch /api/news:', err);
    if (cached) return cached.items; // serve stale cache rather than an empty grid
    throw err;
  }
}

export function useNewsFeed() {
  return useQuery({
    queryKey: ['cyber-news'],
    queryFn: fetchNews,
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
    queryKey: ['cyber-news-item', slug],
    queryFn: async () => {
      if (!slug) throw new Error('missing slug');
      const listed = queryClient.getQueryData<NewsItem[]>(['cyber-news']);
      const fromList = listed?.find((item) => item.slug === slug);
      if (fromList) return fromList;
      return fetchNewsItemBySlug(slug);
    },
    enabled: !!slug,
    staleTime: CACHE_TTL_MS,
    retry: 1,
  });
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
