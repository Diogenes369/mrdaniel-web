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
 *
 * There are NO divider elements between sections. Each section paints its own <SectionBackdrop> —
 * a translucent glass panel clipped to a shallow diagonal and bled past its bounds, so adjacent
 * panels overlap and interlock on an angle with no hard line anywhere. The ambient tint alternates
 * a/b down the page. Section bodies ride a <DepthSection> 3D scroll plane; section titles are
 * <PopHeadline>s that project toward the viewer as they scroll in.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <WordRotator />
      {HOME_OFFERS.map((offer, i) => (
        <OfferSection key={offer.id} offer={offer} tone={i % 2 === 0 ? 'a' : 'b'} />
      ))}
      <RoiCalculator />
      <ServicesSection />
      <TechMarquee />
      <CyberNewsGrid />
      <ContactPortal />
    </>
  );
}
