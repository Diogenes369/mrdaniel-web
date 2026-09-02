import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header';
import NewsTicker from './components/NewsTicker';
import ScrollProgress from './components/ScrollProgress';
import Footer from './components/Footer';
import AIAssistantWidget from './components/AIAssistantWidget';
import AccessibilityWidget from './components/AccessibilityWidget';
import LeadForm from './components/LeadForm';
import AgentQualificationModal from './components/AgentQualificationModal';
import CyberCookieBanner from './components/CyberCookieBanner';
import CommandPalette from './components/CommandPalette';
import TerminalCLI from './components/TerminalCLI';
import { useLenis, triggerRouteTransitionPulse } from './hooks/useLenis';
import { useScrollRestoration } from './hooks/useScrollRestoration';
import { useDeferredMount } from './hooks/useDeferredMount';
import { ScrollTrigger } from './lib/gsap';
import RouteSeo from './components/seo/RouteSeo';

// The site's standard background: the R3F cosmic scene. Lazy so its Three.js/R3F bundle stays out
// of the initial payload until the page is idle (see useDeferredMount).
// NOTE: the experimental Canvas2D particle / scroll-sequence engine was archived to
// src/archive/canvas-motion-v2/ (see the README there to restore it).
const Scene3D = lazy(() => import('./three/Scene3D'));

// The tracker pulls in the Firebase SDK (~200KB gzipped) — code-split into its own chunk via
// dynamic import rather than a static one, so it never bloats the main bundle that every visitor
// downloads, matching how Scene3D is already lazy-loaded above. Cached so every call site (route
// changes fire this often) reuses the same load rather than re-importing.
type TrackerModule = typeof import('./lib/tracker');
let trackerPromise: Promise<TrackerModule> | null = null;
function loadTracker(): Promise<TrackerModule> {
  if (!trackerPromise) trackerPromise = import('./lib/tracker');
  return trackerPromise;
}
import HomePage from './pages/HomePage';
import AboutPage from './pages/AboutPage';
import AIPage from './pages/AIPage';
import JarvisPage from './pages/JarvisPage';
import CyberPage from './pages/CyberPage';
import DigitalPage from './pages/DigitalPage';
import ArchitecturePage from './pages/ArchitecturePage';
import CapabilitiesPage from './pages/CapabilitiesPage';
import MagazinesPage from './pages/MagazinesPage';
import NewsPage from './pages/NewsPage';
import NewsArticlePage from './pages/NewsArticlePage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import AccessibilityPage from './pages/AccessibilityPage';

function RouteScrollManager() {
  const { pathname } = useLocation();

  // Scroll position on route change is owned entirely by useScrollRestoration:
  // back/forward (incl. mobile swipe-back) restores the saved position, a fresh link click
  // starts at the top, and a #hash anchor-scrolls.
  useScrollRestoration();

  useEffect(() => {
    triggerRouteTransitionPulse();
    loadTracker().then((t) => t.trackPageview(pathname));
    // GSAP pins/triggers need a re-measure after the new route's DOM is in — kept separate from
    // the scroll positioning above.
    const id = window.setTimeout(() => ScrollTrigger.refresh(), 60);
    return () => window.clearTimeout(id);
  }, [pathname]);

  return null;
}

export default function App() {
  useLenis();
  const location = useLocation();
  const sceneReady = useDeferredMount();

  useEffect(() => {
    loadTracker().then((t) => t.initTracker());
    // Every CTA on the site already dispatches this one event to open the lead modal — listening
    // for it centrally here captures every conversion-intent click (contact, purchase, magazine
    // CTAs, capability-matrix CTA, etc.) without instrumenting each call site individually.
    const handleLeadOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ subject?: string; sourceSection?: string }>).detail;
      loadTracker().then((t) => t.trackConversion(detail?.sourceSection || detail?.subject || 'lead-modal'));
    };
    window.addEventListener('open-lead-modal', handleLeadOpen);

    const handleQualifierOpen = () => loadTracker().then((t) => t.trackConversion('Agent Qualification Modal'));
    window.addEventListener('open-agent-qualifier', handleQualifierOpen);

    return () => {
      window.removeEventListener('open-lead-modal', handleLeadOpen);
      window.removeEventListener('open-agent-qualifier', handleQualifierOpen);
    };
  }, []);

  return (
    <div
      className="relative min-h-screen w-full max-w-full overflow-x-clip bg-carbon-950 text-zinc-100 font-sans selection:bg-brand-500 selection:text-black"
      dir="rtl"
    >
      <RouteScrollManager />
      <RouteSeo />
      <Suspense fallback={null}>{sceneReady && <Scene3D />}</Suspense>
      <ScrollProgress />
      {/* Live headline ticker: very top of the layout, above the header, in normal document
          flow, DESKTOP ONLY (the component is `hidden md:block`). It scrolls away with the page;
          the header measures it and is NOT sticky-bundled with it (see Header.tsx). On mobile the
          ticker instead renders inline inside the homepage news section (CyberNewsGrid). */}
      <NewsTicker placement="top" />
      <Header />
      <main key={location.pathname} className="relative z-[1] w-full max-w-full overflow-x-clip">
        <Routes location={location}>
          <Route path="/" element={<HomePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/ai" element={<AIPage />} />
          <Route path="/jarvis" element={<JarvisPage />} />
          <Route path="/cyber" element={<CyberPage />} />
          <Route path="/digital" element={<DigitalPage />} />
          <Route path="/architecture" element={<ArchitecturePage />} />
          <Route path="/capabilities" element={<CapabilitiesPage />} />
          <Route path="/magazines" element={<MagazinesPage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/news/:slug" element={<NewsArticlePage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/accessibility" element={<AccessibilityPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>
      <div className="relative z-[1]">
        <Footer />
      </div>
      <AIAssistantWidget />
      <AccessibilityWidget />
      <LeadForm />
      <AgentQualificationModal />
      <CyberCookieBanner />
      <CommandPalette />
      <TerminalCLI />
    </div>
  );
}
