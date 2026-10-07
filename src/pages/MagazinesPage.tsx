import { Bell, ArrowLeft, Lock } from 'lucide-react';
import GlyphButton from '../components/ui/GlyphButton';
import SocialLinks from '../components/SocialLinks';
import SiteBot from '../components/bots/SiteBot';
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
 * The guides are file cards (2026-10-07), as on the homepage: the real file name and size, the
 * title, one line and the way in; the code-drawn 3D covers (GuideCover) stay on each guide's own
 * page, where the download happens after a free sign-in (2026-09-24).
 *
 * The opening is in the glyph world since 2026-10-07, in the homepage hero's own form: the page's
 * name is the first line, and "בקרוב" is not typeset by the browser but built by the field out of
 * the same characters as the noise around it, with a block caret after it, because the guides are
 * still being written. The old pill kicker, glowing headline, orbs, grid and floating chips are
 * gone. The floating chips were the live model catalog (ModelUpdateAgent), "the models we'll
 * explain"; that list now stands in a dotted frame on the open side, with one of the crew on it.
 * No sticky/pin (webview rule).
 */

/** The real files behind /g/<slug> (public/guides/*.pdf): 739,978 and 1,184,816 bytes. */
const GUIDE_META: Record<string, string> = {
  'ai-business-automations-2026': 'PDF · 740KB',
  'ai-learning-guide-2026': 'PDF · 1.2MB',
};

export default function MagazinesPage() {
  const { data: catalog } = useModelCatalog();
  const c = LEARN_AI_COPY;
  const models = (catalog?.frontier ?? []).slice(0, 4);
  const headline = useFieldHeadline();
  const quietLead = useFieldQuiet();
  const quietBody = useFieldQuiet();
  const quietDesk = useFieldQuiet();
  const quietFree = useFieldQuiet();

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
              </span>{' '}
              {/* The space keeps the accessible name "לומדים AI בקרוב" two words apart. */}
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
                <SocialLinks iconClassName="hdr-icon-btn hdr-icon-btn--framed" channels={['instagram', 'threads', 'tiktok', 'x', 'linkedin']} />
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
      {/* Each guide is the homepage's file card (StartBeat): the real file name and size, the title,
          one line, and the way in. The download is gated behind a free sign-in (GuideDownloadPage),
          and the card says so before the click, so the form is expected rather than a surprise. */}
      <section className="container-wide relative z-10" aria-labelledby="learn-free-title">
        <div ref={quietFree} className="max-w-3xl">
          <h2 id="learn-free-title" className="story-h2">
            {rtl(c.freeTitle)}
          </h2>
          <div className="mt-4 flex items-center gap-2" aria-hidden="true">
            <span className="story-statusbar__live" />
            <span className="h-px w-20 border-t border-dotted border-[var(--color-rule)]" />
          </div>
          <p className="story-body mt-5" data-live="rise">
            {rtl(c.freeSub)}
          </p>
        </div>
        <ul className="learn-guides" data-live="stagger">
          {CREATOR_GUIDES.map((g) => (
            <li key={g.slug}>
              <article className="glyph-frame file-card learn-guide">
                <header className="learn-guide__bar">
                  <bdi dir="ltr" className="truncate font-type">
                    {g.slug}.pdf
                  </bdi>
                  {GUIDE_META[g.slug] && (
                    <bdi dir="ltr" className="shrink-0 font-type">
                      {GUIDE_META[g.slug]}
                    </bdi>
                  )}
                </header>
                <div className="learn-guide__body">
                  <h3 className="poster learn-guide__title">{rtl(g.title)}</h3>
                  <p className="story-body mt-3 !text-[15px]">{rtl(g.blurb)}</p>
                  <div className="learn-guide__actions">
                    <GlyphButton variant="line" to={`/g/${g.slug}`}>
                      להורדה חינם
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    </GlyphButton>
                    <span className="learn-guide__gate">
                      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                      בהרשמה חינמית עם Google או אימייל
                    </span>
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
