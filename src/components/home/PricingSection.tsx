import { Check, ArrowLeft } from 'lucide-react';
import WebButton from '../WebButton';
import TiltCard from '../TiltCard';
import { PLAIN_SERVICES, PACKAGES, type PricingPackage } from '../../data/homePricing';

function openLead(subject: string) {
  window.dispatchEvent(
    new CustomEvent('open-lead-modal', { detail: { subject, sourceSection: 'Home · Pricing & Packages' } })
  );
}

function PackageCard({ pkg }: { pkg: PricingPackage }) {
  return (
    <div
      className={`relative flex h-full flex-col rounded-2xl border p-6 md:p-7 ${
        pkg.featured
          ? 'border-brand-500/50 bg-[#0E140B] shadow-[0_0_40px_-12px_rgba(118,185,0,0.35)]'
          : 'border-white/10 bg-[#0D0E12]'
      }`}
    >
      {pkg.featured && (
        <span className="absolute -top-3 right-6 rounded-full bg-brand-500 px-3 py-1 text-[11px] font-mono font-bold uppercase tracking-widest text-black">
          הכי מבוקש
        </span>
      )}
      <h3 className="font-display text-xl font-black text-white">{pkg.name}</h3>
      <p className="mt-1 text-sm text-zinc-400">{pkg.tagline}</p>

      <div className="mt-5 mb-1">
        <span className="font-display text-2xl md:text-3xl font-black text-brand-400" dir="rtl">
          {pkg.priceLabel}
        </span>
      </div>
      <p className="text-[11px] text-zinc-500">{pkg.priceNote}</p>

      <ul className="mt-5 mb-6 space-y-2.5 flex-grow">
        {pkg.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
            <Check className="mt-0.5 w-4 h-4 shrink-0 text-brand-400" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <WebButton
        variant={pkg.featured ? 'primary' : 'glass'}
        onClick={() => openLead(pkg.leadSubject)}
        className="w-full justify-center"
      >
        {pkg.cta}
        <ArrowLeft className="w-4 h-4" />
      </WebButton>
    </div>
  );
}

export default function PricingSection() {
  return (
    <section id="pricing" className="relative py-20 md:py-32 border-t border-white/5 overflow-hidden cv-auto">
      <div className="container-wide relative z-10">
        <div className="max-w-3xl mx-auto text-center mb-12 md:mb-16">
          <h2 className="font-display text-fluid-h2 font-black text-white mb-5">
            שירותים <span className="text-brand-500">ותמחור ברור</span>
          </h2>
          <p className="font-sans text-fluid-body text-zinc-300 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">
            בלי מונחים מבלבלים. הנה מה שאני עושה — ומה זה נותן לעסק שלכם.
          </p>
        </div>

        {/* Plain-language services */}
        <div className="mx-auto max-w-[1500px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 md:gap-5 mb-16 md:mb-20">
          {PLAIN_SERVICES.map((s) => (
            <div key={s.term} className="rounded-2xl border border-white/10 bg-[#0D0E12] p-5">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-brand-400">
                  <s.icon className="w-4 h-4" />
                </span>
                <h3 className="font-display text-base font-bold text-[#F1F5F9]">{s.term}</h3>
              </div>
              <p className="text-sm leading-relaxed text-zinc-400">{s.benefit}</p>
            </div>
          ))}
        </div>

        {/* Packages */}
        <div className="mx-auto max-w-[1200px] grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6 items-stretch">
          {PACKAGES.map((pkg) => (
            <TiltCard key={pkg.id} strength={3} className="h-full">
              <PackageCard pkg={pkg} />
            </TiltCard>
          ))}
        </div>

        <div className="mx-auto max-w-2xl mt-10 text-center">
          <p className="text-xs text-zinc-500 mb-5">
            כל פרויקט מתומחר לפי אפיון — המספרים למעלה הם נקודת פתיחה, לא מחיר סופי.
          </p>
          <WebButton variant="ghost" onClick={() => openLead('הצעת מחיר מותאמת — פרויקט דיגיטלי')} className="!px-8">
            צריכים משהו אחר? קבלו הצעת מחיר מותאמת
          </WebButton>
        </div>
      </div>
    </section>
  );
}
