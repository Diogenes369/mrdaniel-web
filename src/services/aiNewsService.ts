import { useQuery } from '@tanstack/react-query';
import type { NewsItem } from './newsService';

export interface AIVideo {
  id: string;
  youtubeId: string;
  title: string;
  channel: string;
  publishedAt: string;
}

export interface AINewsData {
  videos: AIVideo[];
  articles: NewsItem[];
}

interface AINewsResponse extends AINewsData {
  updatedAt: string;
}

const CACHE_KEY = 'dbb-ai-news-cache-v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // refresh at most once a day per browser

interface AINewsCacheShape {
  data: AINewsData;
  fetchedAt: number;
}

function readCache(): AINewsCacheShape | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AINewsCacheShape>;
    if (!parsed.data || !Array.isArray(parsed.data.videos) || !Array.isArray(parsed.data.articles) || typeof parsed.fetchedAt !== 'number') {
      return null;
    }
    return parsed as AINewsCacheShape;
  } catch {
    return null;
  }
}

function writeCache(data: AINewsData) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, fetchedAt: Date.now() } satisfies AINewsCacheShape));
  } catch {
    // localStorage unavailable (private mode / quota) — caching is a nice-to-have, not required
  }
}

export async function fetchAINews(): Promise<AINewsData> {
  const cached = readCache();
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const res = await fetch('/api/ai-news');
    if (!res.ok) throw new Error(`ai-news endpoint responded ${res.status}`);
    const data: AINewsResponse = await res.json();
    const result: AINewsData = {
      videos: Array.isArray(data.videos) ? data.videos : [],
      articles: Array.isArray(data.articles) ? data.articles : [],
    };
    if (result.videos.length > 0 || result.articles.length > 0) writeCache(result);
    return result;
  } catch (err) {
    console.error('[ai-news] failed to fetch /api/ai-news:', err);
    if (cached) return cached.data; // serve stale cache rather than an empty page
    throw err;
  }
}

export function useAINewsFeed() {
  return useQuery({
    queryKey: ['ai-news'],
    queryFn: fetchAINews,
    staleTime: CACHE_TTL_MS,
    gcTime: CACHE_TTL_MS * 2,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
