import type { DeviceType, PresenceRecord } from './types';

/**
 * The ONE definition of "active session", shared by every live card so the total count can never
 * disagree with the device breakdown or the visitor table.
 *
 * A `presence/<id>` child counts as active only if it is a well-formed record — an object with a
 * known `device` and a numeric `startedAt` — whose freshness (`lastSeen`, or `startedAt` for a
 * client that predates the heartbeat) is within ACTIVE_WINDOW_MS. This drops:
 *   • "ghost" nodes recreated by an old partial `set(presence/<id>/path, …)` — no `device`.
 *   • sessions Firebase's `onDisconnect` failed to clean (stale tab, network blip) — no fresh
 *     heartbeat, so they age out within the window even with no new RTDB event.
 */
export const ACTIVE_WINDOW_MS = 60_000;

const DEVICES: DeviceType[] = ['mobile', 'desktop', 'tablet'];

export function isActiveSession(p: unknown, nowMs: number): p is PresenceRecord {
  if (!p || typeof p !== 'object') return false;
  const r = p as Partial<PresenceRecord>;
  if (!DEVICES.includes(r.device as DeviceType)) return false;
  if (typeof r.startedAt !== 'number' || !Number.isFinite(r.startedAt)) return false;
  const freshness = typeof r.lastSeen === 'number' && Number.isFinite(r.lastSeen) ? r.lastSeen : r.startedAt;
  return nowMs - freshness <= ACTIVE_WINDOW_MS && freshness <= nowMs + 60_000;
}

/** Active sessions as `[id, record]` pairs, newest first. */
export function selectActiveSessions(presence: Record<string, PresenceRecord>, nowMs: number): [string, PresenceRecord][] {
  return Object.entries(presence ?? {})
    .filter(([, p]) => isActiveSession(p, nowMs))
    .sort(([, a], [, b]) => b.startedAt - a.startedAt);
}

export function selectActivePresence(presence: Record<string, PresenceRecord>, nowMs: number): Record<string, PresenceRecord> {
  return Object.fromEntries(selectActiveSessions(presence, nowMs));
}

export function deviceCounts(sessions: [string, PresenceRecord][]): Record<DeviceType, number> {
  const counts: Record<DeviceType, number> = { mobile: 0, desktop: 0, tablet: 0 };
  for (const [, p] of sessions) counts[p.device] += 1;
  return counts;
}
