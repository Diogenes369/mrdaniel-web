import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Radar, Activity, Play } from 'lucide-react';
import { AGENT_META, useAgentActivity, type AgentId } from '../lib/agentActivity';
import { fetchNewsList } from '../lib/newsFeedClient';
import PreviewErrorBoundary from './PreviewErrorBoundary';

// The Three.js / R3F bundle is ~1 MB — it only downloads when this tab is opened.
const MissionControlScene = lazy(() => import('./mission/MissionControlScene'));

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const ORDER: AgentId[] = ['scout', 'grok', 'hermes'];

function timeOf(at: number): string {
  return new Date(at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Mission Control — the 3D arena plus the same activity as plain text beside it. It is a spectator
 * view: nothing here is simulated. Work in any other tab (Grok studio, carousel studio, news agent)
 * and the arena reacts; open it in a second browser tab and it mirrors the first over a
 * BroadcastChannel (lib/agentActivity.ts).
 */
export default function MissionControl() {
  const snap = useAgentActivity();
  const [gl] = useState(webglAvailable);
  const [scanning, setScanning] = useState(false);
  const totals = useMemo(() => ORDER.reduce((n, id) => n + snap.agents[id].done, 0), [snap]);

  // While this tab is open Scout re-reads the live feed every 3 minutes — a real request through the
  // same fetch tap, so the office shows the pipeline breathing instead of sitting idle.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void fetchNewsList('all', 40).catch(() => undefined);
    }, 180_000);
    return () => clearInterval(timer);
  }, []);

  // A real Scout run — fetches the live AI feed — for when the operator wants to see the arena move.
  async function scan() {
    setScanning(true);
    try {
      await fetchNewsList('all', 40);
    } catch {
      /* the tap already recorded the failure */
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="dash-card flex flex-wrap items-center gap-3 p-4">
        <Radar className="h-5 w-5 text-lime-300" />
        <h2 className="font-display text-lg font-black text-white">Mission Control · המשרד</h2>
        <span className="text-sm text-zinc-400">הסוכנים בזמן אמת — כל בקשה שהדשבורד שולח מאירה את הסוכן שמטפל בה</span>
        <span className="ms-auto font-mono text-xs text-zinc-500">{totals} משימות הושלמו בסשן</span>
        <button type="button" onClick={scan} disabled={scanning} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-bold text-sky-300 disabled:opacity-50">
          <Play className="h-3.5 w-3.5" /> {scanning ? 'Scout סורק…' : 'שלח את Scout לסרוק'}
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="dash-card relative h-[62vh] min-h-[420px] overflow-hidden p-0">
          {gl ? (
            <PreviewErrorBoundary label="זירת Mission Control">
              <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-zinc-500">טוען את הזירה…</div>}>
                <MissionControlScene snap={snap} />
              </Suspense>
            </PreviewErrorBoundary>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-zinc-400">
              הדפדפן הזה לא תומך ב-WebGL, אז הזירה התלת-ממדית כבויה. הפעילות עדיין מוצגת בצד.
            </div>
          )}
        </div>

        <div className="space-y-3">
          {ORDER.map((id) => {
            const a = snap.agents[id];
            const m = AGENT_META[id];
            return (
              <div key={id} className="dash-card p-3" style={{ borderColor: a.status === 'working' ? `${m.color}88` : undefined }}>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${a.status === 'working' ? 'animate-pulse' : ''}`} style={{ background: a.status === 'error' ? '#ef4444' : a.status === 'working' ? m.color : '#3f3f46' }} />
                  <strong className="font-mono text-sm" style={{ color: m.color }} dir="ltr">{m.name}</strong>
                  <span className="text-xs text-zinc-500">{m.role}</span>
                </div>
                <p className="mt-1.5 truncate text-xs text-zinc-300">{a.lastAt ? a.task : 'ממתין למשימה'}</p>
                <p className="mt-1 font-mono text-[10px] text-zinc-500">
                  פעיל {a.active} · הושלמו {a.done} · שגיאות {a.errors}
                </p>
              </div>
            );
          })}

          <div className="dash-card p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-zinc-300">
              <Activity className="h-3.5 w-3.5" /> יומן פעילות
            </div>
            <ul className="max-h-64 space-y-1 overflow-y-auto text-[11px]">
              {!snap.events.length && <li className="text-zinc-500">עוד אין פעילות. הפעילו כלי בכל לשונית, או שלחו את Scout לסרוק.</li>}
              {snap.events.map((e) => (
                <li key={e.id} className="flex gap-2">
                  <span className="font-mono text-zinc-600">{timeOf(e.at)}</span>
                  <span className="font-mono" style={{ color: AGENT_META[e.agent].color }} dir="ltr">{AGENT_META[e.agent].name}</span>
                  <span className={e.kind === 'error' ? 'text-red-400' : 'text-zinc-400'}>
                    {e.kind === 'start' ? '▶' : e.kind === 'end' ? '✓' : '✕'} {e.task}
                    {e.ms !== undefined && <span className="text-zinc-600"> · {(e.ms / 1000).toFixed(1)}s</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
