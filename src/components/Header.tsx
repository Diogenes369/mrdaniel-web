import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, type Transition } from 'motion/react';
import { panelMotion } from '../lib/modalMotion';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, Shuffle, Search, ListChecks, SquareTerminal, Ellipsis } from 'lucide-react';
import GlyphButton from './ui/GlyphButton';
import SocialLinks from './SocialLinks';
import Logo from './Logo';
import SiteBot from './bots/SiteBot';
import { smoothScrollTo, scrollToTopSmooth } from '../hooks/useLenis';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useFieldQuiet } from './field/fieldState';

/**
 * The site's header, in the glyph world since 2026-10-07: one line of chrome over the field.
 *
 * At the top level only what a visitor reaches for: the logo, the sections, search and the one
 * action (the personal-agent qualifier). Everything else the old toolbar carried (a random page,
 * the terminal mode, the social links) lives one click away in the "more" panel, so the row stays
 * calm. A Field Green bar under the links is the cursor: it springs to the link under the pointer
 * and settles back under the page you are on.
 *
 * The header steps out of the way while you read down and comes back the moment you scroll up
 * (never while the menu, the panel or a keyboard focus is inside it). It is fixed, not sticky, so
 * Instagram and Facebook webviews are fine with it.
 */

// TikTok and WhatsApp stay exclusive to the footer and the bottom-of-page social bar.
const HEADER_SOCIAL_CHANNELS = ['instagram', 'linkedin', 'mail'] as const;

// "צור קשר" is an action, not a route: it opens the lead modal (the site's contact funnel).
type NavLink = { name: string; to?: string; action?: 'contact' };
const navLinks: NavLink[] = [
  { name: 'סוכני AI', to: '/ai' },
  { name: 'מערכת JARVIS', to: '/jarvis' },
  // Added 2026-10-06: the live Grok Bot deck (public/grok-deck) on its own page.
  { name: 'סוכן GROK', to: '/grok' },
  { name: 'לומדים AI', to: '/magazines' },
  // Restored 2026-09-27 at Daniel's request: /news is the full live feed, and the ticker is
  // desktop-only, so phones need a visible way in.
  { name: 'חדשות', to: '/news' },
  { name: 'דברו איתי', action: 'contact' },
];

// "Surprise me" destinations, now in the more panel and the mobile menu.
const SHUFFLE_DESTINATIONS = ['/magazines', '/ai', '/jarvis', '/grok', '/about', '/news'];

// How long the mobile menu's exit takes: a nav tap navigates only after it has closed, so the
// incoming page never fades in under a menu that is still fading out.
const DRAWER_EXIT_MS = 280;

const CARET: Transition = { type: 'spring', stiffness: 520, damping: 38, mass: 0.7 };
const SLIDE: Transition = { type: 'spring', stiffness: 380, damping: 40, mass: 0.8 };

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function isCurrent(pathname: string, to?: string) {
  return !!to && (pathname === to || pathname.startsWith(to + '/'));
}

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // The live ticker (NewsTicker.tsx) sits above the header in normal flow, desktop only. The
  // header is fixed and glues its own top to the ticker's bottom edge (top = tickerHeight - scrollY,
  // clamped at 0), so the ticker scrolls away and only the header row stays.
  const [tickerOffset, setTickerOffset] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const headerRef = useRef<HTMLElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const morePanelRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const lock = useRef(false);
  lock.current = mobileOpen || moreOpen;

  useEffect(() => {
    const bar = document.getElementById('news-ticker-bar');
    let barHeight = bar?.offsetHeight ?? 0;
    let lastY = window.scrollY;

    const apply = () => {
      const y = window.scrollY;
      setScrolled(y > 24);
      setTickerOffset(Math.max(0, barHeight - y));
      const dy = y - lastY;
      if (Math.abs(dy) < 6) return;
      lastY = y;
      // Away while reading down, back on the first scroll up. A focus inside the header (keyboard
      // users tabbing through it) or an open menu keeps it in place.
      const focusInside = !!headerRef.current?.contains(document.activeElement);
      setHidden(dy > 0 && y > 360 && !lock.current && !focusInside);
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

  // A new page starts with the header in view and every panel closed.
  useEffect(() => {
    setHidden(false);
    setMoreOpen(false);
  }, [location.pathname]);

  const openAgent = () => window.dispatchEvent(new CustomEvent('open-agent-qualifier'));
  const openPalette = () => window.dispatchEvent(new CustomEvent('open-command-palette'));
  const openCli = () => window.dispatchEvent(new CustomEvent('open-cli'));
  const openContact = () =>
    window.dispatchEvent(new CustomEvent('open-lead-modal', { detail: { subject: 'יצירת קשר', sourceSection: 'Navbar' } }));

  // Already home → smooth-scroll to top (a <Link to="/"> does nothing when the path is the same).
  const handleLogoClick = (e: React.MouseEvent) => {
    if (location.pathname === '/') {
      e.preventDefault();
      scrollToTopSmooth();
    }
  };

  const goTo = useCallback(
    (to: string) => {
      if (to.startsWith('/#')) {
        const hash = to.slice(1);
        if (location.pathname === '/') smoothScrollTo(hash);
        else navigate('/' + hash);
      } else {
        navigate(to);
      }
    },
    [location.pathname, navigate]
  );

  const handleNavClick = (e: React.MouseEvent, to: string) => {
    if (!to.startsWith('/#')) return;
    e.preventDefault();
    goTo(to);
  };

  const shuffle = () => goTo(SHUFFLE_DESTINATIONS[Math.floor(Math.random() * SHUFFLE_DESTINATIONS.length)]);

  // Closes the menu first and acts only after its exit has finished (see DRAWER_EXIT_MS).
  const afterDrawer = (fn: () => void) => {
    setMobileOpen(false);
    window.setTimeout(fn, DRAWER_EXIT_MS);
  };

  useBodyScrollLock(mobileOpen);
  // The glyph field steps back behind the nav row so its words never run through the links.
  const quietBar = useFieldQuiet();

  // ── the cursor under the links ────────────────────────────────────────────────────────────────
  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const activeKey = navLinks.find((l) => isCurrent(location.pathname, l.to))?.name ?? null;
  const targetKey = hoverKey ?? activeKey;
  const [caret, setCaret] = useState<{ x: number; w: number } | null>(null);
  const measure = useCallback(() => {
    const el = targetKey ? itemRefs.current.get(targetKey) : null;
    setCaret(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
  }, [targetKey]);
  useLayoutEffect(measure, [measure, scrolled]);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(nav);
    document.fonts?.ready.then(() => measure());
    return () => ro.disconnect();
  }, [measure]);

  // ── the more panel ────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (morePanelRef.current?.contains(t) || moreBtnRef.current?.contains(t)) return;
      setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMoreOpen(false);
      moreBtnRef.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  const fromMore = (fn: () => void) => () => {
    setMoreOpen(false);
    fn();
  };

  return (
    <motion.header
      ref={headerRef}
      initial={{ y: -90 }}
      animate={{ y: hidden ? '-115%' : 0 }}
      transition={SLIDE}
      className={`site-header ${scrolled ? 'is-scrolled' : ''}`}
      style={{ top: tickerOffset }}
    >
      <div ref={quietBar} className="container-wide site-header__row">
        <Link to="/" onClick={handleLogoClick} className="site-header__logo" aria-label="MR. DANIEL, לעמוד הבית">
          <Logo iconClassName={scrolled ? 'h-7 md:h-8' : 'h-8 md:h-10'} textClassName="text-base md:text-lg" />
        </Link>

        <nav ref={navRef} className="site-nav" aria-label="ניווט ראשי" onMouseLeave={() => setHoverKey(null)}>
          {navLinks.map((link) => {
            const common = {
              ref: (el: HTMLElement | null) => {
                if (el) itemRefs.current.set(link.name, el);
                else itemRefs.current.delete(link.name);
              },
              onMouseEnter: () => setHoverKey(link.name),
              onFocus: () => setHoverKey(link.name),
              onBlur: () => setHoverKey(null),
              className: 'nav-link',
            };
            return link.action === 'contact' ? (
              <button key={link.name} type="button" onClick={openContact} {...common}>
                {link.name}
              </button>
            ) : (
              <Link
                key={link.name}
                to={link.to!}
                onClick={(e) => handleNavClick(e, link.to!)}
                aria-current={isCurrent(location.pathname, link.to) ? 'page' : undefined}
                {...common}
              >
                {link.name}
              </Link>
            );
          })}
          <motion.span
            className="site-nav__caret"
            aria-hidden="true"
            initial={false}
            animate={caret ? { x: caret.x, width: caret.w, opacity: 1 } : { opacity: 0 }}
            transition={CARET}
          />
        </nav>

        <div className="site-header__tools">
          <button type="button" className="hdr-search" onClick={openPalette} aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}>
            <Search size={15} aria-hidden="true" />
            <span className="hdr-search__label">חיפוש</span>
            <kbd className="hdr-search__kbd" dir="ltr">
              {isMac ? '⌘K' : 'Ctrl K'}
            </kbd>
          </button>

          <div className="hdr-more">
            <button
              ref={moreBtnRef}
              type="button"
              className="hdr-icon-btn"
              aria-label="עוד"
              aria-expanded={moreOpen}
              aria-controls="header-more"
              onClick={() => setMoreOpen((v) => !v)}
            >
              <Ellipsis size={18} aria-hidden="true" />
            </button>
            <AnimatePresence>
              {moreOpen && (
                <motion.div
                  ref={morePanelRef}
                  id="header-more"
                  className="hdr-more__panel"
                  initial={{ opacity: 0, y: -6, clipPath: 'inset(0 0 100% 0)' }}
                  animate={{ opacity: 1, y: 0, clipPath: 'inset(-12px -12px -12px -12px)', transition: { default: CARET, clipPath: { duration: 0.32, ease: [0.16, 1, 0.3, 1] } } }}
                  exit={{ opacity: 0, y: -4, transition: { duration: 0.14 } }}
                >
                  <button type="button" className="hdr-more__row" onClick={fromMore(shuffle)}>
                    <Shuffle size={16} aria-hidden="true" />
                    <span>עמוד אקראי</span>
                    <span className="hdr-more__hint">הפתעה</span>
                  </button>
                  <button type="button" className="hdr-more__row" onClick={fromMore(openCli)}>
                    <SquareTerminal size={16} aria-hidden="true" />
                    <span>מצב טרמינל</span>
                    <span className="hdr-more__hint" dir="ltr">
                      {'>_ CLI'}
                    </span>
                  </button>
                  <div className="hdr-more__social">
                    <span>עוקבים</span>
                    <SocialLinks iconClassName="hdr-icon-btn" channels={[...HEADER_SOCIAL_CHANNELS]} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="site-header__action">
            <GlyphButton variant="line" onClick={openAgent} className="glyph-btn--compact">
              <ListChecks size={15} aria-hidden="true" />
              {/* One label everywhere; narrower bars carry its first two words. */}
              <span className="hidden xl:inline">סוכן התאמה אישי</span>
              <span className="xl:hidden">סוכן התאמה</span>
            </GlyphButton>
          </div>

          <button
            ref={menuBtnRef}
            type="button"
            className="hdr-icon-btn site-header__menu"
            onClick={() => setMobileOpen(true)}
            aria-label="פתיחת התפריט"
            aria-expanded={mobileOpen}
          >
            <Menu size={24} aria-hidden="true" />
          </button>
        </div>
      </div>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {mobileOpen && (
              <MobileMenu
                pathname={location.pathname}
                onClose={() => {
                  setMobileOpen(false);
                  window.setTimeout(() => menuBtnRef.current?.focus(), DRAWER_EXIT_MS);
                }}
                onNavigate={(to) => afterDrawer(() => goTo(to))}
                onContact={() => afterDrawer(openContact)}
                onAgent={() => afterDrawer(openAgent)}
                onSearch={() => afterDrawer(openPalette)}
                onShuffle={() => afterDrawer(shuffle)}
                onCli={() => afterDrawer(openCli)}
              />
            )}
          </AnimatePresence>,
          document.body
        )}
    </motion.header>
  );
}

const list = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.045, delayChildren: 0.12 } },
};
const item = {
  hidden: { opacity: 0, x: 28 },
  shown: { opacity: 1, x: 0, transition: { type: 'spring' as const, stiffness: 420, damping: 34 } },
};

/**
 * The phone and tablet menu: a full screen of its own, portalled to <body> so no transformed or
 * stacking ancestor can trap it. The sections are set large in the poster face and arrive one
 * after another from the reading start; the page you are on carries the caret.
 */
function MobileMenu({
  pathname,
  onClose,
  onNavigate,
  onContact,
  onAgent,
  onSearch,
  onShuffle,
  onCli,
}: {
  pathname: string;
  onClose: () => void;
  onNavigate: (to: string) => void;
  onContact: () => void;
  onAgent: () => void;
  onSearch: () => void;
  onShuffle: () => void;
  onCli: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div {...panelMotion} className="mobile-menu" role="dialog" aria-modal="true" aria-label="תפריט" dir="rtl">
      <div className="mobile-menu__top">
        <Logo iconClassName="h-8" textClassName="text-base" />
        <button ref={closeRef} type="button" className="hdr-icon-btn" onClick={onClose} aria-label="סגירת התפריט">
          <X size={24} aria-hidden="true" />
        </button>
      </div>

      <button type="button" className="mobile-menu__search" onClick={onSearch}>
        <Search size={17} aria-hidden="true" />
        <span>חיפוש באתר</span>
      </button>

      <motion.nav className="mobile-menu__nav" aria-label="ניווט ראשי" variants={list} initial="hidden" animate="shown">
        {navLinks.map((link) => {
          const current = isCurrent(pathname, link.to);
          return (
            <motion.div key={link.name} variants={item}>
              {link.action === 'contact' ? (
                <button type="button" className="mobile-menu__link" onClick={onContact}>
                  {link.name}
                </button>
              ) : (
                <a
                  href={link.to}
                  className="mobile-menu__link"
                  aria-current={current ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(link.to!);
                  }}
                >
                  {link.name}
                  {current && <span className="mobile-menu__caret" aria-hidden="true" />}
                </a>
              )}
            </motion.div>
          );
        })}
      </motion.nav>

      <div className="mobile-menu__foot">
        <GlyphButton variant="primary" onClick={onAgent} className="w-full">
          <ListChecks size={17} aria-hidden="true" />
          סוכן התאמה אישי
        </GlyphButton>
        <div className="mobile-menu__utils">
          <button type="button" className="mobile-menu__util" onClick={onShuffle}>
            <Shuffle size={15} aria-hidden="true" />
            עמוד אקראי
          </button>
          <button type="button" className="mobile-menu__util" onClick={onCli}>
            <SquareTerminal size={15} aria-hidden="true" />
            מצב טרמינל
          </button>
        </div>
        <div className="mobile-menu__social">
          <SocialLinks iconClassName="hdr-icon-btn" channels={[...HEADER_SOCIAL_CHANNELS]} />
          <SiteBot shape="circle" tone="hi" mood="happy" size={46} hop="view" hopDelay={420} />
        </div>
      </div>
    </motion.div>
  );
}
