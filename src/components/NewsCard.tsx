import { Clock, ExternalLink, BookOpen, Sparkles, ShieldAlert, Cloud, Newspaper, type LucideIcon } from 'lucide-react';
import TiltCard from './TiltCard';
import NewsImage from './news/NewsImage';
import { formatRelativeTime, readingTimeMin, type NewsItem, type NewsTopic } from '../services/newsService';

const CARD_BASE = 'cyber-glass cyber-glass--info h-full rounded-2xl flex flex-col';

// Each card leads with a 16:9 image header (feed lead image via <NewsImage>, `object-cover
// object-center` so subjects stay centred; a topic-tinted gradient + oversized watermark icon
// show through when the feed has no image or it fails to load).
const TOPIC_META: Record<NewsTopic, { label: string; icon: LucideIcon; grad: string; glyph: string }> = {
  ai: {
    label: 'בינה מלאכותית',
    icon: Sparkles,
    grad: 'from-violet-600/30 via-violet-500/5',
    glyph: 'text-violet-400/20',
  },
  cyber: {
    label: 'סייבר',
    icon: ShieldAlert,
    grad: 'from-rose-600/30 via-rose-500/5',
    glyph: 'text-rose-400/20',
  },
  cloud: {
    label: 'ענן',
    icon: Cloud,
    grad: 'from-sky-600/30 via-sky-500/5',
    glyph: 'text-sky-400/20',
  },
  general: {
    label: 'טכנולוגיה',
    icon: Newspaper,
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
        <div className={CARD_BASE}>
          {/* Image header — 16:9, ~55% of the card. Feed lead image (centred, never squashed);
              topic gradient + watermark show through when there's no image. */}
          <div className={`relative aspect-[16/9] min-h-[190px] shrink-0 overflow-hidden bg-gradient-to-bl ${meta.grad} to-transparent`}>
            <TopicIcon className={`absolute -bottom-3 -left-2 w-28 h-28 md:w-32 md:h-32 ${meta.glyph}`} aria-hidden="true" />
            <NewsImage src={item.image} className="transition-transform duration-700 group-hover:scale-105" />
            <span className="absolute right-2.5 top-2.5 z-[1] inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[11px] font-bold text-white/90 backdrop-blur-md">
              <TopicIcon className="w-3.5 h-3.5 text-brand-400" />
              {meta.label}
            </span>
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

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] md:text-xs text-zinc-500 mb-4">
              <span dir="ltr" className="font-bold text-zinc-400">{item.source}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {formatRelativeTime(item.publishedAt)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1" title="זמן קריאה משוער">
                <BookOpen className="w-3.5 h-3.5" />
                {readingTimeMin(item.summary || item.excerpt)} דק׳
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
