import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import GlyphButton from '../ui/GlyphButton';
import Depth from '../story/Depth';
import SiteBot from '../bots/SiteBot';
import { SERVICES, type ServiceEntry } from '../../data/homeServices';
import { SERVICES_COPY } from '../../data/siteCopy';
import { rtl } from '../../lib/rtl';
import { useFieldQuiet } from '../field/fieldState';

function openLead(subject: string) {
  window.dispatchEvent(new CustomEvent('open-lead-modal', { detail: { subject, sourceSection: 'Home · Services' } }));
}

/**
 * "What I build" (moved into the glyph world 2026-10-06): a catalogue rather than a bento of glowing
 * cards. Each service is one dotted frame that is a link to its page: the title in the poster face,
 * what it does in plain Hebrew, its tags as a machine line, and (from md up) what it actually does
 * as a short checklist. The flagship services take the first, wider row. On a phone the checklist
 * steps aside, so the list stays a quick read and the service page holds the detail.
 */
function Service({ s }: { s: ServiceEntry }) {
  return (
    <li className={`service-item ${s.flagship ? 'service-item--lead' : ''}`}>
      <Link to={s.to} className="glyph-frame service-card group">
        {s.chips && s.chips.length > 0 && (
          <p className="service-card__tags">
            {s.chips.map((c, i) => (
              <span key={c}>
                {i > 0 && <span aria-hidden="true"> · </span>}
                {rtl(c)}
              </span>
            ))}
          </p>
        )}
        <h3 className="service-card__title">{rtl(s.title)}</h3>
        <p className="service-card__blurb">{rtl(s.blurb)}</p>
        {s.points && s.points.length > 0 && (
          <ul className="service-card__points">
            {s.points.map((p) => (
              <li key={p}>{rtl(p)}</li>
            ))}
          </ul>
        )}
        {s.metric && (
          <p className="service-card__metric">
            <b>{rtl(s.metric.value)}</b>
            <span>{rtl(s.metric.label)}</span>
          </p>
        )}
        <span className="service-card__go" aria-hidden="true">
          לפרטים
          <ArrowLeft className="h-3.5 w-3.5" />
        </span>
      </Link>
    </li>
  );
}

export default function ServicesSection() {
  const quiet = useFieldQuiet();
  const lead = SERVICES.filter((s) => s.flagship);
  const rest = SERVICES.filter((s) => !s.flagship);
  return (
    <section id="services" className="story-beat">
      <div className="container-wide">
        <div className="grid grid-cols-1 items-end gap-8 lg:grid-cols-12 lg:gap-10">
          <div ref={quiet} className="lg:col-span-8">
            <h2 className="story-h2">
              {rtl(SERVICES_COPY.lead)} <span className="text-brand-400">{rtl(SERVICES_COPY.accent)}</span>
            </h2>
            <p className="story-body mt-6" data-live="rise">
              {rtl(SERVICES_COPY.sub)}
            </p>
          </div>
          <div className="flex lg:col-span-4 lg:justify-end">
            <Depth speed={0.18}>
              <SiteBot shape="star" tone="hi" mood="happy" size={124} className="offer-beat__bot" />
            </Depth>
          </div>
        </div>

        <ul className="service-grid service-grid--lead mt-12 md:mt-16" data-live="stagger">
          {lead.map((s) => (
            <Service key={s.id} s={s} />
          ))}
        </ul>
        <ul className="service-grid mt-4 md:mt-5" data-live="stagger">
          {rest.map((s) => (
            <Service key={s.id} s={s} />
          ))}
        </ul>

        <div className="mt-12 max-w-2xl md:mt-16">
          <p className="story-body mb-6">{rtl(SERVICES_COPY.closing)}</p>
          <GlyphButton onClick={() => openLead('אפיון פתרון טכנולוגי מותאם — שירותים')}>
            {rtl(SERVICES_COPY.cta)}
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </GlyphButton>
        </div>
      </div>
    </section>
  );
}
