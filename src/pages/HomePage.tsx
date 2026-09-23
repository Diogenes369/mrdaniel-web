import Hero from '../components/Hero';
import WordRotator from '../components/WordRotator';
import OfferSection from '../components/home/OfferSection';
import RoiCalculator from '../components/home/RoiCalculator';
import ProcessSection from '../components/home/ProcessSection';
import TodayTermsSection from '../components/home/TodayTermsSection';
import ServicesSection from '../components/home/ServicesSection';
import TechMarquee from '../components/TechMarquee';
import ContactPortal from '../components/ContactPortal';
import { HOME_OFFERS } from '../data/homeOffers';

/**
 * Homepage (AI-only since 2026-09-21; flow redesigned 2026-09-23): split hero with a live signal
 * console (the three newest real headlines) → rotating headline → the three pillars (autonomous
 * AI agents, the LLM lab, the AI news hub) → today's AI terms from the news (autonomous, free) →
 * "how it gets built" process rail → interactive ROI
 * calculator (lead magnet) → services bento → tech-stack marquee → contact.
 * (The X feed and channels grid were removed 2026-09-22; the hero keeps the social icons. The news
 * section was removed the same day — headlines reach the homepage through the site-wide ticker,
 * whose items open the article modal, and the full feed lives on /news.)
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
      <TodayTermsSection />
      <ProcessSection />
      <RoiCalculator />
      <ServicesSection />
      <TechMarquee />
      <ContactPortal />
    </>
  );
}
