import { useEffect, useState } from 'react';
import { Users2, Smartphone, Monitor, Tablet, Globe2, MapPin } from 'lucide-react';
import type { DeviceType, PresenceRecord } from '../lib/types';

const DEVICE_ICON: Record<DeviceType, typeof Smartphone> = { mobile: Smartphone, desktop: Monitor, tablet: Tablet };
const DEVICE_LABEL: Record<DeviceType, string> = { mobile: 'מובייל', desktop: 'דסקטופ', tablet: 'טאבלט' };

/** Fallback 1s clock so the component's dwell column stays live even without a parent-supplied `now`. */
function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** "04m 12s" / "1h 03m 09s" — exact dwell time. */
function formatDwell(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}h ${pad(m)}m ${pad(sec)}s` : `${pad(m)}m ${pad(sec)}s`;
}

/** ISO country code → flag emoji via regional-indicator symbols. */
function flagEmoji(code?: string): string {
  if (!code || code.length !== 2) return '🌐';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

let countryNames: Intl.DisplayNames | null = null;
function countryName(code?: string): string {
  if (!code) return '—';
  try {
    countryNames ??= new Intl.DisplayNames(['he'], { type: 'region' });
    return countryNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export default function VisitorBreakdown({ presence, now: nowProp }: { presence: Record<string, PresenceRecord>; now?: number }) {
  const nowInternal = useNow();
  const now = nowProp ?? nowInternal;
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
                <th className="text-right font-medium pb-2 pr-2">מדינה / עיר</th>
                <th className="text-right font-medium pb-2">כתובת IP</th>
                <th className="text-right font-medium pb-2">מכשיר</th>
                <th className="text-right font-medium pb-2">עמוד נוכחי</th>
                <th className="text-right font-medium pb-2">דפדפן</th>
                <th className="text-right font-medium pb-2">משך שהייה</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(([id, p]) => {
                const Icon = DEVICE_ICON[p.device] ?? Monitor;
                return (
                  <tr key={id} className="border-b border-white/5 text-zinc-300 align-top">
                    <td className="py-2.5 pr-2">
                      <span className="flex items-center gap-1.5">
                        <span className="text-base leading-none">{flagEmoji(p.countryCode)}</span>
                        <span className="flex flex-col">
                          <span className="text-zinc-200">{p.countryCode ? countryName(p.countryCode) : <span className="text-zinc-500 inline-flex items-center gap-1"><Globe2 className="w-3 h-3" />לא ידוע</span>}</span>
                          {(p.city || p.region) && (
                            <span className="text-[10px] text-zinc-500 inline-flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5" />
                              {[p.city, p.region].filter(Boolean).join(', ')}
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 font-mono text-zinc-400" dir="ltr">{p.ip || '—'}</td>
                    <td className="py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-brand-400">
                        <Icon className="w-3.5 h-3.5" />
                        {DEVICE_LABEL[p.device] ?? p.device}
                      </span>
                    </td>
                    <td className="py-2.5 font-mono text-zinc-400 max-w-[200px] truncate" dir="ltr" title={p.path}>{p.path}</td>
                    <td className="py-2.5 text-zinc-400" dir="ltr">{p.browser ?? '—'}</td>
                    <td className="py-2.5 font-mono text-brand-300 tabular-nums" dir="ltr">{formatDwell(now - p.startedAt)}</td>
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
