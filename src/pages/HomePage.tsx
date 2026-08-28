import Hero from '../components/Hero';
import WordRotator from '../components/WordRotator';
import OfferSection from '../components/home/OfferSection';
import PricingSection from '../components/home/PricingSection';
import CyberNewsGrid from '../components/CyberNewsGrid';
import ContactPortal from '../components/ContactPortal';
import { HOME_OFFERS } from '../data/homeOffers';

/**
 * Streamlined homepage: hero → rotating headline → the three core offerings (custom AI agents,
 * cyber & security, web development + marketing) → interactive news dashboard → contact.
 * The heavier "generic AI" widgets (ROI calculator, simulated live monitors, comparison matrices,
 * roadmaps) were removed — their routes still exist and are reachable from the footer.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <WordRotator />
      {HOME_OFFERS.map((offer) => (
        <OfferSection key={offer.id} offer={offer} />
      ))}
      <PricingSection />
      <CyberNewsGrid />
      <ContactPortal />
    </>
  );
}
