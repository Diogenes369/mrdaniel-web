import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import { useDeviceTier } from '../hooks/useDeviceTier';
import { prefersReducedMotion } from '../lib/gsap';

/**
 * The site's original ambient cosmic starfield — same source/tuning as `StarField` in
 * src/three/SceneObjects.tsx, WITHOUT the wireframe planets/globes that live alongside it there.
 * A visitor on `?motion=2d` gets this real layer back underneath the new Canvas2D particle engine,
 * instead of losing the site's cosmic backdrop entirely.
 *
 * Tuned dimmer/sparser than the original values (opacity 0.95→0.4, count trimmed, pushed one z-unit
 * further back) specifically for this pairing — with the Canvas2D field now running a genuinely
 * active multi-formation state machine on top of it (helices, rings, a converging halo — see
 * fieldEngine.ts), this layer's job shifted from "the visible stars" to "a faint depth cue behind
 * them"; at its original brightness the two competed for the same visual space instead of reading
 * as one background with foreground shapes moving through it.
 *
 * Deliberately its own minimal <Canvas> rather than reusing Scene3D.tsx: no bloom/post-processing,
 * no wireframe bodies, no scroll-driven body physics, no camera dolly — just the one Sparkles draw
 * call, so this costs meaningfully less than the full scene it's standing in for.
 */
function Stars({ tier }: { tier: 'high' | 'low' }) {
  const count = tier === 'high' ? 190 : 110;
  const reduced = prefersReducedMotion();
  return (
    <Sparkles
      count={count}
      size={1.3}
      scale={[32, 19, 17]}
      position={[0, 0, -18]}
      speed={reduced ? 0 : 0.12}
      noise={0.25}
      color="#dff5e6"
      opacity={0.4}
    />
  );
}

export default function StarfieldLayer() {
  const tier = useDeviceTier();
  const dprMax = tier === 'low' ? 1 : Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2);

  return (
    <div className="starfield-layer" aria-hidden="true">
      <Canvas
        dpr={[1, dprMax]}
        gl={{ antialias: false, alpha: true, powerPreference: 'low-power' }}
        camera={{ position: [0, 0, 9], fov: 45, near: 1, far: 30 }}
      >
        <Suspense fallback={null}>
          <Stars tier={tier} />
        </Suspense>
      </Canvas>
    </div>
  );
}
