import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Rss, Search, RefreshCw, Sparkles, ChevronRight, ChevronLeft } from 'lucide-react';
import { PageHero } from '../components/content/ContentPrimitives';
import NewsCard from '../components/NewsCard';
import WebButton from '../components/WebButton';
import { useNewsFeed, type NewsTopic } from '../services/newsService';

const FILTERS: { id: NewsTopic | 'all'; label: string }[] = [
  { id: 'all', label: 'הכל' },
  { id: 'ai', label: 'בינה מלאכותית' },
  { id: 'cyber', label: 'סייבר' },
  { id: 'cloud', label: 'ענן' },
];

const PAGE_SIZE = 20;

/** Compact page list with ellipses: 1 … p-1 p p+1 … N (always shows first & last). */
function pageList(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push('…');
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push('…');
  out.push(total);
  return out;
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const btn =
    'inline-flex items-center justify-center min-w-10 h-10 px-3 rounded-xl border text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <nav className="mt-12 flex flex-wrap items-center justify-center gap-2" aria-label="ניווט בין עמודי חדשות">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        className={`${btn} border-white/10 bg-carbon-900/60 text-zinc-300 hover:border-brand-500/40`}
      >
        <ChevronRight className="w-4 h-4" />
        הקודם
      </button>

      {pageList(page, totalPages).map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className="px-1.5 text-zinc-600 select-none">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={`${btn} ${
              p === page
                ? 'border-brand-500 bg-brand-500 text-black'
                : 'border-white/10 bg-carbon-900/60 text-zinc-300 hover:border-brand-500/40'
            }`}
          >
            {p}
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        className={`${btn} border-white/10 bg-carbon-900/60 text-zinc-300 hover:border-brand-500/40`}
      >
        הבא
        <ChevronLeft className="w-4 h-4" />
      </button>
    </nav>
  );
}

export default function NewsPage() {
  const { data: items, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useNewsFeed();
  const [activeFilter, setActiveFilter] = useState<NewsTopic | 'all'>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (activeFilter !== 'all' && item.topic !== activeFilter) return false;
      if (!q) return true;
      return item.title.toLowerCase().includes(q) || item.excerpt.toLowerCase().includes(q);
    });
  }, [items, activeFilter, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // Any change to the result set resets to page 1; also clamp if the list shrank under us.
  useEffect(() => {
    setPage(1);
  }, [activeFilter, query]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const goToPage = (p: number) => {
    const next = Math.min(totalPages, Math.max(1, p));
    setPage(next);
    document.getElementById('news-grid-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div id="page-top" className="min-h-screen pt-24 md:pt-28 pb-24">
      <div className="container-wide">
        <PageHero
          badgeIcon={Rss}
          badgeLabel="עדכון יומי · Israeli Hebrew Tech Feed"
          title="כל החדשות בסייבר, AI וטכנולוגיה"
          subtitle="ריכוז חי מגיקטיים, אנשים ומחשבים, Techtime ו-Israel Defense — סננו לפי תחום או חפשו כתבה ספציפית."
        />

        <div id="news-grid-top" className="flex flex-col md:flex-row md:items-center gap-4 mb-8 scroll-mt-28">
          <div className="flex items-center gap-2 flex-wrap">
            {FILTERS.map((f) => {
              const isActive = activeFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-bold transition-colors ${
                    isActive
                      ? 'bg-brand-500 border-brand-500 text-black'
                      : 'bg-carbon-900/60 border-white/10 text-zinc-300 hover:border-brand-500/40'
                  }`}
                >
                  {f.id === 'ai' && <Sparkles className="w-3.5 h-3.5" />}
                  {f.label}
                </button>
              );
            })}
          </div>

          <div className="relative flex-1 md:max-w-xs md:mr-auto">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש מהיר בכותרות ובתקצירים..."
              className="input-glow !pr-10"
            />
          </div>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 md:gap-6">
            {Array.from({ length: 12 }).map((_, idx) => (
              <div key={idx} className="h-72 rounded-2xl bg-white/[0.03] border border-white/5 animate-pulse" />
            ))}
          </div>
        )}

        {isError && !isLoading && (
          <div className="max-w-md mx-auto text-center py-16">
            <p className="text-zinc-400 mb-5">לא הצלחנו לטעון את הפיד כרגע. נסו שוב בעוד רגע.</p>
            <WebButton variant="glass" onClick={() => refetch()}>
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              ניסיון נוסף
            </WebButton>
          </div>
        )}

        {!isLoading && !isError && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 mb-6" dir="rtl">
              <span>
                {filtered.length} כתבות · עמוד {page} מתוך {totalPages}
              </span>
              {dataUpdatedAt > 0 && (
                <span>
                  עודכן לאחרונה{' '}
                  {new Date(dataUpdatedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            {pageItems.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 md:gap-6">
                  {pageItems.map((item) => (
                    <motion.div key={item.id} className="h-full">
                      <NewsCard item={item} />
                    </motion.div>
                  ))}
                </div>

                <Pagination page={page} totalPages={totalPages} onChange={goToPage} />
              </>
            ) : (
              <div className="max-w-md mx-auto text-center py-16 text-zinc-400">
                <Rss className="w-8 h-8 mx-auto mb-4 text-zinc-600" />
                לא נמצאו כתבות התואמות את הסינון הנוכחי.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
