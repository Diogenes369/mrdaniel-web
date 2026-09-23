import { HelpCircle, ClipboardList, Route, Send } from 'lucide-react';
import { PageHero, SectionHeading, UnifiedCta } from '../components/content/ContentPrimitives';
import AiAgentsSection from '../components/AiAgentsSection';
import {
  AI_GUIDE_HERO,
  AI_GUIDE_WHAT,
  AI_GUIDE_PREP,
  AI_GUIDE_PROCESS,
  AI_GUIDE_CTA,
  type GuideCard,
} from '../data/aiAgentGuide';
import { rtl } from '../lib/rtl';

/**
 * /ai — the AI agents page, rewritten 2026-09-23 as a practical client guide:
 *   1. What an agent is (plain words + three everyday examples)
 *   → the ready-made agents for sale (AiAgentsSection, live model names)
 *   2. What to prepare (a checklist a client can do before the first call)
 *   3. How we build it together (four steps, each ending in the client's go-ahead)
 *   → contact.
 *
 * Removed with the rewrite: the "technical depth" grid (RAG / multi-agent / MCP / Guardian), the
 * AI-news pulse and the demo videos, and every ROI figure — they read as a brochure for engineers
 * and none of the numbers had a source. All copy lives in src/data/aiAgentGuide.ts.
 */

function Card({ card, index }: { card: GuideCard; index?: number }) {
  const Icon = card.icon;
  return (
    <div className="glass-panel glass-panel--marketing relative flex h-full flex-col rounded-2xl p-5 sm:p-6 lg:p-7">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/40 text-brand-400">
          <Icon className="h-5 w-5" />
        </span>
        {index !== undefined && (
          <span className="font-mono text-xs font-bold tracking-[0.2em] text-brand-400/80" dir="ltr" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
        )}
      </div>
      <h3 className="mb-2 font-display text-lg font-bold leading-snug text-white">{rtl(card.title)}</h3>
      <p className="text-base leading-relaxed text-zinc-300">{rtl(card.body)}</p>
    </div>
  );
}

export default function AIPage() {
  return (
    <div id="page-top" className="min-h-screen pt-24 md:pt-28 pb-24">
      <div className="container-wide">
        <PageHero title={AI_GUIDE_HERO.title} subtitle={rtl(AI_GUIDE_HERO.subtitle)} />

        <div className="pt-8 md:pt-10">
          {/* 1 — What is it */}
          <section id="what" aria-labelledby="what-title" className="mb-20">
            <SectionHeading icon={HelpCircle} title={AI_GUIDE_WHAT.title} description={rtl(AI_GUIDE_WHAT.intro)} />
            <p className="mb-8 max-w-3xl rounded-2xl border border-brand-500/25 bg-brand-500/[0.06] px-5 py-4 text-base font-semibold leading-relaxed text-brand-200">
              {rtl(AI_GUIDE_WHAT.difference)}
            </p>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
              {AI_GUIDE_WHAT.examples.map((c) => (
                <Card key={c.title} card={c} />
              ))}
            </div>
          </section>

          {/* Ready-made agents for sale — right after "what is it", where a shopper decides.
              Moved here from the guides page 2026-09-23; model names on the cards are live. */}
          <div className="mb-20">
            <AiAgentsSection />
          </div>

          {/* 2 — What to prepare */}
          <section id="prepare" className="mb-20">
            <SectionHeading icon={ClipboardList} title={AI_GUIDE_PREP.title} description={rtl(AI_GUIDE_PREP.intro)} />
            <ol className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5 md:gap-6">
              {AI_GUIDE_PREP.items.map((c, i) => (
                <li key={c.title}>
                  <Card card={c} index={i} />
                </li>
              ))}
            </ol>
          </section>

          {/* 3 — How we build it together */}
          <section id="process" className="mb-20">
            <SectionHeading icon={Route} title={AI_GUIDE_PROCESS.title} description={rtl(AI_GUIDE_PROCESS.intro)} />
            <ol className="process-rail relative grid grid-cols-1 gap-5 md:grid-cols-4 md:gap-6">
              {AI_GUIDE_PROCESS.steps.map((c, i) => (
                <li key={c.title} className="process-step relative">
                  <span className="process-step__node" aria-hidden="true" />
                  <Card card={c} index={i} />
                </li>
              ))}
            </ol>
          </section>

          <SectionHeading icon={Send} title={AI_GUIDE_CTA.title} description={rtl(AI_GUIDE_CTA.body)} />
          <UnifiedCta
            mailSubject="שיחת היכרות על סוכן AI"
            whatsappMessage="היי דניאל, יש לי עבודה שחוזרת כל יום ואני רוצה לבדוק אם סוכן AI יכול לקחת אותה."
          />
        </div>
      </div>
    </div>
  );
}
