import { useEffect, useMemo, useState } from 'react';
import { prefersReducedMotion } from '../lib/gsap';

/**
 * Single-slot rotating headline with a retro terminal "backspace typing" effect: each phrase is
 * typed character-by-character, held, then deleted character-by-character before the next one types
 * in — with a glowing green block caret that stops blinking while it's actively typing/deleting
 * (classic console behaviour) and blinks while the phrase rests.
 *
 * Uses the site's PRIMARY font (var(--font-sans) — Heebo), matching the body/hero copy, rather than
 * a monospace face; the "terminal" character comes entirely from the caret + typing motion.
 */
const TERMS = [
  'סוכני AI שעובדים בשבילכם',
  'אוטומציה שרצה 24/7',
  'הגנת סייבר בלי פשרות',
  'פיתוח פול-סטאק מקצה לקצה',
  'נוכחות דיגיטלית שממירה',
] as const;

const TYPE_MS = 58;      // per-character while typing
const DELETE_MS = 30;    // per-character while deleting (a touch faster, like a held backspace)
const HOLD_MS = 1600;    // dwell on the fully-typed phrase before deleting
const GAP_MS = 320;      // blank pause between deleting one phrase and typing the next

type Phase = 'typing' | 'deleting';

export default function WordRotator() {
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('typing');
  const reduced = prefersReducedMotion();

  // Reserve the width of the longest phrase so the band doesn't reflow on every keystroke.
  const longest = useMemo(() => TERMS.reduce((a, b) => (b.length > a.length ? b : a), ''), []);

  useEffect(() => {
    if (reduced) {
      setText(TERMS[idx]);
      return;
    }
    const full = TERMS[idx];
    let delay: number;
    let step: () => void;

    if (phase === 'typing') {
      if (text.length < full.length) {
        delay = TYPE_MS + Math.random() * 42; // slight human jitter
        step = () => setText(full.slice(0, text.length + 1));
      } else {
        delay = HOLD_MS;
        step = () => setPhase('deleting');
      }
    } else {
      if (text.length > 0) {
        delay = DELETE_MS;
        step = () => setText(full.slice(0, text.length - 1));
      } else {
        delay = GAP_MS;
        step = () => {
          setIdx((i) => (i + 1) % TERMS.length);
          setPhase('typing');
        };
      }
    }

    const t = window.setTimeout(step, delay);
    return () => window.clearTimeout(t);
  }, [text, phase, idx, reduced]);

  const full = TERMS[idx];
  const actively = !reduced && ((phase === 'typing' && text.length < full.length) || (phase === 'deleting' && text.length > 0));

  return (
    <div className="word-rotator" dir="rtl">
      <span className="word-rotator__viewport">
        <span className="word-rotator__sizer" aria-hidden="true">
          {longest}
        </span>
        <span className="word-rotator__text" aria-hidden="true">
          {text}
          <span className={`word-rotator__caret${actively ? ' is-steady' : ''}`} />
        </span>
      </span>
      {/* One calm announcement per phrase for assistive tech, not per keystroke. */}
      <span className="sr-only" aria-live="polite">
        {full}
      </span>
    </div>
  );
}
