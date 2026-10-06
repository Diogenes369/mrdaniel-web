import GrokDeckFrame from '../components/grok/GrokDeckFrame';
import GrokGuide from '../components/grok/GrokGuide';
import { BotCrew } from '../components/bots/SiteBot';
import { GROK_COPY } from '../data/siteCopy';
import { rtl } from '../lib/rtl';
import { useFieldQuiet } from '../components/field/fieldState';

/**
 * /grok — "סוכן GROK": the live Grok Bot deck on its own page, opened from the main menu. The deck
 * (public/grok-deck) loads straight away here. Under it, the same story as a written guide for
 * people who would rather read (GrokGuide, copy in src/data/grokGuide.ts). No source line, by the
 * owner's decision (2026-10-06).
 */
export default function GrokAgentPage() {
  const c = GROK_COPY;
  const quietHead = useFieldQuiet();
  return (
    <div id="page-top" className="relative pb-24">
      <section className="relative pt-28 md:pt-36" aria-labelledby="grok-page-title">
        <div className="container-wide">
          <div className="grid grid-cols-1 items-end gap-8 lg:grid-cols-12 lg:gap-10">
            <header ref={quietHead} className="lg:col-span-8">
              <p className="flex items-center gap-2.5 font-type text-[13px] text-ink-faint" data-live="decode">
                <span className="story-statusbar__live" aria-hidden="true" />
                <bdi dir="ltr">{c.kicker}</bdi>
                <span aria-hidden="true">·</span>
                <span>{rtl(c.kickerTail)}</span>
              </p>
              <h1 id="grok-page-title" className="story-h2 mt-4">
                {rtl(c.title)}
              </h1>
              <p className="grok-page__lead mt-3" data-live="wipe">
                {rtl(c.lead)}
              </p>
              <p className="story-body mt-5" data-live="rise" data-live-delay="150">
                {rtl(c.sub)}
              </p>
            </header>
            {/* The deck's cast in the open side of the page, on the ground the frame stands on. */}
            <div className="flex lg:col-span-4 lg:justify-end">
              <BotCrew size={58} lead={104} />
            </div>
          </div>
          <div id="grok-deck">
            <GrokDeckFrame eager className="mt-10" />
          </div>
          <GrokGuide />
        </div>
      </section>
    </div>
  );
}
