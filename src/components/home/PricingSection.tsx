import { Check, ArrowLeft, FileText, ArrowUpLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import WebButton from '../WebButton';
import TiltCard from '../TiltCard';
import Reveal from '../Reveal';
import SwipeRow from '../mobile/SwipeRow';
import { PLAIN_SERVICES, PACKAGES, type PlainService, type PricingPackage } from '../../data/homePricing';

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
        {pkg.hidePrice ? (
          <button
            type="button"
            onClick={() => openLead(pkg.leadSubject)}
            className="inline-flex items-center gap-2 rounded-full border border-brand-500/40 bg-brand-500/10 px-4 py-2 text-sm font-bold text-brand-300 transition-colors hover:bg-brand-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
          >
            <FileText className="w-4 h-4" />
            קבלת הצעת מחיר בהתאמה אישית
          </button>
        ) : (
          <span className="font-display text-2xl md:text-3xl font-black text-brand-400" dir="rtl">
            {pkg.priceLabel}
          </span>
        )}
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

/** One plain-language service tile. Renders as a <Link> to its service page when `to` is set, so
 *  the pricing section also works as a map of everything on offer. */
function ServiceTile({ s }: { s: PlainService }) {
  const inner = (
    <>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-brand-400 transition-colors group-hover/st:border-brand-500/40 group-hover/st:text-brand-300">
          <s.icon className="w-4 h-4" />
        </span>
        <h3 className="font-display text-base font-bold text-[#F1F5F9]">{s.term}</h3>
        {s.to && (
          <ArrowUpLeft className="ml-auto w-4 h-4 text-zinc-600 transition-colors group-hover/st:text-brand-400" aria-hidden="true" />
        )}
      </div>
      <p className="text-sm leading-relaxed text-zinc-400">{s.benefit}</p>
    </>
  );

  const base = 'group/st block h-full rounded-2xl border border-white/10 bg-[#0D0E12] p-5 transition-colors';

  return s.to ? (
    <Link to={s.to} className={`${base} hover:border-brand-500/40`}>
      {inner}
    </Link>
  ) : (
    <div className={base}>{inner}</div>
  );
}

export default function PricingSection() {
  return (
    <section id="pricing" className="relative py-20 md:py-32 border-t border-white/5 overflow-hidden cv-auto">
      <div className="container-wide relative z-10">
        <Reveal className="max-w-3xl mx-auto text-center mb-12 md:mb-16">
          <h2 className="font-display text-fluid-h2 font-black text-white mb-5">
            שירותים <span className="text-brand-500">ותמחור ברור</span>
          </h2>
          <p className="font-sans text-fluid-body text-zinc-300 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">
            בלי מונחים מבלבלים ובלי הפתעות. הנה כל מה שאני עושה — מה זה נותן לעסק שלכם בשפה פשוטה, וטווח
            מחירים שקוף כנקודת פתיחה. כל פרויקט נסגר סופית רק אחרי אפיון קצר ומדויק.
          </p>
        </Reveal>

        {/* Plain-language services — desktop grid + mobile swipe row */}
        <Reveal>
          <div className="mx-auto max-w-[1500px] hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5 mb-16 md:mb-20">
            {PLAIN_SERVICES.map((s) => (
              <ServiceTile key={s.term} s={s} />
            ))}
          </div>
          <SwipeRow className="mb-14">
            {PLAIN_SERVICES.map((s) => (
              <ServiceTile key={s.term} s={s} />
            ))}
          </SwipeRow>
        </Reveal>

        {/* Packages */}
        <Reveal>
          <div className="mx-auto max-w-[1200px] hidden md:grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6 items-stretch">
            {PACKAGES.map((pkg) => (
              <TiltCard key={pkg.id} strength={3} className="h-full">
                <PackageCard pkg={pkg} />
              </TiltCard>
            ))}
          </div>
          <SwipeRow className="md:hidden" itemClassName="w-[86%]">
            {PACKAGES.map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} />
            ))}
          </SwipeRow>
        </Reveal>

        <div className="mx-auto max-w-2xl mt-10 text-center">
          <p className="text-xs text-zinc-500 mb-5">
            המחירים למעלה הם נקודת פתיחה, לא מחיר סופי. פרויקט מורכב מתומחר לפי אפיון — היקף, אינטגרציות,
            לוחות זמנים ורמת ליווי.
          </p>
          <WebButton variant="ghost" onClick={() => openLead('הצעת מחיר מותאמת — פרויקט דיגיטלי')} className="!px-8">
            צריכים משהו אחר? קבלו הצעת מחיר מותאמת
          </WebButton>
        </div>
      </div>
    </section>
  );
}
