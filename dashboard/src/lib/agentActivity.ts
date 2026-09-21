import { useSyncExternalStore } from 'react';

/**
 * Real-time agent activity — what the Mission Control arena animates.
 *
 * ## Where the events come from
 *
 * Every AI or data call this dashboard makes goes through `window.fetch` to the production API
 * (mrdaniel.co.il/api/*). Rather than instrumenting thirty client libs one by one — and missing the
 * next one someone adds — `installActivityTap()` wraps fetch once at startup and classifies each
 * request by URL and `action`:
 *
 *   Scout  — fetching: the news feed, the X feed, URL / X / Threads imports, trend radar, stock photos
 *   Grok   — any `grok-*` action (X-optimized carousels + threads on xAI)
 *   Hermes — verifying & routing: every other AI action (Gemini/Groq synthesis, fact-check passes,
 *            analysis, the site assistant) plus explicit verification phases the Grok studio emits
 *
 * Health pings and the image relay are ignored — they fire every few seconds and would keep every
 * node permanently lit, which would make the arena meaningless.
 *
 * State is mirrored to other open dashboard tabs over a BroadcastChannel, so the arena can sit on a
 * second monitor while the operator works in the first.
 */

export type AgentId = 'scout' | 'grok' | 'hermes';
export type AgentStatus = 'idle' | 'working' | 'error';

export interface AgentState {
  id: AgentId;
  status: AgentStatus;
  /** Human label of what it is doing right now (or did last). */
  task: string;
  /** In-flight request count. */
  active: number;
  /** Completed requests this session. */
  done: number;
  errors: number;
  lastAt: number;
}

export interface ActivityEvent {
  id: number;
  agent: AgentId;
  kind: 'start' | 'end' | 'error';
  task: string;
  at: number;
  ms?: number;
}

export interface ActivitySnapshot {
  agents: Record<AgentId, AgentState>;
  events: ActivityEvent[];
}

export const AGENT_META: Record<AgentId, { name: string; role: string; color: string; /** The 3D office's floating label. */ heLabel: string }> = {
  scout: { name: 'Scout', role: 'סורק חדשות ופיד X', color: '#38bdf8', heLabel: 'סקאוט - חוקר רשת' },
  grok: { name: 'Grok', role: 'מנסח קרוסלות ושרשורים ל-X', color: '#a3e635', heLabel: 'גרוק - מנהל קריאייטיב' },
  hermes: { name: 'Hermes', role: 'מאמת עובדות ומנתב', color: '#f59e0b', heLabel: 'הרמס - מבקר נתונים' },
};

const blank = (id: AgentId): AgentState => ({ id, status: 'idle', task: 'ממתין', active: 0, done: 0, errors: 0, lastAt: 0 });

let snapshot: ActivitySnapshot = {
  agents: { scout: blank('scout'), grok: blank('grok'), hermes: blank('hermes') },
  events: [],
};
const listeners = new Set<() => void>();
let seq = 0;

const channel: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('dbb-agent-activity') : null;

function commit(next: ActivitySnapshot, broadcast = true) {
  snapshot = next;
  listeners.forEach((l) => l());
  if (broadcast) {
    try {
      channel?.postMessage(next);
    } catch {
      /* structured-clone failure is not worth breaking a fetch over */
    }
  }
}

channel?.addEventListener('message', (e: MessageEvent<ActivitySnapshot>) => {
  if (e.data?.agents) commit(e.data, false);
});

function apply(ev: Omit<ActivityEvent, 'id' | 'at'> & { at?: number }) {
  const at = ev.at ?? Date.now();
  const prev = snapshot.agents[ev.agent];
  const active = Math.max(0, prev.active + (ev.kind === 'start' ? 1 : -1));
  const agent: AgentState = {
    ...prev,
    active,
    status: ev.kind === 'error' ? 'error' : active > 0 ? 'working' : 'idle',
    task: ev.task,
    done: prev.done + (ev.kind === 'end' ? 1 : 0),
    errors: prev.errors + (ev.kind === 'error' ? 1 : 0),
    lastAt: at,
  };
  const event: ActivityEvent = { id: ++seq, agent: ev.agent, kind: ev.kind, task: ev.task, at, ms: ev.ms };
  commit({ agents: { ...snapshot.agents, [ev.agent]: agent }, events: [event, ...snapshot.events].slice(0, 60) });
  // An error flashes, then settles back to idle/working so the node doesn't stay red forever.
  if (ev.kind === 'error') {
    setTimeout(() => {
      const cur = snapshot.agents[ev.agent];
      if (cur.status === 'error') commit({ ...snapshot, agents: { ...snapshot.agents, [ev.agent]: { ...cur, status: cur.active > 0 ? 'working' : 'idle' } } });
    }, 2500);
  }
}

/** Manual phases (e.g. the Grok studio's Hermes verification step). Returns the `end` callback. */
export function trackActivity(agent: AgentId, task: string): (ok?: boolean) => void {
  const started = Date.now();
  apply({ agent, kind: 'start', task });
  let ended = false;
  return (ok = true) => {
    if (ended) return;
    ended = true;
    apply({ agent, kind: ok ? 'end' : 'error', task, ms: Date.now() - started });
  };
}

const TASK_LABEL: Record<string, string> = {
  'grok-carousel': 'מנסח קרוסלה + שרשור ל-X',
  'grok-status': 'בודק חיבור ל-xAI',
  'x-score': 'מדרג שרשור מול האלגוריתם',
  'x-intel': 'מנתח פוסטים ב-X',
  'x-write-status': 'בודק הרשאות כתיבה ל-X',
  'import-url': 'מושך כתבה מקישור',
  'parse-x-post': 'קורא פוסט מ-X',
  'parse-thread': 'קורא שרשור מ-Threads',
  'trend-radar': 'סורק טרנדים',
  'carousel-studio': 'מנתב קרוסלה ל-Gemini',
  'story-carousel': 'מנתב סטורי',
  'post-synthesize': 'מאמת ומנסח פוסט',
  'growth-optimize': 'מדרג צמיחה',
};

const SCOUT_ACTIONS = new Set(['import-url', 'parse-x-post', 'parse-thread', 'trend-radar', 'x-intel']);

function classify(url: string, body: unknown): { agent: AgentId; task: string } | null {
  let path = url;
  try {
    path = new URL(url, window.location.href).pathname + new URL(url, window.location.href).search;
  } catch {
    /* relative or odd URL — match on the raw string */
  }
  if (/\/api\/(health|img-proxy)/.test(path)) return null;
  if (/\/api\/news\?.*action=x-feed/.test(path)) return { agent: 'scout', task: 'מושך את פיד ה-X' };
  if (/\/api\/news\/analyze/.test(path)) return { agent: 'hermes', task: 'מנתח כתבה' };
  if (/\/api\/news(\?|$)/.test(path) || /\/api\/news\/item\//.test(path)) return { agent: 'scout', task: 'סורק את פיד חדשות ה-AI' };
  if (/\/api\/ai-news/.test(path)) return { agent: 'scout', task: 'סורק סרטוני AI' };
  if (/\/api\/pexels-search/.test(path)) return { agent: 'scout', task: 'מחפש תמונת רקע' };
  if (/\/api\/chat/.test(path)) return { agent: 'hermes', task: 'עונה בצ׳אט האתר' };
  if (/\/api\/agent-generate/.test(path)) {
    let action = '';
    if (typeof body === 'string') {
      try {
        action = String(JSON.parse(body)?.action ?? '');
      } catch {
        action = '';
      }
    }
    const task = TASK_LABEL[action] ?? (action ? `מריץ ${action}` : 'מנתב בקשה');
    if (action.startsWith('grok-')) return { agent: 'grok', task };
    if (SCOUT_ACTIONS.has(action)) return { agent: 'scout', task };
    return { agent: 'hermes', task };
  }
  return null;
}

let installed = false;

/** Wraps window.fetch once. Safe to call repeatedly (StrictMode double-invokes effects). */
export function installActivityTap() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const hit = classify(url, init?.body);
    if (!hit) return original(input, init);
    const end = trackActivity(hit.agent, hit.task);
    try {
      const res = await original(input, init);
      end(res.ok);
      return res;
    } catch (err) {
      end(false);
      throw err;
    }
  };
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAgentActivity(): ActivitySnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

export function getAgentActivity(): ActivitySnapshot {
  return snapshot;
}
