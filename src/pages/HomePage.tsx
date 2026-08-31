import Hero from '../components/Hero';
import WordRotator from '../components/WordRotator';
import OfferSection from '../components/home/OfferSection';
import RoiCalculator from '../components/home/RoiCalculator';
import ServicesSection from '../components/home/ServicesSection';
import TechMarquee from '../components/TechMarquee';
import CyberNewsGrid from '../components/CyberNewsGrid';
import ContactPortal from '../components/ContactPortal';
import { HOME_OFFERS } from '../data/homeOffers';

/**
 * Homepage: hero → rotating headline → the three core offerings (custom AI agents, cyber & security,
 * web development + marketing) → interactive ROI calculator (lead magnet) → services bento →
 * tech-stack marquee → live news dashboard → contact.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <WordRotator />
      {HOME_OFFERS.map((offer) => (
        <OfferSection key={offer.id} offer={offer} />
      ))}
      <RoiCalculator />
      <ServicesSection />
      <TechMarquee />
      <CyberNewsGrid />
      <ContactPortal />
    </>
  );
}
