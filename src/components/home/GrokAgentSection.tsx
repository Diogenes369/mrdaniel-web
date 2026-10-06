import { ArrowLeft } from 'lucide-react';
import GlyphButton from '../ui/GlyphButton';
import GrokDeckFrame from '../grok/GrokDeckFrame';
import { BotCrew } from '../bots/SiteBot';
import { GROK_COPY } from '../../data/siteCopy';
import { rtl } from '../../lib/rtl';
import { useFieldQuiet } from '../field/fieldState';

/**
 * Homepage: the Grok Bot deck right after the story, as the next thing to learn. The deck plays in
 * a frame on the page; the button goes to its own page (/grok), the same one the main menu opens.
 */
export default function GrokAgentSection() {
  const c = GROK_COPY;
  const quietText = useFieldQuiet();
  return (
    <section id="grok-agent" className="story-beat" aria-labelledby="grok-agent-title">
      <div className="container-wide">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-end">
          <div ref={quietText} className="lg:col-span-7">
            <p className="flex items-center gap-2.5 font-type text-[13px] text-ink-faint">
              <span className="story-statusbar__live" aria-hidden="true" />
              <bdi dir="ltr">{c.kicker}</bdi>
              <span aria-hidden="true">·</span>
              <span>{rtl(c.kickerTail)}</span>
            </p>
            <h2 id="grok-agent-title" className="story-h2 mt-4">
              {rtl(c.title)}
            </h2>
            <p className="story-body mt-6">{rtl(c.homeSub)}</p>
          </div>
          <div className="flex flex-col items-start gap-6 lg:col-span-5 lg:items-end">
            {/* The deck's cast, waiting by the door: the same bots the frame below is full of. */}
            <BotCrew size={50} lead={82} />
            <GlyphButton to="/grok">
              {rtl(c.open)}
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </GlyphButton>
          </div>
        </div>
        <GrokDeckFrame className="mt-12" />
      </div>
    </section>
  );
}
