import { ArrowLeft } from 'lucide-react';
import WebButton from '../WebButton';
import PopHeadline from './PopHeadline';
import { PROCESS_COPY } from '../../data/siteCopy';
import { rtl } from '../../lib/rtl';

/**
 * "How a working agent gets built" — three steps, between the pillars and the ROI calculator
 * (homepage redesign, 2026-09-23).
 *
 * The flow it fixes: the page used to go from "here is what agents do" straight to "estimate your
 * savings", which asks for commitment before answering the obvious question in between — what
 * happens if I say yes. Three steps, each ending in the visitor's own decision, lower that step.
 *
 * Layout: a connected rail. Desktop = three columns joined by a glowing line that "charges" left
 * along the RTL reading order (CSS only, `.process-rail`); mobile = a vertical stack with the line
 * running down the right edge. No pinning, no scroll-jacking — it is a plain section.
 */
export default function ProcessSection() {
  const c = PROCESS_COPY;
  const openLead = () =>
    window.dispatchEvent(
      new CustomEvent('open-lead-modal', { detail: { subject: 'אפיון סוכן AI', sourceSection: 'Home · Process' } })
    );

  return (
    <section id="process" className="relative py-20 md:py-28 overflow-x-clip cv-auto">
      <div className="container-wide relative z-10">
        <div className="max-w-3xl mx-auto text-center mb-12 md:mb-16">
          <PopHeadline lead={rtl(c.lead)} accent={rtl(c.accent)} />
          <p className="font-sans text-fluid-body text-zinc-300 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">{rtl(c.sub)}</p>
        </div>

        <ol className="process-rail relative mx-auto grid max-w-[1400px] gap-5 md:grid-cols-3 md:gap-6" dir="rtl">
          {c.steps.map((s) => (
            <li key={s.kicker} className="process-step relative">
              <div className="glass-panel glass-panel--marketing h-full rounded-3xl p-7 lg:p-9">
                <span className="process-step__node" aria-hidden="true" />
                <span className="mb-5 block font-mono text-sm font-bold tracking-[0.25em] text-brand-400" dir="ltr" aria-hidden="true">
                  {s.kicker}
                </span>
                <h3 className="mb-3 font-display text-xl font-extrabold text-white lg:text-2xl">{rtl(s.title)}</h3>
                <p className="text-base leading-relaxed text-zinc-300 lg:text-lg">{rtl(s.body)}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-12 flex justify-center">
          <WebButton variant="primary" onClick={openLead} className="cta-sheen !px-8">
            {rtl(c.cta)}
            <ArrowLeft className="w-4 h-4" />
          </WebButton>
        </div>
      </div>
    </section>
  );
}
