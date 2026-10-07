import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Mic, RotateCcw } from 'lucide-react';
import VoiceWave from './VoiceWave';
import { Artifact, type ArtState } from './MissionArtifacts';
import { MISSIONS } from './missions';
import { fieldRipple, useFieldQuiet } from '../field/fieldState';
import { rtl } from '../../lib/rtl';

/**
 * The /jarvis demo (2026-10-07): one sentence said out loud, and JARVIS running the whole mission
 * on its own. The owner's brief: JARVIS is fully autonomous on voice commands, and the demo has to
 * show that, not a chat that waits for the next instruction.
 *
 * A mission plays in four movements, all inside one dotted frame:
 *   listen   the request appears word by word under a voice line drawn in density glyphs
 *   plan     JARVIS lays out its steps, each with the tool it will work in
 *   run      step after step, the pane shows what it is making (a map being scanned, sites being
 *            built, messages going out, code being typed, a back-test, the bot running); each
 *            finished step ticks off and sends a ripple through the glyph field behind the page
 *   report   JARVIS answers out loud with what it did
 * Nothing in between asks for a click: that is the point being shown. When a mission ends, the
 * finished steps become buttons that bring their result back into the pane, and after a pause
 * the next mission starts. Picking a mission or replaying one hands the console to the visitor
 * and stops the automatic turn.
 *
 * It starts when a third of it is on screen and only moves on to the next mission while it is
 * visible. Under reduced motion every mission shows its finished state and the tabs still switch.
 * The field goes quiet behind the frame.
 */

type Phase = 'idle' | 'listen' | 'plan' | 'run' | 'report' | 'end';

const PHASE_LABEL: Record<Phase, string> = {
  idle: 'מחכה',
  listen: 'מקשיב',
  plan: 'מתכנן',
  run: 'מבצע',
  report: 'מדווח',
  end: 'סיים',
};

const SPRING = { type: 'spring', stiffness: 380, damping: 32, mass: 0.8 } as const;
const HOLD_MS = 6500;

export default function MissionConsole() {
  const reduce = !!useReducedMotion();
  const quiet = useFieldQuiet();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const inViewRef = useRef(false);

  const [mi, setMi] = useState(0);
  const [run, setRun] = useState(0);
  const [auto, setAuto] = useState(true);
  const [started, setStarted] = useState(false);
  const [inView, setInView] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [words, setWords] = useState(0);
  const [planned, setPlanned] = useState(0);
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(0);
  const [said, setSaid] = useState(0);
  const [view, setView] = useState<number | null>(null);

  const mission = MISSIONS[mi];
  // Bidi-anchored first (rtl), then split, so "JARVIS," keeps its comma on the Hebrew side.
  const commandWords = useMemo(() => rtl(mission.command).split(' '), [mission]);
  const report = useMemo(() => rtl(mission.report), [mission]);

  const setRoot = useCallback(
    (el: HTMLDivElement | null) => {
      rootRef.current = el;
      return quiet(el);
    },
    [quiet]
  );

  // In view: start once a third of the frame shows; keep tracking so the turn to the next
  // mission waits for the visitor.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setStarted(true);
      setInView(true);
      inViewRef.current = true;
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        const on = e.intersectionRatio >= 0.3;
        inViewRef.current = on;
        setInView(on);
        if (on) setStarted(true);
      },
      { threshold: [0, 0.3] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const ripple = useCallback((i: number) => {
    const mark = rowRefs.current[i]?.querySelector('.jv-plan__mark');
    if (!mark || !inViewRef.current) return;
    const r = mark.getBoundingClientRect();
    fieldRipple(r.left + r.width / 2, r.top + r.height / 2);
  }, []);

  // One mission, scheduled in full when it starts; switching mission or replaying clears it.
  useEffect(() => {
    if (reduce || !started) return;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    setPhase('listen');
    setWords(0);
    setPlanned(0);
    setStep(-1);
    setDone(0);
    setSaid(0);
    setView(null);

    let t = 420;
    commandWords.forEach((w, i) => {
      at(t, () => setWords(i + 1));
      t += 125 + Math.min(110, w.length * 14);
    });
    t += 500;
    at(t, () => setPhase('plan'));
    mission.steps.forEach((_, i) => at(t + 160 + i * 300, () => setPlanned(i + 1)));
    t += 160 + mission.steps.length * 300 + 420;
    mission.steps.forEach((s, i) => {
      at(t, () => {
        setPhase('run');
        setStep(i);
      });
      t += s.ms;
      at(t, () => {
        setDone(i + 1);
        ripple(i);
      });
      t += 320;
    });
    at(t, () => {
      setStep(-1);
      setPhase('report');
    });
    const chars = report.length;
    for (let c = 2; c < chars; c += 2) at(t + 120 + c * 17, () => setSaid(c));
    t += 120 + chars * 17 + 300;
    at(t, () => {
      setSaid(chars);
      setPhase('end');
    });
    return () => timers.forEach(clearTimeout);
  }, [mi, run, started, reduce, mission, commandWords, report, ripple]);

  // The automatic turn to the next mission, only while the visitor can see it.
  useEffect(() => {
    if (reduce || phase !== 'end' || !auto || !inView) return;
    const id = window.setTimeout(() => setMi((m) => (m + 1) % MISSIONS.length), HOLD_MS);
    return () => clearTimeout(id);
  }, [phase, auto, inView, reduce]);

  const pick = (i: number) => {
    setAuto(false);
    setView(null);
    if (i === mi) setRun((r) => r + 1);
    else setMi(i);
  };
  const replay = () => {
    setAuto(false);
    setRun((r) => r + 1);
  };

  // Reduced motion: every mission is shown finished.
  const still = reduce;
  const shownWords = still ? commandWords.length : words;
  const shownPlan = still ? mission.steps.length : planned;
  const shownDone = still ? mission.steps.length : done;
  const shownSaid = still ? report.length : said;
  const shownPhase: Phase = still ? 'end' : phase;
  const ended = shownPhase === 'end';
  const paneStep = view ?? (step >= 0 ? step : shownDone > 0 ? shownDone - 1 : -1);
  const paneState: ArtState = still || paneStep < shownDone ? 'done' : paneStep === step ? 'run' : 'idle';
  const paneArtifact = paneStep >= 0 ? mission.steps[paneStep] : null;

  return (
    <div ref={setRoot} className="glyph-frame jv-console" role="group" aria-label="הדגמה: JARVIS מבצע משימה שלמה מפקודה קולית">
      <div className="jv-console__bar">
        <span className="jv-console__label">
          <span className="story-statusbar__live" aria-hidden="true" />
          הדגמה
        </span>
        <div className="jv-console__tabs" role="group" aria-label="בחירת משימה">
          {MISSIONS.map((m, i) => (
            <button key={m.id} type="button" className="jv-tab" aria-pressed={i === mi} onClick={() => pick(i)}>
              {m.tab}
              {i === mi && <motion.span layoutId="jv-tab-caret" className="jv-tab__caret" transition={SPRING} />}
            </button>
          ))}
        </div>
        {!still && (
          <button type="button" className="jv-replay" onClick={replay}>
            <RotateCcw size={13} aria-hidden="true" />
            שוב מההתחלה
          </button>
        )}
      </div>

      {/* Four cells. Phones read them in story order (request, plan, what it is making, reply);
          from 900px the pane takes the far column beside the other three. */}
      <div className="jv-console__body">
        {/* The request, said out loud */}
        <div className="jv-voice jv-voice--you">
          <p className="jv-voice__who">
            <Mic size={13} aria-hidden="true" />
            אתם, בקול
          </p>
          <VoiceWave active={shownPhase === 'listen'} tone="you" still={still} spoken={still} />
          <p className="jv-voice__text">
            {commandWords.slice(0, shownWords).join(' ')}
            {shownPhase === 'listen' && <i className="jv-caret" aria-hidden="true" />}
          </p>
        </div>

        {/* The plan JARVIS makes of it, then works through on its own */}
        <div className="jv-plan">
          <p className="jv-plan__who">
            <span dir="ltr">JARVIS</span>
            <span className="jv-plan__phase">{PHASE_LABEL[shownPhase]}</span>
          </p>
          <ol className="jv-plan__list">
            {mission.steps.map((s, i) => {
              const isDone = i < shownDone;
              const isRun = i === step && !still;
              const status = isDone ? 'done' : isRun ? 'run' : 'wait';
              return (
                <li key={s.label} className={i < shownPlan ? 'is-planned' : ''}>
                  <button
                    ref={(el) => {
                      rowRefs.current[i] = el;
                    }}
                    type="button"
                    className={`jv-plan__row is-${status}`}
                    disabled={!(ended && isDone)}
                    aria-pressed={ended && isDone ? paneStep === i : undefined}
                    onClick={() => setView(i)}
                  >
                    <span className="jv-plan__mark" aria-hidden="true">
                      {isDone ? <Check size={14} /> : isRun ? <i className="jv-caret" /> : <i className="jv-plan__box" />}
                    </span>
                    <span className="jv-plan__label">{rtl(s.label)}</span>
                    <span className="jv-plan__tool">{s.tool}</span>
                    <span className="sr-only">{isDone ? 'בוצע' : isRun ? 'בביצוע' : 'ממתין'}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        {/* What it is making right now. An illustration: hidden from screen readers, whose
            users get the same story from the plan's own words. */}
        <div className="jv-console__pane" aria-hidden="true">
          <AnimatePresence initial={false}>
            {paneArtifact ? (
              <motion.div
                key={`${mission.id}-${paneStep}`}
                className="jv-pane"
                initial={{ opacity: 0, y: 12, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.99 }}
                transition={SPRING}
              >
                <Artifact kind={paneArtifact.artifact} state={paneState} ms={paneArtifact.ms} mission={mission.id} />
              </motion.div>
            ) : (
              <motion.div
                key={`${mission.id}-standby`}
                className="jv-pane jv-standby"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={SPRING}
              >
                <span dir="ltr">JARVIS</span>
                <span>
                  {PHASE_LABEL[shownPhase]}
                  <i className="jv-caret" />
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* What it says back */}
        <div className="jv-voice jv-voice--jarvis">
          <p className="jv-voice__who">
            <span dir="ltr">JARVIS</span>, בקול
          </p>
          <VoiceWave active={shownPhase === 'report'} tone="jarvis" still={still} spoken={still} />
          <p className="jv-voice__text">
            {report.slice(0, shownSaid)}
            {(shownPhase === 'report' || ended) && <i className="jv-caret" aria-hidden="true" />}
          </p>
        </div>
      </div>
    </div>
  );
}
