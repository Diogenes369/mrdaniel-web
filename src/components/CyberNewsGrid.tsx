import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Rss, ArrowLeft, RefreshCw, ArrowUpLeft } from 'lucide-react';
import WebButton from './WebButton';
import TitleUnderline from './TitleUnderline';
import ArticleModal from './news/ArticleModal';
import { NewsHeroCard, NewsGridCard } from './news/NewsCards';
import { filterCommandCenter } from '../lib/newsAnalysis';
import { prefersReducedMotion } from '../lib/gsap';
import { useNewsFeed, type NewsItem } from '../services/newsService';

/**
 * Homepage news section — a "Mini News Command Center": a compact MINI LIVE FEED status banner
 * with a link to the full /news חמ״ל, then 1 featured hero + 2 secondary cards (single column on
 * mobile). Same strict gate as /news (Hebrew-only + real lead image via `filterCommandCenter`),
 * the shared `<NewsHeroCard>` / `<NewsGridCard>`, and the shared `<ArticleModal>` on click.
 */
export default function CyberNewsGrid() {
  const navigate = useNavigate();
  const { data: allItems, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useNewsFeed();
  const [active, setActive] = useState<NewsItem | null>(null);
  const reduce = prefersReducedMotion();

  const picks = useMemo(() => filterCommandCenter(allItems ?? []).slice(0, 3), [allItems]);
  const hero = picks[0];
  const secondary = picks.slice(1, 3);

  const nodes = useMemo(() => new Set((allItems ?? []).map((i) => i.source)).size, [allItems]);
  const synced =
    dataUpdatedAt > 0 ? new Date(dataUpdatedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <section id="news" className="relative cv-auto overflow-x-hidden py-16 md:py-24">
      <div className="container-wide relative z-10">
        <div className="mx-auto mb-8 max-w-4xl text-center md:mb-10">
          <div className="group mb-4 inline-flex max-w-full flex-col items-center">
            <h2 className="text-pop text-center font-display font-black text-white">
              חדשות <span className="text-brand-500">סייבר, AI וטכנולוגיה</span>
            </h2>
            <TitleUnderline className="w-full" base="w-12" />
          </div>
          <p className="font-sans text-base leading-relaxed text-zinc-300 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)] md:text-lg">
            כל מה שזז בטכנולוגיה הישראלית, במקום אחד.
          </p>
        </div>

        {/* MINI LIVE FEED banner */}
        <div className="mx-auto mb-6 flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 overflow-hidden rounded-2xl border border-[#22d3ee]/20 bg-[#04070b]/85 px-4 py-2.5 font-mono text-[11px]">
          <span className="inline-flex items-center gap-2 font-bold text-[#67e8f9]">
            <span className="relative flex h-2 w-2">
              {!reduce && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22d3ee] opacity-70" />}
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#22d3ee]" />
            </span>
            MINI LIVE FEED
          </span>
          <span className="text-zinc-500">
            NODES ACTIVE: <span className="text-zinc-300">{nodes || '—'}</span>
          </span>
          <span className="hidden text-zinc-600 sm:inline">·</span>
          <span className="hidden text-zinc-500 sm:inline">SYNC {synced}</span>
          <Link
            to="/news"
            className="mr-auto inline-flex items-center gap-1 rounded-full border border-[#76B900]/45 bg-[#76B900]/12 px-3 py-1 font-bold text-[#9FE870] transition-colors hover:border-[#76B900]/80 hover:text-white"
          >
            עבור לחמ״ל המלא <ArrowUpLeft className="h-3.5 w-3.5" />
          </Link>
        </div>

        {isLoading && (
          <div className="mx-auto grid max-w-[1400px] gap-5 lg:grid-cols-2">
            <div className="h-64 animate-pulse rounded-3xl border border-white/5 bg-white/[0.03] lg:col-span-2" />
            <div className="h-72 animate-pulse rounded-2xl border border-white/5 bg-white/[0.03]" />
            <div className="h-72 animate-pulse rounded-2xl border border-white/5 bg-white/[0.03]" />
          </div>
        )}

        {isError && !isLoading && (
          <div className="mx-auto max-w-md text-center">
            <p className="mb-5 text-zinc-400">לא הצלחנו לטעון את הפיד כרגע. נסו שוב בעוד רגע.</p>
            <WebButton variant="glass" onClick={() => refetch()}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              ניסיון נוסף
            </WebButton>
          </div>
        )}

        {!isLoading && !isError && hero && (
          <>
            <div className="mx-auto grid w-full min-w-0 max-w-[1400px] gap-5">
              <NewsHeroCard item={hero} onOpen={setActive} />
              {secondary.length > 0 && (
                <div className="grid min-w-0 gap-5 sm:grid-cols-2">
                  {secondary.map((item) => (
                    <NewsGridCard key={item.id} item={item} onOpen={setActive} />
                  ))}
                </div>
              )}
            </div>

            <div className="relative z-10 mt-10 text-center">
              <WebButton variant="primary" onClick={() => navigate('/news')} className="!px-8">
                לכל החדשות
                <ArrowLeft className="h-4 w-4" />
              </WebButton>
            </div>
          </>
        )}

        {!isLoading && !isError && !hero && (
          <div className="mx-auto max-w-md text-center text-zinc-400">
            <Rss className="mx-auto mb-4 h-8 w-8 text-zinc-600" />
            אין כרגע כתבות זמינות בפיד.
          </div>
        )}
      </div>

      <ArticleModal item={active} onClose={() => setActive(null)} />
    </section>
  );
}
