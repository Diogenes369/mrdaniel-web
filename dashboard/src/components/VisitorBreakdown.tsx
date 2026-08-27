import { useEffect, useState } from 'react';
import { Users2, Smartphone, Monitor, Tablet } from 'lucide-react';
import type { DeviceType, PresenceRecord } from '../lib/types';

const DEVICE_ICON: Record<DeviceType, typeof Smartphone> = { mobile: Smartphone, desktop: Monitor, tablet: Tablet };

/** Ticks once a second purely to force this component to re-render its live "duration" column —
 * the underlying `startedAt` timestamps don't change, only what "now minus startedAt" reads as. */
function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

/** Real proxy for "location" derived client-side without a permission prompt or a third-party
 * IP-geolocation service — the browser's own resolved timezone. Not the same as precise
 * geolocation, and deliberately not faked as one (see README's honesty note on scope). */
function locationLabel(p: PresenceRecord): string {
  return p.timezone || '—';
}

export default function VisitorBreakdown({ presence }: { presence: Record<string, PresenceRecord> }) {
  const now = useNow();
  const sessions = Object.entries(presence).sort(([, a], [, b]) => b.startedAt - a.startedAt);

  return (
    <div className="dash-card p-6">
      <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
        <Users2 className="w-3.5 h-3.5" />
        פירוט מבקרים פעילים ({sessions.length})
      </div>

      {sessions.length === 0 ? (
        <p className="text-zinc-500 text-sm text-center py-12">אין משתמשים פעילים כעת</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 text-[11px] uppercase tracking-wide border-b border-white/10">
                <th className="text-right font-medium pb-2 pr-2">מכשיר</th>
                <th className="text-right font-medium pb-2">דפדפן</th>
                <th className="text-right font-medium pb-2">עמוד נוכחי</th>
                <th className="text-right font-medium pb-2">אזור זמן</th>
                <th className="text-right font-medium pb-2">שפה</th>
                <th className="text-right font-medium pb-2">משך שהייה</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(([id, p]) => {
                // `p.device` is normally always one of the 3 known DeviceType values (see
                // src/lib/tracker.ts's detectDevice()), but a stale/partial presence record from an
                // older client build or an interrupted write could carry something else — falling
                // back to Monitor instead of indexing straight into DEVICE_ICON is what fixed the
                // "Element type is invalid: ...got: undefined" crash (an unrecognized key made
                // DEVICE_ICON[p.device] resolve to undefined, which React can't render as a tag).
                const Icon = DEVICE_ICON[p.device] ?? Monitor;
                return (
                  <tr key={id} className="border-b border-white/5 text-zinc-300">
                    <td className="py-2 pr-2">
                      <span className="flex items-center gap-1.5 text-brand-400">
                        <Icon className="w-3.5 h-3.5" />
                        {p.device}
                      </span>
                    </td>
                    <td className="py-2">{p.browser ?? '—'}</td>
                    <td className="py-2 font-mono text-zinc-400" dir="ltr">
                      {p.path}
                    </td>
                    <td className="py-2 text-zinc-400" dir="ltr">
                      {locationLabel(p)}
                    </td>
                    <td className="py-2 text-zinc-400" dir="ltr">
                      {p.lang ?? '—'}
                    </td>
                    <td className="py-2 font-mono text-zinc-400" dir="ltr">
                      {formatDuration(now - p.startedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
