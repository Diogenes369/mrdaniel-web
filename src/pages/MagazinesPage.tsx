import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Bell, BookOpen, ArrowLeft, Sparkles } from 'lucide-react';
import WebButton from '../components/WebButton';
import SocialLinks from '../components/SocialLinks';
import { LEARN_AI_COPY } from '../data/siteCopy';
import { CREATOR_GUIDES } from '../data/creatorContent';
import { useModelCatalog } from '../services/modelCatalogService';
import { rtl } from '../lib/rtl';

/**
 * /magazines — "לומדים AI" (renamed in the nav 2026-09-23). A single, deliberately oversized
 * "coming soon" screen while the new guides and magazines are written; the old paid-guide store
 * that lived here is in git history (commit before 2026-09-23) and the ready-made agents moved to
 * /ai.
 *
 * Three things keep it from being a dead end: a "notify me" CTA (the site's lead modal, tagged so
 * the dashboard can filter these), the two free guides that already exist, and the social links.
 * The floating chips are the live model catalog (ModelUpdateAgent) — "the models we'll explain" —
 * so even the placeholder page stays current.
 *
 * Motion: CSS-only drift on the backdrop orbs and chips (`.learn-*` in index.css), switched off
 * under reduced motion. No sticky/pin (webview rule).
 */
const EASE = [0.16, 1, 0.3, 1] as const;

export default function MagazinesPage() {
  const navigate = useNavigate();
  const { data: catalog } = useModelCatalog();
  const c = LEARN_AI_COPY;
  const chips = (catalog?.frontier ?? []).slice(0, 4);

  const notify = () =>
    window.dispatchEvent(
      new CustomEvent('open-lead-modal', { detail: { subject: 'עדכנו אותי: מדריכים ומגזינים חדשים', sourceSection: 'Learn AI · Coming Soon' } })
    );

  return (
    <div id="page-top" className="relative min-h-screen pb-24">
      {/* ── Hero: fills the first screen ─────────────────────────────────────────────────── */}
      <section className="learn-hero relative flex min-h-[100dvh] items-center overflow-hidden pt-28 pb-16" dir="rtl">
        <span className="learn-orb learn-orb--a" aria-hidden="true" />
        <span className="learn-orb learn-orb--b" aria-hidden="true" />
        <span className="learn-orb learn-orb--c" aria-hidden="true" />
        <div className="learn-grid" aria-hidden="true" />

        {/* The models the guides will explain — live, from the sync agent. Decorative on desktop. */}
        <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden="true">
          {chips.map((m, i) => (
            <span key={m.id} className={`learn-chip learn-chip--${i}`}>
              <bdi dir="ltr">{m.name}</bdi>
            </span>
          ))}
        </div>

        <div className="container-wide relative z-10 text-center">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-500/40 bg-brand-500/10 px-4 py-1.5 text-sm font-bold text-brand-300"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {c.kicker}
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 1.2, ease: EASE }}
            className="learn-headline font-display font-black leading-none text-white"
          >
            <span className="neon-text">{c.headline}</span>
            <span className="learn-dots" aria-hidden="true">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.25, ease: EASE }}
            className="mx-auto mt-8 max-w-3xl font-display text-2xl font-extrabold leading-snug text-white md:text-4xl [text-shadow:0_2px_18px_rgba(0,0,0,0.85)]"
          >
            {rtl(c.sub)}
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.4, ease: EASE }}
            className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-zinc-300 md:text-xl [text-shadow:0_2px_14px_rgba(0,0,0,0.9)]"
          >
            {rtl(c.body)}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.55, ease: EASE }}
            className="mt-10 flex flex-col items-center gap-6"
          >
            <WebButton variant="primary" magnetic onClick={notify} className="cta-sheen !px-9">
              <Bell className="h-5 w-5" />
              {c.notifyCta}
            </WebButton>
            <div className="flex flex-col items-center gap-3">
              <span className="text-sm text-zinc-500">{c.followCta}</span>
              <SocialLinks
                className="justify-center"
                iconClassName="w-10 h-10 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-zinc-300 hover:text-brand-400 hover:border-brand-500/40 transition-colors"
                channels={['instagram', 'threads', 'tiktok', 'x', 'linkedin']}
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Meanwhile: the free guides that already exist ─────────────────────────────────── */}
      <section className="container-wide relative z-10" dir="rtl" aria-labelledby="learn-free-title">
        <div className="mx-auto mb-8 max-w-3xl text-center">
          <h2 id="learn-free-title" className="font-display text-2xl font-black text-white md:text-3xl">
            {rtl(c.freeTitle)}
          </h2>
          <p className="mt-2 text-zinc-400">{rtl(c.freeSub)}</p>
        </div>
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-5 md:grid-cols-2">
          {CREATOR_GUIDES.map((g) => (
            <button
              key={g.slug}
              type="button"
              onClick={() => navigate(`/g/${g.slug}`)}
              className="glass-panel glass-panel--marketing group flex h-full flex-col items-start rounded-2xl p-6 text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
            >
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-black/40 text-brand-400">
                <BookOpen className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mb-2 font-display text-lg font-bold text-white">{rtl(g.title)}</h3>
              <p className="mb-5 flex-grow text-zinc-400">{rtl(g.blurb)}</p>
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-300 group-hover:text-brand-200">
                להורדה חינם
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
