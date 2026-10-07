import { Link } from 'react-router-dom';
import { Terminal, Workflow, Cpu, Network, Rocket, LayoutGrid, ArrowLeft, BookOpen } from 'lucide-react';
import { PageHero, SectionHeading, UnifiedCta } from '../components/content/ContentPrimitives';
import GlyphButton from '../components/ui/GlyphButton';
import SocialLinks from '../components/SocialLinks';
import { ABOUT_COPY } from '../data/siteCopy';
import { rtl } from '../lib/rtl';
import { useFieldQuiet } from '../components/field/fieldState';

/**
 * /about, in the glyph world since 2026-10-07 (it was the last page still built from glass panels).
 * The copy is unchanged except the learn-alone block, which pointed to a store that no longer
 * exists (/magazines has been the free guides and a coming-soon page since 2026-09-23) and opened
 * on a rhetorical question the brief bans. Each block takes the form its content has: the lede is
 * a line under a dotted rule, the story is prose under a site headline, the pillars are frame
 * cells, the site's services a directory in one frame, the quote a pull quote in the poster face.
 */

const PILLAR_ICONS = [Workflow, Cpu, Network, Rocket];

const HUB_LINKS = [
  { icon: Terminal, to: '/news', title: 'חדשות ומדריכי AI', description: 'מה חדש ב-AI כל יום, והסבר פשוט על המודלים החדשים' },
  { icon: Workflow, to: '/ai', title: 'סוכני AI', description: 'מה זה סוכן, מה צריך להכין ואיך בונים אותו יחד' },
  { icon: Rocket, to: '/jarvis', title: 'מערכת JARVIS', description: 'סוכן AI אוטונומי שמבצע משימות שלמות מפקודה קולית' },
  { icon: LayoutGrid, to: '/magazines', title: 'לומדים AI', description: 'מדריכים ומגזינים חדשים על AI, בקרוב' },
];

export default function AboutPage() {
  const quietStory = useFieldQuiet();
  const quietQuote = useFieldQuiet();

  return (
    <div id="page-top" className="min-h-screen pt-24 md:pt-28">
      <div className="container-wide">
        <PageHero title={rtl(ABOUT_COPY.title)} subtitle={rtl(ABOUT_COPY.subtitle)} />

        <p className="about-lede" data-live="wipe">
          {rtl(ABOUT_COPY.lede)}
        </p>

        {/* Who I am: prose under the site's headline voice, no panel around it. */}
        <section ref={quietStory} className="mb-20 max-w-3xl" aria-labelledby="about-story">
          <h2 id="about-story" className="story-h2">
            מי אני ומה אני בונה
          </h2>
          <div className="mt-4 flex items-center gap-2" aria-hidden="true">
            <span className="story-statusbar__live" />
            <span className="h-px w-20 border-t border-dotted border-[var(--color-rule)]" />
          </div>
          <div className="mt-6 space-y-5" data-live="stagger">
            {ABOUT_COPY.paras.map((para) => (
              <p key={para} className="story-body !max-w-none">
                {rtl(para)}
              </p>
            ))}
          </div>
        </section>

        <SectionHeading title="ארבעת עמודי התווך" description="מה אני בונה, למי, ואיפה לומדים את זה לבד" />
        {/* Four pillars: two by two, then four in a row, so no row is left with one cell. */}
        <ul className="mb-20 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-4" data-live="stagger">
          {ABOUT_COPY.pillars.map((pillar, i) => {
            const Icon = PILLAR_ICONS[i % PILLAR_ICONS.length];
            return (
              <li key={pillar.title} className="glyph-frame frame-cell frame-cell--stack">
                <span className="frame-cell__icon mb-4" aria-hidden="true">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="frame-cell__title">{rtl(pillar.title)}</h3>
                <p className="frame-cell__text">{rtl(pillar.description)}</p>
              </li>
            );
          })}
        </ul>

        {/* Everything on the site, as a directory in one frame. */}
        <nav className="glyph-frame about-hub mb-20" aria-labelledby="about-hub-title" data-live="frame">
          <p id="about-hub-title" className="about-hub__bar">
            <span className="story-statusbar__live" aria-hidden="true" />
            כל שירותי האתר במקום אחד
          </p>
          <ul className="about-hub__list">
            {HUB_LINKS.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="about-hub__row">
                  <span className="frame-cell__icon" aria-hidden="true">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="about-hub__title">{rtl(item.title)}</strong>
                    <span className="about-hub__text">{rtl(item.description)}</span>
                  </span>
                  <ArrowLeft className="about-hub__arrow h-4 w-4" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <figure ref={quietQuote} className="about-quote mb-20">
          <blockquote className="about-quote__text" data-live="wipe">
            {rtl(ABOUT_COPY.quote)}
          </blockquote>
          <figcaption className="about-quote__by">דניאל</figcaption>
        </figure>

        <div className="about-follow mb-20">
          <div className="min-w-0">
            <h2 className="about-follow__title headline-plain">עקבו אחרי הפעילות באופן שוטף</h2>
            <p className="about-follow__text">טיפים, עדכוני AI ומה שאני לומד תוך כדי עבודה, ישירות ברשתות או במייל.</p>
          </div>
          <SocialLinks iconClassName="hdr-icon-btn hdr-icon-btn--framed" glyphClassName="w-5 h-5" />
        </div>

        {/* Learning alone: the free guides on /magazines (it used to say "store", and there is none). */}
        <div className="glyph-frame about-learn mb-20" data-live="frame">
          <div className="min-w-0">
            <h2 className="about-follow__title headline-plain">ללמוד לבד, בקצב שלכם</h2>
            <p className="about-follow__text">מדריכים וחוברות על סוכני AI, צעד אחר צעד. דברים שאפשר לעשות, לא תיאוריה.</p>
          </div>
          <GlyphButton variant="line" to="/magazines">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            למדריכים
          </GlyphButton>
        </div>

        <SectionHeading title={rtl(ABOUT_COPY.ctaTitle)} description={rtl(ABOUT_COPY.ctaDescription)} />
        <UnifiedCta mailSubject="אפיון סוכן AI" whatsappMessage="שלום דניאל, אשמח לשיחת אפיון ראשונית על סוכן AI." />
      </div>
    </div>
  );
}
