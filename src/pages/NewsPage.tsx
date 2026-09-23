import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Rss,
  Search,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  BrainCircuit,
  Bot,
  type LucideIcon,
} from 'lucide-react';
import { PageHero } from '../components/content/ContentPrimitives';
import WebButton from '../components/WebButton';
import ArticleModal from '../components/news/ArticleModal';
import { NewsHeroCard, NewsGridCard } from '../components/news/NewsCards';
import { filterCommandCenter } from '../lib/newsAnalysis';
import { prefersReducedMotion } from '../lib/gsap';
import { useNewsFeed, type NewsItem, type NewsTopic } from '../services/newsService';

// ── categories (Command Center filter rail) ───────────────────────────────────────────────────
const CATEGORIES: { id: NewsTopic | 'all'; he: string; en: string; icon?: LucideIcon }[] = [
  { id: 'all', he: 'הכל', en: 'ALL' },
  { id: 'ai', he: 'בינה מלאכותית', en: 'AI', icon: Sparkles },
  { id: 'ai_models', he: 'מודלי AI וחידושים', en: 'AI Models & LLMs', icon: BrainCircuit },
  { id: 'ai_agents', he: 'סוכני AI', en: 'AI Agents', icon: Bot },
];

const PAGE_SIZE = 18;

// ── live telemetry ticker ─────────────────────────────────────────────────────────────────────
function TelemetryTicker({ items, updatedAt }: { items: NewsItem[]; updatedAt: number }) {
  const reduce = prefersReducedMotion();
  const nodes = useMemo(() => new Set(items.map((i) => i.source)).size, [items]);

  // The rotating line cycles ONLY real headlines. The "system is live / N sources synced"
  // telemetry lives in the static left rail (LIVE FEED · NODES ACTIVE · SYNC) — it must never
  // cycle through here as if it were a headline (and the old Latin-first "FEED · …" / "SCAN · …"
  // strings also flipped the whole line LTR under `dir="auto"`).
  const lines = useMemo(() => {
    const heads = items.slice(0, 8).map((i) => `דחוף · ${i.title}`);
    return heads.length ? heads : ['הפיד מתעדכן — אין כותרות חדשות ברגע זה'];
  }, [items]);

  const [idx, setIdx] = useState(0);
  useEffect(() => {
    setIdx(0);
    if (reduce || lines.length < 2) return;
    const id = window.setInterval(() => setIdx((v) => (v + 1) % lines.length), 3600);
    return () => window.clearInterval(id);
  }, [lines, reduce]);

  const synced = updatedAt > 0 ? new Date(updatedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div dir="rtl" className="mb-6 overflow-hidden rounded-2xl border border-[#22d3ee]/20 bg-[#04070b]/85 font-mono">
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
              dir="rtl"
              className="truncate text-right text-[11px] text-zinc-300 sm:text-xs [unicode-bidi:isolate]"
            >
              <span className="text-[#9FE870]">▸ </span>
              <bdi>{lines[idx]}</bdi>
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
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
    // strict command-center gate first: Hebrew-language + a usable lead image only
    return filterCommandCenter(items).filter((item) => {
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
          badgeLabel="AI News Command Center"
          title={'חדשות AI: מודלים, סוכנים וכלים'}
          subtitle="מה קרה היום בעולם ה-AI, עם תקציר קצר לכל כתבה ומה זה אומר בשבילכם."
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
          <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
                {heroItem && <NewsHeroCard item={heroItem} onOpen={setActive} className="mb-8" />}

                {gridItems.length > 0 && (
                  <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {gridItems.map((item, i) => (
                      <NewsGridCard key={item.id} item={item} onOpen={setActive} wide={i === 0} />
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
