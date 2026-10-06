import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowUpLeft, Check } from 'lucide-react';
import GlyphButton from '../ui/GlyphButton';
import HandNote from '../story/HandNote';
import DecodeText from '../story/DecodeText';
import { GROK_GUIDE as G, GROK_GUIDE_URL, BEGINNER_GUIDE_PATH } from '../../data/grokGuide';
import { rtl } from '../../lib/rtl';
import { smoothScrollTo } from '../../hooks/useLenis';
import { useFieldQuiet } from '../field/fieldState';

/**
 * /grok, under the deck: the same story written out for people who would rather read, or want to go
 * back to one part. Built from the homepage story's own pieces (dotted frames, the stairs with
 * their caret, decode rows, the hand) so it reads as the same world as the deck above it. All copy
 * is in src/data/grokGuide.ts.
 */

const SECTIONS = [
  { id: 'grok-what', nav: G.what.nav },
  { id: 'grok-can', nav: G.can.nav },
  { id: 'grok-control', nav: G.control.nav },
  { id: 'grok-start', nav: G.start.nav },
  { id: 'grok-first', nav: G.first.nav },
  { id: 'grok-quality', nav: G.quality.nav },
  { id: 'grok-month', nav: G.month.nav },
  { id: 'grok-api', nav: G.api.nav },
  { id: 'grok-words', nav: G.words.nav },
];

// Offset 0: the target's own scroll-margin-top (.grok-sec, #grok-deck) clears the fixed header, and
// both Lenis and the native fallback on touch devices honour it, so the two land in the same place.
const jump = (id: string) => (e: MouseEvent<HTMLElement>) => {
  e.preventDefault();
  smoothScrollTo(`#${id}`, 0);
};

function Section({ id, kicker, title, body, children }: { id: string; kicker: string; title: string; body?: string; children?: ReactNode }) {
  const quiet = useFieldQuiet();
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="grok-sec">
      <div ref={quiet} className="max-w-3xl">
        <p className="grok-kicker">{rtl(kicker)}</p>
        <h2 id={`${id}-title`} className="story-h2 mt-3">
          {rtl(title)}
        </h2>
        {body && <p className="story-body mt-5">{rtl(body)}</p>}
      </div>
      {children}
    </section>
  );
}

/** One block of the field stepping back behind it (the field draws at most eight on screen). */
function Quiet({ className = '', children }: { className?: string; children: ReactNode }) {
  const quiet = useFieldQuiet();
  return (
    <div ref={quiet} className={className}>
      {children}
    </div>
  );
}

/** The homepage's stairs: order shown by indent, a caret on the tread at the reading line. */
function Stairs({ id, items }: { id: string; items: { title: string; text: string }[] }) {
  const reduce = useReducedMotion();
  const quiet = useFieldQuiet();
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = refs.current.indexOf(e.target as HTMLLIElement);
          if (i >= 0) setActive(i);
        }
      },
      { rootMargin: '-46% 0px -46% 0px' }
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <ol className="stairs">
      {items.map((s, i) => (
        <li
          key={s.title}
          ref={(el) => {
            refs.current[i] = el;
            // Quiet per tread, not per list, so the field still shows between the steps.
            return quiet(el);
          }}
          className="stair"
          data-active={i === active ? '' : undefined}
          style={{ ['--step' as string]: i }}
        >
          <div className="stair__head">
            {i === active && (
              <motion.span
                layoutId={`stair-caret-${id}`}
                className="stair__caret"
                aria-hidden="true"
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 22, mass: 0.8 }}
              />
            )}
            <h3 className="stair__title">{rtl(s.title)}</h3>
          </div>
          <p className="stair__body">{rtl(s.text)}</p>
        </li>
      ))}
    </ol>
  );
}

function Term({ term, plain }: { term: string; plain: string }) {
  const [play, setPlay] = useState(0);
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="decode-row"
      onViewportEnter={() => setPlay((n) => (n === 0 ? 1 : n))}
      viewport={{ once: true, amount: 0.9 }}
      onHoverStart={() => setPlay((n) => n + 1)}
      whileHover={reduce ? undefined : { x: -6 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
    >
      <dt className="decode-row__term">{rtl(term)}</dt>
      <dd className="decode-row__plain">
        <DecodeText text={rtl(plain)} play={play} />
      </dd>
    </motion.div>
  );
}

export default function GrokGuide() {
  const quietIntro = useFieldQuiet();
  return (
    <div className="mt-20 md:mt-28">
      {/* ── intro + contents ── */}
      <div ref={quietIntro} className="max-w-3xl pb-12 md:pb-16">
        <p className="grok-kicker">{rtl(G.intro.kicker)}</p>
        <h2 className="story-h2 mt-3">{rtl(G.intro.title)}</h2>
        <p className="story-body mt-5">{rtl(G.intro.body)}</p>
        <nav aria-label={G.intro.tocLabel} className="grok-toc mt-8">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} onClick={jump(s.id)} className="model-chip">
              {rtl(s.nav)}
            </a>
          ))}
        </nav>
      </div>

      {/* ── what it is ── */}
      <Section id="grok-what" kicker={G.what.kicker} title={G.what.title} body={G.what.body}>
        <Quiet className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
          {[G.what.chat, G.what.bot].map((c, i) => (
            <div key={c.label} className={`glyph-frame grok-card ${i === 1 ? 'grok-card--lit' : ''}`}>
              <p className={`grok-label ${i === 1 ? 'grok-label--lit' : ''}`}>{rtl(c.label)}</p>
              <p className="grok-card__text mt-3">{rtl(c.text)}</p>
            </div>
          ))}
        </Quiet>
        <Quiet className="mt-8">
          <p className="grok-takeaway">{rtl(G.what.takeaway)}</p>
        </Quiet>
      </Section>

      {/* ── what it can do ── */}
      <Section id="grok-can" kicker={G.can.kicker} title={G.can.title} body={G.can.body}>
        <Quiet className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 md:gap-5">
          {G.can.items.map((c) => (
            <div key={c.title} className="glyph-frame grok-card">
              <h3 className="grok-card__title">{rtl(c.title)}</h3>
              <p className="grok-card__text">{rtl(c.text)}</p>
            </div>
          ))}
          <div className="glyph-frame grok-card grok-card--lit md:col-span-2 lg:col-span-3">
            <p className="grok-label grok-label--lit">{rtl(G.can.team.tag)}</p>
            <h3 className="grok-card__title mt-2">{rtl(G.can.team.title)}</h3>
            <p className="grok-card__text max-w-3xl">{rtl(G.can.team.text)}</p>
          </div>
        </Quiet>
      </Section>

      {/* ── who is in control ── */}
      <Section id="grok-control" kicker={G.control.kicker} title={G.control.title} body={G.control.body}>
        <Quiet className="mt-10">
          <dl className="glyph-frame divide-y divide-dotted divide-[var(--color-rule)]">
            {G.control.items.map((c) => (
              <div key={c.title} className="grok-row">
                <dt className="grok-row__term">{rtl(c.title)}</dt>
                <dd className="grok-row__text">{rtl(c.text)}</dd>
              </div>
            ))}
          </dl>
        </Quiet>
      </Section>

      {/* ── getting started ── */}
      <Section id="grok-start" kicker={G.start.kicker} title={G.start.title} body={G.start.body}>
        <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            <Stairs id="start" items={G.start.steps} />
          </div>
          <Quiet className="lg:col-span-5">
            <aside className="glyph-frame grok-card" aria-labelledby="grok-access-title">
              <h3 id="grok-access-title" className="grok-card__title">
                {rtl(G.start.access.title)}
              </h3>
              <div className="mt-4 flex flex-col gap-4">
                {G.start.access.groups.map((g) => (
                  <div key={g.label}>
                    <p className="grok-label">{rtl(g.label)}</p>
                    <ul className="mt-2 flex flex-wrap gap-2" dir="ltr">
                      {g.plans.map((p) => (
                        <li key={p} className="grok-plan">
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="grok-card__text mt-5">{rtl(G.start.access.quota)}</p>
              <p className="grok-card__text mt-3">{rtl(G.start.access.status)}</p>
              <a href={GROK_GUIDE_URL} target="_blank" rel="noopener noreferrer" className="story-link mt-5 text-[14px]">
                {rtl(G.start.access.official)}
                <ArrowUpLeft className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </aside>
          </Quiet>
        </div>
      </Section>

      {/* ── the first task ── */}
      <Section id="grok-first" kicker={G.first.kicker} title={G.first.title} body={G.first.body}>
        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
          <Quiet className="lg:col-span-7">
            <ul className="glyph-frame divide-y divide-dotted divide-[var(--color-rule)]">
              {G.first.tests.map((t) => (
                <li key={t} className="grok-check">
                  <span className="grok-check__box" aria-hidden="true">
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </span>
                  <span>{rtl(t)}</span>
                </li>
              ))}
            </ul>
          </Quiet>
          {/* The page's one handwritten note, pointing back at the test everyone skips: right under
              the list on a phone, level with its last line from lg. */}
          <div className="relative lg:col-span-5">
            <div className="ms-6 lg:absolute lg:start-0 lg:top-[7.25rem] lg:ms-0">
              <HandNote arrow="up-right" tilt={-3} className="hand-note--lit">
                {G.first.note}
              </HandNote>
            </div>
          </div>
        </div>
        <Quiet className="mt-8 max-w-3xl">
          <p className="story-body">{rtl(G.first.why)}</p>
        </Quiet>
        <Quiet className="mt-12">
          <div className="glyph-frame grok-card">
            <p className="grok-label grok-label--lit">{rtl(G.first.example.title)}</p>
            <ol className="grok-flow mt-4">
              {G.first.example.steps.map((s, i) => (
                <li key={s}>
                  <span className="grok-flow__step">{rtl(s)}</span>
                  {i < G.first.example.steps.length - 1 && <ArrowLeft className="grok-flow__arrow h-4 w-4" aria-hidden="true" />}
                </li>
              ))}
            </ol>
            <p className="grok-card__text mt-5">{rtl(G.first.example.tail)}</p>
          </div>
        </Quiet>
      </Section>

      {/* ── quality ── */}
      <Section id="grok-quality" kicker={G.quality.kicker} title={G.quality.title} body={G.quality.body}>
        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
          <Quiet className="lg:col-span-7">
            <div className="grok-file">
              <div className="grok-file__bar">
                <span>{rtl(G.quality.rulesTitle)}</span>
                <span dir="ltr">{G.quality.file}</span>
              </div>
              <ul className="grok-file__list">
                {G.quality.rules.map((r) => (
                  <li key={r}>{rtl(r)}</li>
                ))}
              </ul>
            </div>
            <p className="grok-card__text mt-5">{rtl(G.quality.tip)}</p>
          </Quiet>
          <Quiet className="lg:col-span-5">
            <div className="glyph-frame grok-card">
              <div className="grok-tries" aria-hidden="true">
                <span data-state="fail" />
                <span data-state="pass" />
                <span />
              </div>
              <h3 className="grok-card__title mt-4">{rtl(G.quality.tries.title)}</h3>
              <p className="grok-card__text">{rtl(G.quality.tries.text)}</p>
            </div>
          </Quiet>
        </div>
      </Section>

      {/* ── the first month ── */}
      <Section id="grok-month" kicker={G.month.kicker} title={G.month.title} body={G.month.body}>
        <div className="mt-12">
          <Stairs id="month" items={G.month.weeks} />
        </div>
        <Quiet className="mt-12">
          <p className="grok-statement">{rtl(G.month.closing)}</p>
        </Quiet>
      </Section>

      {/* ── for builders ── */}
      <Section id="grok-api" kicker={G.api.kicker} title={G.api.title} body={G.api.body}>
        <Quiet className="mt-10">
          <dl className="glyph-frame divide-y divide-dotted divide-[var(--color-rule)]">
            {G.api.models.map((m) => (
              <div key={m.name + (m.role ?? '')} className="grok-row">
                <dt className="grok-row__term grok-row__term--model">
                  <bdi dir="ltr">{m.name}</bdi>
                  {m.role && <span className="grok-row__role">{rtl(m.role)}</span>}
                </dt>
                <dd className="grok-row__text">{rtl(m.text)}</dd>
              </div>
            ))}
          </dl>
          <p className="grok-takeaway mt-8">{rtl(G.api.rule)}</p>
          <p className="mt-5 max-w-3xl font-type text-[12.5px] leading-relaxed text-ink-faint">{rtl(G.api.update)}</p>
        </Quiet>
        <Quiet className="mt-10">
          <div className="glyph-frame grok-card">
            <h3 className="grok-card__title">{rtl(G.api.cliff.title)}</h3>
            <p className="grok-card__text max-w-3xl">{rtl(G.api.cliff.text)}</p>
            <ul className="grok-file__list grok-file__list--flush mt-3">
              {G.api.cliff.tips.map((t) => (
                <li key={t}>{rtl(t)}</li>
              ))}
            </ul>
          </div>
        </Quiet>
      </Section>

      {/* ── words ── */}
      <Section id="grok-words" kicker={G.words.kicker} title={G.words.title} body={G.words.body}>
        <Quiet className="mt-10">
          <dl className="glyph-frame divide-y divide-dotted divide-[var(--color-rule)]">
            {G.words.pairs.map((p) => (
              <Term key={p.term} term={p.term} plain={p.plain} />
            ))}
          </dl>
        </Quiet>
      </Section>

      {/* ── the close ── */}
      <section aria-labelledby="grok-end-title" className="grok-sec grok-sec--end">
        <Quiet className="max-w-3xl">
          <h2 id="grok-end-title" className="story-h2">
            {rtl(G.end.title)}
          </h2>
          <p className="story-body mt-5">{rtl(G.end.body)}</p>
          <p className="grok-card__text mt-8">{rtl(G.end.beginners)}</p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <GlyphButton to={BEGINNER_GUIDE_PATH}>
              {rtl(G.end.guideCta)}
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </GlyphButton>
            <GlyphButton variant="line" href="#grok-deck" onClick={jump('grok-deck')}>
              {rtl(G.end.backCta)}
            </GlyphButton>
          </div>
        </Quiet>
      </section>
    </div>
  );
}
