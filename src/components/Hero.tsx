import type { MouseEvent } from 'react';
import { ArrowDown } from 'lucide-react';
import GlyphButton from './ui/GlyphButton';
import Depth from './story/Depth';
import HandNote from './story/HandNote';
import { HERO_COPY } from '../data/siteCopy';
import { smoothScrollTo } from '../hooks/useLenis';
import { rtl } from '../lib/rtl';
import { useFieldBeat, useFieldHeadline, useFieldQuiet } from './field/fieldState';

/** Where the single hero action leads: the first beat of the story. */
const STORY_ANCHOR = '#story';

/**
 * Hero (rewritten 2026-10-01, learners first). The visitor's own feeling as the first line, the
 * promise as the second — and that second line is not typeset by the browser: the glyph field
 * builds it out of the same characters as the noise around it, assembling cell by cell on load.
 * The DOM keeps the real text in place (transparent while the field draws it) so selection,
 * search and screen readers never notice; on small screens or without WebGL it simply stays solid.
 *
 * First paint: nothing here starts hidden. Every line is readable on the first frame; the field
 * fades in behind it once the page is idle.
 *
 * The open side of the hero (left, in RTL) is deliberately empty of DOM: it is where the noise is
 * visible and where the pointer lens wanders until the visitor's own hand takes it over.
 */
export default function Hero() {
  const c = HERO_COPY;
  const beat = useFieldBeat('hero');
  const headline = useFieldHeadline();
  const quietLead = useFieldQuiet();
  const quietBody = useFieldQuiet();
  const accent = rtl(c.h1Accent).split(' ');

  const goToStory = (e: MouseEvent<HTMLElement>) => {
    e.preventDefault();
    smoothScrollTo(STORY_ANCHOR, -24);
  };

  return (
    <section
      id="hero"
      ref={beat}
      // From md up the news ticker sits above the header in normal flow; subtracting it keeps the
      // whole hero inside the first viewport.
      className="story-hero relative flex min-h-[100dvh] flex-col md:min-h-[calc(100dvh-2.25rem)]"
    >
      <div className="container-wide relative z-10 flex flex-1 items-center pb-14 pt-24 md:pb-6 md:pt-24">
        <div className="grid w-full grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <h1 className="story-h1">
              <Depth as="span" speed={0.22}>
                <span ref={quietLead} className="story-h1__lead">
                  {rtl(c.h1Lead)}
                </span>
              </Depth>
              <Depth as="span" speed={0.1}>
                {/* Three lines on a phone (bigger letters read better as glyphs), two from sm up. The
                    trailing spaces keep the accessible text "בואו נעשה בה סדר" intact. */}
                <span ref={headline} className="glyph-accent">
                  {accent[0]}{' '}
                  <br className="sm:hidden" />
                  {accent[1]}{' '}
                  <br className="hidden sm:inline" />
                  {accent[2]}{' '}
                  <br className="sm:hidden" />
                  {accent.slice(3).join(' ')}
                </span>
              </Depth>
            </h1>

            <Depth speed={0.04}>
              <div ref={quietBody} className="mt-8 max-w-[46ch] md:mt-10">
                <p className="story-body !text-ink-paper">{rtl(c.sub)}</p>
                <div className="mt-9">
                  {/* A real anchor, so it still works if the smooth-scroll layer is off. Never full
                      width: on a phone it has to stay clear of the floating accessibility button. */}
                  <GlyphButton href={STORY_ANCHOR} onClick={goToStory}>
                    {rtl(c.ctaPrimary)}
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </GlyphButton>
                </div>
              </div>
            </Depth>
          </div>

          <div className="relative hidden lg:col-span-5 lg:block">
            <Depth speed={0.34} className="absolute end-[8%] top-[18%]">
              <HandNote arrow="down-left">{c.note}</HandNote>
            </Depth>
          </div>
        </div>
      </div>

    </section>
  );
}
