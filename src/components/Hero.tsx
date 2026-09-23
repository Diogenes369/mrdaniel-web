import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Newspaper, ChevronLeft } from 'lucide-react';
import WebButton from './WebButton';
import SocialLinks from './SocialLinks';
import ArticleModal from './news/ArticleModal';
import { HERO_COPY, HERO_CONSOLE_COPY } from '../data/siteCopy';
import { useNewsFeed, formatRelativeTime, type NewsItem } from '../services/newsService';
import { rtl } from '../lib/rtl';

const HERO_ICON_CLASS =
  'w-10 h-10 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-zinc-300 hover:text-brand-400 hover:border-brand-500/40 transition-colors';

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Hero v2 (2026-09-23 redesign): a split first screen. The headline + CTAs keep the right-hand
 * column (RTL start); the left-hand column is a live "signal console" with the three newest
 * headlines from /api/news.
 *
 * Why the console: the page's promise is "AI news in real time", and the first screen used to
 * state that and show nothing. Three live, clickable, timestamped headlines prove it in the place
 * a visitor decides whether to scroll — and each one opens the same ArticleModal the ticker uses,
 * so a first click keeps the visitor on the site rather than sending them to the publisher.
 *
 * Mobile: one column, console under the CTAs and capped at three rows, so the headline and the
 * primary CTA still own the first viewport. No sticky/pin anywhere (webview rule, AGENTS.md).
 */
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
        <div className="mx-auto grid max-w-[1400px] items-center gap-12 px-4 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.1, ease: EASE }}
            className="text-center lg:text-right"
          >
            <h1 className="font-display text-fluid-hero font-black text-white mb-7 [text-shadow:0_2px_18px_rgba(0,0,0,0.85),0_6px_44px_rgba(0,0,0,0.75)]">
              {rtl(c.h1Lead)}
              <br />
              <span className="neon-text">{rtl(c.h1Accent)}</span>
            </h1>

            <p className="text-base md:text-xl text-zinc-300 font-light max-w-2xl mx-auto lg:mx-0 leading-relaxed mb-10 [text-shadow:0_2px_14px_rgba(0,0,0,0.9)]">
              {rtl(c.sub)}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
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
              className="mt-9 justify-center lg:justify-start"
              iconClassName={HERO_ICON_CLASS}
              channels={['instagram', 'threads', 'tiktok', 'x', 'linkedin']}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.1, delay: 0.25, ease: EASE }}
          >
            <SignalConsole />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

const CONSOLE_ROWS = 3;

function SignalConsole() {
  const navigate = useNavigate();
  const { data, isLoading } = useNewsFeed();
  const [active, setActive] = useState<NewsItem | null>(null);
  const k = HERO_CONSOLE_COPY;

  // Newest first; the feed is already Hebrew/AI-only and sanitised server-side (sanitizeAndKeep).
  const rows = useMemo(() => {
    const ts = (iso: string) => {
      const t = new Date(iso).getTime();
      return Number.isNaN(t) ? -Infinity : t;
    };
    return [...(data ?? [])].sort((a, b) => ts(b.publishedAt) - ts(a.publishedAt)).slice(0, CONSOLE_ROWS);
  }, [data]);

  return (
    <div className="signal-console glass-panel glass-panel--flagship relative overflow-hidden rounded-3xl" dir="rtl">
      {/* Terminal chrome: status dot + label + window dots. Purely decorative. */}
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-400" />
          </span>
          <span className="font-mono text-[11px] font-bold tracking-[0.2em] text-brand-300" dir="ltr">
            {k.label}
          </span>
        </div>
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-brand-500/60" />
        </div>
      </div>

      <div className="px-5 pb-5 pt-4">
        <h2 className="mb-3 font-display text-lg font-extrabold text-white">{rtl(k.title)}</h2>

        {isLoading ? (
          <ul className="space-y-3" aria-busy="true" aria-label={k.loading}>
            {Array.from({ length: CONSOLE_ROWS }, (_, i) => (
              <li key={i} className="space-y-2 rounded-2xl border border-white/[0.06] bg-black/25 p-4">
                <span className="block h-2.5 w-24 animate-pulse rounded bg-white/[0.08]" />
                <span className="block h-3.5 w-full animate-pulse rounded bg-white/[0.08]" />
                <span className="block h-3.5 w-2/3 animate-pulse rounded bg-white/[0.08]" />
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <p className="rounded-2xl border border-white/[0.06] bg-black/25 p-4 text-sm text-zinc-400">{rtl(k.empty)}</p>
        ) : (
          <ol className="space-y-2.5">
            {rows.map((item, i) => (
              <li key={item.id} className="signal-row" style={{ animationDelay: `${0.5 + i * 0.12}s` }}>
                <button
                  type="button"
                  onClick={() => setActive(item)}
                  className="group flex w-full items-start gap-3 rounded-2xl border border-white/[0.06] bg-black/25 p-4 text-right transition-colors hover:border-brand-500/40 hover:bg-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
                >
                  <span className="mt-0.5 font-mono text-[11px] font-bold text-brand-400/80" dir="ltr" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="mb-1 flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-500">
                      <span className="font-bold text-zinc-400">{item.source}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatRelativeTime(item.publishedAt)}</span>
                    </span>
                    <bdi dir="rtl" className="line-clamp-2 block text-[15px] font-semibold leading-snug text-zinc-100 group-hover:text-white">
                      {item.title}
                    </bdi>
                  </span>
                  <ChevronLeft className="mt-5 h-4 w-4 shrink-0 text-zinc-600 transition-transform group-hover:-translate-x-0.5 group-hover:text-brand-400" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
        )}

        <button
          type="button"
          onClick={() => navigate('/news')}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-brand-300 hover:text-brand-200 focus-visible:outline-none focus-visible:underline"
        >
          {rtl(k.cta)}
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Scan line: one slow sweep, CSS-only, disabled under reduced motion (index.css). */}
      <span className="signal-console__scan" aria-hidden="true" />

      <ArticleModal item={active} onClose={() => setActive(null)} />
    </div>
  );
}
