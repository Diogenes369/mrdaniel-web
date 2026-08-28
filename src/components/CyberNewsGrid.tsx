import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Rss, ArrowLeft, RefreshCw, Sparkles, Clock3 } from 'lucide-react';
import WebButton from './WebButton';
import NewsCard from './NewsCard';
import ScrollLockRail from './mobile/ScrollLockRail';
import { useNewsFeed, type NewsTopic } from '../services/newsService';
import { prefersReducedMotion } from '../lib/gsap';

// Homepage news section, rebuilt as an interactive mini-dashboard: an infinite live headline
// ticker, category tab filters, reading-time tags (in NewsCard), an "updated" pill, and a
// responsive grid / mobile scroll-lock rail. All underlying data is unchanged — same useNewsFeed().
const PREVIEW_COUNT = 9;
const TICKER_COUNT = 12;

const CATEGORIES: { id: NewsTopic | 'all'; label: string }[] = [
  { id: 'all', label: 'הכל' },
  { id: 'ai', label: 'בינה מלאכותית' },
  { id: 'cyber', label: 'סייבר' },
  { id: 'cloud', label: 'ענן' },
  { id: 'general', label: 'כללי' },
];

interface TickerRow {
  id: string;
  title: string;
  dateLabel: string;
  href: string;
}

// Shown while the feed is loading, empty, or errored — the ticker is never blank.
const FALLBACK_TICKER: TickerRow[] = [
  { id: 'fb-ai', title: 'סוכני AI בארגונים — מגמת האוטומציה שמשנה תהליכים עסקיים', dateLabel: 'עדכני', href: '/ai' },
  { id: 'fb-cy', title: 'אבטחת סייבר לעסקים קטנים ובינוניים: Zero-Trust כברירת מחדל', dateLabel: 'עדכני', href: '/cyber' },
  { id: 'fb-web', title: 'פיתוח Full-Stack מודרני — מהירות, נגישות וארכיטקטורה נקייה', dateLabel: 'עדכני', href: '/digital' },
  { id: 'fb-data', title: 'ארכיטקטורת דאטה נכונה = החלטות מהירות ומוצר טוב יותר', dateLabel: 'עדכני', href: '/architecture' },
  { id: 'fb-mkt', title: 'קמפיינים דיגיטליים מבוססי דאטה — יותר לידים, פחות בזבוז', dateLabel: 'עדכני', href: '/digital' },
  { id: 'fb-cap', title: 'סקירת יכולות: מ-MVP ליזם ועד פלטפורמה ארגונית מלאה', dateLabel: 'עדכני', href: '/capabilities' },
];

function formatTickerDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

export default function CyberNewsGrid() {
  const navigate = useNavigate();
  const { data: allItems, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useNewsFeed();
  const [active, setActive] = useState<NewsTopic | 'all'>('all');
  const reduced = prefersReducedMotion();

  const filtered = useMemo(() => {
    const list = allItems ?? [];
    const scoped = active === 'all' ? list : list.filter((i) => i.topic === active);
    return scoped.slice(0, PREVIEW_COUNT);
  }, [allItems, active]);

  // Always a non-empty list — real headlines when we have them, evergreen fallbacks otherwise.
  const tickerRows: TickerRow[] = useMemo(() => {
    const rows = (allItems ?? []).slice(0, TICKER_COUNT).map((i) => ({
      id: i.id,
      title: i.title,
      dateLabel: formatTickerDate(i.publishedAt),
      href: i.link,
    }));
    return rows.length >= 4 ? rows : FALLBACK_TICKER;
  }, [allItems]);

  const openRow = (href: string) => {
    if (href.startsWith('/')) navigate(href);
    else window.open(href, '_blank', 'noopener,noreferrer');
  };

  const updatedLabel =
    dataUpdatedAt > 0
      ? new Date(dataUpdatedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
      : null;

  const Item = ({ row }: { row: TickerRow }) => (
    <button
      type="button"
      onClick={() => openRow(row.href)}
      className="group inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-brand-300 transition-colors"
    >
      <span className="text-brand-500">•</span>
      <span>{row.title}</span>
      {row.dateLabel && (
        <span className="text-xs font-mono text-zinc-600 group-hover:text-brand-500/70" dir="ltr">
          {row.dateLabel}
        </span>
      )}
    </button>
  );

  return (
    <section id="news" className="py-14 md:py-24 border-t border-white/5 relative overflow-hidden cv-auto">
      <div className="container-wide relative z-10">
        <div className="max-w-3xl mx-auto text-center mb-8 md:mb-10">
          <h2 className="font-display text-fluid-h2 font-black text-white mb-4">
            חדשות <span className="text-brand-500">סייבר, AI וטכנולוגיה</span>
          </h2>
          <p className="font-sans text-zinc-300 text-base md:text-lg leading-relaxed [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">
            לוח חדשות חי — ריכוז אוטומטי מגיקטיים, אנשים ומחשבים, Techtime ו-Israel Defense, בעברית.
          </p>
        </div>

        {/* Infinite live headline ticker — always populated (fallbacks while loading/empty). */}
        <div className="news-ticker relative mb-8 rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
          {/* LIVE tag (right) + its gradient mask so items dissolve out from behind it */}
          <div className="absolute right-0 inset-y-0 z-20 flex items-center gap-2 pr-3 pl-10 bg-gradient-to-l from-carbon-950 via-carbon-950 to-transparent">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-400" />
            </span>
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-brand-300">Live</span>
          </div>
          {/* left fade */}
          <div className="pointer-events-none absolute left-0 inset-y-0 z-10 w-10 bg-gradient-to-r from-carbon-950 to-transparent" />

          {reduced ? (
            <div className="flex gap-8 overflow-hidden whitespace-nowrap py-2.5 pr-24 pl-4">
              {tickerRows.slice(0, 5).map((row) => (
                <span key={row.id} className="inline-flex items-center gap-2 text-sm text-zinc-400 truncate">
                  <span className="text-brand-500">•</span>
                  {row.title}
                  {row.dateLabel && <span className="text-xs font-mono text-zinc-600" dir="ltr">{row.dateLabel}</span>}
                </span>
              ))}
            </div>
          ) : (
            <div className="news-ticker__viewport py-2.5" dir="ltr">
              <div className="news-ticker__track">
                {[0, 1].map((dup) => (
                  <div className="news-ticker__group" key={dup} aria-hidden={dup === 1}>
                    {tickerRows.map((row) => (
                      <Item key={`${dup}-${row.id}`} row={row} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

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
