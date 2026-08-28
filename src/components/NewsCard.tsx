import { Clock, ExternalLink, BookOpen, Sparkles, ShieldAlert, Cloud, Newspaper, type LucideIcon } from 'lucide-react';
import TiltCard from './TiltCard';
import { formatRelativeTime, readingTimeMin, type NewsItem, type NewsTopic } from '../services/newsService';

const CARD_BASE =
  'relative h-full overflow-hidden bg-[#0D0E12] border border-white/10 rounded-2xl transition-all duration-500 hover:border-[#76B900]/50 hover:-translate-y-1.5 hover:shadow-[0_10px_40px_-10px_rgba(118,185,0,0.2)]';

// No image URLs come from the feed, so each card leads with a compact topic-tinted banner (an
// oversized watermark icon + a colour keyed to the topic) that reads as a thumbnail and makes the
// grid scannable at a glance on both mobile and wide desktop.
const TOPIC_META: Record<NewsTopic, { label: string; icon: LucideIcon; pill: string; grad: string; glyph: string }> = {
  ai: {
    label: 'בינה מלאכותית',
    icon: Sparkles,
    pill: 'text-violet-200 border-violet-400/30 bg-violet-500/15',
    grad: 'from-violet-600/30 via-violet-500/5',
    glyph: 'text-violet-400/20',
  },
  cyber: {
    label: 'סייבר',
    icon: ShieldAlert,
    pill: 'text-rose-200 border-rose-400/30 bg-rose-500/15',
    grad: 'from-rose-600/30 via-rose-500/5',
    glyph: 'text-rose-400/20',
  },
  cloud: {
    label: 'ענן',
    icon: Cloud,
    pill: 'text-sky-200 border-sky-400/30 bg-sky-500/15',
    grad: 'from-sky-600/30 via-sky-500/5',
    glyph: 'text-sky-400/20',
  },
  general: {
    label: 'טכנולוגיה',
    icon: Newspaper,
    pill: 'text-zinc-200 border-white/15 bg-white/10',
    grad: 'from-zinc-500/25 via-zinc-500/5',
    glyph: 'text-zinc-400/15',
  },
};

export default function NewsCard({ item }: { item: NewsItem }) {
  const meta = TOPIC_META[item.topic] ?? TOPIC_META.general;
  const TopicIcon = meta.icon;

  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      data-track-interest={`news:${item.topic}:${item.title}`}
      className="group flex flex-col h-full"
    >
      <TiltCard strength={5} className="h-full">
        <div className={`${CARD_BASE} flex flex-col`}>
          {/* Topic banner — the "thumbnail" */}
          <div className={`relative h-16 md:h-20 shrink-0 overflow-hidden bg-gradient-to-bl ${meta.grad} to-transparent`}>
            <TopicIcon className={`absolute -bottom-3 -left-2 w-20 h-20 md:w-24 md:h-24 ${meta.glyph}`} aria-hidden="true" />
            <div className="absolute inset-0 flex items-center justify-between gap-2 px-4 md:px-5">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-wide border rounded-full ${meta.pill}`}>
                <TopicIcon className="w-3 h-3" />
                {meta.label}
              </span>
              <span
                className="px-2.5 py-1 text-[10px] font-mono font-bold tracking-widest border border-white/15 rounded-full text-brand-300 bg-black/40 shrink-0"
                dir="ltr"
              >
                {item.source}
              </span>
            </div>
          </div>

          <div className="relative flex flex-col flex-grow p-5 md:p-6">
            <h3
              dir="auto"
              className="font-display text-base md:text-lg font-bold text-[#F1F5F9] leading-snug mb-2.5 line-clamp-2 md:line-clamp-3 group-hover:text-brand-300 transition-colors"
            >
              {item.title}
            </h3>
            <p dir="auto" className="text-[13px] md:text-sm text-zinc-400 leading-relaxed line-clamp-2 md:line-clamp-3 flex-grow mb-5">
              {item.excerpt}
            </p>

            <div className="flex items-center gap-3 text-[11px] md:text-xs text-zinc-500 mb-4">
              <span className="inline-flex items-center gap-1" title="זמן קריאה משוער">
                <BookOpen className="w-3.5 h-3.5" />
                {readingTimeMin(item.summary || item.excerpt)} דק׳
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {formatRelativeTime(item.publishedAt)}
              </span>
            </div>

            <div className="flex items-center gap-3 mt-auto">
              <span className="flex-1 text-center text-[13px] md:text-sm font-bold px-4 py-2.5 rounded-full border border-white/15 text-zinc-200 group-hover:border-brand-400/50 group-hover:text-brand-300 transition-colors">
                קריאה מלאה
              </span>
              <span
                aria-hidden="true"
                className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full border border-white/15 text-zinc-400 group-hover:border-brand-400/50 group-hover:text-brand-300 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </span>
            </div>
          </div>
        </div>
      </TiltCard>
    </a>
  );
}
