import { useMemo } from 'react';
import { useAutoRefresh } from '../lib/useDashboardRefresh';
import type { DeviceType, HealthRecord, PresenceRecord, TrackedEvent } from '../lib/types';

type EventRow = TrackedEvent & { id: string };
import LiveStatusBar from './LiveStatusBar';
import LiveCounter from './LiveCounter';
import HealthGauge from './HealthGauge';
import DeviceBreakdown from './DeviceBreakdown';
import TrafficChart from './TrafficChart';
import EventFeed from './EventFeed';

/**
 * "Overview" tab — the live snapshot. Owns a 5-second auto-refresh cycle (LiveStatusBar's badge,
 * countdown ring, and manual "רענן עכשיו"); the Firebase-backed data itself is already push-based,
 * so the cycle only drives the countdown and any relative-time recomputation. One interval,
 * cleaned up by useAutoRefresh on unmount.
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

  const { list, counts } = useMemo(() => {
    const list = Object.values(presence);
    const counts: Record<DeviceType, number> = { mobile: 0, desktop: 0, tablet: 0 };
    for (const p of list) counts[p.device] = (counts[p.device] ?? 0) + 1;
    return { list, counts };
  }, [presence]);

  return (
    <div className="space-y-5">
      <LiveStatusBar refresh={refresh} activeUsers={list.length} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <LiveCounter count={list.length} mobile={counts.mobile} desktop={counts.desktop} tablet={counts.tablet} />
        <HealthGauge health={health} />
        <DeviceBreakdown presence={presence} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TrafficChart events={events} />
        <EventFeed events={events} />
      </div>
    </div>
  );
}
