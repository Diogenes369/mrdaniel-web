import { PageHero, SectionHeading, UnifiedCta } from '../components/content/ContentPrimitives';
import AiAgentsSection from '../components/AiAgentsSection';
import { AI_GUIDE_HERO, AI_GUIDE_WHAT, AI_GUIDE_PREP, AI_GUIDE_PROCESS, AI_GUIDE_CTA } from '../data/aiAgentGuide';
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
 *
 * In the glyph world since 2026-10-07. Each block takes the form its content already has, the way
 * the homepage pillars do, instead of one card grid repeated four times: the examples are the
 * inner pages' frame cells, the preparation list is a checklist in a window that ticks off as it
 * arrives, and the build is the homepage's stops on one dotted line. The 01–05 index numbers are
 * gone (the brief bans them); the order of the build is the line itself.
 */

export default function AIPage() {
  return (
    <div id="page-top" className="min-h-screen pt-24 md:pt-28 pb-24">
      <div className="container-wide">
        <PageHero title={AI_GUIDE_HERO.title} subtitle={rtl(AI_GUIDE_HERO.subtitle)} />

        <div className="pt-8 md:pt-10">
          {/* What is it */}
          <section id="what" aria-labelledby="what-title" className="mb-20">
            <SectionHeading title={AI_GUIDE_WHAT.title} description={rtl(AI_GUIDE_WHAT.intro)} />
            <p className="ai-diff" data-live="rise">
              {rtl(AI_GUIDE_WHAT.difference)}
            </p>
            {/* Three examples, three columns from md: no row with one cell left on its own. */}
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5" data-live="stagger">
              {AI_GUIDE_WHAT.examples.map((c) => (
                <li key={c.title} className="glyph-frame frame-cell frame-cell--stack">
                  <span className="frame-cell__icon mb-4" aria-hidden="true">
                    <c.icon className="h-5 w-5" />
                  </span>
                  <h3 className="frame-cell__title">{rtl(c.title)}</h3>
                  <p className="frame-cell__text">{rtl(c.body)}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* Ready-made agents for sale — right after "what is it", where a shopper decides.
              Moved here from the guides page 2026-09-23; model names on the cards are live. */}
          <div className="mb-24">
            <AiAgentsSection />
          </div>

          {/* What to prepare: a checklist, so it reads as one */}
          <section id="prepare" className="mb-20">
            <SectionHeading title={AI_GUIDE_PREP.title} description={rtl(AI_GUIDE_PREP.intro)} />
            <div className="glyph-frame offer-window ai-prep" data-live="frame">
              <div className="offer-window__bar" aria-hidden="true">
                <i />
                <i />
                <i />
                <span className="offer-window__title">
                  <span className="story-statusbar__live" />
                  לפני השיחה הראשונה
                </span>
              </div>
              <ul className="offer-tasks" data-live="stagger" data-live-delay="250">
                {AI_GUIDE_PREP.items.map((c) => (
                  <li key={c.title} className="offer-task">
                    <span className="offer-task__check" aria-hidden="true" />
                    <div className="min-w-0">
                      <h3 className="offer-task__title">{rtl(c.title)}</h3>
                      <p className="offer-task__body">{rtl(c.body)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* How we build it together: four stops on one line, read from the right */}
          <section id="process" className="mb-20">
            <SectionHeading title={AI_GUIDE_PROCESS.title} description={rtl(AI_GUIDE_PROCESS.intro)} />
            <div className="process-line ai-process">
              <ol className="process-stops process-stops--four" data-live="stagger" data-live-delay="150">
                {AI_GUIDE_PROCESS.steps.map((c) => (
                  <li key={c.title} className="process-stop">
                    <span className="process-stop__node" aria-hidden="true" />
                    <h3 className="process-stop__title">{rtl(c.title)}</h3>
                    <p className="process-stop__body">{rtl(c.body)}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <SectionHeading title={AI_GUIDE_CTA.title} description={rtl(AI_GUIDE_CTA.body)} />
          <UnifiedCta
            mailSubject="שיחת היכרות על סוכן AI"
            leadMessage="יש לי עבודה שחוזרת כל יום, ואני רוצה לבדוק אם סוכן AI יכול לקחת אותה."
          />
        </div>
      </div>
    </div>
  );
}
