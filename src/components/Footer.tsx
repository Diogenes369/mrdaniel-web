import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import type React from 'react';
import { Mail, Check, Copy } from 'lucide-react';
import SocialLinks from './SocialLinks';
import Logo from './Logo';
import { smoothScrollTo, scrollToTopSmooth } from '../hooks/useLenis';

const NAV_LINKS = [
  { name: 'אודות', to: '/about' },
  { name: 'AI', to: '/ai' },
  { name: 'סייבר', to: '/cyber' },
  { name: 'דיגיטל', to: '/digital' },
  { name: 'ארכיטקטורה', to: '/architecture' },
  { name: 'יכולות', to: '/capabilities' },
  { name: 'חנות', to: '/magazines' },
  { name: 'חדשות', to: '/news' },
];

const LEGAL_LINKS = [
  { name: 'מדיניות פרטיות', to: '/privacy' },
  { name: 'תנאי שימוש', to: '/terms' },
  { name: 'הצהרת נגישות', to: '/accessibility' },
];

const CONTACT_EMAIL = 'danihell3039@gmail.com';

const COLUMN_HEADING_CLASS = 'text-xs font-medium uppercase tracking-[0.15em] text-zinc-500 mb-4';

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
        className="flex items-center gap-2 text-sm font-normal text-zinc-300 hover:text-brand-400 transition-colors"
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
        className="relative flex items-center gap-1 text-xs font-normal text-zinc-500 hover:text-brand-400 transition-colors"
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
    <footer className="relative overflow-hidden border-t border-[#76B900]/20 bg-black py-8">
      <div className="footer-grid absolute inset-0 pointer-events-none" aria-hidden="true" />

      <div className="container-wide relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-8 mb-8">
          <div className="col-span-2 md:col-span-1">
            <Link to="/" onClick={handleLogoClick} className="inline-flex rounded-lg outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60">
              <Logo className="mb-3" iconClassName="h-7 md:h-9 drop-shadow-[0_0_8px_rgba(0,255,102,0.35)]" textClassName="text-sm md:text-base" />
            </Link>
            <p className="text-zinc-400 text-sm font-light leading-relaxed max-w-xs mb-3">
              ארכיטקטורת AI וסייבר ברמת Zero-Trust עבור ארגונים שדורשים חדשנות חסרת פשרות.
            </p>
            <div className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-400" />
              </span>
              מערכות אבטחה ו-AI פעילות 2026
            </div>
          </div>

          <div>
            <h3 className={COLUMN_HEADING_CLASS}>ניווט</h3>
            <ul className="flex flex-col gap-2 text-zinc-400 text-sm font-normal">
              {NAV_LINKS.map((link) => (
                <li key={link.name}>
                  <Link to={link.to} onClick={(e) => handleNavClick(e, link.to)} className="hover:text-brand-400 transition-colors">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className={COLUMN_HEADING_CLASS}>משפטי ואבטחה</h3>
            <ul className="flex flex-col gap-2 text-zinc-400 text-sm font-normal">
              {LEGAL_LINKS.map((link) => (
                <li key={link.name}>
                  <Link to={link.to} className="hover:text-brand-400 transition-colors">
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

        <div className="flex flex-col sm:flex-row items-center justify-between pt-6 border-t border-white/5 text-zinc-500 text-xs font-normal gap-4 text-center sm:text-right">
          <div dir="ltr" className="font-mono tracking-wide">
            © {new Date().getFullYear()} MR. DANIEL. ALL RIGHTS RESERVED.
          </div>
        </div>
      </div>
    </footer>
  );
}
