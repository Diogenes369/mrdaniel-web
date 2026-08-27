import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { PresenceRecord, DeviceType } from '../lib/types';

const COLORS: Record<DeviceType, string> = { mobile: '#9FE870', desktop: '#76B900', tablet: '#5C9200' };
const LABELS: Record<DeviceType, string> = { mobile: 'מובייל', desktop: 'דסקטופ', tablet: 'טאבלט' };

export default function DeviceBreakdown({ presence }: { presence: Record<string, PresenceRecord> }) {
  const data = useMemo(() => {
    const counts: Record<DeviceType, number> = { mobile: 0, desktop: 0, tablet: 0 };
    Object.values(presence).forEach((p) => {
      // Guard against a stale/malformed presence record carrying a device value outside the known
      // enum (same root cause as the VisitorBreakdown crash) — an unrecognized key here wouldn't
      // throw, but would silently inject a bogus, unlabeled slice into the chart.
      if (p.device in counts) counts[p.device] = (counts[p.device] ?? 0) + 1;
    });
    return (Object.entries(counts) as [DeviceType, number][])
      .filter(([, value]) => value > 0)
      .map(([device, value]) => ({ name: LABELS[device], value, device }));
  }, [presence]);

  return (
    <div className="dash-card p-6">
      <h3 className="text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">פילוח מכשירים</h3>
      {data.length === 0 ? (
        <p className="text-zinc-500 text-sm text-center py-16">אין משתמשים פעילים כעת</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
              {data.map((entry) => (
                <Cell key={entry.device} fill={COLORS[entry.device]} stroke="none" />
              ))}
            </Pie>
            <Tooltip contentStyle={{ background: '#121212', border: '1px solid rgba(118,185,0,0.25)', borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
