import { HelpCircle, ClipboardList, Route, Bot, Send, Check, UserCog, ShoppingCart, FileSearch, Workflow, ArrowLeft, type LucideIcon } from 'lucide-react';
import { PageHero, SectionHeading, UnifiedCta } from '../components/content/ContentPrimitives';
import WebButton from '../components/WebButton';
import {
  AI_GUIDE_HERO,
  AI_GUIDE_WHAT,
  AI_GUIDE_PREP,
  AI_GUIDE_PROCESS,
  AI_GUIDE_SHOWCASE,
  AI_GUIDE_CTA,
  type GuideCard,
} from '../data/aiAgentGuide';
import { rtl } from '../lib/rtl';

/**
 * /ai — the AI agents page, rewritten 2026-09-23 as a practical client guide:
 *   1. What an agent is (plain words + three everyday examples)
 *   2. What to prepare (a checklist a client can do before the first call)
 *   3. How we build it together (four steps, each ending in the client's go-ahead)
 *   → example agents with a direct lead CTA → contact.
 *
 * Removed with the rewrite: the "technical depth" grid (RAG / multi-agent / MCP / Guardian), the
 * AI-news pulse and the demo videos, and every ROI figure — they read as a brochure for engineers
 * and none of the numbers had a source. All copy lives in src/data/aiAgentGuide.ts.
 */

interface ShowcaseAgent {
  icon: LucideIcon;
  title: string;
  tagline: string;
  features: string[];
  subject: string;
}

const SHOWCASE_AGENTS: ShowcaseAgent[] = [
  {
    icon: UserCog,
    title: 'עוזר אישי',
    tagline: 'יומן, מייל ומשימות',
    features: ['קובע ומזיז פגישות ביומן', 'מסכם את המיילים של הבוקר', 'מכין טיוטות תשובה לאישור שלכם'],
    subject: 'סוכן AI · עוזר אישי',
  },
  {
    icon: ShoppingCart,
    title: 'סוכן פניות ולקוחות',
    tagline: 'וואטסאפ ואתר',
    features: ['עונה מיד על השאלות הקבועות', 'אוסף פרטים מלקוח חדש', 'מעביר אליכם רק פנייה רצינית'],
    subject: 'סוכן AI · פניות ולקוחות',
  },
  {
    icon: FileSearch,
    title: 'סוכן שעונה מהמסמכים שלכם',
    tagline: 'מחירונים, נהלים, חוזים',
    features: ['עונה מתוך המסמכים שלכם בלבד', 'מציין מאיפה לקח את התשובה', 'אומר "לא יודע" כשאין תשובה'],
    subject: 'סוכן AI · תשובות מתוך המסמכים',
  },
  {
    icon: Workflow,
    title: 'סוכן עבודה משרדית',
    tagline: 'העתק-הדבק בין מערכות',
    features: ['מעביר פרטים מטופס לטבלה', 'מפיק הצעות מחיר וחשבוניות', 'מתריע כשמשהו לא מסתדר'],
    subject: 'סוכן AI · עבודה משרדית',
  },
];

function openAgentLead(subject: string) {
  window.dispatchEvent(new CustomEvent('open-lead-modal', { detail: { subject, sourceSection: 'AI Page · Agents Showcase' } }));
}

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

function ShowcaseCard({ agent }: { agent: ShowcaseAgent }) {
  const Icon = agent.icon;
  return (
    <div className="flex h-full flex-col glass-panel glass-panel--marketing rounded-2xl p-5 sm:p-6 lg:p-8">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-black/40 text-brand-400">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="font-display text-lg font-bold text-white leading-snug">{agent.title}</h3>
      <p className="mt-1 text-sm text-zinc-400">{agent.tagline}</p>
      <ul className="mt-5 space-y-2.5 flex-grow">
        {agent.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
            <Check className="mt-0.5 w-4 h-4 shrink-0 text-brand-400" />
            {f}
          </li>
        ))}
      </ul>
      <WebButton variant="glass" onClick={() => openAgentLead(agent.subject)} className="mt-6 w-full justify-center">
        אני רוצה סוכן כזה
        <ArrowLeft className="w-4 h-4" />
      </WebButton>
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

          {/* Examples */}
          <SectionHeading icon={Bot} title={AI_GUIDE_SHOWCASE.title} description={rtl(AI_GUIDE_SHOWCASE.intro)} />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 md:gap-6 mb-20">
            {SHOWCASE_AGENTS.map((agent) => (
              <ShowcaseCard key={agent.title} agent={agent} />
            ))}
          </div>

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
