import { useEffect, useRef, useState } from 'react';

/**
 * Dashboard auto-refresh helpers.
 *
 * The core metrics (presence, events, leads, signups) are already push-based over Firebase's
 * realtime WebSocket — they update sub-second with no polling. These two hooks add the pieces that
 * genuinely benefit from a fixed interval:
 *
 *  • `useHeartbeat(ms)` — a lightweight re-render tick so every relative-time label ("לפני 3 שניות",
 *    session durations, "updated Ns ago") stays live without a manual refresh.
 *  • `useSiteHealthPing(origin, ms)` — an independent round-trip check to the mrdaniel.co.il domain
 *    (`GET /api/health`) every few seconds, so the dashboard can VERIFY and display its connection
 *    to the production endpoints in real time, not just trust Firebase.
 */

/** Returns a value that changes every `ms`, forcing a re-render on that cadence. */
export function useHeartbeat(ms = 4000): number {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return tick;
}

export interface AutoRefreshState {
  /** Bumps every `ms` (and on `refreshNow`) — depend on it to recompute live values. */
  tick: number;
  /** Whole seconds remaining until the next automatic tick (`periodMs/1000` … 1). */
  secondsToNext: number;
  /** 0 → 1 progress toward the next tick, for a ring/bar indicator. */
  progress: number;
  /** True for ~600ms after a manual refresh — drive a spin animation off this. */
  refreshing: boolean;
  refreshNow: () => void;
}

/**
 * A fixed auto-refresh cycle for the live views. Firebase data is already push-based; this drives
 * the per-second dwell counters, the "next tick" countdown, and a manual "Refresh Now" that
 * re-synchronises the cycle. One interval, cleaned up on unmount — no leak.
 */
export function useAutoRefresh(periodMs = 5000): AutoRefreshState {
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const anchorRef = useRef(Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const spinTimer = useRef<number | null>(null);

  useEffect(() => {
    const clock = window.setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      if (now - anchorRef.current >= periodMs) {
        anchorRef.current = now;
        setTick((t) => t + 1);
      }
    }, 250);
    return () => {
      window.clearInterval(clock);
      if (spinTimer.current !== null) window.clearTimeout(spinTimer.current);
    };
  }, [periodMs]);

  const refreshNow = () => {
    anchorRef.current = Date.now();
    setNowMs(Date.now());
    setTick((t) => t + 1);
    setRefreshing(true);
    if (spinTimer.current !== null) window.clearTimeout(spinTimer.current);
    spinTimer.current = window.setTimeout(() => setRefreshing(false), 600);
  };

  const elapsed = Math.min(periodMs, Math.max(0, nowMs - anchorRef.current));
  const remaining = periodMs - elapsed;
  return {
    tick,
    secondsToNext: Math.max(1, Math.ceil(remaining / 1000)),
    progress: elapsed / periodMs,
    refreshing,
    refreshNow,
  };
}

/** Production origin whose `/api/health` this dashboard probes. Override with VITE_SITE_ORIGIN. */
export const SITE_ORIGIN: string =
  (import.meta.env.VITE_SITE_ORIGIN as string | undefined)?.replace(/\/$/, '') || 'https://mrdaniel.co.il';

export interface SiteHealth {
  /** Round-trip latency to `${SITE_ORIGIN}/api/health` in ms, or null before the first result. */
  latencyMs: number | null;
  /** true = last probe reached the domain and got a 2xx; false = unreachable / error. */
  reachable: boolean;
  /** epoch ms of the last completed probe. */
  checkedAt: number | null;
  /** the endpoint being probed (for display / debugging). */
  endpoint: string;
}

/**
 * Polls `${SITE_ORIGIN}/api/health` every `ms` (default 5s) with a short timeout. Pure client-side;
 * no writes. Gives the dashboard a live, self-verified view of its link to the production domain.
 */
export function useSiteHealthPing(ms = 5000): SiteHealth {
  const endpoint = `${SITE_ORIGIN}/api/health`;
  const [state, setState] = useState<SiteHealth>({ latencyMs: null, reachable: false, checkedAt: null, endpoint });
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const ping = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      const started = performance.now();
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), Math.min(ms, 4000));
      try {
        const res = await fetch(`${endpoint}?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
        const latencyMs = Math.round(performance.now() - started);
        if (!cancelled) setState({ latencyMs, reachable: res.ok, checkedAt: Date.now(), endpoint });
      } catch {
        if (!cancelled) setState((s) => ({ ...s, reachable: false, checkedAt: Date.now(), endpoint }));
      } finally {
        window.clearTimeout(timeout);
        inFlight.current = false;
      }
    };

    ping();
    const id = window.setInterval(ping, ms);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [ms, endpoint]);

  return state;
}
