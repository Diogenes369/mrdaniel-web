import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header';
import ScrollProgress from './components/ScrollProgress';
import Footer from './components/Footer';
import AIAssistantWidget from './components/AIAssistantWidget';
import AccessibilityWidget from './components/AccessibilityWidget';
import LeadForm from './components/LeadForm';
import AgentQualificationModal from './components/AgentQualificationModal';
import CyberCookieBanner from './components/CyberCookieBanner';
import CommandPalette from './components/CommandPalette';
import { useLenis, smoothScrollTo, scrollToTopInstant, triggerRouteTransitionPulse } from './hooks/useLenis';
import { useDeferredMount } from './hooks/useDeferredMount';
import { ScrollTrigger } from './lib/gsap';
import { isMotionV2Enabled } from './lib/motionFlag';

const Scene3D = lazy(() => import('./three/Scene3D'));
// Both lazy — a visitor without the `?motion=2d` preview flag never downloads either of these
// chunks, and one with the flag never downloads Scene3D/Three.js. See lib/motionFlag.ts.
const MotionField = lazy(() => import('./motion/MotionField'));
const Cursor = lazy(() => import('./components/Cursor'));

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
  const { pathname, hash } = useLocation();

  useEffect(() => {
    triggerRouteTransitionPulse();
    loadTracker().then((t) => t.trackPageview(pathname));
    const id = window.setTimeout(() => {
      ScrollTrigger.refresh();
      if (hash) {
        smoothScrollTo(hash);
      } else {
        scrollToTopInstant();
      }
    }, 60);
    return () => window.clearTimeout(id);
  }, [pathname, hash]);

  return null;
}

export default function App() {
  useLenis();
  const location = useLocation();
  const sceneReady = useDeferredMount();
  // Computed once per session, same pattern as Scene3D.tsx's own `useState(isIOSWebKit)` — the
  // flag is a runtime/localStorage switch (see lib/motionFlag.ts), not something that needs to
  // react live mid-session.
  const [motionV2] = useState(isMotionV2Enabled);

  // A single class on <html> is what index.css's `.motion-v2` rules key off — see the "MOTION V2
  // GLASS OVERRIDES" block there for why this exists: it lets the preview turn the site's already
  // largely-translucent cards into true frosted glass (added backdrop-blur, not a new opacity)
  // WITHOUT editing the ~20 component files that render them, and reverts to zero effect the
  // instant the flag is off.
  useEffect(() => {
    document.documentElement.classList.toggle('motion-v2', motionV2);
  }, [motionV2]);

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
    <div className="min-h-screen overflow-x-hidden bg-carbon-950 text-zinc-100 font-sans selection:bg-brand-500 selection:text-black" dir="rtl">
      <RouteScrollManager />
      <Suspense fallback={null}>{sceneReady && (motionV2 ? <MotionField /> : <Scene3D />)}</Suspense>
      {motionV2 && (
        <Suspense fallback={null}>
          <Cursor />
        </Suspense>
      )}
      <ScrollProgress />
      <Header />
      <main key={location.pathname} className="relative z-[1]">
        <Routes location={location}>
          <Route path="/" element={<HomePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/ai" element={<AIPage />} />
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
    </div>
  );
}
