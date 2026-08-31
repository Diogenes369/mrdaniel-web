import { useMemo } from 'react';
import { useAutoRefresh } from '../lib/useDashboardRefresh';
import { selectActiveSessions, selectActivePresence, deviceCounts } from '../lib/presence';
import type { HealthRecord, PresenceRecord, TrackedEvent } from '../lib/types';
import LiveStatusBar from './LiveStatusBar';
import LiveCounter from './LiveCounter';
import HealthGauge from './HealthGauge';
import DeviceBreakdown from './DeviceBreakdown';
import TrafficChart from './TrafficChart';
import EventFeed from './EventFeed';

type EventRow = TrackedEvent & { id: string };

/**
 * "Overview" tab — the live snapshot. Owns a 5-second auto-refresh cycle: `refresh.tick` changes
 * every 5s (and on the manual "רענן עכשיו"), which re-runs the active-session filter against a
 * fresh `Date.now()`, so a session whose heartbeat goes stale disappears from EVERY card within
 * ≤5s even if Firebase sends no new `presence` event. All cards read the SAME filtered set, so the
 * total count always equals the device breakdown.
 */
export default function OverviewPanel({
  presence,
  events,
  health,
}: {
  presence: Record<string, PresenceRecord>;
  events: EventRow[];
  health: HealthRecord | null;
}) {
  const refresh = useAutoRefresh(5000);

  const { activePresence, counts, count } = useMemo(() => {
    const now = Date.now();
    const sessions = selectActiveSessions(presence, now);
    return {
      activePresence: selectActivePresence(presence, now),
      counts: deviceCounts(sessions),
      count: sessions.length,
    };
    // refresh.tick is a deliberate dep — it re-ages the freshness window on the 5s cadence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presence, refresh.tick]);

  return (
    <div className="space-y-5">
      <LiveStatusBar refresh={refresh} activeUsers={count} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <LiveCounter count={count} mobile={counts.mobile} desktop={counts.desktop} tablet={counts.tablet} />
        <HealthGauge health={health} />
        <DeviceBreakdown presence={activePresence} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TrafficChart events={events} />
        <EventFeed events={events} />
      </div>
    </div>
  );
}
