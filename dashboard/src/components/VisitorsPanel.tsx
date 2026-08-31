import { useMemo } from 'react';
import { useAutoRefresh } from '../lib/useDashboardRefresh';
import { selectActiveSessions, selectActivePresence, deviceCounts } from '../lib/presence';
import type { PresenceRecord } from '../lib/types';
import LiveStatusBar from './LiveStatusBar';
import VisitorBreakdown from './VisitorBreakdown';
import LiveCounter from './LiveCounter';
import DeviceBreakdown from './DeviceBreakdown';

/**
 * "Visitors" tab — the detailed live session table (IP, country/flag/city, dwell, path, device)
 * plus the device split. Same 5-second auto-refresh cycle as Overview; every card here reads the
 * SAME filtered active set (`selectActivePresence`), re-computed against a fresh `Date.now()` on
 * each `refresh.tick`, so the count, the pie, and the table row-count are always identical.
 * VisitorBreakdown keeps its own 1s clock only for the smooth per-second dwell counter.
 */
export default function VisitorsPanel({ presence }: { presence: Record<string, PresenceRecord> }) {
  const refresh = useAutoRefresh(5000);

  const { activePresence, counts, count } = useMemo(() => {
    const now = Date.now();
    const sessions = selectActiveSessions(presence, now);
    return {
      activePresence: selectActivePresence(presence, now),
      counts: deviceCounts(sessions),
      count: sessions.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presence, refresh.tick]);

  return (
    <div className="space-y-5">
      <LiveStatusBar refresh={refresh} activeUsers={count} />
      <VisitorBreakdown presence={activePresence} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <LiveCounter count={count} mobile={counts.mobile} desktop={counts.desktop} tablet={counts.tablet} />
        <DeviceBreakdown presence={activePresence} />
      </div>
    </div>
  );
}
