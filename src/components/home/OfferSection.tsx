import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import GlyphButton from '../ui/GlyphButton';
import Depth from '../story/Depth';
import SiteBot from '../bots/SiteBot';
import type { BotMood } from '../bots/SiteBot';
import type { BotShape, BotTone } from '../bots/botShapes';
import type { HomeOffer, OfferBullet } from '../../data/homeOffers';
import { rtl } from '../../lib/rtl';
import { useFieldQuiet } from '../field/fieldState';
import { LINKTREE_URL, X_URL } from '../SocialLinks';

/**
 * The three pillars after the story (moved into the glyph world 2026-10-06). Each pillar keeps its
 * copy (src/data/homeOffers.ts) and gets its own way of showing its points, so three sections in a
 * row never read as the same card grid three times:
 *
 *   agents  the agent's own window: the tasks tick off one by one as it scrolls in
 *   lab     a test bench: one frame per kind of test, opening one after another
 *   hub     a running log, a caret on the line under the hand
 *
 * A bot from the Grok Bot deck's crew hosts each one, in the open side of the grid.
 */
type Look = { kind: 'tasks' | 'bench' | 'log'; shape: BotShape; tone: BotTone; mood: BotMood; window: string };
const LOOKS: Record<string, Look> = {
  'offer-ai-agents': { kind: 'tasks', shape: 'circle', tone: 'ink', mood: 'focus', window: 'הסוכן במשמרת' },
  'offer-llm-lab': { kind: 'bench', shape: 'diamond', tone: 'pale', mood: 'surprised', window: 'שולחן הבדיקות' },
  'offer-ai-hub': { kind: 'log', shape: 'square', tone: 'hi', mood: 'happy', window: 'מה חדש היום' },
};

function Tasks({ bullets, title }: { bullets: OfferBullet[]; title: string }) {
  return (
    <div className="glyph-frame offer-window" data-live="frame">
      <div className="offer-window__bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <span className="offer-window__title">
          <span className="story-statusbar__live" />
          {title}
        </span>
      </div>
      <ul className="offer-tasks" data-live="stagger" data-live-delay="250">
        {bullets.map((b) => (
          <li key={b.title} className="offer-task">
            <span className="offer-task__check" aria-hidden="true" />
            <div className="min-w-0">
              <h3 className="offer-task__title">{rtl(b.title)}</h3>
              <p className="offer-task__body">{rtl(b.body)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bench({ bullets }: { bullets: OfferBullet[] }) {
  return (
    <ul className="offer-bench" data-live="stagger">
      {bullets.map((b) => (
        <li key={b.title} className="glyph-frame offer-bench__cell">
          <h3 className="offer-bench__title">{rtl(b.title)}</h3>
          <p className="offer-bench__body">{rtl(b.body)}</p>
        </li>
      ))}
    </ul>
  );
}

function Log({ bullets }: { bullets: OfferBullet[] }) {
  return (
    <ul className="glyph-frame offer-log divide-y divide-dotted divide-[var(--color-rule)]" data-live="stagger">
      {bullets.map((b) => (
        <li key={b.title} className="offer-log__row">
          <span className="offer-log__caret" aria-hidden="true" />
          <h3 className="offer-log__title">{rtl(b.title)}</h3>
          <p className="offer-log__body">{rtl(b.body)}</p>
        </li>
      ))}
    </ul>
  );
}

export default function OfferSection({ offer }: { offer: HomeOffer }) {
  const navigate = useNavigate();
  const quiet = useFieldQuiet();
  const quietList = useFieldQuiet();
  const look = LOOKS[offer.id] ?? LOOKS['offer-ai-agents'];

  const openLead = () =>
    window.dispatchEvent(
      new CustomEvent('open-lead-modal', {
        detail: { subject: offer.leadSubject, sourceSection: offer.sourceSection },
      })
    );
  const secondary =
    offer.secondary === 'linktree'
      ? () => window.open(LINKTREE_URL, '_blank', 'noopener,noreferrer')
      : offer.secondary === 'x'
        ? () => window.open(X_URL, '_blank', 'noopener,noreferrer')
        : openLead;

  return (
    <section id={offer.id} className="story-beat offer-beat" data-look={look.kind}>
      <div className="container-wide">
        <div className="grid grid-cols-1 items-end gap-8 lg:grid-cols-12 lg:gap-10">
          <div ref={quiet} className="lg:col-span-7">
            <p className="flex items-center gap-2.5 font-type text-[13px] text-ink-faint" data-live="decode">
              <span className="story-statusbar__live" aria-hidden="true" />
              {rtl(offer.eyebrow)}
            </p>
            <h2 className="story-h2 mt-4">
              {rtl(offer.title)} <span className="text-brand-400">{rtl(offer.accent)}</span>
            </h2>
            <p className="story-body mt-6" data-live="rise">
              {rtl(offer.intro)}
            </p>
          </div>
          <div className="flex lg:col-span-5 lg:justify-end">
            <Depth speed={0.18}>
              <SiteBot shape={look.shape} tone={look.tone} mood={look.mood} size={132} className="offer-beat__bot" />
            </Depth>
          </div>
        </div>

        <div ref={quietList} className="mt-12 md:mt-16">
          {look.kind === 'tasks' && <Tasks bullets={offer.bullets} title={look.window} />}
          {look.kind === 'bench' && <Bench bullets={offer.bullets} />}
          {look.kind === 'log' && <Log bullets={offer.bullets} />}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4 md:mt-12">
          <GlyphButton onClick={() => navigate(offer.route)}>
            {rtl(offer.ctaLabel)}
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </GlyphButton>
          <GlyphButton variant="line" onClick={secondary}>
            {rtl(offer.secondaryLabel)}
          </GlyphButton>
        </div>
      </div>
    </section>
  );
}
