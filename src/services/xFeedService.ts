import { useQuery } from '@tanstack/react-query';

/** Mirrors `XFeedPayload` in src/server/xFeed.ts. */
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

export interface XFeed {
  ok: boolean;
  handle: string;
  profileUrl: string;
  posts: XFeedPost[];
  source: 'syndication' | 'grok' | 'snapshot' | 'none';
  fetchedAt: number;
}

const EMPTY: XFeed = { ok: false, handle: 'mrdaniel_ai', profileUrl: 'https://x.com/mrdaniel_ai', posts: [], source: 'none', fetchedAt: 0 };

async function fetchXFeed(): Promise<XFeed> {
  try {
    const res = await fetch('/api/news?action=x-feed');
    if (!res.ok) return EMPTY;
    const data = (await res.json()) as Partial<XFeed>;
    return { ...EMPTY, ...data, posts: Array.isArray(data.posts) ? data.posts : [] };
  } catch {
    return EMPTY;
  }
}

/**
 * The homepage's live X feed. Polls every 5 minutes while the tab is open; the server and CDN hold
 * the real cache (see api/news.ts), so a poll is an edge hit, not a new fetch from X.
 */
export function useXFeed() {
  return useQuery({
    queryKey: ['x-feed'],
    queryFn: fetchXFeed,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: 0,
  });
}
