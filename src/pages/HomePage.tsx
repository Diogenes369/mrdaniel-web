import { Fragment } from 'react';
import Hero from '../components/Hero';
import WordRotator from '../components/WordRotator';
import OfferSection from '../components/home/OfferSection';
import RoiCalculator from '../components/home/RoiCalculator';
import ServicesSection from '../components/home/ServicesSection';
import AngledDivider from '../components/home/AngledDivider';
import TechMarquee from '../components/TechMarquee';
import CyberNewsGrid from '../components/CyberNewsGrid';
import ContactPortal from '../components/ContactPortal';
import { HOME_OFFERS } from '../data/homeOffers';

/**
 * Homepage: hero → rotating headline → the three core offerings (custom AI agents, cyber & security,
 * web development + marketing) → interactive ROI calculator (lead magnet) → services bento →
 * tech-stack marquee → live news dashboard → contact.
 *
 * Section seams are asymmetric <AngledDivider> diagonals (alternating direction) instead of flat
 * `border-t` hairlines; each major section's content rides a scroll-driven <DepthSection> 3D plane
 * (see the section components) for the layered, drawn-into-the-page feel.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <WordRotator />
      {HOME_OFFERS.map((offer, i) => (
        <Fragment key={offer.id}>
          <AngledDivider flip={i % 2 === 1} />
          <OfferSection offer={offer} />
        </Fragment>
      ))}
      <AngledDivider flip />
      <RoiCalculator />
      <AngledDivider />
      <ServicesSection />
      <AngledDivider flip />
      <TechMarquee />
      <CyberNewsGrid />
      <AngledDivider />
      <ContactPortal />
    </>
  );
}
