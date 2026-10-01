import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

const NOISE = 'אבגדהוזחטיכלמנסעפצקרשת=+:-';
/** Letters that resolve; marks, spaces and punctuation stay put so the line never changes length. */
const LETTER = /[א-תA-Za-z0-9]/;

/**
 * A line that arrives the way the whole page works: as noise first, then resolving into plain
 * words, letter by letter in reading order. The final sentence reserves the layout underneath,
 * so nothing around it moves while it decodes. The real sentence is always in the DOM for screen
 * readers and search; only the animated copy is hidden from them.
 *
 * `play` is a counter — bump it to decode again (on hover, for instance).
 */
export default function DecodeText({ text, play, className }: { text: string; play: number; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(text);
  const raf = useRef(0);

  useEffect(() => {
    if (reduce || play === 0) {
      setShown(text);
      return;
    }
    const chars = [...text];
    const start = performance.now();
    const dur = 520 + chars.length * 14;
    let lastSwap = 0;
    let frame = chars.map((c) => c);
    const step = (now: number) => {
      const p = (now - start) / dur;
      if (p >= 1) {
        setShown(text);
        return;
      }
      // Swap noise characters ~25 times a second, not every frame, so it reads as typing.
      if (now - lastSwap > 40) {
        lastSwap = now;
        frame = chars.map((c, i) => {
          if (!LETTER.test(c)) return c;
          return i / chars.length < p * 1.15 - 0.12 ? c : NOISE[Math.floor(Math.random() * NOISE.length)];
        });
        setShown(frame.join(''));
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [text, play, reduce]);

  // The final sentence holds the layout (invisible); the scramble is laid over it, so a noise
  // glyph wider than the letter it stands in for can never re-wrap the line or move the row.
  return (
    <span className={`relative inline-block ${className ?? ''}`}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="invisible">
        {text}
      </span>
      <span aria-hidden="true" className="absolute inset-0">
        {shown}
      </span>
    </span>
  );
}
