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
