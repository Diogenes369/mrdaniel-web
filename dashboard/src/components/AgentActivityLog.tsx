import { useMemo } from 'react';
import { Bot, MessageCircle, Sparkles, Zap } from 'lucide-react';
import type { TrackedEvent } from '../lib/types';

const AGENT_EVENT_TYPES = ['chat_open', 'chat_query', 'conversion'] as const;

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const TYPE_META: Record<(typeof AGENT_EVENT_TYPES)[number], { label: string; icon: typeof Bot; color: string }> = {
  chat_open: { label: 'פתיחת סוכן AI', icon: MessageCircle, color: 'text-sky-400' },
  chat_query: { label: 'שאילתת משתמש', icon: Sparkles, color: 'text-sky-400' },
  conversion: { label: 'המרה / הפעלת CTA', icon: Zap, color: 'text-brand-400' },
};

/** A live, real feed drawn from the same `events` stream every other panel reads — filtered to
 * the interaction types that actually represent someone engaging an AI agent surface on the site
 * (chat widget opens/queries, and CTA conversions, which include the qualification-modal handoff).
 * Deliberately does NOT claim to show "security triggers" the site has no real backend for — see
 * ThreatAuditPanel for the honest, data-derived equivalent of that. */
export default function AgentActivityLog({ events }: { events: (TrackedEvent & { id: string })[] }) {
  const agentEvents = useMemo(
    () => events.filter((e): e is TrackedEvent & { id: string; type: (typeof AGENT_EVENT_TYPES)[number] } => (AGENT_EVENT_TYPES as readonly string[]).includes(e.type)),
    [events]
  );

  return (
    <div className="dash-card p-6">
      <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
        <Bot className="w-3.5 h-3.5" />
        יומן פעילות סוכן AI חי ({agentEvents.length})
      </div>

      {agentEvents.length === 0 ? (
        <p className="text-zinc-500 text-sm text-center py-10">אין עדיין אינטראקציות עם סוכן ה-AI.</p>
      ) : (
        <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
          {agentEvents.map((e) => {
            const meta = TYPE_META[e.type as (typeof AGENT_EVENT_TYPES)[number]];
            return (
              <div key={e.id} className="flex items-center gap-3 border-b border-white/5 pb-1.5 text-xs">
                <meta.icon className={`w-3.5 h-3.5 shrink-0 ${meta.color}`} />
                <span className={`font-bold ${meta.color}`}>{meta.label}</span>
                {e.label && <span className="text-zinc-500 truncate max-w-[220px]">· {e.label}</span>}
                <span className="text-zinc-600 mr-auto shrink-0" dir="ltr">
                  {e.path}
                </span>
                <span className="text-zinc-600 font-mono shrink-0" dir="ltr">
                  {timeLabel(e.ts)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
