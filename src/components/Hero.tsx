import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Newspaper } from 'lucide-react';
import WebButton from './WebButton';
import SocialLinks from './SocialLinks';
import { HERO_COPY } from '../data/siteCopy';
import { rtl } from '../lib/rtl';

const HERO_ICON_CLASS =
  'w-10 h-10 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-zinc-300 hover:text-brand-400 hover:border-brand-500/40 transition-colors';

export default function Hero() {
  const navigate = useNavigate();
  const c = HERO_COPY;

  const handleCtaClick = (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('open-lead-modal', { detail: { subject: 'אפיון סוכן AI', sourceSection: 'Hero CTA' } }));
  };

  return (
    <section id="hero" className="relative min-h-[100dvh] flex items-center pt-28 pb-16 overflow-hidden">
      <div className="hero-grid" aria-hidden="true" />
      <div className="container-wide relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-5xl mx-auto text-center px-4"
        >
          <span className="glass-chip mb-7">
            <span className="glass-chip__dot" aria-hidden="true" />
            {rtl(c.eyebrow)}
          </span>

          <h1 className="font-display text-fluid-hero font-black text-white mb-7 [text-shadow:0_2px_18px_rgba(0,0,0,0.85),0_6px_44px_rgba(0,0,0,0.75)]">
            {rtl(c.h1Lead)}
            <br />
            <span className="neon-text">{rtl(c.h1Accent)}</span>
          </h1>

          <p className="text-base md:text-xl text-zinc-300 font-light max-w-2xl mx-auto leading-relaxed mb-10 [text-shadow:0_2px_14px_rgba(0,0,0,0.9)]">
            {rtl(c.sub)}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <WebButton variant="primary" magnetic onClick={handleCtaClick} className="cta-sheen w-full sm:w-auto !px-8">
              {rtl(c.ctaPrimary)}
              <ArrowLeft className="w-5 h-5" />
            </WebButton>
            <WebButton variant="ghost" onClick={() => navigate('/news')} className="w-full sm:w-auto !px-7 bg-black/30">
              <Newspaper className="w-4 h-4 text-brand-400" />
              {rtl(c.ctaSecondary)}
            </WebButton>
          </div>

          <SocialLinks
            className="mt-9 justify-center"
            iconClassName={HERO_ICON_CLASS}
            channels={['instagram', 'threads', 'tiktok', 'x', 'linkedin']}
          />
        </motion.div>
      </div>
    </section>
  );
}
