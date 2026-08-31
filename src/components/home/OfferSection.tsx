import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import WebButton from '../WebButton';
import TiltCard from '../TiltCard';
import DepthSection from './DepthSection';
import SectionBackdrop from './SectionBackdrop';
import PopHeadline from './PopHeadline';
import ScrollLockRail from '../mobile/ScrollLockRail';
import type { HomeOffer, OfferBullet } from '../../data/homeOffers';

/** Hero-scale supporting card: glassmorphism plane, glowing hover edge, commanding type. */
function BulletCard({ bullet }: { bullet: OfferBullet }) {
  const Icon = bullet.icon;
  return (
    <div className="group/bc relative h-full flex flex-col overflow-hidden rounded-3xl border border-white/12 bg-white/[0.035] p-7 backdrop-blur-md transition-all duration-300 hover:border-brand-500/45 hover:bg-white/[0.055] hover:shadow-[0_0_44px_-16px_rgba(118,185,0,0.5)] lg:p-9">
      {/* Corner light — a soft brand wash that breathes in on hover, so each card has its own atmosphere. */}
      <div
        className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-brand-500/[0.07] blur-2xl transition-opacity duration-500 opacity-60 group-hover/bc:opacity-100"
        aria-hidden="true"
      />
      <div className="relative w-12 h-12 lg:w-14 lg:h-14 shrink-0 rounded-2xl bg-black/40 border border-white/12 flex items-center justify-center text-brand-300 mb-5 transition-colors group-hover/bc:border-brand-500/45">
        <Icon className="w-6 h-6 lg:w-7 lg:h-7" />
      </div>
      <h3 className="relative font-display text-xl font-extrabold text-white mb-2.5 lg:text-2xl">{bullet.title}</h3>
      <p className="relative text-base text-zinc-300 leading-relaxed lg:text-lg lg:leading-relaxed">{bullet.body}</p>
    </div>
  );
}

export default function OfferSection({ offer, tone = 'a' }: { offer: HomeOffer; tone?: 'a' | 'b' }) {
  const navigate = useNavigate();

  const openLead = () =>
    window.dispatchEvent(
      new CustomEvent('open-lead-modal', {
        detail: { subject: offer.leadSubject, sourceSection: offer.sourceSection },
      })
    );

  return (
    <section
      id={offer.id}
      className="relative isolate py-20 md:py-28 overflow-x-clip cv-auto"
    >
      <SectionBackdrop tone={tone} />

      {/* Header sits ABOVE the depth plane so the pop-out title and the card-grid tilt don't stack. */}
      <div className="container-wide relative z-10">
        <div className="max-w-3xl mx-auto text-center mb-12 md:mb-16">
          <PopHeadline lead={offer.title} accent={offer.accent} />
          <p className="font-sans text-fluid-body text-zinc-300 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">{offer.intro}</p>
        </div>
      </div>

      <DepthSection className="container-wide relative z-10">
        {/* Desktop / tablet: 4-up grid of hero-scale cards — mouse-tilt layered on the section's
            scroll-depth plane. */}
        <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6 max-w-[1600px] mx-auto mb-12">
          {offer.bullets.map((b) => (
            <TiltCard key={b.title} strength={4} className="h-full">
              <BulletCard bullet={b} />
            </TiltCard>
          ))}
        </div>

        {/* Mobile: native horizontal swipe rail — vertical swipes pass straight through to page scroll. */}
        <ScrollLockRail className="md:hidden mb-10" ariaLabel={offer.eyebrow}>
          {offer.bullets.map((b) => (
            <BulletCard key={b.title} bullet={b} />
          ))}
        </ScrollLockRail>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <WebButton variant="primary" onClick={() => navigate(offer.route)} className="!px-8">
            {offer.ctaLabel}
            <ArrowLeft className="w-4 h-4" />
          </WebButton>
          <WebButton variant="ghost" onClick={openLead} className="!px-6">
            תיאום שיחת אפיון טכנולוגית
          </WebButton>
        </div>
      </DepthSection>
    </section>
  );
}
