import { useMemo } from 'react';
import { Flame, MousePointerClick, FileText, Target } from 'lucide-react';
import type { TrackedEvent } from '../lib/types';

function topN(counts: Map<string, number>, n: number): [string, number][] {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function Bar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="text-zinc-300 text-xs truncate" dir="auto">
          {label}
        </span>
        <span className="text-zinc-500 text-[11px] font-mono shrink-0">{count}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-l from-brand-500 to-brand-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** All aggregates below are computed client-side from the live event window already loaded by
 * `useLiveEvents` — a real signal derived from actual tracked interactions, scoped to however
 * many events that hook currently holds (not a full historical query). */
export default function ContentHeatmap({ events }: { events: (TrackedEvent & { id: string })[] }) {
  const { topClicked, topPages, conversionRate, conversions, sessions } = useMemo(() => {
    const clickCounts = new Map<string, number>();
    const pageCounts = new Map<string, number>();
    let conversions = 0;
    let sessions = 0;

    events.forEach((e) => {
      if ((e.type === 'click' || e.type === 'hover' || e.type === 'outbound_link') && e.label) {
        clickCounts.set(e.label, (clickCounts.get(e.label) ?? 0) + 1);
      }
      if (e.type === 'pageview' || e.type === 'session_start') {
        pageCounts.set(e.path, (pageCounts.get(e.path) ?? 0) + 1);
      }
      if (e.type === 'conversion') conversions += 1;
      if (e.type === 'session_start') sessions += 1;
    });

    return {
      topClicked: topN(clickCounts, 8),
      topPages: topN(pageCounts, 8),
      conversions,
      sessions,
      conversionRate: sessions > 0 ? Math.round((conversions / sessions) * 100) : 0,
    };
  }, [events]);

  const maxClick = topClicked[0]?.[1] ?? 0;
  const maxPage = topPages[0]?.[1] ?? 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="dash-card p-6">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
          <MousePointerClick className="w-3.5 h-3.5" />
          אלמנטים מובילים בקליקים
        </div>
        {topClicked.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-8">אין נתונים עדיין</p>
        ) : (
          <div className="space-y-3">
            {topClicked.map(([label, count]) => (
              <Bar key={label} label={label} count={count} max={maxClick} />
            ))}
          </div>
        )}
      </div>

      <div className="dash-card p-6">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
          <FileText className="w-3.5 h-3.5" />
          עמודים / שירותים נצפים ביותר
        </div>
        {topPages.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-8">אין נתונים עדיין</p>
        ) : (
          <div className="space-y-3">
            {topPages.map(([path, count]) => (
              <Bar key={path} label={path} count={count} max={maxPage} />
            ))}
          </div>
        )}
      </div>

      <div className="dash-card p-6 flex flex-col">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
          <Target className="w-3.5 h-3.5" />
          יחס המרה
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="relative">
            <Flame className="w-7 h-7 text-brand-400 mx-auto mb-2" />
            <span className="font-display text-5xl font-black text-white">{conversionRate}%</span>
          </div>
          <p className="text-zinc-500 text-xs mt-3">
            {conversions} המרות מתוך {sessions} סשנים (בחלון האירועים הנוכחי)
          </p>
        </div>
      </div>
    </div>
  );
}
