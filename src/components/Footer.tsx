import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import type React from 'react';
import { Mail, Check, Copy } from 'lucide-react';
import SocialLinks from './SocialLinks';
import Logo from './Logo';
import { BotCrew } from './bots/SiteBot';
import { smoothScrollTo, scrollToTopSmooth } from '../hooks/useLenis';
import { FOOTER_COPY } from '../data/siteCopy';
import { rtl } from '../lib/rtl';

const NAV_LINKS = [
  { name: 'אודות', to: '/about' },
  { name: 'AI', to: '/ai' },
  { name: 'מערכת JARVIS', to: '/jarvis' },
  { name: 'סוכן GROK', to: '/grok' },
  { name: 'לומדים AI', to: '/magazines' },
  { name: 'חדשות', to: '/news' },
];

const LEGAL_LINKS = [
  { name: 'מדיניות פרטיות', to: '/privacy' },
  { name: 'תנאי שימוש', to: '/terms' },
  { name: 'הצהרת נגישות', to: '/accessibility' },
];

const CONTACT_EMAIL = 'daniel@mrdaniel.co.il';

// Column headings are people's words (Hebrew), so proportional type — the mono face is kept for
// machine chrome like the copyright line.
const COLUMN_HEADING_CLASS = 'mb-4 font-sans text-[13px] font-bold text-ink-faint';
const LINK_CLASS = 'footer-link';

function CopyableEmail() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the mailto: link alongside still works.
    }
  };

  return (
    <div className="flex items-center gap-2">
      <a
        href={`mailto:${CONTACT_EMAIL}`}
        className="footer-link flex items-center gap-2 font-type text-[13px]"
        dir="ltr"
      >
        <Mail className="w-3.5 h-3.5 text-brand-400 shrink-0" />
        {CONTACT_EMAIL}
      </a>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="העתקת כתובת המייל"
        title="העתקת כתובת המייל"
        className="relative flex items-center gap-1 font-sans text-xs text-ink-faint transition-colors hover:text-brand-400"
      >
        {copied ? (
          <>
            <Check className="w-3 h-3" />
            הועתק!
          </>
        ) : (
          <Copy className="w-3 h-3" />
        )}
      </button>
    </div>
  );
}

export default function Footer() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavClick = (e: React.MouseEvent, to: string) => {
    if (!to.startsWith('/#')) return;
    const hash = to.slice(1);
    if (location.pathname === '/') {
      e.preventDefault();
      smoothScrollTo(hash);
    } else {
      e.preventDefault();
      navigate('/' + hash);
    }
  };

  // Same behavior as the header logo: already home → smooth-scroll to top; anywhere else → let
  // the Link navigate home normally (existing instant reset-to-top on route change applies).
  const handleLogoClick = (e: React.MouseEvent) => {
    if (location.pathname === '/') {
      e.preventDefault();
      scrollToTopSmooth();
    }
  };

  return (
    <footer className="relative z-[1] overflow-hidden border-t border-dotted border-[var(--color-rule)] bg-ground py-12">
      <div className="container-wide relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-8 mb-8">
          <div className="col-span-2 md:col-span-1">
            <Link to="/" onClick={handleLogoClick} className="inline-flex outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C8F46E]">
              <Logo className="mb-4" iconClassName="h-7 md:h-8" textClassName="text-sm md:text-base" />
            </Link>
            <p className="mb-4 max-w-xs font-sans text-[15px] leading-relaxed text-ink-muted">
              {rtl(FOOTER_COPY.tagline)}
            </p>
            <div className="inline-flex items-center gap-2 font-type text-xs text-ink-faint">
              <span className="story-statusbar__live" aria-hidden="true" />
              {rtl(FOOTER_COPY.status)}
            </div>
          </div>

          <div>
            <h3 className={COLUMN_HEADING_CLASS}>ניווט</h3>
            <ul className="flex flex-col gap-2.5">
              {NAV_LINKS.map((link) => (
                <li key={link.name}>
                  <Link to={link.to} onClick={(e) => handleNavClick(e, link.to)} className={LINK_CLASS}>
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className={COLUMN_HEADING_CLASS}>מידע משפטי</h3>
            <ul className="flex flex-col gap-2.5">
              {LEGAL_LINKS.map((link) => (
                <li key={link.name}>
                  <Link to={link.to} className={LINK_CLASS}>
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className={COLUMN_HEADING_CLASS}>קשר</h3>
            <div className="flex flex-col gap-3">
              <CopyableEmail />
              <SocialLinks />
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-5 border-t border-dotted border-[var(--color-rule)] pt-6 text-center text-xs text-ink-faint sm:flex-row sm:text-right">
          <div dir="ltr" className="font-type tracking-wide">
            © {new Date().getFullYear()} MR. DANIEL. ALL RIGHTS RESERVED.
          </div>
          {/* The crew sees you off: the Grok Bot deck's bots, waving from the last line. */}
          <BotCrew size={34} lead={52} />
        </div>
      </div>
    </footer>
  );
}
