import { useMemo } from 'react';
import { Radar, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { TrackedEvent } from '../lib/types';

/** Any distinct sessionId posting this many events within a 15-second rolling window reads as
 * scripted/bot-like traffic rather than a real person clicking around — a genuine, generically
 * applicable anomaly signal, not a fixed "known attack" fabrication. The site has no backend
 * WAF/IDS to report real "attacks blocked" from, so this panel only ever shows what it can
 * actually derive from the real live `events` stream — burst-rate outliers — labeled honestly as
 * such rather than dressed up as a security product it isn't. */
const BURST_WINDOW_MS = 15_000;
const BURST_THRESHOLD = 20;

interface FlaggedSession {
  sessionId: string;
  burstCount: number;
  eventCount: number;
  device: string;
  browser?: string;
  lastPath: string;
  lastTs: number;
}

function maxBurstInWindow(timestamps: number[], windowMs: number): number {
  let best = 0;
  let start = 0;
  for (let end = 0; end < timestamps.length; end++) {
    while (timestamps[end] - timestamps[start] > windowMs) start++;
    best = Math.max(best, end - start + 1);
  }
  return best;
}

export default function ThreatAuditPanel({ events }: { events: (TrackedEvent & { id: string })[] }) {
  const flagged = useMemo<FlaggedSession[]>(() => {
    const bySession = new Map<string, (TrackedEvent & { id: string })[]>();
    for (const e of events) {
      if (!e.sessionId) continue;
      const list = bySession.get(e.sessionId) ?? [];
      list.push(e);
      bySession.set(e.sessionId, list);
    }

    const result: FlaggedSession[] = [];
    for (const [sessionId, list] of bySession) {
      const sorted = [...list].sort((a, b) => a.ts - b.ts);
      const burst = maxBurstInWindow(sorted.map((e) => e.ts), BURST_WINDOW_MS);
      if (burst >= BURST_THRESHOLD) {
        const last = sorted[sorted.length - 1];
        result.push({
          sessionId,
          burstCount: burst,
          eventCount: sorted.length,
          device: last.device,
          browser: last.browser,
          lastPath: last.path,
          lastTs: last.ts,
        });
      }
    }
    return result.sort((a, b) => b.burstCount - a.burstCount);
  }, [events]);

  const clean = flagged.length === 0;

  return (
    <div className="dash-card p-6">
      <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
        <Radar className="w-3.5 h-3.5" />
        ביקורת חריגות ואיומים
      </div>

      <div
        className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 mb-4 ${
          clean ? 'bg-brand-500/5 border-brand-500/25 text-brand-300' : 'bg-red-500/10 border-red-500/30 text-red-300'
        }`}
      >
        {clean ? <ShieldCheck className="w-4 h-4 shrink-0" /> : <ShieldAlert className="w-4 h-4 shrink-0" />}
        <span className="text-sm font-bold">
          {clean ? 'לא זוהו חריגות — קצב האירועים בטווח תקין' : `${flagged.length} session חשודים בקצב אירועים חריג`}
        </span>
      </div>

      <p className="text-[11px] text-zinc-600 leading-relaxed mb-4">
        ניטור אוטומטי של קצב אירועים לפי session — {BURST_THRESHOLD}+ אירועים בחלון של {BURST_WINDOW_MS / 1000} שניות מסומן כחשוד (דפוס בוט/סקריפט אוטומטי), לא כ"מתקפה שנחסמה" בפועל.
      </p>

      {!clean && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 text-[11px] uppercase tracking-wide border-b border-white/10">
                <th className="text-right font-medium pb-2 pr-2">Session</th>
                <th className="text-right font-medium pb-2">קצב שיא</th>
                <th className="text-right font-medium pb-2">סה״כ אירועים</th>
                <th className="text-right font-medium pb-2">מכשיר</th>
                <th className="text-right font-medium pb-2">נצפה לאחרונה</th>
              </tr>
            </thead>
            <tbody>
              {flagged.map((f) => (
                <tr key={f.sessionId} className="border-b border-white/5 text-zinc-300">
                  <td className="py-2 pr-2 font-mono text-zinc-500" dir="ltr">
                    {f.sessionId.slice(0, 10)}…
                  </td>
                  <td className="py-2 text-red-300 font-bold">{f.burstCount}/{BURST_WINDOW_MS / 1000}s</td>
                  <td className="py-2 text-zinc-400">{f.eventCount}</td>
                  <td className="py-2 text-zinc-400" dir="ltr">
                    {f.device}
                  </td>
                  <td className="py-2 text-zinc-500 font-mono" dir="ltr">
                    {new Date(f.lastTs).toLocaleTimeString('he-IL')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
