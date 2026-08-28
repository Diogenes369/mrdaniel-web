import { Clock, ExternalLink, BookOpen } from 'lucide-react';
import TiltCard from './TiltCard';
import { formatRelativeTime, readingTimeMin, type NewsItem } from '../services/newsService';

const CARD_BASE =
  'relative h-full overflow-hidden bg-[#0D0E12] border border-white/10 rounded-2xl transition-all duration-500 hover:border-[#76B900]/50 hover:-translate-y-1.5 hover:shadow-[0_10px_40px_-10px_rgba(118,185,0,0.2)]';

export default function NewsCard({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      data-track-interest={`news:${item.topic}:${item.title}`}
      className="group flex flex-col h-full"
    >
      <TiltCard strength={5} className="h-full">
        <div className={`${CARD_BASE} p-6 flex flex-col`}>
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" aria-hidden="true" />

          <div className="relative flex items-center justify-between gap-2 mb-4">
            <span className="px-2.5 py-1 text-[10px] font-mono font-bold tracking-widest border border-white/10 rounded-full text-brand-400 shrink-0" dir="ltr">
              {item.source}
            </span>
            <span className="flex items-center gap-2.5 text-xs text-zinc-500 shrink-0">
              <span className="inline-flex items-center gap-1" title="זמן קריאה משוער">
                <BookOpen className="w-3.5 h-3.5" />
                {readingTimeMin(item.summary || item.excerpt)} דק׳
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {formatRelativeTime(item.publishedAt)}
              </span>
            </span>
          </div>

          <h3 dir="auto" className="relative font-display text-lg font-bold text-[#F1F5F9] leading-snug mb-3 line-clamp-3 group-hover:text-brand-300 transition-colors">
            {item.title}
          </h3>
          <p dir="auto" className="relative text-sm text-zinc-400 leading-relaxed line-clamp-3 flex-grow mb-6">
            {item.excerpt}
          </p>

          <div className="relative flex items-center gap-3 mt-auto">
            <span className="flex-1 text-center text-sm font-bold px-4 py-2.5 rounded-full border border-white/15 text-zinc-200 group-hover:border-brand-400/50 group-hover:text-brand-300 transition-colors">
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
      </TiltCard>
    </a>
  );
}
