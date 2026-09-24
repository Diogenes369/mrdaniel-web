import { useEffect, useState } from 'react';
import { LayoutGrid, Users2, Activity, UserPlus, LogOut, ShieldAlert, Bot, Calendar, Newspaper, Rocket, Film, Mail, Wifi, WifiOff, Recycle, TrendingUp, LayoutTemplate, GraduationCap, AtSign, ImagePlus, Code2, Twitter, Sparkles, Radar, Box } from 'lucide-react';
import { useAuthUser, logout, isDashboardAdmin } from './lib/auth';
import { usePresence, useLiveEvents, useHealth, useLeads, useNewsletterSignups, useFirebaseConnection } from './lib/useLiveEvents';
import { useHeartbeat, useSiteHealthPing, SITE_ORIGIN } from './lib/useDashboardRefresh';
import { firebaseConfigured } from './firebase';
import type { DeviceType } from './lib/types';
import LoginGate from './components/LoginGate';
import OverviewPanel from './components/OverviewPanel';
import VisitorsPanel from './components/VisitorsPanel';
import EventFeed from './components/EventFeed';
import ContentHeatmap from './components/ContentHeatmap';
import { NewsletterLog } from './components/LeadsLog';
import LeadPipeline from './components/LeadPipeline';
import AgentActivityLog from './components/AgentActivityLog';
import ThreatAuditPanel from './components/ThreatAuditPanel';
import ExportControls from './components/ExportControls';
import { PrintableLeadsReport } from './components/PrintableReport';
import AgentControlPanel from './components/AgentControlPanel';
import NewsContentAgent from './components/NewsContentAgent';
import AutoPublisherPanel from './components/AutoPublisherPanel';
import InstagramStoryCanvas from './components/InstagramStoryCanvas';
import ContentRepurposer from './components/ContentRepurposer';
import CarouselStudio from './components/CarouselStudio';
import IgGrowthAgent from './components/IgGrowthAgent';
import TechTipsStudio from './components/TechTipsStudio';
import ThreadsImporter from './components/ThreadsImporter';
import XImporter from './components/XImporter';
import ImageCarouselUploader from './components/ImageCarouselUploader';
import ScreenshotToCode from './components/ScreenshotToCode';
import EmailManagerPanel from './components/EmailManagerPanel';
import WeeklyPlanCalendar from './components/WeeklyPlanCalendar';
import GrokStudio from './components/GrokStudio';
import MissionControl from './components/MissionControl';
import ErrorBoundary from './components/ErrorBoundary';
import AdminAuthGate from './components/AdminAuthGate';

type Tab = 'mission' | 'grok' | 'overview' | 'visitors' | 'events' | 'leads' | 'security' | 'agent' | 'news-agent' | 'story' | 'repurpose' | 'carousel-studio' | 'tech-tips' | 'threads-import' | 'x-import' | 'image-carousel' | 'screenshot-code' | 'ig-growth' | 'auto-publisher' | 'email' | 'weekly-plan';

/**
 * Tab groups. Nineteen equal-weight pills in one row read as a wall of options, so they are grouped
 * by what the operator is trying to do. Ids, labels and icons are untouched — this only adds a
 * `group` field for rendering, so every existing route, panel and API binding is unaffected.
 */
const GROUPS = [
  { id: 'agents', label: 'סוכנים' },
  { id: 'analytics', label: 'ניתוח ונתונים' },
  { id: 'create', label: 'יצירת תוכן' },
  { id: 'growth', label: 'צמיחה ואוטומציה' },
] as const;
type GroupId = (typeof GROUPS)[number]['id'];

const TABS: { id: Tab; label: string; icon: typeof LayoutGrid; group: GroupId }[] = [
  { id: 'mission', label: 'משרד סוכנים 3D', icon: Radar, group: 'agents' },
  { id: 'grok', label: 'Grok · סטודיו X', icon: Sparkles, group: 'agents' },
  { id: 'overview', label: 'סקירה כללית', icon: LayoutGrid, group: 'analytics' },
  { id: 'visitors', label: 'מבקרים', icon: Users2, group: 'analytics' },
  { id: 'events', label: 'אירועים ותוכן', icon: Activity, group: 'analytics' },
  { id: 'leads', label: 'לידים וניוזלטר', icon: UserPlus, group: 'analytics' },
  { id: 'security', label: 'אבטחה ופעילות סוכן', icon: ShieldAlert, group: 'analytics' },
  { id: 'news-agent', label: 'מחולל תוכן מחדשות', icon: Newspaper, group: 'create' },
  { id: 'story', label: 'מחולל סטורי', icon: Film, group: 'create' },
  { id: 'carousel-studio', label: 'סטודיו קרוסלות WEB3', icon: LayoutTemplate, group: 'create' },
  { id: 'repurpose', label: 'יבוא ושכתוב תוכן', icon: Recycle, group: 'create' },
  { id: 'tech-tips', label: 'טיפים ומדריכים', icon: GraduationCap, group: 'create' },
  { id: 'threads-import', label: 'יבוא מ-Threads', icon: AtSign, group: 'create' },
  { id: 'x-import', label: 'ייבוא מ-X / Twitter', icon: Twitter, group: 'create' },
  { id: 'image-carousel', label: 'תרגום ומיתוג קרוסלות (תמונות)', icon: ImagePlus, group: 'create' },
  { id: 'screenshot-code', label: 'מסך לקוד (React + Tailwind)', icon: Code2, group: 'create' },
  { id: 'agent', label: 'סוכן AI חברתי', icon: Bot, group: 'growth' },
  { id: 'ig-growth', label: 'סוכן צמיחה באינסטגרם', icon: TrendingUp, group: 'growth' },
  { id: 'auto-publisher', label: 'אוטונומיה', icon: Rocket, group: 'growth' },
  { id: 'email', label: 'מערכת דיוור ומיילים', icon: Mail, group: 'growth' },
  { id: 'weekly-plan', label: 'לוח תוכן שבועי', icon: Calendar, group: 'growth' },
];

/**
 * Tab <-> URL hash, so a tab is linkable. `#office` (and `#mission`) opens the 3D agent office
 * directly — the hash survives the login gate, so the link lands there right after sign-in.
 */
const HASH_ALIASES: Record<string, Tab> = { office: 'mission', '3d': 'mission' };

function tabFromHash(): Tab | null {
  const key = decodeURIComponent(window.location.hash.replace(/^#/, '')).trim();
  if (!key) return null;
  if (HASH_ALIASES[key]) return HASH_ALIASES[key];
  return TABS.some((t) => t.id === key) ? (key as Tab) : null;
}

/** Live connection strip — Firebase realtime link + an independent 5s round-trip probe to the
 * production domain (mrdaniel.co.il/api/health). Makes the "no manual refresh needed" claim visible
 * and verifiable. */
function LiveStatus({ connected }: { connected: boolean }) {
  const now = useHeartbeat(4000);
  const site = useSiteHealthPing(5000);
  const agoSec = site.checkedAt ? Math.max(0, Math.round((now - site.checkedAt) / 1000)) : null;
  const host = SITE_ORIGIN.replace(/^https?:\/\//, '');

  return (
    <div className="flex flex-col gap-1 text-xs">
      <span
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border font-medium ${
          connected
            ? 'bg-brand-500/10 border-brand-500/30 text-brand-300'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
        }`}
        title={connected ? 'הנתונים מתעדכנים בזמן אמת דרך Firebase' : 'מנסה להתחבר מחדש'}
      >
        <span className="relative flex h-2 w-2">
          {connected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${connected ? 'bg-brand-400' : 'bg-amber-400'}`} />
        </span>
        {connected ? 'חי · עדכון אוטומטי' : 'מתחבר מחדש…'}
      </span>
      <span className="inline-flex items-center gap-1.5 text-zinc-500 font-mono pr-1" dir="ltr">
        {site.reachable ? <Wifi className="w-3 h-3 text-brand-400" /> : <WifiOff className="w-3 h-3 text-red-400" />}
        {host} {site.reachable ? `· ${site.latencyMs}ms` : '· unreachable'}
        {agoSec !== null && ` · ${agoSec}s ago`}
      </span>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuthUser();
  const presence = usePresence();
  const events = useLiveEvents(300);
  const health = useHealth();
  const leads = useLeads();
  const signups = useNewsletterSignups();
  const connected = useFirebaseConnection();
  const [tab, setTabState] = useState<Tab>(() => tabFromHash() ?? 'overview');

  function setTab(next: Tab) {
    setTabState(next);
    const hash = next === 'mission' ? '#office' : `#${next}`;
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
  }

  useEffect(() => {
    const onHash = () => {
      const next = tabFromHash();
      if (next) setTabState(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-carbon-950 text-zinc-500 text-sm">
        טוען...
      </div>
    );
  }

  // A session alone is not enough: visitors can now create accounts in this Firebase project.
  if (!user || !isDashboardAdmin(user)) {
    return <LoginGate denied={Boolean(user)} />;
  }

  return (
    <div dir="rtl" className="dash-root min-h-screen bg-carbon-950 text-zinc-100 p-5 md:p-8 font-sans">
      <div className="w-full">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div>
            <h1 className="font-display font-black text-2xl md:text-3xl text-white">לוח בקרה בזמן אמת</h1>
            <p className="text-zinc-500 text-sm mt-1">Live Analytics · דניאל בן ברוך</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {/* The 3D office used to be one pill among twenty. This is the direct way in. */}
            <button
              type="button"
              onClick={() => setTab('mission')}
              aria-current={tab === 'mission' ? 'page' : undefined}
              className={`group inline-flex items-center gap-2.5 rounded-full border px-4 py-2 text-sm font-black transition-all cursor-pointer ${
                tab === 'mission'
                  ? 'border-lime-300/70 bg-lime-400 text-black shadow-[0_0_24px_-4px_rgba(163,230,53,0.7)]'
                  : 'border-lime-400/50 bg-gradient-to-l from-lime-500/20 via-sky-500/10 to-fuchsia-500/20 text-lime-200 shadow-[0_0_20px_-6px_rgba(163,230,53,0.6)] hover:border-lime-300 hover:text-white'
              }`}
            >
              <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-300 opacity-70" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-lime-300" />
              </span>
              <Box className="h-4 w-4" />
              משרד סוכנים 3D
              <span className="font-mono text-[10px] font-bold opacity-70" dir="ltr">LIVE 3D AGENT OFFICE</span>
            </button>
            <LiveStatus connected={connected} />
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

        {/* Tab nav — grouped by purpose. Same buttons and same setTab calls as before; only the
            arrangement changed, so no pathway is altered. */}
        <nav className="mb-6 space-y-2.5" aria-label="ניווט ראשי">
          {GROUPS.map((g) => {
            const items = TABS.filter((t) => t.group === g.id);
            if (items.length === 0) return null;
            return (
              <div key={g.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                {/* Label on its own line. The previous version put it inline with a min-width,
                    which collided with the pills once a row wrapped. */}
                <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                  {g.label}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                {items.map((t) => {
                  const Icon = t.icon;
                  const active = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
                        active
                          ? 'bg-brand-500 text-black'
                          : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/10'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {t.label}
                    </button>
                  );
                })}
                </div>
              </div>
            );
          })}
        </nav>

        {tab === 'mission' && (
          <ErrorBoundary label="Mission Control">
            <MissionControl />
          </ErrorBoundary>
        )}

        {tab === 'grok' && (
          <ErrorBoundary label="Grok · סטודיו X">
            <GrokStudio />
          </ErrorBoundary>
        )}

        {tab === 'overview' && (
          <ErrorBoundary label="סקירה כללית">
            <OverviewPanel presence={presence} events={events} health={health} />
          </ErrorBoundary>
        )}

        {tab === 'visitors' && (
          <ErrorBoundary label="מבקרים">
            <VisitorsPanel presence={presence} />
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

        {tab === 'news-agent' && (
          <ErrorBoundary label="מחולל תוכן מחדשות">
            <NewsContentAgent />
          </ErrorBoundary>
        )}

        {tab === 'story' && (
          <ErrorBoundary label="מחולל סטורי">
            <InstagramStoryCanvas />
          </ErrorBoundary>
        )}

        {tab === 'repurpose' && (
          <ErrorBoundary label="יבוא ושכתוב תוכן">
            <ContentRepurposer />
          </ErrorBoundary>
        )}

        {tab === 'carousel-studio' && (
          <ErrorBoundary label="סטודיו קרוסלות WEB3">
            <CarouselStudio />
          </ErrorBoundary>
        )}

        {tab === 'tech-tips' && (
          <ErrorBoundary label="טיפים ומדריכים">
            <TechTipsStudio />
          </ErrorBoundary>
        )}

        {tab === 'threads-import' && (
          <ErrorBoundary label="יבוא מ-Threads">
            <ThreadsImporter />
          </ErrorBoundary>
        )}

        {tab === 'x-import' && (
          <ErrorBoundary label="ייבוא מ-X / Twitter">
            <XImporter />
          </ErrorBoundary>
        )}

        {tab === 'image-carousel' && (
          <ErrorBoundary label="תרגום ומיתוג קרוסלות (תמונות)">
            <ImageCarouselUploader />
          </ErrorBoundary>
        )}

        {tab === 'screenshot-code' && (
          <ErrorBoundary label="מסך לקוד (React + Tailwind)">
            <ScreenshotToCode />
          </ErrorBoundary>
        )}

        {tab === 'ig-growth' && (
          <ErrorBoundary label="סוכן צמיחה באינסטגרם">
            <IgGrowthAgent />
          </ErrorBoundary>
        )}

        {tab === 'auto-publisher' && (
          <ErrorBoundary label="אוטונומיה">
            <AutoPublisherPanel />
          </ErrorBoundary>
        )}

        {tab === 'email' && (
          <ErrorBoundary label="מערכת דיוור ומיילים">
            <EmailManagerPanel />
          </ErrorBoundary>
        )}

        {tab === 'weekly-plan' && (
          <ErrorBoundary label="לוח תוכן שבועי">
            <WeeklyPlanCalendar />
          </ErrorBoundary>
        )}
      </div>

      <PrintableLeadsReport leads={leads} />
      {/* Surfaces one actionable re-auth prompt when the site API rejects x-admin-secret,
          instead of letting each failing call raise its own raw 401 toast. */}
      <AdminAuthGate />
    </div>
  );
}
