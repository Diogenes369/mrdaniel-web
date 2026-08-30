import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Rss, ArrowLeft, RefreshCw, Sparkles, Clock3 } from 'lucide-react';
import WebButton from './WebButton';
import NewsCard from './NewsCard';
import NewsTicker from './NewsTicker';
import ScrollLockRail from './mobile/ScrollLockRail';
import { useNewsFeed, type NewsTopic } from '../services/newsService';

// Homepage news section: category tab filters, reading-time tags (in NewsCard), an "updated"
// pill, and a responsive grid / mobile scroll-lock rail. The infinite live headline ticker sits
// site-wide at the very top of the layout on DESKTOP (NewsTicker, mounted in App.tsx) and is
// re-rendered here inline on MOBILE (`placement="inline"`, `md:hidden`). Data is unchanged —
// same useNewsFeed().
const PREVIEW_COUNT = 9;

const CATEGORIES: { id: NewsTopic | 'all'; label: string }[] = [
  { id: 'all', label: 'הכל' },
  { id: 'ai', label: 'בינה מלאכותית' },
  { id: 'cyber', label: 'סייבר' },
  { id: 'cloud', label: 'ענן' },
  { id: 'general', label: 'כללי' },
];

export default function CyberNewsGrid() {
  const navigate = useNavigate();
  const { data: allItems, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useNewsFeed();
  const [active, setActive] = useState<NewsTopic | 'all'>('all');

  const filtered = useMemo(() => {
    const list = allItems ?? [];
    const scoped = active === 'all' ? list : list.filter((i) => i.topic === active);
    return scoped.slice(0, PREVIEW_COUNT);
  }, [allItems, active]);

  const updatedLabel =
    dataUpdatedAt > 0
      ? new Date(dataUpdatedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
      : null;

  return (
    <section id="news" className="py-14 md:py-24 border-t border-white/5 relative overflow-x-clip cv-auto">
      <div className="container-wide relative z-10">
        <div className="max-w-3xl mx-auto text-center mb-8 md:mb-10">
          <h2 className="font-display text-fluid-h2 font-black text-white mb-4">
            חדשות <span className="text-brand-500">סייבר, AI וטכנולוגיה</span>
          </h2>
          <p className="font-sans text-zinc-300 text-base md:text-lg leading-relaxed [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">
            לוח חדשות חי — ריכוז אוטומטי מגיקטיים, אנשים ומחשבים, Techtime ו-Israel Defense, בעברית.
          </p>
        </div>

        {/* Mobile-only: the live ticker, back in its original in-section spot. */}
        <NewsTicker placement="inline" />

        {/* Category tabs + updated pill */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-8">
          <div className="flex items-center gap-2 flex-wrap">
            {CATEGORIES.map((c) => {
              const on = active === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActive(c.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-bold transition-colors ${
                    on
                      ? 'bg-brand-500 border-brand-500 text-black'
                      : 'bg-carbon-900/60 border-white/10 text-zinc-300 hover:border-brand-500/40'
                  }`}
                >
                  {c.id === 'ai' && <Sparkles className="w-3.5 h-3.5" />}
                  {c.label}
                </button>
              );
            })}
          </div>
          {updatedLabel && (
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 sm:mr-auto">
              <Clock3 className="w-3.5 h-3.5" />
              עודכן {updatedLabel}
            </span>
          )}
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 md:gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-64 rounded-2xl bg-white/[0.03] border border-white/5 animate-pulse" />
            ))}
          </div>
        )}

        {isError && !isLoading && (
          <div className="max-w-md mx-auto text-center relative z-10">
            <p className="text-zinc-400 mb-5">לא הצלחנו לטעון את הפיד כרגע. נסו שוב בעוד רגע.</p>
            <WebButton variant="glass" onClick={() => refetch()}>
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              ניסיון נוסף
            </WebButton>
          </div>
        )}

        {!isLoading && !isError && filtered.length > 0 && (
          <>
            <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 md:gap-6 max-w-[1600px] mx-auto mb-10">
              {filtered.map((item) => (
                <motion.div key={item.id} className="h-full">
                  <NewsCard item={item} />
                </motion.div>
              ))}
            </div>

            <ScrollLockRail className="md:hidden mb-8" ariaLabel="חדשות">
              {filtered.map((item) => (
                <NewsCard key={item.id} item={item} />
              ))}
            </ScrollLockRail>

            <div className="text-center relative z-10">
              <WebButton variant="primary" onClick={() => navigate('/news')} className="!px-8">
                לכל החדשות
                <ArrowLeft className="w-4 h-4" />
              </WebButton>
            </div>
          </>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <div className="max-w-md mx-auto text-center relative z-10 text-zinc-400">
            <Rss className="w-8 h-8 mx-auto mb-4 text-zinc-600" />
            אין כרגע כתבות בקטגוריה הזו.
          </div>
        )}
      </div>
    </section>
  );
}
