import { RefreshCw } from 'lucide-react';
import type { AutoRefreshState } from '../lib/useDashboardRefresh';

/**
 * Real-time status strip: a pulsing "LIVE" badge, a manual "רענן עכשיו" button (spins for ~600ms
 * on click), and a countdown ring showing the seconds to the next 5-second auto-tick.
 */
export default function LiveStatusBar({
  refresh,
  activeUsers,
  periodSeconds = 5,
}: {
  refresh: AutoRefreshState;
  activeUsers?: number;
  periodSeconds?: number;
}) {
  const R = 9;
  const C = 2 * Math.PI * R;

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 text-brand-300 text-xs font-bold">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-400" />
          </span>
          LIVE
        </span>
        {typeof activeUsers === 'number' && (
          <span className="text-sm text-zinc-400">
            <span className="font-display font-black text-white tabular-nums">{activeUsers}</span> משתמשים פעילים כעת
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* countdown ring */}
        <span className="relative inline-flex items-center justify-center" title={`רענון הבא בעוד ${refresh.secondsToNext}ש׳`}>
          <svg width="24" height="24" viewBox="0 0 24 24" className="-rotate-90">
            <circle cx="12" cy="12" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
            <circle
              cx="12"
              cy="12"
              r={R}
              fill="none"
              stroke="#8FD400"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - refresh.progress)}
              style={{ transition: 'stroke-dashoffset 0.25s linear' }}
            />
          </svg>
          <span className="absolute text-[9px] font-mono font-bold text-zinc-400 tabular-nums">{refresh.secondsToNext}</span>
        </span>

        <button
          onClick={refresh.refreshNow}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-300 text-xs font-bold cursor-pointer hover:bg-white/10"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refresh.refreshing ? 'animate-spin' : ''}`} />
          רענן עכשיו
        </button>

        <span className="text-[10px] font-mono text-zinc-600">כל {periodSeconds}ש׳ · ללא רענון דף</span>
      </div>
    </div>
  );
}
