import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, Shuffle, Search, Sparkles, SquareTerminal } from 'lucide-react';
import WebButton from './WebButton';
import SocialLinks from './SocialLinks';
import Logo from './Logo';
import { smoothScrollTo, scrollToTopSmooth } from '../hooks/useLenis';

// TikTok and WhatsApp stay exclusive to the footer and the bottom-of-page social bar — the header
// toolbar and mobile drawer keep just these three.
const HEADER_SOCIAL_CHANNELS = ['instagram', 'linkedin', 'mail'] as const;

// Consolidated to the core offerings only. Dropped links (אודות / ארכיטקטורה / יכולות / חנות) stay
// live as routes and remain in the footer. "צור קשר" is an action, not a route — it opens the lead
// modal (the site's contact funnel).
type NavLink = { name: string; to?: string; action?: 'contact' };
const navLinks: NavLink[] = [
  { name: 'סוכני AI', to: '/ai' },
  { name: 'מערכת JARVIS', to: '/jarvis' },
  { name: 'סייבר ואבטחה', to: '/cyber' },
  { name: 'פיתוח ושיווק', to: '/digital' },
  { name: 'חדשות', to: '/news' },
  { name: 'דברו איתי', action: 'contact' },
];

// "Surprise me" destinations for the shuffle toolbar icon.
const SHUFFLE_DESTINATIONS = [
  '/magazines',
  '/architecture',
  '/capabilities',
  '/ai',
  '/jarvis',
  '/cyber',
  '/about',
  '/digital',
  '/news',
];

// No native browser focus ring anywhere in the header — that default ring reads as a stray white
// outline against this dark theme, especially noticeable while the header's own background is
// mid-transition on scroll. Replaced with a branded green ring, and only via `focus-visible` so
// it never flashes on an ordinary mouse click, only on real keyboard focus.
const FOCUS_SAFE_CLASS = 'outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-0';

// Desktop top toolbar (Shuffle/Search/Social): icon-only, no background circle or border — a
// soft box-shadow glow on hover (visible even with a transparent fill) is the only affordance.
const DESKTOP_ICON_CLASS =
  `w-11 h-11 rounded-full flex items-center justify-center text-zinc-300 hover:text-brand-400 hover:shadow-[0_0_16px_rgba(0,255,102,0.45)] transition-all duration-300 cursor-pointer ${FOCUS_SAFE_CLASS}`;

// How long the mobile drawer's own exit fade takes — routing/scroll is deliberately delayed by
// this long after a nav click (see handleMobileNavClick) so the drawer finishes closing BEFORE
// the route/section transition starts, instead of both animating over each other at once (the
// cause of the reported "flash"/jump — the incoming page fading in while the drawer overlay was
// still fading out on top of it).
const DRAWER_EXIT_MS = 280;

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // The live news ticker (NewsTicker.tsx) sits above the header in normal flow. The header is
  // fixed but is NOT bundled into that sticky ticker — instead it glues its own `top` to the
  // ticker's bottom edge (top = tickerHeight - scrollY, clamped at 0) so the ticker scrolls
  // fully away and then only the compact header stays pinned. No CSS transition on `top`: the
  // scroll handler updates it every frame so it tracks the ticker 1:1 with no gap or overlap.
  const [tickerOffset, setTickerOffset] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const bar = document.getElementById('news-ticker-bar');
    let barHeight = bar?.offsetHeight ?? 0;

    const apply = () => {
      setScrolled(window.scrollY > 80);
      setTickerOffset(Math.max(0, barHeight - window.scrollY));
    };
    apply();

    const ro =
      bar && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            barHeight = bar.offsetHeight;
            apply();
          })
        : null;
    ro?.observe(bar as Element);

    window.addEventListener('scroll', apply, { passive: true });
    window.addEventListener('resize', apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
    };
  }, []);

  const openAgent = () => window.dispatchEvent(new CustomEvent('open-agent-qualifier'));

  const handleCtaClick = (e: React.MouseEvent) => {
    e.preventDefault();
    openAgent();
  };

  const openContact = () => {
    window.dispatchEvent(
      new CustomEvent('open-lead-modal', { detail: { subject: 'יצירת קשר', sourceSection: 'Navbar' } })
    );
  };

  // Already home → smooth-scroll to top (a normal <Link to="/"> click does nothing when the path
  // doesn't change). Anywhere else → let the Link navigate home normally; RouteScrollManager's
  // existing instant reset-to-top on route change already handles that case consistently with
  // every other nav link, so it's deliberately left alone here.
  const handleLogoClick = (e: React.MouseEvent) => {
    if (location.pathname === '/') {
      e.preventDefault();
      scrollToTopSmooth();
    }
  };

  const handleNavClick = (e: React.MouseEvent, to: string) => {
    if (!to.startsWith('/#')) return;
    e.preventDefault();
    const hash = to.slice(1);
    if (location.pathname === '/') {
      smoothScrollTo(hash);
    } else {
      navigate('/' + hash);
    }
  };

  const goTo = (to: string) => {
    if (to.startsWith('/#')) {
      const hash = to.slice(1);
      if (location.pathname === '/') smoothScrollTo(hash);
      else navigate('/' + hash);
    } else {
      navigate(to);
    }
  };

  const handleShuffle = () => {
    const pick = SHUFFLE_DESTINATIONS[Math.floor(Math.random() * SHUFFLE_DESTINATIONS.length)];
    goTo(pick);
  };

  // Closes the drawer first, then navigates only after its exit fade has finished — see
  // DRAWER_EXIT_MS. Handles both hash-scroll links and normal routes, unlike handleNavClick (which
  // only intercepts hash links and otherwise defers to <Link>'s default, immediate navigation).
  const handleMobileNavClick = (e: React.MouseEvent, to: string) => {
    e.preventDefault();
    setMobileOpen(false);
    window.setTimeout(() => {
      if (to.startsWith('/#')) {
        const hash = to.slice(1);
        if (location.pathname === '/') smoothScrollTo(hash);
        else navigate('/' + hash);
      } else {
        navigate(to);
      }
    }, DRAWER_EXIT_MS);
  };

  // Lock background scroll while the drawer is open — it's now a fully opaque h-dvh overlay, so a
  // stray touch on it shouldn't be able to scroll the page behind it.
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className={`fixed inset-x-0 z-40 pt-safe border-none outline-none transition-all duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
        scrolled
          ? 'bg-black shadow-2xl py-2 lg:bg-transparent lg:shadow-none lg:py-4'
          : 'bg-transparent py-6 md:py-8'
      }`}
      style={{ top: tickerOffset, willChange: 'transform, opacity, background-color' }}
    >
      <div className="container-wide">
        {/* Desktop-only: on scroll this row condenses from a full-width bar into a floating
            glassmorphism capsule (w-fit + rounded-full + its own bg/border/glow) — the outer
            <header> above sheds its own background at the lg breakpoint so the capsule reads as
            a detached floating island rather than a bar-within-a-bar. Below lg, none of the
            capsule classes apply and this is just the existing full-width scrolled bar. */}
        <div
          className={`flex items-center justify-between gap-3 outline-none lg:border lg:rounded-full transition-all duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
            scrolled
              ? 'lg:w-fit lg:mx-auto lg:gap-5 lg:bg-black lg:border-[#76B900]/30 lg:py-2 lg:px-6 lg:shadow-[0_0_20px_rgba(118,185,0,0.15)]'
              : 'lg:border-transparent'
          }`}
          style={{ willChange: 'transform, opacity, background-color' }}
        >
          <Link
            to="/"
            onClick={handleLogoClick}
            className={`relative flex items-center shrink-0 group z-50 rounded-lg ${FOCUS_SAFE_CLASS}`}
            style={{ willChange: 'transform, opacity' }}
          >
            <div className="absolute inset-0 -m-2.5 rounded-full bg-[#76B900]/25 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" aria-hidden="true" />
            <Logo
              className="relative drop-shadow-[0_0_14px_rgba(118,185,0,0.45)] group-hover:scale-105 transition-all duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
              iconClassName={scrolled ? 'h-8 lg:h-7' : 'h-9 md:h-10'}
              textClassName={`text-base md:text-lg ${scrolled ? 'hidden lg:inline' : 'hidden sm:inline'}`}
            />
          </Link>

          <nav className={`hidden lg:flex items-center shrink-0 transition-all duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${scrolled ? 'gap-4 xl:gap-5' : 'gap-5 xl:gap-8'}`}>
            {navLinks.map((link) =>
              link.action === 'contact' ? (
                <button
                  key={link.name}
                  type="button"
                  onClick={openContact}
                  className={`whitespace-nowrap text-sm font-medium text-zinc-300 hover:text-white transition-colors py-2 rounded cursor-pointer ${FOCUS_SAFE_CLASS}`}
                >
                  {link.name}
                </button>
              ) : (
                <Link
                  key={link.name}
                  to={link.to!}
                  onClick={(e) => handleNavClick(e, link.to!)}
                  className={`whitespace-nowrap text-sm font-medium text-zinc-300 hover:text-white transition-colors py-2 rounded ${FOCUS_SAFE_CLASS}`}
                >
                  {link.name}
                </Link>
              )
            )}
          </nav>

          <div className={`flex items-center shrink-0 transition-all duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${scrolled ? 'gap-2' : 'gap-2 md:gap-3'}`}>
            {/* Geektime-style utility toolbar */}
            <div className="hidden sm:flex items-center gap-1">
              <motion.button
                onClick={handleShuffle}
                whileHover={{ rotate: 15, scale: 1.08 }}
                whileTap={{ scale: 0.9, rotate: -15 }}
                className={DESKTOP_ICON_CLASS}
                aria-label="גלישה אקראית"
                title="הפתעה אקראית"
              >
                <Shuffle className="w-4 h-4" />
              </motion.button>
              <motion.button
                onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.9 }}
                className={DESKTOP_ICON_CLASS}
                aria-label="חיפוש מהיר"
                title="חיפוש מהיר (Ctrl+K)"
              >
                <Search className="w-4 h-4" />
              </motion.button>
              <SocialLinks iconClassName={DESKTOP_ICON_CLASS} channels={[...HEADER_SOCIAL_CHANNELS]} />
            </div>

            {/* Standout CTA: a continuous breathing glow halo (same pattern as the Logo's hover
                halo above, but always-on and slower) plus a gently animated Sparkles icon, so this
                reads as the header's one "premium" action at rest — not just on hover, like every
                other icon/button in this bar. */}
            <div className="hidden lg:block relative">
              <motion.div
                aria-hidden="true"
                className="absolute inset-0 -m-1.5 rounded-full bg-[#76B900]/30 blur-lg pointer-events-none"
                animate={{ opacity: [0.35, 0.8, 0.35], scale: [0.94, 1.06, 0.94] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
              />
              <WebButton
                variant="ghost"
                onClick={handleCtaClick}
                className="!text-[#76B900] hover:text-white !border-[#76B900]/40 hover:!border-[#76B900]/40 hover:bg-[#76B900]/10 !px-4 !py-2 !text-xs !font-semibold !transition-all !duration-300 shadow-[0_0_15px_rgba(118,185,0,0.15)] hover:shadow-[0_0_20px_rgba(118,185,0,0.4)]"
              >
                <motion.span
                  className="inline-flex"
                  animate={{ rotate: [0, 15, -10, 0], scale: [1, 1.15, 1] }}
                  transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Sparkles size={14} />
                </motion.span>
                סוכן התאמה אישי
              </WebButton>
            </div>

            {/* `>_ CLI` — desktop only (>= lg). Wrapped in a `hidden lg:block` div rather than
                putting `hidden` on the WebButton itself: WebButton hardcodes `inline-flex` in its
                base class, which fought `hidden` and let the pill leak into the mobile header.
                Directly LEFT of the personal-agent CTA (RTL: next in DOM); mirrors its pill shape
                via <WebButton variant="ghost"> with the CLI cyan/turquoise signature (#22d3ee). */}
            <div className="hidden lg:block">
              <WebButton
                variant="ghost"
                onClick={() => window.dispatchEvent(new CustomEvent('open-cli'))}
                aria-label="מצב טרמינל · CLI"
                className="font-mono !text-[#22d3ee] hover:!text-white !border-[#22d3ee]/40 hover:!border-[#22d3ee]/40 hover:bg-[#22d3ee]/10 !px-4 !py-2 !text-xs !font-semibold !transition-all !duration-300 shadow-[0_0_15px_rgba(34,211,238,0.14)] hover:shadow-[0_0_20px_rgba(34,211,238,0.4)]"
              >
                <SquareTerminal size={14} />
                {'>_ CLI'}
              </WebButton>
            </div>

            {/* Mobile quick-action — opens the personal-agent qualifier. Compact pill that sits to
                the side of the hamburger (which is pulled to the edge via -mr-2) so it never
                crowds the logo or the menu icon. */}
            <button
              type="button"
              onClick={openAgent}
              aria-label="פתיחת סוכן אישי"
              className={`lg:hidden inline-flex items-center gap-1.5 rounded-full border border-[#76B900]/40 bg-[#76B900]/10 px-3 py-1.5 text-xs font-semibold text-[#9FE870] whitespace-nowrap transition-colors hover:bg-[#76B900]/20 active:scale-95 ${FOCUS_SAFE_CLASS}`}
            >
              <Sparkles size={13} />
              סוכן אישי
            </button>

            <button className={`lg:hidden text-white z-50 p-2 -mr-2 rounded-lg ${FOCUS_SAFE_CLASS}`} onClick={() => setMobileOpen(!mobileOpen)} aria-label="תפריט">
              {mobileOpen ? <X size={28} /> : <Menu size={28} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile drawer — a fully self-contained h-dvh view with its own header (logo + close) and
          footer (social links), rather than relying on the real header row peeking through above
          it: that row's z-50 turned out to be trapped inside a nested stacking context (its parent
          has `will-change: transform, opacity`, which itself creates a stacking context per the
          CSS spec), so it was actually losing to this drawer's z-40 — the logo/close button were
          being visually covered despite the z-index numbers suggesting otherwise. Self-contained
          sidesteps that fragility entirely instead of chasing z-index further. */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DRAWER_EXIT_MS / 1000, ease: 'easeInOut' }}
            className="fixed inset-0 h-dvh w-full max-w-full overflow-x-hidden bg-black lg:hidden z-40 flex flex-col"
          >
            {/* Top: logo + close, pt-safe clears the notch/status bar */}
            <div className="shrink-0 flex items-center justify-between px-6 pt-safe pt-6 pb-4">
              <Logo iconClassName="h-9" textClassName="text-base hidden sm:inline" />
              <button
                onClick={() => setMobileOpen(false)}
                className={`text-white p-2 -mr-2 rounded-lg ${FOCUS_SAFE_CLASS}`}
                aria-label="סגירת תפריט"
              >
                <X size={28} />
              </button>
            </div>

            {/* Nav links: vertically centered in the remaining space. overflow-y-auto is a safety
                net for a very short viewport (e.g. landscape) — normally 8 links at this size fit
                a single dvh with no scrolling needed. */}
            <nav className="flex-1 min-h-0 overflow-y-auto momentum-scroll flex flex-col justify-center gap-1 px-6">
              {/* Personal-agent quick action, highlighted above the plain nav list. */}
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  window.setTimeout(openAgent, DRAWER_EXIT_MS);
                }}
                className={`mb-3 flex items-center justify-center gap-2 rounded-full bg-brand-500 py-3.5 font-display text-lg font-bold text-black shadow-[0_0_24px_rgba(118,185,0,0.25)] ${FOCUS_SAFE_CLASS}`}
              >
                <Sparkles size={18} />
                סוכן אישי · התאמה מיידית
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  window.setTimeout(() => window.dispatchEvent(new CustomEvent('open-cli')), DRAWER_EXIT_MS);
                }}
                className={`mb-4 flex items-center justify-center gap-2 rounded-full border border-[#22d3ee]/40 bg-[#22d3ee]/10 py-3 font-mono text-base font-semibold text-[#7dd3fc] transition-all active:scale-[0.98] hover:border-[#22d3ee]/70 hover:shadow-[0_0_18px_rgba(34,211,238,0.35)] ${FOCUS_SAFE_CLASS}`}
              >
                <SquareTerminal size={17} />
                {'>_ CLI · מצב טרמינל'}
              </button>
              {navLinks.map((link) =>
                link.action === 'contact' ? (
                  <button
                    key={link.name}
                    type="button"
                    onClick={() => {
                      setMobileOpen(false);
                      window.setTimeout(openContact, DRAWER_EXIT_MS);
                    }}
                    className={`text-right text-xl font-display font-medium text-white border-b border-white/10 py-3 ${FOCUS_SAFE_CLASS}`}
                  >
                    {link.name}
                  </button>
                ) : (
                  <Link
                    key={link.name}
                    to={link.to!}
                    onClick={(e) => handleMobileNavClick(e, link.to!)}
                    className={`text-xl font-display font-medium text-white border-b border-white/10 py-3 ${FOCUS_SAFE_CLASS}`}
                  >
                    {link.name}
                  </Link>
                )
              )}
            </nav>

            {/* Bottom: social links, anchored with safe-area clearance for the home indicator */}
            <div className="shrink-0 flex items-center justify-center gap-3 px-6 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] border-t border-white/10">
              <SocialLinks channels={[...HEADER_SOCIAL_CHANNELS]} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
