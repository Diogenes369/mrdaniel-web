import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { TrackedEvent } from '../lib/types';

/** Buckets the live event stream into per-minute counts over the trailing 15 minutes — a real,
 * derived "requests/min" signal from tracked events (not raw server access logs; see README for
 * that scoping note). */
export default function TrafficChart({ events }: { events: (TrackedEvent & { id: string })[] }) {
  const data = useMemo(() => {
    const buckets = new Map<string, number>();
    const now = Date.now();
    for (let i = 14; i >= 0; i--) {
      const t = now - i * 60_000;
      const key = new Date(t).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
      buckets.set(key, 0);
    }
    events.forEach((e) => {
      const key = new Date(e.ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    });
    return Array.from(buckets.entries()).map(([time, count]) => ({ time, count }));
  }, [events]);

  return (
    <div className="dash-card p-6">
      <h3 className="text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">תעבורה בזמן אמת · אירועים לדקה</h3>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="trafficGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8FD400" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#8FD400" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="time" stroke="#71717a" fontSize={11} tickLine={false} />
          <YAxis stroke="#71717a" fontSize={11} tickLine={false} allowDecimals={false} width={28} />
          <Tooltip
            contentStyle={{ background: '#121212', border: '1px solid rgba(118,185,0,0.25)', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#fff' }}
          />
          <Area type="monotone" dataKey="count" stroke="#76B900" strokeWidth={2} fill="url(#trafficGradient)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
