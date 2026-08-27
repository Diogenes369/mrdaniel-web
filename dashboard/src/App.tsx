import { useState } from 'react';
import { LayoutGrid, Users2, Activity, UserPlus, LogOut, ShieldAlert, Bot, Calendar } from 'lucide-react';
import { useAuthUser, logout } from './lib/auth';
import { usePresence, useLiveEvents, useHealth, useLeads, useNewsletterSignups } from './lib/useLiveEvents';
import { firebaseConfigured } from './firebase';
import type { DeviceType } from './lib/types';
import LoginGate from './components/LoginGate';
import LiveCounter from './components/LiveCounter';
import TrafficChart from './components/TrafficChart';
import DeviceBreakdown from './components/DeviceBreakdown';
import EventFeed from './components/EventFeed';
import HealthGauge from './components/HealthGauge';
import VisitorBreakdown from './components/VisitorBreakdown';
import ContentHeatmap from './components/ContentHeatmap';
import { NewsletterLog } from './components/LeadsLog';
import LeadPipeline from './components/LeadPipeline';
import AgentActivityLog from './components/AgentActivityLog';
import ThreatAuditPanel from './components/ThreatAuditPanel';
import ExportControls from './components/ExportControls';
import { PrintableLeadsReport } from './components/PrintableReport';
import AgentControlPanel from './components/AgentControlPanel';
import WeeklyPlanCalendar from './components/WeeklyPlanCalendar';
import ErrorBoundary from './components/ErrorBoundary';

type Tab = 'overview' | 'visitors' | 'events' | 'leads' | 'security' | 'agent' | 'weekly-plan';

const TABS: { id: Tab; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'overview', label: 'סקירה כללית', icon: LayoutGrid },
  { id: 'visitors', label: 'מבקרים', icon: Users2 },
  { id: 'events', label: 'אירועים ותוכן', icon: Activity },
  { id: 'leads', label: 'לידים וניוזלטר', icon: UserPlus },
  { id: 'security', label: 'אבטחה ופעילות סוכן', icon: ShieldAlert },
  { id: 'agent', label: 'סוכן AI חברתי', icon: Bot },
  { id: 'weekly-plan', label: 'לוח תוכן שבועי', icon: Calendar },
];

export default function App() {
  const { user, loading } = useAuthUser();
  const presence = usePresence();
  const events = useLiveEvents(300);
  const health = useHealth();
  const leads = useLeads();
  const signups = useNewsletterSignups();
  const [tab, setTab] = useState<Tab>('overview');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-carbon-950 text-zinc-500 text-sm">
        טוען...
      </div>
    );
  }

  if (!user) {
    return <LoginGate />;
  }

  const presenceList = Object.values(presence);
  const counts: Record<DeviceType, number> = { mobile: 0, desktop: 0, tablet: 0 };
  presenceList.forEach((p) => {
    counts[p.device] = (counts[p.device] ?? 0) + 1;
  });

  return (
    <div dir="rtl" className="dash-root min-h-screen bg-carbon-950 text-zinc-100 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="font-display font-black text-2xl md:text-3xl text-white">לוח בקרה בזמן אמת</h1>
            <p className="text-zinc-500 text-sm mt-1">Live Analytics · דניאל בן ברוך</p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <ExportControls leads={leads} events={events} health={health} />
            <button
              onClick={() => logout()}
              className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              התנתקות
            </button>
          </div>
        </div>

        {!firebaseConfigured && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm rounded-xl p-4 mb-6">
            Firebase אינו מוגדר — הוסף את פרטי ה-config לקובץ .env כדי לראות נתונים חיים (ראו README).
          </div>
        )}

        {/* Tab nav */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  active ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/10'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'overview' && (
          <ErrorBoundary label="סקירה כללית">
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <LiveCounter count={presenceList.length} mobile={counts.mobile} desktop={counts.desktop} tablet={counts.tablet} />
                <HealthGauge health={health} />
                <DeviceBreakdown presence={presence} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <TrafficChart events={events} />
                <EventFeed events={events} />
              </div>
            </div>
          </ErrorBoundary>
        )}

        {tab === 'visitors' && (
          <ErrorBoundary label="מבקרים">
            <div className="space-y-5">
              <VisitorBreakdown presence={presence} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <LiveCounter count={presenceList.length} mobile={counts.mobile} desktop={counts.desktop} tablet={counts.tablet} />
                <DeviceBreakdown presence={presence} />
              </div>
            </div>
          </ErrorBoundary>
        )}

        {tab === 'events' && (
          <ErrorBoundary label="אירועים ותוכן">
            <div className="space-y-5">
              <ContentHeatmap events={events} />
              <EventFeed events={events} />
            </div>
          </ErrorBoundary>
        )}

        {tab === 'leads' && (
          <ErrorBoundary label="לידים וניוזלטר">
            <div className="space-y-5">
              <LeadPipeline leads={leads} />
              <NewsletterLog signups={signups} />
            </div>
          </ErrorBoundary>
        )}

        {tab === 'security' && (
          <ErrorBoundary label="אבטחה ופעילות סוכן">
            <div className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <AgentActivityLog events={events} />
                <ThreatAuditPanel events={events} />
              </div>
            </div>
          </ErrorBoundary>
        )}

        {tab === 'agent' && (
          <ErrorBoundary label="סוכן AI חברתי">
            <AgentControlPanel />
          </ErrorBoundary>
        )}

        {tab === 'weekly-plan' && (
          <ErrorBoundary label="לוח תוכן שבועי">
            <WeeklyPlanCalendar />
          </ErrorBoundary>
        )}
      </div>

      <PrintableLeadsReport leads={leads} />
    </div>
  );
}
