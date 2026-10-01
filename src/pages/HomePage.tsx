import Hero from '../components/Hero';
import NoiseBeat from '../components/story/NoiseBeat';
import OrderBeat from '../components/story/OrderBeat';
import PathBeat from '../components/story/PathBeat';
import StartBeat from '../components/story/StartBeat';
import OfferSection from '../components/home/OfferSection';
import ProcessSection from '../components/home/ProcessSection';
import TodayTermsSection from '../components/home/TodayTermsSection';
import ServicesSection from '../components/home/ServicesSection';
import TechMarquee from '../components/TechMarquee';
import ContactPortal from '../components/ContactPortal';
import { HOME_OFFERS } from '../data/homeOffers';

/**
 * Homepage — learners first since 2026-10-01.
 *
 * The top of the page is one scroll story told over the glyph field (GlyphField, mounted in
 * App.tsx): the hero names the mess → NoiseBeat proves the pace with the real launches of the last
 * few days → OrderBeat (the field sorts itself into a typed page) shows jargon turned into plain
 * Hebrew → PathBeat climbs from "what is this" to building like a developer → StartBeat hands over
 * the free beginner guide. Each beat registers itself with the field, which stages the background
 * from the beat under the reading line.
 *
 * Below the story the earlier sections continue, the agent-building offer among them as the
 * secondary path. The ROI / agent-savings calculator was removed on 2026-10-01 by decision.
 * TODO(redesign): those sections still wear the pre-2026-10-01 look and move into the glyph world
 * next.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <NoiseBeat />
      <OrderBeat />
      <PathBeat />
      <StartBeat />
      {HOME_OFFERS.map((offer) => (
        <OfferSection key={offer.id} offer={offer} />
      ))}
      <TodayTermsSection />
      <ProcessSection />
      <ServicesSection />
      <TechMarquee />
      <ContactPortal />
    </>
  );
}
