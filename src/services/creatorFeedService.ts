import { useQuery } from '@tanstack/react-query';

/**
 * Daniel's own recent X posts for the hero console, from the existing `GET /api/news?action=x-feed`
 * (src/server/xFeed.ts: free syndication → Grok x_search → last Firebase snapshot). Reused rather
 * than adding an endpoint — the Vercel project is at its 12-function limit.
 *
 * Best-effort by design. X's free endpoint is usually rate-limited and the Grok leg needs paid
 * credits, so this often comes back empty; the console then shows the guides and model updates
 * only. It never throws into the UI: any failure resolves to [].
 */
export interface CreatorPost {
  id: string;
  url: string;
  text: string;
  createdAt: string;
}

async function fetchCreatorPosts(): Promise<CreatorPost[]> {
  try {
    const res = await fetch('/api/news?action=x-feed', { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = (await res.json()) as { posts?: Array<Partial<CreatorPost>> };
    return (Array.isArray(data.posts) ? data.posts : [])
      .filter((p): p is CreatorPost => typeof p.id === 'string' && typeof p.url === 'string' && typeof p.text === 'string' && p.text.trim().length > 0)
      // Only links to Daniel's own profile — the payload is ours, but a URL we render is a URL we vouch for.
      .filter((p) => /^https:\/\/x\.com\/mrdaniel_ai\/status\/\d+$/.test(p.url))
      .slice(0, 4);
  } catch {
    return [];
  }
}

export function useCreatorPosts() {
  return useQuery({
    queryKey: ['creator-x-posts'],
    queryFn: fetchCreatorPosts,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 0,
  });
}
