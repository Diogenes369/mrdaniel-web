import { useQuery } from '@tanstack/react-query';
import type { NewsItem } from './newsService';

/**
 * Client side of the "ניתוח טכנולוגי ומשמעויות" (MR. DANIEL Analysis) block: posts the article's
 * own title + body to `POST /api/news/analyze`, which asks Gemini for 3 insights derived from THAT
 * story (see src/server/newsInsights.ts).
 *
 * There is no client-side fallback copy on purpose. If the endpoint is unconfigured, rate-limited
 * or errors, the hook reports the failure and the modal drops the section — the old behaviour of
 * printing a static topic-keyed paragraph is gone.
 */

export interface ArticleInsights {
  headline: string;
  points: string[];
}

interface AnalyzeResponse {
  available?: boolean;
  insights?: ArticleInsights;
  error?: string;
  rateLimited?: boolean;
}

/** Defensive normalisation of a server payload — also the last guard against a leading "- ". */
function normalize(raw: unknown): ArticleInsights | null {
  const value = raw as Partial<ArticleInsights> | undefined;
  const points = (Array.isArray(value?.points) ? value.points : [])
    .map((p) => String(p ?? '').replace(/^[\s\-–—•*·>]+/, '').trim())
    .filter((p) => p.length > 0)
    .slice(0, 3);
  if (points.length === 0) return null;
  return {
    headline: String(value?.headline ?? '').replace(/^[\s\-–—•*·>]+/, '').trim(),
    points,
  };
}

export async function fetchArticleInsights(item: NewsItem): Promise<ArticleInsights> {
  const res = await fetch('/api/news/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: item.title,
      summary: item.summary,
      excerpt: item.excerpt,
      source: item.source,
      topic: item.topic,
      link: item.link,
    }),
  });

  const data: AnalyzeResponse = await res.json().catch(() => ({}) as AnalyzeResponse);
  if (!res.ok || data.available === false) {
    throw new Error(data.error || `analysis endpoint responded ${res.status}`);
  }

  const insights = normalize(data.insights);
  if (!insights) throw new Error('analysis response contained no usable insights');
  return insights;
}

/**
 * Runs only while a modal is actually open (`enabled`), so the grid never fires an LLM call per
 * card. The result is cached per article id for the session — reopening the same story is free.
 */
export function useArticleInsights(item: NewsItem | null) {
  return useQuery({
    queryKey: ['news-article-insights', item?.id ?? item?.link ?? ''],
    queryFn: () => fetchArticleInsights(item as NewsItem),
    enabled: Boolean(item),
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 12 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
