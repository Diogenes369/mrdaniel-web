import { useQuery } from '@tanstack/react-query';
import type { NewsItem } from './newsService';

/**
 * Client side of the article modal's generated sections: posts the article's title + link to
 * `POST /api/news/analyze`, which fetches the FULL article from the publisher and returns an
 * executive summary, an extended article and the MR. DANIEL analysis paragraph
 * (see src/server/newsInsights.ts).
 *
 * No client-side fallback copy for the analysis on purpose. If the endpoint fails, the modal keeps
 * its teaser-based summary/article and drops the analysis block.
 */

export interface ArticleInsights {
  headline: string;
  executiveSummary: string[];
  extendedArticle: string[];
  mrDanielAnalysis: string;
  /** False when the server could not reach the article and wrote from the feed teaser. */
  fullText: boolean;
  /** Lead image the server found on the article page, if any. */
  image?: string;
}

interface AnalyzeResponse {
  available?: boolean;
  insights?: ArticleInsights;
  error?: string;
  rateLimited?: boolean;
}

const clean = (v: unknown) => String(v ?? '').replace(/^[\s\-–—•*·>]+/, '').trim();
const cleanList = (v: unknown, max: number) =>
  (Array.isArray(v) ? v : []).map(clean).filter((line) => line.length > 0).slice(0, max);

/** Defensive normalisation of a server payload — also the last guard against a leading "- ". */
function normalize(raw: unknown): ArticleInsights | null {
  const value = raw as Partial<ArticleInsights> | undefined;
  const executiveSummary = cleanList(value?.executiveSummary, 4);
  const extendedArticle = cleanList(value?.extendedArticle, 3);
  const mrDanielAnalysis = clean(value?.mrDanielAnalysis);
  if (!executiveSummary.length && !extendedArticle.length && !mrDanielAnalysis) return null;
  const image = typeof value?.image === 'string' && /^https?:\/\//i.test(value.image) ? value.image : undefined;
  return { headline: clean(value?.headline), executiveSummary, extendedArticle, mrDanielAnalysis, fullText: value?.fullText === true, image };
}

export async function fetchArticleInsights(item: NewsItem): Promise<ArticleInsights> {
  // GET, not POST: the query is deterministic per article, so Vercel's edge caches the generation
  // and every later visitor gets it for free. The teaser is clipped to keep the URL short — the
  // server reads the full article itself and only falls back to this when the fetch fails.
  const params = new URLSearchParams({
    title: item.title,
    link: item.link,
    source: item.source || '',
    topic: item.topic || 'general',
    summary: (item.summary || item.excerpt || '').slice(0, 280),
  });
  const res = await fetch(`/api/news/analyze?${params}`);

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
    queryKey: ['news-article-insights-v2', item?.id ?? item?.link ?? ''],
    queryFn: () => fetchArticleInsights(item as NewsItem),
    enabled: Boolean(item),
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 12 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
