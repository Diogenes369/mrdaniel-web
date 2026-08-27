import { useEffect, useRef, useState } from 'react';
import { useDeviceTier } from '../hooks/useDeviceTier';
import { getA11yPrefs, subscribeA11y } from '../lib/a11yStore';
import { prefersReducedMotion } from '../lib/gsap';
import { createFieldEngine, type FieldEngineHandle } from './fieldEngine';

/** Mirrors Scene3D.tsx's own `useA11yStopMotion` — kept as a separate local copy rather than a
 * shared import since the two backgrounds are mutually exclusive (see motionFlag.ts) and this is a
 * three-line hook, not worth a shared-module dependency between them. */
function useA11yStopMotion() {
  const [stop, setStop] = useState(() => getA11yPrefs().stopAnimations);
  useEffect(() => subscribeA11y((p) => setStop(p.stopAnimations)), []);
  return stop;
}

/**
 * Lightweight Canvas2D alternative to Scene3D — see src/motion/fieldEngine.ts for the actual
 * particle physics. Only ever mounted when the `?motion=2d` preview flag is on (see App.tsx); never
 * both this and Scene3D at once. Single canvas — the aurora wash layer was removed by explicit
 * request (pure black + white starfield only, zero color wash).
 */
export default function MotionField() {
  const fieldRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FieldEngineHandle | null>(null);
  const tier = useDeviceTier();
  const stopMotion = useA11yStopMotion();

  useEffect(() => {
    const fieldCanvas = fieldRef.current;
    if (!fieldCanvas) return;
    const engine = createFieldEngine({
      fieldCanvas,
      tier,
      reducedMotion: prefersReducedMotion(),
    });
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // Deliberately re-created if `tier` changes (e.g. PerformanceMonitor-style downgrade isn't wired
    // up here, but a device-tier flip from a reduced-motion OS setting toggling mid-session is worth
    // handling correctly rather than leaving stale particle counts).
  }, [tier]);

  useEffect(() => {
    engineRef.current?.setFrozen(stopMotion);
  }, [stopMotion]);

  return (
    <div className="motion-field-layer" aria-hidden="true">
      <canvas ref={fieldRef} />
    </div>
  );
}
