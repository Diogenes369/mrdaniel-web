import { useMemo, useState } from 'react';
import { Terminal } from 'lucide-react';
import type { EventType, TrackedEvent } from '../lib/types';

const TYPE_LABEL: Record<EventType, string> = {
  pageview: 'צפייה בדף',
  session_start: 'התחלת סשן',
  conversion: 'המרה',
  click: 'קליק',
  outbound_link: 'קישור חיצוני',
  scroll_depth: 'עומק גלילה',
  hover: 'עניין',
  form_interaction: 'אינטראקציה בטופס',
  chat_open: 'פתיחת צ׳אט AI',
  chat_query: 'שאילתת AI',
  route_change: 'מעבר עמוד',
};

const TYPE_COLOR: Partial<Record<EventType, string>> = {
  conversion: 'text-brand-400',
  chat_open: 'text-sky-400',
  chat_query: 'text-sky-400',
  outbound_link: 'text-amber-400',
};

type Filter = 'all' | 'clicks' | 'conversions' | 'pageviews' | 'ai' | 'scroll';

const FILTERS: { id: Filter; label: string; types?: EventType[] }[] = [
  { id: 'all', label: 'הכל' },
  { id: 'clicks', label: 'קליקים', types: ['click', 'outbound_link'] },
  { id: 'conversions', label: 'המרות', types: ['conversion'] },
  { id: 'pageviews', label: 'צפיות', types: ['pageview', 'session_start'] },
  { id: 'ai', label: 'שאילתות AI', types: ['chat_open', 'chat_query'] },
  { id: 'scroll', label: 'עומק גלילה', types: ['scroll_depth'] },
];

export default function EventFeed({ events }: { events: (TrackedEvent & { id: string })[] }) {
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    const def = FILTERS.find((f) => f.id === filter);
    if (!def?.types) return events;
    return events.filter((e) => def.types!.includes(e.type));
  }, [events, filter]);

  return (
    <div className="dash-card p-6 flex flex-col">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
          <Terminal className="w-3.5 h-3.5" />
          יומן אירועים חי
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                filter === f.id ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1.5 font-mono text-xs max-h-96">
        {filtered.length === 0 && <p className="text-zinc-600">ממתין לאירועים...</p>}
        {filtered.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center gap-2 text-zinc-300 border-b border-white/5 pb-1.5">
            <span className="text-zinc-600" dir="ltr">
              {new Date(e.ts).toLocaleTimeString('he-IL')}
            </span>
            <span className="text-brand-400 uppercase" dir="ltr">
              [{e.device}]
            </span>
            <span className={TYPE_COLOR[e.type] ?? ''}>{TYPE_LABEL[e.type] ?? e.type}</span>
            {e.depth !== undefined && <span className="text-zinc-500">· {e.depth}%</span>}
            {e.field && <span className="text-zinc-500">· {e.field}</span>}
            {e.label && <span className="text-zinc-500 truncate max-w-xs">· {e.label}</span>}
            <span className="text-zinc-600" dir="ltr">
              {e.path}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
