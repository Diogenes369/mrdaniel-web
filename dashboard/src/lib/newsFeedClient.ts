import { SITE_ORIGIN } from './useDashboardRefresh';
import { CATEGORY_TOPICS, type NewsCategory, type NewsItem } from './newsAgentTypes';

/**
 * Queries the site's Live News Feed (`${SITE_ORIGIN}/api/news`, CORS-open) and returns the single
 * most-recent item in the chosen category. The feed API already returns items sorted newest-first,
 * so this is just: filter by topic → take the head. Falls back to the newest item overall if the
 * category has nothing.
 */
export async function fetchLatestNewsItem(category: NewsCategory): Promise<NewsItem | null> {
  const res = await fetch(`${SITE_ORIGIN}/api/news`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`news feed responded ${res.status}`);
  const data = (await res.json()) as { items?: NewsItem[] };
  const items = Array.isArray(data.items) ? data.items : [];
  if (items.length === 0) return null;

  const topics = CATEGORY_TOPICS[category];
  const scoped = topics ? items.filter((i) => topics.includes(i.topic)) : items;
  return scoped[0] ?? items[0];
}

/** Wraps a remote image URL in the site's CORS-safe relay so it can be drawn to a <canvas>. */
export function proxiedImageUrl(url: string): string {
  return `${SITE_ORIGIN}/api/img-proxy?url=${encodeURIComponent(url)}`;
}
