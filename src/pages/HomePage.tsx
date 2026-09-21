import Hero from '../components/Hero';
import WordRotator from '../components/WordRotator';
import OfferSection from '../components/home/OfferSection';
import RoiCalculator from '../components/home/RoiCalculator';
import ServicesSection from '../components/home/ServicesSection';
import TechMarquee from '../components/TechMarquee';
import AiNewsGrid from '../components/AiNewsGrid';
import ContactPortal from '../components/ContactPortal';
import CommunitySection from '../components/home/CommunitySection';
import { HOME_OFFERS } from '../data/homeOffers';

/**
 * Homepage (AI-only since 2026-09-21): hero → rotating headline → the three pillars (autonomous
 * AI agents, the LLM lab, the AI news hub) → interactive ROI calculator (lead magnet) → services
 * bento → tech-stack marquee → live AI news dashboard → live X feed → community channels (every
 * Linktree profile) → contact.
 *
 * Every section wrapper is fully transparent — no divider elements, no per-section backdrop — so
 * the fixed Scene3D particle/mesh layer (`.scene3d-layer`, z-0 in App.tsx) runs unobstructed from
 * top to bottom. The `.glass-panel` cards float directly over it. Section bodies ride a
 * <DepthSection> 3D scroll plane; section titles are <PopHeadline>s that project toward the viewer.
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
      <AiNewsGrid />
      <CommunitySection />
      <ContactPortal />
    </>
  );
}
