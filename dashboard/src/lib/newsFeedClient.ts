import { SITE_ORIGIN } from './useDashboardRefresh';
import { CATEGORY_TOPICS, type NewsCategory, type NewsItem } from './newsAgentTypes';

/**
 * Queries the site's Live News Feed (`${SITE_ORIGIN}/api/news`, CORS-open) and returns the single
 * most-recent item in the chosen category. The feed API already returns items sorted newest-first,
 * so this is just: filter by topic → take the head. Falls back to the newest item overall if the
 * category has nothing.
 */
export async function fetchLatestNewsItem(category: NewsCategory): Promise<NewsItem | null> {
  const items = await fetchNewsList(category);
  return items[0] ?? null;
}

/**
 * The full candidate list for the manual content picker — every feed item in the chosen category
 * (or all of them for `'all'`), newest-first. The dashboard renders these as a selectable list so
 * the operator can preview the raw text and pick a specific article before generating.
 */
export async function fetchNewsList(category: NewsCategory, limit = 40): Promise<NewsItem[]> {
  const res = await fetch(`${SITE_ORIGIN}/api/news`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`news feed responded ${res.status}`);
  const data = (await res.json()) as { items?: NewsItem[] };
  const items = Array.isArray(data.items) ? data.items : [];

  const topics = CATEGORY_TOPICS[category];
  const scoped = topics ? items.filter((i) => topics.includes(i.topic)) : items;
  return (scoped.length ? scoped : items).slice(0, limit);
}

/** Wraps a remote image URL in the site's CORS-safe relay so it can be drawn to a <canvas>. */
export function proxiedImageUrl(url: string): string {
  return `${SITE_ORIGIN}/api/img-proxy?url=${encodeURIComponent(url)}`;
}

/** The N newest items overall — for the email "featured articles" block. */
export async function fetchTopNews(n = 3): Promise<NewsItem[]> {
  const res = await fetch(`${SITE_ORIGIN}/api/news`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`news feed responded ${res.status}`);
  const data = (await res.json()) as { items?: NewsItem[] };
  return (Array.isArray(data.items) ? data.items : []).slice(0, n);
}
