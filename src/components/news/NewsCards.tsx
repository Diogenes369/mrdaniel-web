import {
  Radar,
  Clock,
  BookOpen,
  ChevronLeft,
  ShieldAlert,
  Sparkles,
  BrainCircuit,
  Cloud,
  Newspaper,
  type LucideIcon,
} from 'lucide-react';
import NewsImage from './NewsImage';
import { sourceDomain } from '../../lib/newsAnalysis';
import { formatRelativeTime, readingTimeMin, type NewsItem, type NewsTopic } from '../../services/newsService';

/** Shared topic styling for every news card + the article modal. */
export const TOPIC: Record<NewsTopic, { label: string; icon: LucideIcon; ring: string; grad: string }> = {
  cyber: { label: 'סייבר', icon: ShieldAlert, ring: 'text-rose-300 border-rose-400/40 bg-rose-500/10', grad: 'from-rose-600/40' },
  ai: { label: 'בינה מלאכותית', icon: Sparkles, ring: 'text-violet-300 border-violet-400/40 bg-violet-500/10', grad: 'from-violet-600/40' },
  ai_models: { label: 'מודלי AI וחידושים', icon: BrainCircuit, ring: 'text-fuchsia-300 border-fuchsia-400/40 bg-fuchsia-500/10', grad: 'from-fuchsia-600/40' },
  cloud: { label: 'תשתיות וענן', icon: Cloud, ring: 'text-sky-300 border-sky-400/40 bg-sky-500/10', grad: 'from-sky-600/40' },
  general: { label: 'טכנולוגיה', icon: Newspaper, ring: 'text-zinc-300 border-white/20 bg-white/5', grad: 'from-zinc-500/30' },
};

/** Featured breaking story — image-forward, 2-col on md+. Click opens the article modal. */
export function NewsHeroCard({ item, onOpen, className = '' }: { item: NewsItem; onOpen: (i: NewsItem) => void; className?: string }) {
  const t = TOPIC[item.topic] ?? TOPIC.general;
  const Icon = t.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      data-track-interest={`news:${item.topic}:${item.title}`}
      className={`group relative block w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-white/12 bg-[#06080c] text-right transition-colors hover:border-[#76B900]/40 ${className}`}
    >
      <div className="grid min-w-0 md:grid-cols-2">
        <div className="relative aspect-[16/9] w-full overflow-hidden md:aspect-[16/10]">
          <div className={`absolute inset-0 bg-gradient-to-bl ${t.grad} via-transparent to-transparent`} aria-hidden="true" />
          <Icon className="pointer-events-none absolute -bottom-6 -left-4 h-40 w-40 text-white/[0.06]" aria-hidden="true" />
          <NewsImage src={item.image} topic={item.topic} seed={item.id} className="transition-transform duration-700 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#06080c] via-transparent to-transparent md:bg-gradient-to-l" aria-hidden="true" />
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-3 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#76B900]/45 bg-[#76B900]/12 px-2.5 py-1 text-[11px] font-bold text-[#9FE870]">
              <Radar className="h-3.5 w-3.5" /> כתבה נבחרת · ניתוח חמ״ל
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${t.ring}`}>
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </span>
          </div>
          <h3 dir="auto" className="break-words font-display text-2xl font-black leading-tight text-white transition-colors group-hover:text-brand-300 sm:text-3xl">
            {item.title}
          </h3>
          <p dir="auto" className="line-clamp-3 break-words text-sm leading-relaxed text-zinc-400">
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

/** Secondary card — 16:9 image header (min 190px), title/excerpt, domain + time + reading-time. */
export function NewsGridCard({
  item,
  onOpen,
  wide,
}: {
  item: NewsItem;
  onOpen: (i: NewsItem) => void;
  wide?: boolean;
}) {
  const t = TOPIC[item.topic] ?? TOPIC.general;
  const Icon = t.icon;
  const domain = sourceDomain(item.link);
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      data-track-interest={`news:${item.topic}:${item.title}`}
      className={`group flex h-full min-w-0 max-w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#06080c] text-right transition-colors hover:border-[#76B900]/40 ${
        wide ? 'sm:col-span-2' : ''
      }`}
    >
      <div className="relative aspect-[16/9] min-h-[190px] w-full shrink-0 overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-bl ${t.grad} via-transparent to-transparent`} aria-hidden="true" />
        <Icon className="pointer-events-none absolute -bottom-4 -left-3 h-24 w-24 text-white/[0.06]" aria-hidden="true" />
        <NewsImage src={item.image} topic={item.topic} seed={item.id} className="transition-transform duration-700 group-hover:scale-105" />
        <span className={`absolute right-2.5 top-2.5 z-[1] inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold backdrop-blur-md ${t.ring}`}>
          <Icon className="h-3 w-3" /> {t.label}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
        <h3
          dir="auto"
          className={`break-words font-display font-bold leading-snug text-[#F1F5F9] transition-colors group-hover:text-brand-300 ${
            wide ? 'text-lg line-clamp-3 md:text-xl' : 'text-[15px] line-clamp-3'
          }`}
        >
          {item.title}
        </h3>
        <p dir="auto" className="mt-2 line-clamp-2 flex-1 break-words text-[12.5px] leading-relaxed text-zinc-400">
          {item.excerpt || item.summary}
        </p>
        <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-zinc-500" dir="rtl">
          <span dir="ltr" className="max-w-full truncate font-mono text-zinc-400">{domain || item.source}</span>
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
