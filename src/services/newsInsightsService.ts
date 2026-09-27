import { useEffect } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { NewsItem } from './newsService';

/**
 * Client side of the article modal's sections — READ-ONLY since 2026-09-23.
 *
 * Every article is analysed in the background by the precompute agent
 * (src/server/articlePrecompute.ts) and stored in Firebase. The page fetches ONE bulk map of those
 * stored analyses (`GET /api/news?action=insights`, CDN-cached) while the browser is idle, so by
 * the time anyone clicks a headline the answer is already in memory: opening the modal is a
 * dictionary lookup, never a request, a scrape or a model call.
 *
 * An article the agent has not reached yet is simply absent from the map; the modal then shows the
 * deterministic teaser sections (src/lib/newsAnalysis.ts), also instantly.
 */

export interface ArticleInsights {
  headline: string;
  executiveSummary: string[];
  extendedArticle: string[];
  /** False when the server could not reach the article and wrote from the feed teaser. */
  fullText: boolean;
  /** Lead image the server found on the article page, if any. */
  image?: string;
}

const clean = (v: unknown) => String(v ?? '').replace(/^[\s\-–—•*·>]+/, '').trim();
const cleanList = (v: unknown, max: number) =>
  (Array.isArray(v) ? v : []).map(clean).filter((line) => line.length > 0).slice(0, max);

/** Defensive normalisation of a server payload — also the last guard against a leading "- ". */
function normalize(raw: unknown): ArticleInsights | null {
  const value = raw as Partial<ArticleInsights> | undefined;
  const executiveSummary = cleanList(value?.executiveSummary, 4);
  const extendedArticle = cleanList(value?.extendedArticle, 3);
  if (!executiveSummary.length && !extendedArticle.length) return null;
  const image = typeof value?.image === 'string' && /^https?:\/\//i.test(value.image) ? value.image : undefined;
  return { headline: clean(value?.headline), executiveSummary, extendedArticle, fullText: value?.fullText === true, image };
}

type InsightsMap = Record<string, ArticleInsights>;
const QUERY_KEY = ['news-insights-map-v1'];

async function fetchInsightsMap(): Promise<InsightsMap> {
  try {
    const res = await fetch('/api/news?action=insights', { headers: { Accept: 'application/json' } });
    if (!res.ok) return {};
    const data = (await res.json()) as { insights?: Record<string, unknown> };
    const out: InsightsMap = {};
    for (const [id, raw] of Object.entries(data.insights ?? {})) {
      const v = normalize(raw);
      if (v) out[id] = v;
    }
    return out;
  } catch {
    return {};
  }
}

const QUERY_OPTIONS = {
  queryKey: QUERY_KEY,
  queryFn: fetchInsightsMap,
  staleTime: 5 * 60 * 1000,
  gcTime: 60 * 60 * 1000,
  refetchOnWindowFocus: false,
  retry: 1,
} as const;

export function prefetchInsights(client: QueryClient): Promise<void> {
  return client.prefetchQuery(QUERY_OPTIONS);
}

/**
 * Mounted once (App.tsx): warms the map as soon as the browser is idle after first paint, so it
 * never competes with the page's own loading, and refreshes it with the feed.
 */
export function useInsightsPrefetch(enabled = true): void {
  const client = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const run = () => void prefetchInsights(client);
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(run, { timeout: 3000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(run, 1200);
    return () => window.clearTimeout(t);
  }, [client, enabled]);
}

async function fetchStoredInsight(link: string): Promise<ArticleInsights | null> {
  try {
    const res = await fetch(`/api/news/analyze?link=${encodeURIComponent(link)}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = (await res.json()) as { available?: boolean; insights?: unknown };
    return data.available ? normalize(data.insights) : null;
  } catch {
    return null;
  }
}

/**
 * The stored analysis for one article: from the prefetched map when it is there (no request), and
 * otherwise ONE read-only lookup of that article's stored analysis.
 *
 * The lookup closes a gap the text quality gate exposed: the feed and the bulk map are cached
 * separately (CDN 10 min vs 5 min), so a freshly analysed story can reach the feed before it reaches
 * the map a browser already holds — and the modal then fell back to the teaser, which for a
 * headline-only feed item is one sentence shown as both the summary and the article. The lookup
 * never generates anything (api/news.ts handleAnalyze is read-only).
 *
 * `pending` is true while that lookup runs, so the modal can show a placeholder instead of
 * flashing the teaser fallback first.
 */
export function useArticleInsights(item: NewsItem | null): ArticleInsights | undefined {
  return useArticleInsightsState(item).insights;
}

export function useArticleInsightsState(item: NewsItem | null): { insights: ArticleInsights | undefined; pending: boolean } {
  const map = useQuery({ ...QUERY_OPTIONS, enabled: Boolean(item) });
  const fromMap = item ? map.data?.[item.id] : undefined;
  const needsLookup = Boolean(item?.link) && !fromMap && !map.isPending;
  const single = useQuery({
    queryKey: ['news-insight-single', item?.link ?? ''],
    queryFn: () => fetchStoredInsight(item!.link),
    enabled: needsLookup,
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 0,
    refetchOnWindowFocus: false,
  });
  const insights = fromMap ?? single.data ?? undefined;
  const pending = !insights && Boolean(item) && (map.isPending || (needsLookup && single.isPending));
  return { insights, pending };
}
