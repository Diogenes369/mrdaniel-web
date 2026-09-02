import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Rss,
  Search,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  Radar,
  ShieldAlert,
  Sparkles,
  Cloud,
  Newspaper,
  Clock,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';
import { PageHero } from '../components/content/ContentPrimitives';
import WebButton from '../components/WebButton';
import ArticleModal from '../components/news/ArticleModal';
import { sourceDomain } from '../lib/newsAnalysis';
import { prefersReducedMotion } from '../lib/gsap';
import { useNewsFeed, formatRelativeTime, readingTimeMin, type NewsItem, type NewsTopic } from '../services/newsService';

// ── categories (Command Center filter rail) ───────────────────────────────────────────────────
const CATEGORIES: { id: NewsTopic | 'all'; he: string; en: string; icon?: LucideIcon }[] = [
  { id: 'all', he: 'הכל', en: 'ALL' },
  { id: 'cyber', he: 'סייבר ואבטחת מידע', en: 'Cyber Security', icon: ShieldAlert },
  { id: 'ai', he: 'בינה מלאכותית ואוטומציה', en: 'AI & Automation', icon: Sparkles },
  { id: 'cloud', he: 'פיתוח ותשתיות', en: 'Full-Stack & Cloud', icon: Cloud },
  { id: 'general', he: 'חדשות שוק', en: 'Tech Market Insights', icon: Newspaper },
];

const TOPIC: Record<NewsTopic, { label: string; icon: LucideIcon; ring: string; grad: string }> = {
  cyber: { label: 'סייבר', icon: ShieldAlert, ring: 'text-rose-300 border-rose-400/40 bg-rose-500/10', grad: 'from-rose-600/40' },
  ai: { label: 'בינה מלאכותית', icon: Sparkles, ring: 'text-violet-300 border-violet-400/40 bg-violet-500/10', grad: 'from-violet-600/40' },
  cloud: { label: 'תשתיות וענן', icon: Cloud, ring: 'text-sky-300 border-sky-400/40 bg-sky-500/10', grad: 'from-sky-600/40' },
  general: { label: 'טכנולוגיה', icon: Newspaper, ring: 'text-zinc-300 border-white/20 bg-white/5', grad: 'from-zinc-500/30' },
};

const PAGE_SIZE = 18;

// ── live telemetry ticker ─────────────────────────────────────────────────────────────────────
function TelemetryTicker({ items, updatedAt }: { items: NewsItem[]; updatedAt: number }) {
  const reduce = prefersReducedMotion();
  const nodes = useMemo(() => new Set(items.map((i) => i.source)).size, [items]);

  const lines = useMemo(() => {
    const status = [
      'SCAN · וקטורי תקיפה מנוטרים — אין אנומליה חריגה',
      `FEED · ${nodes || '—'} מקורות RSS מחוברים ומסונכרנים`,
      'AI-WATCH · תנועת מודלים, רגולציה והשקות במעקב',
      'CLOUD · ניטור עלות · ביצועים · אבטחת שכבת רשת תקין',
    ];
    const heads = items.slice(0, 6).map((i) => `דחוף · ${i.title}`);
    const out: string[] = [];
    for (let i = 0; i < Math.max(status.length, heads.length); i++) {
      if (status[i]) out.push(status[i]);
      if (heads[i]) out.push(heads[i]);
    }
    return out.length ? out : status;
  }, [items, nodes]);

  const [idx, setIdx] = useState(0);
  useEffect(() => {
    setIdx(0);
    if (reduce || lines.length < 2) return;
    const id = window.setInterval(() => setIdx((v) => (v + 1) % lines.length), 3600);
    return () => window.clearInterval(id);
  }, [lines, reduce]);

  const synced = updatedAt > 0 ? new Date(updatedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-[#22d3ee]/20 bg-[#04070b]/85 font-mono">
      <div className="flex items-stretch">
        <div className="flex shrink-0 items-center gap-2 border-l border-white/10 bg-[#22d3ee]/[0.06] px-3 py-2.5 text-[11px] font-bold text-[#67e8f9] sm:px-4">
          <span className="relative flex h-2 w-2">
            {!reduce && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22d3ee] opacity-70" />}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#22d3ee]" />
          </span>
          LIVE FEED
        </div>
        <div className="hidden shrink-0 items-center gap-3 border-l border-white/10 px-4 py-2.5 text-[11px] text-zinc-500 md:flex">
          <span>
            NODES ACTIVE: <span className="text-zinc-300">{nodes || '—'}</span>
          </span>
          <span aria-hidden="true">·</span>
          <span>SYNC {synced}</span>
        </div>
        <div className="relative min-w-0 flex-1 px-3 py-2.5 sm:px-4">
          <AnimatePresence mode="wait">
            <motion.p
              key={idx}
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : -8 }}
              transition={{ duration: 0.3 }}
              dir="auto"
              className="truncate text-[11px] text-zinc-300 sm:text-xs"
            >
              <span className="text-[#9FE870]">▸ </span>
              {lines[idx]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ── featured breaking story ───────────────────────────────────────────────────────────────────
function HeroCard({ item, onOpen }: { item: NewsItem; onOpen: (i: NewsItem) => void }) {
  const t = TOPIC[item.topic] ?? TOPIC.general;
  const Icon = t.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="group relative mb-8 block w-full overflow-hidden rounded-3xl border border-white/12 bg-[#06080c] text-right transition-colors hover:border-[#76B900]/40"
    >
      <div className="grid md:grid-cols-2">
        <div className="relative h-52 overflow-hidden sm:h-64 md:h-full md:min-h-[340px]">
          {item.image ? (
            <img
              src={item.image}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : null}
          <div className={`absolute inset-0 bg-gradient-to-bl ${t.grad} via-transparent to-transparent`} aria-hidden="true" />
          <Icon className="pointer-events-none absolute -bottom-6 -left-4 h-40 w-40 text-white/[0.06]" aria-hidden="true" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#06080c] via-transparent to-transparent md:bg-gradient-to-l" aria-hidden="true" />
        </div>
        <div className="flex flex-col justify-center gap-3 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#76B900]/45 bg-[#76B900]/12 px-2.5 py-1 text-[11px] font-bold text-[#9FE870]">
              <Radar className="h-3.5 w-3.5" /> כתבה נבחרת · ניתוח חמ״ל
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${t.ring}`}>
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </span>
          </div>
          <h2 dir="auto" className="font-display text-2xl font-black leading-tight text-white transition-colors group-hover:text-brand-300 sm:text-3xl">
            {item.title}
          </h2>
          <p dir="auto" className="line-clamp-3 text-sm leading-relaxed text-zinc-400">
            {item.excerpt || item.summary}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500" dir="rtl">
            <span dir="ltr" className="font-bold text-zinc-400">{item.source}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatRelativeTime(item.publishedAt)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5" />
              {readingTimeMin(item.summary || item.excerpt)} דק׳
            </span>
          </div>
          <span className="mt-2 inline-flex w-fit items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-bold text-zinc-200 transition-colors group-hover:border-brand-400/50 group-hover:text-brand-300">
            פתיחת ניתוח מורחב <ChevronLeft className="h-4 w-4" />
          </span>
        </div>
      </div>
    </button>
  );
}

// ── secondary grid card ───────────────────────────────────────────────────────────────────────
function GridCard({ item, onOpen, wide }: { item: NewsItem; onOpen: (i: NewsItem) => void; wide?: boolean }) {
  const t = TOPIC[item.topic] ?? TOPIC.general;
  const Icon = t.icon;
  const domain = sourceDomain(item.link);
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      data-track-interest={`news:${item.topic}:${item.title}`}
      className={`group flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#06080c] text-right transition-colors hover:border-[#76B900]/40 ${wide ? 'sm:col-span-2' : ''}`}
    >
      <div className={`relative shrink-0 overflow-hidden ${wide ? 'h-44 sm:h-52' : 'h-36'}`}>
        {item.image ? (
          <img
            src={item.image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : null}
        <div className={`absolute inset-0 bg-gradient-to-bl ${t.grad} via-transparent to-transparent`} aria-hidden="true" />
        <Icon className="pointer-events-none absolute -bottom-4 -left-3 h-24 w-24 text-white/[0.06]" aria-hidden="true" />
        <span className={`absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold backdrop-blur-md ${t.ring}`}>
          <Icon className="h-3 w-3" /> {t.label}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h3
          dir="auto"
          className={`font-display font-bold leading-snug text-[#F1F5F9] transition-colors group-hover:text-brand-300 ${
            wide ? 'text-lg line-clamp-3 md:text-xl' : 'text-[15px] line-clamp-3'
          }`}
        >
          {item.title}
        </h3>
        <p dir="auto" className="mt-2 line-clamp-2 flex-1 text-[12.5px] leading-relaxed text-zinc-400">
          {item.excerpt || item.summary}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-zinc-500" dir="rtl">
          <span dir="ltr" className="font-mono text-zinc-400">{domain || item.source}</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(item.publishedAt)}
          </span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <BookOpen className="h-3 w-3" />
            {readingTimeMin(item.summary || item.excerpt)} דק׳
          </span>
        </div>
      </div>
    </button>
  );
}

// ── pagination (unchanged) ────────────────────────────────────────────────────────────────────
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

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
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
        <ChevronRight className="h-4 w-4" />
        הקודם
      </button>
      {pageList(page, totalPages).map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className="select-none px-1.5 text-zinc-600">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={`${btn} ${
              p === page ? 'border-brand-500 bg-brand-500 text-black' : 'border-white/10 bg-carbon-900/60 text-zinc-300 hover:border-brand-500/40'
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
        <ChevronLeft className="h-4 w-4" />
      </button>
    </nav>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────────────────────
export default function NewsPage() {
  const { data: items, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useNewsFeed();
  const [activeFilter, setActiveFilter] = useState<NewsTopic | 'all'>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<NewsItem | null>(null);

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

  useEffect(() => {
    setPage(1);
  }, [activeFilter, query]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const heroItem = page === 1 ? pageItems[0] : undefined;
  const gridItems = heroItem ? pageItems.slice(1) : pageItems;

  const goToPage = (p: number) => {
    setPage(Math.min(totalPages, Math.max(1, p)));
    document.getElementById('news-grid-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div id="page-top" className="min-h-screen pt-24 pb-24 md:pt-28">
      <div className="container-wide">
        <PageHero
          badgeIcon={Rss}
          badgeLabel="Cyber & AI News Command Center"
          title={'חמ״ל חדשות סייבר, AI וטכנולוגיה'}
          subtitle="ריכוז חי מגיקטיים, אנשים ומחשבים, Techtime ו-Israel Defense — עם תקציר מנהלים, ניתוח טכנולוגי ומשמעויות לכל כתבה."
        />

        <TelemetryTicker items={items ?? []} updatedAt={dataUpdatedAt} />

        <div id="news-grid-top" className="mb-8 flex scroll-mt-28 flex-col gap-4 md:flex-row md:items-center">
          <div className="flex flex-wrap items-center gap-2">
            {CATEGORIES.map((f) => {
              const isActive = activeFilter === f.id;
              const Icon = f.icon;
              return (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-bold transition-colors ${
                    isActive
                      ? 'border-brand-500 bg-brand-500 text-black'
                      : 'border-white/10 bg-carbon-900/60 text-zinc-300 hover:border-brand-500/40'
                  }`}
                >
                  {Icon && <Icon className="h-3.5 w-3.5" />}
                  {f.he}
                  <span className={`hidden font-mono text-[10px] font-semibold sm:inline ${isActive ? 'text-black/60' : 'text-zinc-500'}`}>
                    {f.en}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative flex-1 md:mr-auto md:max-w-xs">
            <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש מהיר בכותרות ובתקצירים..."
              className="input-glow !pr-10"
            />
          </div>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, idx) => (
              <div key={idx} className="h-72 animate-pulse rounded-2xl border border-white/5 bg-white/[0.03]" />
            ))}
          </div>
        )}

        {isError && !isLoading && (
          <div className="mx-auto max-w-md py-16 text-center">
            <p className="mb-5 text-zinc-400">לא הצלחנו לטעון את הפיד כרגע. נסו שוב בעוד רגע.</p>
            <WebButton variant="glass" onClick={() => refetch()}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              ניסיון נוסף
            </WebButton>
          </div>
        )}

        {!isLoading && !isError && (
          <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500" dir="rtl">
              <span>
                {filtered.length} כתבות · עמוד {page} מתוך {totalPages}
              </span>
              {dataUpdatedAt > 0 && (
                <span>עודכן לאחרונה {new Date(dataUpdatedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>

            {pageItems.length > 0 ? (
              <>
                {heroItem && <HeroCard item={heroItem} onOpen={setActive} />}

                {gridItems.length > 0 && (
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {gridItems.map((item, i) => (
                      <GridCard key={item.id} item={item} onOpen={setActive} wide={i === 0} />
                    ))}
                  </div>
                )}

                <Pagination page={page} totalPages={totalPages} onChange={goToPage} />
              </>
            ) : (
              <div className="mx-auto max-w-md py-16 text-center text-zinc-400">
                <Rss className="mx-auto mb-4 h-8 w-8 text-zinc-600" />
                לא נמצאו כתבות התואמות את הסינון הנוכחי.
              </div>
            )}
          </>
        )}
      </div>

      <ArticleModal item={active} onClose={() => setActive(null)} />
    </div>
  );
}
