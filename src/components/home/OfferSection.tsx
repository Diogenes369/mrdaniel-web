import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import WebButton from '../WebButton';
import TiltCard from '../TiltCard';
import DepthSection from './DepthSection';
import PopHeadline from './PopHeadline';
import ScrollLockRail from '../mobile/ScrollLockRail';
import type { HomeOffer, OfferBullet } from '../../data/homeOffers';
import { rtl } from '../../lib/rtl';
import { smoothScrollTo } from '../../hooks/useLenis';

/** Hero-scale supporting card on the unified `.glass-panel` marketing surface. */
function BulletCard({ bullet }: { bullet: OfferBullet }) {
  const Icon = bullet.icon;
  return (
    <div className="glass-panel glass-panel--marketing group/bc h-full flex flex-col rounded-3xl p-7 lg:p-9">
      <div className="w-12 h-12 lg:w-14 lg:h-14 shrink-0 rounded-2xl bg-black/40 border border-white/12 flex items-center justify-center text-brand-300 mb-5 transition-colors group-hover/bc:border-brand-500/45">
        <Icon className="w-6 h-6 lg:w-7 lg:h-7" />
      </div>
      <h3 className="font-display text-xl font-extrabold text-white mb-2.5 lg:text-2xl">{rtl(bullet.title)}</h3>
      <p className="text-base text-zinc-300 leading-relaxed lg:text-lg lg:leading-relaxed">{rtl(bullet.body)}</p>
    </div>
  );
}

export default function OfferSection({ offer }: { offer: HomeOffer }) {
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
      className="relative py-20 md:py-28 overflow-x-clip cv-auto"
    >
      {/* Header sits ABOVE the depth plane so the pop-out title and the card-grid tilt don't stack. */}
      <div className="container-wide relative z-10">
        <div className="max-w-4xl mx-auto text-center mb-12 md:mb-16">
          <PopHeadline lead={rtl(offer.title)} accent={rtl(offer.accent)} />
          <p className="font-sans text-fluid-body text-zinc-300 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">{rtl(offer.intro)}</p>
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
          <WebButton variant="primary" onClick={() => navigate(offer.route)} className="cta-sheen !px-8">
            {rtl(offer.ctaLabel)}
            <ArrowLeft className="w-4 h-4" />
          </WebButton>
          {/* The content hub has nothing to scope in a call — its second step is following the
              channels, which keeps a not-yet-ready visitor in the funnel instead of bouncing. */}
          <WebButton
            variant="ghost"
            onClick={
              offer.secondary === 'community'
                ? () => smoothScrollTo('#community')
                : offer.secondary === 'x-feed'
                  ? () => smoothScrollTo('#x-feed')
                  : openLead
            }
            className="!px-6"
          >
            {rtl(offer.secondaryLabel)}
          </WebButton>
        </div>
      </DepthSection>
    </section>
  );
}
