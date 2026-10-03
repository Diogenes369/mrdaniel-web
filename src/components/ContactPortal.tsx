import ContactInlineForm from './ContactInlineForm';
import { CONTACT_COPY } from '../data/siteCopy';
import { rtl } from '../lib/rtl';
import { useFieldQuiet } from './field/fieldState';

/**
 * Site outro (rewritten 2026-10-01 for the glyph world): the closing headline in the headline face
 * and the plain promise under it. Since 2026-10-03 the lead form sits open beside them (under them
 * on phones) instead of behind a "בואו נדבר" button — a visitor who reached the end of the story has
 * already decided; one more click to see a form was a step for nothing. The header's contact button
 * still opens the modal (LeadForm.tsx) from anywhere else on the site.
 */
export default function ContactPortal() {
  const quietText = useFieldQuiet();
  const quietForm = useFieldQuiet();

  return (
    <section id="contact-portal" className="relative py-32 md:py-48">
      <div className="container-wide">
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-12 lg:gap-14">
          <div ref={quietText} className="lg:col-span-5 lg:pt-10">
            <h2 className="story-h2">{rtl(CONTACT_COPY.headline)}</h2>
            <p className="story-body mt-6">{rtl(CONTACT_COPY.sub)}</p>
          </div>
          <div ref={quietForm} className="min-w-0 lg:col-span-7">
            <ContactInlineForm />
          </div>
        </div>
      </div>
    </section>
  );
}
