import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Header from './components/Header';
import NewsTicker from './components/NewsTicker';
import ScrollProgress from './components/ScrollProgress';
import Footer from './components/Footer';
import AIAssistantWidget from './components/AIAssistantWidget';
import AccessibilityWidget from './components/AccessibilityWidget';
import LeadForm from './components/LeadForm';
import AgentQualificationModal from './components/AgentQualificationModal';
import CookieBanner from './components/CookieBanner';
import CommandPalette from './components/CommandPalette';
import TerminalCLI from './components/TerminalCLI';
import { useLenis, triggerRouteTransitionPulse } from './hooks/useLenis';
import { useScrollRestoration } from './hooks/useScrollRestoration';
import { useDeferredMount } from './hooks/useDeferredMount';
import { ScrollTrigger } from './lib/gsap';
import RouteSeo from './components/seo/RouteSeo';
import { shouldMountScene } from './lib/perfMode';
import { useInsightsPrefetch } from './services/newsInsightsService';

// The site's standard background: the R3F cosmic scene. Lazy so its Three.js/R3F bundle stays out
// of the initial payload until the page is idle (see useDeferredMount).
// NOTE: the experimental Canvas2D particle / scroll-sequence engine was archived to
// src/archive/canvas-motion-v2/ (see the README there to restore it).
const Scene3D = lazy(() => import('./three/Scene3D'));

// The tracker pulls in the Firebase SDK (~200KB gzipped) — code-split into its own chunk via
// dynamic import rather than a static one, so it never bloats the main bundle that every visitor
// downloads, matching how Scene3D is already lazy-loaded above. Cached so every call site (route
// changes fire this often) reuses the same load rather than re-importing.
import { loadTracker } from './lib/loadTracker';
import HomePage from './pages/HomePage';

// Every route except the homepage is its own chunk (2026-09-27). They were all static imports, so
// the entry chunk — which has to download and parse before the hero, its signal console or anything
// else paints — carried eleven pages the visitor had not asked for. The homepage stays static: it is
// the LCP route. The others are warmed on idle (see usePrefetchRoutes) so a click still lands on a
// chunk that is already in memory.
const ROUTE_CHUNKS = {
  about: () => import('./pages/AboutPage'),
  ai: () => import('./pages/AIPage'),
  jarvis: () => import('./pages/JarvisPage'),
  magazines: () => import('./pages/MagazinesPage'),
  news: () => import('./pages/NewsPage'),
  newsArticle: () => import('./pages/NewsArticlePage'),
  privacy: () => import('./pages/PrivacyPage'),
  terms: () => import('./pages/TermsPage'),
  accessibility: () => import('./pages/AccessibilityPage'),
  guideDownload: () => import('./pages/GuideDownloadPage'),
  notFound: () => import('./pages/NotFoundPage'),
};
const AboutPage = lazy(ROUTE_CHUNKS.about);
const AIPage = lazy(ROUTE_CHUNKS.ai);
const JarvisPage = lazy(ROUTE_CHUNKS.jarvis);
const MagazinesPage = lazy(ROUTE_CHUNKS.magazines);
const NewsPage = lazy(ROUTE_CHUNKS.news);
const NewsArticlePage = lazy(ROUTE_CHUNKS.newsArticle);
const PrivacyPage = lazy(ROUTE_CHUNKS.privacy);
const TermsPage = lazy(ROUTE_CHUNKS.terms);
const AccessibilityPage = lazy(ROUTE_CHUNKS.accessibility);
const GuideDownloadPage = lazy(ROUTE_CHUNKS.guideDownload);
const NotFoundPage = lazy(ROUTE_CHUNKS.notFound);

/** Holds the viewport while a route chunk loads, so the footer does not jump up for a frame. */
const RouteFallback = () => <div className="min-h-[100dvh]" aria-busy="true" />;

/** Warm every route chunk once the page is idle — after first paint, never competing with it. */
function usePrefetchRoutes(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const run = () => Object.values(ROUTE_CHUNKS).forEach((load) => void load().catch(() => {}));
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) {
      w.requestIdleCallback(run, { timeout: 6000 });
      return;
    }
    const t = window.setTimeout(run, 3000);
    return () => window.clearTimeout(t);
  }, [enabled]);
}
import ErrorBoundary, { PageErrorFallback } from './components/ErrorBoundary';

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
  // Not on the bare guide-download pages, which exist to load as little as possible on mobile data.
  usePrefetchRoutes(!/^\/(?:download|g)(?:\/|$)/.test(location.pathname));
  // Warm the precomputed article analyses while idle, so opening any headline is instant. Not on
  // the bare guide-download pages, which exist to load as little as possible over mobile data.
  useInsightsPrefetch(!/^\/(?:download|g)(?:\/|$)/.test(location.pathname));
  const sceneReady = useDeferredMount();
  // Decided once: reduced motion, Save-Data and weak hardware never download the Three.js chunk.
  const [sceneAllowed] = useState(shouldMountScene);

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

  // Public guide-download links render WITHOUT the site chrome: no header, ticker, footer, cookie
  // banner, assistant widget or 3D scene. The visitor arrived by tapping a link in an Instagram DM
  // on a phone and wants one file — every extra element is another thing to load over mobile data
  // and another thing between them and the download button. The route still lives in this router so
  // the SPA rewrite and <Link to="/"> back-navigation keep working.
  if (/^\/(?:download|g)(?:\/|$)/.test(location.pathname)) {
    return (
      <div className="relative min-h-screen w-full bg-carbon-950 text-zinc-100 font-sans" dir="rtl">
        <RouteScrollManager />
        <Suspense fallback={<RouteFallback />}>
          <Routes location={location}>
            <Route path="/download" element={<GuideDownloadPage />} />
            <Route path="/download/:guideId" element={<GuideDownloadPage />} />
            <Route path="/g/:guideId" element={<GuideDownloadPage />} />
          </Routes>
        </Suspense>
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen w-full max-w-full overflow-x-clip bg-carbon-950 text-zinc-100 font-sans selection:bg-brand-500 selection:text-black"
      dir="rtl"
    >
      <RouteScrollManager />
      <RouteSeo />
      {/* Decorative: if the chunk fails to load or WebGL throws, the page simply has no scene. */}
      <ErrorBoundary name="scene3d" fallback={null}>
        <Suspense fallback={null}>{sceneReady && sceneAllowed && <Scene3D />}</Suspense>
      </ErrorBoundary>
      <ScrollProgress />
      {/* Live headline ticker: very top of the layout, above the header, in normal document
          flow, DESKTOP ONLY (the component is `hidden md:block`). It scrolls away with the page;
          the header measures it and is NOT sticky-bundled with it (see Header.tsx). Clicking a
          headline opens the article modal. */}
      <NewsTicker placement="top" />
      <Header />
      <main key={location.pathname} className="relative z-[1] w-full max-w-full overflow-x-clip">
        <ErrorBoundary name="route" resetKey={location.pathname} fallback={(reset) => <PageErrorFallback onRetry={reset} />}>
        <Suspense fallback={<RouteFallback />}>
        <Routes location={location}>
          <Route path="/" element={<HomePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/ai" element={<AIPage />} />
          <Route path="/jarvis" element={<JarvisPage />} />
          {/* The site is AI-only since 2026-09-21: the old cyber / web-dev / architecture pages
              were removed, and their URLs (still in backlinks and search results) land on /ai. */}
          {['/cyber', '/digital', '/architecture', '/capabilities'].map((path) => (
            <Route key={path} path={path} element={<Navigate to="/ai" replace />} />
          ))}
          <Route path="/magazines" element={<MagazinesPage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/news/:slug" element={<NewsArticlePage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/accessibility" element={<AccessibilityPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
      </main>
      <div className="relative z-[1]">
        <Footer />
      </div>
      <AIAssistantWidget />
      <AccessibilityWidget />
      <LeadForm />
      <AgentQualificationModal />
      <CookieBanner />
      <CommandPalette />
      <TerminalCLI />
    </div>
  );
}
