import { useQuery } from '@tanstack/react-query';
import { CREATOR_GUIDES } from '../data/creatorContent';

/**
 * Daniel's own content for the hero console, as synced by SocialSyncAgent
 * (src/server/agents/socialSyncAgent.ts → `GET /api/news?action=creator-feed`): his guides, his X
 * posts and any content link on his Linktree. Mirrors that module's `CreatorItem`.
 *
 * Never throws into the UI. If the endpoint is unreachable (first paint, an old deployment), the
 * local guide list stands in. Guides use the plain-voice blurb from src/data/creatorContent.ts when
 * one exists — the server's copy is the guide's own cover text.
 */
export interface CreatorItem {
  id: string;
  kind: 'guide' | 'post' | 'link';
  title: string;
  blurb?: string;
  url: string;
  publishedAt?: string;
}

const LOCAL: CreatorItem[] = CREATOR_GUIDES.map((g) => ({
  id: `guide:${g.slug}`,
  kind: 'guide',
  title: g.title,
  blurb: g.blurb,
  url: `/g/${g.slug}`,
  publishedAt: g.publishedAt,
}));

/** Only links we are willing to render: our own guide pages, or https anywhere else. */
function safe(item: CreatorItem): boolean {
  if (item.kind === 'guide') return /^\/g\/[a-z0-9-]+$/.test(item.url);
  return /^https:\/\//.test(item.url);
}

async function fetchCreatorFeed(): Promise<CreatorItem[]> {
  try {
    const res = await fetch('/api/news?action=creator-feed', { headers: { Accept: 'application/json' } });
    if (!res.ok) return LOCAL;
    const data = (await res.json()) as { ok?: boolean; items?: CreatorItem[] };
    const items = (Array.isArray(data.items) ? data.items : []).filter(
      (i) => i && typeof i.title === 'string' && typeof i.url === 'string' && ['guide', 'post', 'link'].includes(i.kind) && safe(i)
    );
    if (!data.ok || !items.length) return LOCAL;
    const localBlurb = new Map(LOCAL.map((g) => [g.url, g]));
    return items.map((i) => (i.kind === 'guide' && localBlurb.has(i.url) ? { ...i, title: localBlurb.get(i.url)!.title, blurb: localBlurb.get(i.url)!.blurb } : i));
  } catch {
    return LOCAL;
  }
}

export function useCreatorFeed() {
  return useQuery({
    queryKey: ['creator-feed'],
    queryFn: fetchCreatorFeed,
    placeholderData: LOCAL,
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 0,
  });
}
