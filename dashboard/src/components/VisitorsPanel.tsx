import { useMemo } from 'react';
import { useAutoRefresh } from '../lib/useDashboardRefresh';
import type { DeviceType, PresenceRecord } from '../lib/types';
import LiveStatusBar from './LiveStatusBar';
import VisitorBreakdown from './VisitorBreakdown';
import LiveCounter from './LiveCounter';
import DeviceBreakdown from './DeviceBreakdown';

/**
 * "Visitors" tab — the detailed live session table (IP, country/flag/city, dwell time, current
 * path, device) plus the device split. Same 5-second auto-refresh cycle as the Overview; the
 * cycle's `tick` feeds the dwell-time column via `now` so it counts up smoothly with no leak.
 */
export default function VisitorsPanel({ presence }: { presence: Record<string, PresenceRecord> }) {
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
      {/* VisitorBreakdown runs its own 1-second clock for the dwell column so it counts up
          smoothly; the 5s cycle above only drives the LIVE badge / countdown / manual refresh. */}
      <VisitorBreakdown presence={presence} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <LiveCounter count={list.length} mobile={counts.mobile} desktop={counts.desktop} tablet={counts.tablet} />
        <DeviceBreakdown presence={presence} />
      </div>
    </div>
  );
}
