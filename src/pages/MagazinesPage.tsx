import { useNavigate } from 'react-router-dom';
import { Bell, ArrowLeft, Lock } from 'lucide-react';
import GlyphButton from '../components/ui/GlyphButton';
import SocialLinks from '../components/SocialLinks';
import SiteBot from '../components/bots/SiteBot';
import GuideCover from '../components/guides/GuideCover';
import { LEARN_AI_COPY } from '../data/siteCopy';
import { CREATOR_GUIDES } from '../data/creatorContent';
import { useModelCatalog } from '../services/modelCatalogService';
import { useFieldHeadline, useFieldQuiet } from '../components/field/fieldState';
import { rtl } from '../lib/rtl';

/**
 * /magazines — "לומדים AI" (renamed in the nav 2026-09-23). A "coming soon" screen while the new
 * guides and magazines are written; the old paid-guide store that lived here is in git history
 * (commit before 2026-09-23) and the ready-made agents moved to /ai.
 *
 * Three things keep it from being a dead end: a "notify me" CTA (the site's lead modal, tagged so
 * the dashboard can filter these), the two free guides that already exist, and the social links.
 * The guide cards carry code-drawn 3D covers (GuideCover); the download itself asks for a free
 * sign-in on the guide page (2026-09-24).
 *
 * The opening is in the glyph world since 2026-10-07, in the homepage hero's own form: the page's
 * name is the first line, and "בקרוב" is not typeset by the browser but built by the field out of
 * the same characters as the noise around it, with a block caret after it, because the guides are
 * still being written. The old pill kicker, glowing headline, orbs, grid and floating chips are
 * gone. The floating chips were the live model catalog (ModelUpdateAgent), "the models we'll
 * explain"; that list now stands in a dotted frame on the open side, with one of the crew on it.
 * No sticky/pin (webview rule).
 */
export default function MagazinesPage() {
  const navigate = useNavigate();
  const { data: catalog } = useModelCatalog();
  const c = LEARN_AI_COPY;
  const models = (catalog?.frontier ?? []).slice(0, 4);
  const headline = useFieldHeadline();
  const quietLead = useFieldQuiet();
  const quietBody = useFieldQuiet();
  const quietDesk = useFieldQuiet();

  const notify = () =>
    window.dispatchEvent(
      new CustomEvent('open-lead-modal', { detail: { subject: 'עדכנו אותי: מדריכים ומגזינים חדשים', sourceSection: 'Learn AI · Coming Soon' } })
    );

  return (
    <div id="page-top" className="relative min-h-screen pb-24">
      {/* ── Hero: fills the first screen ─────────────────────────────────────────────────── */}
      <section className="learn-hero" aria-labelledby="learn-title">
        <div className="container-wide learn-hero__grid">
          <div className="learn-hero__copy">
            <h1 id="learn-title" className="story-h1">
              <span ref={quietLead} className="story-h1__lead">
                {rtl(c.kicker)}
              </span>
              <span className="learn-hero__line">
                <span ref={headline} className="glyph-accent">
                  {c.headline}
                </span>
                <span className="learn-hero__caret" aria-hidden="true" />
              </span>
            </h1>

            <div ref={quietBody} className="learn-hero__body">
              <p className="learn-hero__sub" data-live="wipe">
                {rtl(c.sub)}
              </p>
              <p className="story-body mt-4" data-live="rise" data-live-delay="120">
                {rtl(c.body)}
              </p>
              <div className="mt-9" data-live="rise" data-live-delay="200">
                <GlyphButton onClick={notify}>
                  <Bell className="h-4 w-4" aria-hidden="true" />
                  {c.notifyCta}
                </GlyphButton>
              </div>
              <div className="learn-hero__follow" data-live="rise" data-live-delay="280">
                <span>{c.followCta}</span>
                <SocialLinks iconClassName="hdr-icon-btn learn-hero__social" channels={['instagram', 'threads', 'tiktok', 'x', 'linkedin']} />
              </div>
            </div>
          </div>

          {/* The models the guides will explain — live, from the sync agent. Desktop only: on a
              phone the promise and the button are the whole first screen. */}
          {models.length > 0 && (
            <aside ref={quietDesk} className="learn-desk" aria-labelledby="learn-desk-title">
              <SiteBot shape="square" tone="hi" mood="focus" size={92} className="learn-desk__bot" />
              <div className="glyph-frame" data-live="frame">
                <p id="learn-desk-title" className="learn-desk__bar">
                  <span className="story-statusbar__live" aria-hidden="true" />
                  המודלים שנסביר
                </p>
                <ul className="learn-desk__list" data-live="stagger" data-live-delay="300">
                  {models.map((m) => (
                    <li key={m.id}>
                      <span className="learn-desk__vendor">{m.vendor}</span>
                      <bdi dir="ltr" className="learn-desk__name">
                        {m.name}
                      </bdi>
                    </li>
                  ))}
                </ul>
                <p className="learn-desk__note">הרשימה מתעדכנת לבד כשיוצא מודל חדש.</p>
              </div>
            </aside>
          )}
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
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-5 md:grid-cols-2" data-live="stagger">
          {CREATOR_GUIDES.map((g) => (
            <button
              key={g.slug}
              type="button"
              onClick={() => navigate(`/g/${g.slug}`)}
              className="glass-panel glass-panel--marketing group flex h-full flex-col items-start rounded-2xl p-6 text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
            >
              {/* Code-drawn cover (GuideCover), not an image — see the component for why. */}
              <GuideCover slug={g.slug} title={g.title} style={g.cover} className="mx-auto mb-2 max-w-[17rem]" />
              <h3 className="mb-2 font-display text-lg font-bold text-white">{rtl(g.title)}</h3>
              <p className="mb-5 flex-grow text-zinc-400">{rtl(g.blurb)}</p>
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-300 group-hover:text-brand-200">
                להורדה חינם
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </span>
              {/* The download is gated behind a free sign-in (GuideDownloadPage) — say so before the
                  click, so the modal is expected rather than a bait-and-switch. */}
              <span className="mt-2 inline-flex items-center gap-1 text-xs text-zinc-500">
                <Lock className="h-3 w-3" aria-hidden="true" />
                בהרשמה חינמית עם Google או אימייל
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
