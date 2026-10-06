import { ArrowLeft } from 'lucide-react';
import GlyphButton from '../ui/GlyphButton';
import SiteBot from '../bots/SiteBot';
import { PROCESS_COPY } from '../../data/siteCopy';
import { rtl } from '../../lib/rtl';
import { useFieldQuiet } from '../field/fieldState';

/**
 * "How a working agent gets built": three stops on one dotted line (glyph world since 2026-10-06;
 * the 01/02/03 numbers were removed 2026-10-01, the brief bans sequential numbering). Order is the
 * line itself, read from the right: when the stops scroll in, they light one after another and a
 * small bot walks the line from the first to the last. On a phone the line runs down the reading
 * edge and the bot waits at the top. No pinning, no scroll-jacking.
 */
export default function ProcessSection() {
  const c = PROCESS_COPY;
  const quiet = useFieldQuiet();
  const openLead = () =>
    window.dispatchEvent(new CustomEvent('open-lead-modal', { detail: { subject: 'אפיון סוכן AI', sourceSection: 'Home · Process' } }));

  return (
    <section id="process" className="story-beat">
      <div className="container-wide">
        <div ref={quiet} className="max-w-3xl">
          <h2 className="story-h2">
            {rtl(c.lead)} <span className="text-brand-400">{rtl(c.accent)}</span>
          </h2>
          <p className="story-body mt-6" data-live="rise">
            {rtl(c.sub)}
          </p>
        </div>

        <div className="process-line mt-14 md:mt-20">
          <ol className="process-stops" data-live="stagger" data-live-delay="150">
            {c.steps.map((s) => (
              <li key={s.title} className="process-stop">
                <span className="process-stop__node" aria-hidden="true" />
                <h3 className="process-stop__title">{rtl(s.title)}</h3>
                <p className="process-stop__body">{rtl(s.body)}</p>
              </li>
            ))}
          </ol>
          <span className="process-walker" aria-hidden="true">
            <SiteBot shape="triangle" tone="fill" mood="focus" size={62} hop="tap" />
          </span>
        </div>

        <div className="mt-12 flex">
          <GlyphButton onClick={openLead}>
            {rtl(c.cta)}
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </GlyphButton>
        </div>
      </div>
    </section>
  );
}
