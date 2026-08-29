import { Flame, Sparkles, ArrowLeft, ExternalLink } from 'lucide-react';
import { useAIPulse, toolOfTheWeek } from '../../services/aiPulseService';

/** Small pulsing "auto-updating" badge — reused on both cards. */
function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest text-brand-300 shrink-0">
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-400" />
      </span>
      מתעדכן אוטומטית
    </span>
  );
}

/**
 * "מה חדש בעולם ה-AI" — a live external AI-tech pulse (TechCrunch AI, VentureBeat AI, Hacker News),
 * aggregated client-side via rss2json with a curated evergreen fallback so it's never empty, plus
 * an auto-rotating weekly "Tool of the Week". Fixed min-heights keep the layout stable while data
 * loads (no CLS).
 */
export default function AIPulseWidget() {
  const { data: items, isLoading } = useAIPulse();
  const tool = toolOfTheWeek();
  const list = items ?? [];
  const [lead, ...rest] = list;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-16">
      {/* ---- Tool of the Week (auto-rotates weekly) ---- */}
      <div className="flex min-h-[280px] flex-col rounded-2xl border border-brand-500/30 bg-gradient-to-br from-brand-500/10 to-transparent p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-brand-400">
            <Sparkles className="w-3 h-3" />
            Tool of the Week
          </span>
          <LiveBadge />
        </div>
        <h3 className="mb-1 font-display text-xl font-bold text-white">{tool.name}</h3>
        <p className="mb-3 font-mono text-xs text-zinc-500" dir="ltr">
          {tool.vendor}
        </p>
        <p className="mb-4 flex-grow text-sm leading-relaxed text-zinc-300">{tool.description}</p>
        <a
          href={tool.link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-brand-400 transition-colors hover:text-brand-300"
        >
          למידע נוסף
          <ArrowLeft className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* ---- Live AI-tech feed ---- */}
      <div className="flex min-h-[280px] flex-col rounded-2xl border border-white/10 bg-[#0D0E12]/80 p-6 lg:col-span-2">
        <div className="mb-4 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-brand-400">
            <Flame className="w-3 h-3" />
            עדכוני AI חמים
          </span>
          <LiveBadge />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <div className="h-6 w-3/4 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-4 w-full animate-pulse rounded bg-white/[0.04]" />
            <div className="h-4 w-11/12 animate-pulse rounded bg-white/[0.04]" />
            <div className="mt-4 space-y-2.5 border-t border-white/10 pt-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-4 w-5/6 animate-pulse rounded bg-white/[0.04]" />
              ))}
            </div>
          </div>
        ) : lead ? (
          <>
            <a href={lead.link} target="_blank" rel="noopener noreferrer" className="group mb-3 block">
              <span className="mb-1 block font-mono text-[11px] text-brand-400/80" dir="ltr">
                {lead.source}
              </span>
              <h3
                dir="auto"
                className="mb-1.5 font-display text-lg font-bold leading-snug text-white transition-colors line-clamp-2 group-hover:text-brand-300"
              >
                {lead.title}
              </h3>
              {lead.excerpt && (
                <p dir="auto" className="text-sm leading-relaxed text-zinc-400 line-clamp-2">
                  {lead.excerpt}
                </p>
              )}
            </a>

            {rest.length > 0 && (
              <ul className="mt-1 flex-grow space-y-2 border-t border-white/10 pt-3">
                {rest.slice(0, 5).map((item) => (
                  <li key={item.id} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500/70" />
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      dir="auto"
                      className="block text-sm text-zinc-400 transition-colors line-clamp-1 hover:text-brand-400"
                    >
                      {item.title}
                      <span className="ml-1.5 font-mono text-xs text-zinc-600" dir="ltr">
                        · {item.source}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-500">אין כרגע עדכונים זמינים.</p>
        )}

        <div className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-zinc-600">
          <ExternalLink className="w-3 h-3" />
          מקורות: TechCrunch · VentureBeat · Hacker News
        </div>
      </div>
    </div>
  );
}
