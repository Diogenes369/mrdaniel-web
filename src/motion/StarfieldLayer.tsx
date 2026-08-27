import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import { useDeviceTier } from '../hooks/useDeviceTier';
import { prefersReducedMotion } from '../lib/gsap';

/**
 * The site's original ambient cosmic starfield — extracted verbatim (same count/size/scale/color
 * tuning) from `StarField` in src/three/SceneObjects.tsx, WITHOUT the wireframe planets/globes that
 * live alongside it there. A visitor on `?motion=2d` gets this real layer back underneath the new
 * Canvas2D particle engine, instead of losing the site's cosmic backdrop entirely.
 *
 * Deliberately its own minimal <Canvas> rather than reusing Scene3D.tsx: no bloom/post-processing,
 * no wireframe bodies, no scroll-driven body physics, no camera dolly — just the one Sparkles draw
 * call, so this costs meaningfully less than the full scene it's standing in for.
 */
function Stars({ tier }: { tier: 'high' | 'low' }) {
  const count = tier === 'high' ? 260 : 150;
  const reduced = prefersReducedMotion();
  return (
    <Sparkles
      count={count}
      size={1.7}
      scale={[30, 18, 16]}
      position={[0, 0, -14]}
      speed={reduced ? 0 : 0.15}
      noise={0.25}
      color="#dff5e6"
      opacity={0.95}
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
