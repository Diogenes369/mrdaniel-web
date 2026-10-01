import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import Depth from './Depth';
import HandNote from './HandNote';
import { STORY_COPY } from '../../data/siteCopy';
import { rtl } from '../../lib/rtl';
import { useFieldBeat, useFieldQuiet } from '../field/fieldState';

/**
 * Third beat: the route, from "what is this" to building like a developer. No numbers — the order
 * is shown by the layout itself: each stage is typed one indent further along the line, so the
 * list is a staircase you read down and across. A typewriter caret marks the stage at the reading
 * line and springs to the next one as the visitor scrolls.
 */
export default function PathBeat() {
  const c = STORY_COPY.path;
  const beat = useFieldBeat('path');
  const quietText = useFieldQuiet();
  const quietStep = useFieldQuiet();
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const items = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = items.current.indexOf(e.target as HTMLLIElement);
          if (i >= 0) setActive(i);
        }
      },
      // A thin band across the middle of the screen is "the reading line".
      { rootMargin: '-46% 0px -46% 0px' }
    );
    items.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section id="path" ref={beat} className="story-beat">
      <div className="container-wide">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <Depth speed={0.05} className="lg:col-span-7">
            <div ref={quietText}>
              <h2 className="story-h2">{rtl(c.title)}</h2>
              <p className="story-body mt-6">{rtl(c.body)}</p>
            </div>
          </Depth>
          {/* The page's second (and last) handwritten note: in flow under the text on a phone,
              floating in the open margin from lg up. */}
          <div className="relative lg:col-span-5">
            <Depth speed={0.3} className="ms-6 lg:absolute lg:bottom-[-4rem] lg:start-[10%] lg:ms-0">
              <HandNote arrow="down-left" tilt={2}>
                {c.note}
              </HandNote>
            </Depth>
          </div>
        </div>

        <ol className="stairs mt-16 md:mt-24">
          {c.steps.map((s, i) => (
            <li
              key={s.title}
              ref={(el) => {
                items.current[i] = el;
                // Quiet per stage, not per list, so the field still shows between the treads.
                return quietStep(el);
              }}
              className="stair"
              data-active={i === active ? '' : undefined}
              style={{ ['--step' as string]: i }}
            >
              <div className="stair__head">
                {i === active && (
                  <motion.span
                    layoutId="stair-caret"
                    className="stair__caret"
                    aria-hidden="true"
                    transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 22, mass: 0.8 }}
                  />
                )}
                <h3 className="stair__title">{rtl(s.title)}</h3>
              </div>
              <p className="stair__body">{rtl(s.body)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
