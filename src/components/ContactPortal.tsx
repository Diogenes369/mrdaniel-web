import { ArrowLeft } from 'lucide-react';
import GlyphButton from './ui/GlyphButton';
import { CONTACT_COPY } from '../data/siteCopy';
import { rtl } from '../lib/rtl';
import { useFieldQuiet } from './field/fieldState';

/**
 * Site outro (rewritten 2026-10-01 for the glyph world): the closing headline in the headline face,
 * the plain promise under it, and one sharp button that opens the lead form. It replaced a round
 * dial-shaped button inside a rotating dashed ring — the redesign has no round controls.
 */
export default function ContactPortal() {
  const quiet = useFieldQuiet();
  const handleClick = () => {
    window.dispatchEvent(
      new CustomEvent('open-lead-modal', { detail: { subject: 'יצירת קשר', sourceSection: 'Contact Portal' } })
    );
  };

  return (
    <section id="contact-portal" className="relative py-32 md:py-48">
      <div className="container-wide">
        <div ref={quiet} className="max-w-3xl">
          <h2 className="story-h2">{rtl(CONTACT_COPY.headline)}</h2>
          <p className="story-body mt-6">{rtl(CONTACT_COPY.sub)}</p>
          <div className="mt-10">
            <GlyphButton onClick={handleClick} aria-label="פתיחת טופס יצירת קשר">
              בואו נדבר
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </GlyphButton>
          </div>
        </div>
      </div>
    </section>
  );
}
