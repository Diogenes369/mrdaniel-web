import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Rss, Search, RefreshCw, Sparkles } from 'lucide-react';
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

export default function NewsPage() {
  const { data: items, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useNewsFeed();
  const [activeFilter, setActiveFilter] = useState<NewsTopic | 'all'>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (activeFilter !== 'all' && item.topic !== activeFilter) return false;
      if (!q) return true;
      return item.title.toLowerCase().includes(q) || item.excerpt.toLowerCase().includes(q);
    });
  }, [items, activeFilter, query]);

  return (
    <div id="page-top" className="min-h-screen pt-24 md:pt-28 pb-24">
      <div className="container mx-auto px-6 max-w-6xl">
        <PageHero
          badgeIcon={Rss}
          badgeLabel="עדכון יומי · Israeli Hebrew Tech Feed"
          title="כל החדשות בסייבר, AI וטכנולוגיה"
          subtitle="ריכוז חי מגיקטיים, אנשים ומחשבים, Techtime ו-Israel Defense — סננו לפי תחום או חפשו כתבה ספציפית."
        />

        <div className="flex flex-col md:flex-row md:items-center gap-4 mb-10">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {Array.from({ length: 9 }).map((_, idx) => (
              <div key={idx} className="h-64 rounded-2xl bg-white/[0.03] border border-white/5 animate-pulse" />
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
            {dataUpdatedAt > 0 && (
              <p className="text-xs text-zinc-500 mb-6" dir="rtl">
                {filtered.length} כתבות מוצגות · עודכן לאחרונה {new Date(dataUpdatedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}

            {filtered.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                {filtered.map((item, idx) => (
                  <motion.div
                    key={item.id}
                    className="h-full"
                  >
                    <NewsCard item={item} />
                  </motion.div>
                ))}
              </div>
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
