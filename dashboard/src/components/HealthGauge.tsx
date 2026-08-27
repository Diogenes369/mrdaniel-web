import { Activity } from 'lucide-react';
import type { HealthRecord } from '../lib/types';

export default function HealthGauge({ health }: { health: HealthRecord | null }) {
  const latency = health?.latencyMs ?? null;
  const status = latency === null ? 'לא ידוע' : latency < 200 ? 'מהיר' : latency < 600 ? 'תקין' : 'איטי';
  const color = latency === null ? 'text-zinc-500' : latency < 200 ? 'text-brand-400' : latency < 600 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="dash-card p-6">
      <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
        <Activity className="w-3.5 h-3.5" />
        תקינות מערכת · Latency
      </div>
      <div className="flex items-end gap-3">
        <span className={`font-display text-4xl font-black ${color}`}>{latency ?? '—'}</span>
        <span className="text-zinc-500 text-sm mb-1">ms</span>
      </div>
      <div className={`text-xs font-medium mt-2 ${color}`}>{status}</div>
      {health?.ts && (
        <div className="text-[10px] text-zinc-600 font-mono mt-3" dir="ltr">
          last ping: {new Date(health.ts).toLocaleTimeString('he-IL')}
        </div>
      )}
    </div>
  );
}
