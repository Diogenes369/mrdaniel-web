import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import WebButton from '../WebButton';
import TiltCard from '../TiltCard';
import ScrollLockRail from '../mobile/ScrollLockRail';
import type { HomeOffer, OfferBullet } from '../../data/homeOffers';

function BulletCard({ bullet }: { bullet: OfferBullet }) {
  const Icon = bullet.icon;
  return (
    <div className="h-full flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="w-11 h-11 shrink-0 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-brand-400 mb-4">
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="font-display text-lg font-bold text-[#F1F5F9] mb-2">{bullet.title}</h3>
      <p className="text-sm text-zinc-400 leading-relaxed">{bullet.body}</p>
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
      className="relative py-20 md:py-32 border-t border-white/5 overflow-x-clip cv-auto"
    >
      <div className="container-wide relative z-10">
        <div className="max-w-3xl mx-auto text-center mb-12 md:mb-16">
          <h2 className="font-display text-fluid-h2 font-black text-white mb-5">
            {offer.title} <span className="text-brand-500">{offer.accent}</span>
          </h2>
          <p className="font-sans text-fluid-body text-zinc-300 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">{offer.intro}</p>
        </div>

        {/* Desktop / tablet: static 4-up grid. */}
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
      </div>
    </section>
  );
}
