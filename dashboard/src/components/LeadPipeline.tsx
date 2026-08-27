import { useMemo, useState } from 'react';
import { Workflow, TrendingUp, TrendingDown, Minus, User } from 'lucide-react';
import type { LeadRecord, LeadStatus } from '../lib/types';
import { LEAD_STATUS_LABEL } from '../lib/types';
import { updateLeadStatus } from '../lib/useLiveEvents';

const STATUSES: LeadStatus[] = ['new', 'contacted', 'qualified', 'won', 'lost'];
const STATUS_COLOR: Record<LeadStatus, string> = {
  new: 'border-sky-500/30 bg-sky-500/5 text-sky-300',
  contacted: 'border-amber-500/30 bg-amber-500/5 text-amber-300',
  qualified: 'border-brand-500/30 bg-brand-500/5 text-brand-300',
  won: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300',
  lost: 'border-zinc-600/30 bg-zinc-600/5 text-zinc-500',
};

const DAY_MS = 86_400_000;

function AnalyticsOverview({ leads }: { leads: (LeadRecord & { id: string })[] }) {
  const stats = useMemo(() => {
    const now = Date.now();
    const last7 = leads.filter((l) => now - l.ts <= 7 * DAY_MS).length;
    const prev7 = leads.filter((l) => now - l.ts > 7 * DAY_MS && now - l.ts <= 14 * DAY_MS).length;
    const delta = prev7 === 0 ? (last7 > 0 ? 100 : 0) : Math.round(((last7 - prev7) / prev7) * 100);

    const bySource = new Map<string, number>();
    for (const l of leads) {
      const key = l.sourceSection || 'לא ידוע';
      bySource.set(key, (bySource.get(key) ?? 0) + 1);
    }
    const topSource = [...bySource.entries()].sort((a, b) => b[1] - a[1])[0];

    const won = leads.filter((l) => l.status === 'won').length;
    const closeRate = leads.length > 0 ? Math.round((won / leads.length) * 100) : 0;

    return { total: leads.length, last7, delta, topSource, closeRate };
  }, [leads]);

  const TrendIcon = stats.delta > 0 ? TrendingUp : stats.delta < 0 ? TrendingDown : Minus;
  const trendColor = stats.delta > 0 ? 'text-brand-400' : stats.delta < 0 ? 'text-red-400' : 'text-zinc-500';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
      <div className="dash-card p-4">
        <span className="block text-[11px] font-mono text-zinc-500 uppercase tracking-wide mb-1.5">סה״כ לידים</span>
        <span className="block font-display font-black text-2xl text-white">{stats.total}</span>
      </div>
      <div className="dash-card p-4">
        <span className="block text-[11px] font-mono text-zinc-500 uppercase tracking-wide mb-1.5">7 ימים אחרונים</span>
        <span className={`flex items-center gap-1.5 font-display font-black text-2xl ${trendColor}`}>
          {stats.last7}
          <TrendIcon className="w-4 h-4" />
          <span className="text-xs font-sans font-bold">{stats.delta > 0 ? '+' : ''}{stats.delta}%</span>
        </span>
      </div>
      <div className="dash-card p-4">
        <span className="block text-[11px] font-mono text-zinc-500 uppercase tracking-wide mb-1.5">מקור מוביל</span>
        <span className="block font-display font-bold text-sm text-white truncate">{stats.topSource ? stats.topSource[0] : '—'}</span>
        <span className="block text-xs text-zinc-500 mt-0.5">{stats.topSource ? `${stats.topSource[1]} לידים` : ''}</span>
      </div>
      <div className="dash-card p-4">
        <span className="block text-[11px] font-mono text-zinc-500 uppercase tracking-wide mb-1.5">שיעור סגירה</span>
        <span className="block font-display font-black text-2xl text-brand-400">{stats.closeRate}%</span>
      </div>
    </div>
  );
}

export default function LeadPipeline({ leads }: { leads: (LeadRecord & { id: string })[] }) {
  const [pending, setPending] = useState<Set<string>>(new Set());

  const handleStatusChange = async (id: string, status: LeadStatus) => {
    setPending((prev) => new Set(prev).add(id));
    await updateLeadStatus(id, status);
    setPending((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const columns = useMemo(() => {
    const map = new Map<LeadStatus, (LeadRecord & { id: string })[]>(STATUSES.map((s) => [s, []]));
    for (const lead of leads) {
      const status = lead.status ?? 'new';
      map.get(status)?.push(lead);
    }
    return map;
  }, [leads]);

  return (
    <div>
      <AnalyticsOverview leads={leads} />

      <div className="dash-card p-6">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
          <Workflow className="w-3.5 h-3.5" />
          צינור סטטוס לידים
        </div>

        {leads.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-10">אין עדיין לידים רשומים.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {STATUSES.map((status) => (
              <div key={status} className={`rounded-xl border p-3 ${STATUS_COLOR[status]}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold">{LEAD_STATUS_LABEL[status]}</span>
                  <span className="text-[11px] font-mono opacity-70">{columns.get(status)?.length ?? 0}</span>
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {(columns.get(status) ?? []).map((lead) => (
                    <div key={lead.id} className="bg-black/40 border border-white/10 rounded-lg p-2.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-white truncate mb-1">
                        <User className="w-3 h-3 shrink-0 text-zinc-500" />
                        {lead.name}
                      </div>
                      <div className="text-[10px] text-zinc-500 truncate mb-2" dir="ltr">
                        {lead.email}
                      </div>
                      <select
                        value={status}
                        disabled={pending.has(lead.id)}
                        onChange={(e) => handleStatusChange(lead.id, e.target.value as LeadStatus)}
                        className="w-full text-[10px] bg-black/60 border border-white/10 rounded-md px-1.5 py-1 text-zinc-300 cursor-pointer disabled:opacity-50"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {LEAD_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
