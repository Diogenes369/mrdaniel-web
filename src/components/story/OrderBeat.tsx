import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import Depth from './Depth';
import DecodeText from './DecodeText';
import { STORY_COPY } from '../../data/siteCopy';
import { rtl } from '../../lib/rtl';
import { useFieldBeat, useFieldQuiet } from '../field/fieldState';

/**
 * Second beat: while the visitor reads it, the field behind sorts itself from noise into a typed
 * page (the controller's `order` stage). The section shows the same move at word scale: a term
 * people meet in every headline, and next to it what it actually means, decoded out of noise into
 * plain Hebrew as the row comes into view, and again whenever the hand passes over it.
 */
export default function OrderBeat() {
  const c = STORY_COPY.order;
  const beat = useFieldBeat('order');
  const quietText = useFieldQuiet();
  const quietList = useFieldQuiet();

  return (
    <section id="order" ref={beat} className="story-beat">
      <div className="container-wide">
        <Depth speed={0.05} className="max-w-[58ch]">
          <div ref={quietText}>
            <h2 className="story-h2">{rtl(c.title)}</h2>
            <p className="story-body mt-6">{rtl(c.body)}</p>
          </div>
        </Depth>

        <Depth speed={0.12} className="mt-16 lg:ms-[16.66%]">
          <dl ref={quietList} className="glyph-frame divide-y divide-dotted divide-[var(--color-rule)]">
            {c.pairs.map((p) => (
              <Pair key={p.term} term={p.term} plain={p.plain} />
            ))}
          </dl>
        </Depth>
      </div>
    </section>
  );
}

function Pair({ term, plain }: { term: string; plain: string }) {
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
      {/* The dotted leader between term and meaning is the dd's ::before (a dl row may hold only dt/dd). */}
      <dd className="decode-row__plain">
        <DecodeText text={rtl(plain)} play={play} />
      </dd>
    </motion.div>
  );
}
