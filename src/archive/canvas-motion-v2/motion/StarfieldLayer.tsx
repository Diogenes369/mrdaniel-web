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
  const reduced = prefersReducedMotion();
  // Small, twinkling WHITE stars (pristine, no hue) behind the white Canvas2D particle field —
  // a faint deep dust layer plus a nearer, brighter layer. `noise` drives the shimmer. Kept small
  // and sitting behind the foreground formations, on the near-OLED-black body.
  const far = tier === 'high' ? 360 : 200;
  const near = tier === 'high' ? 140 : 80;
  return (
    <>
      <Sparkles
        count={far}
        size={1.7}
        scale={[34, 20, 18]}
        position={[0, 0, -19]}
        speed={reduced ? 0 : 0.09}
        noise={0.4}
        color="#f2f4ff"
        opacity={0.55}
      />
      <Sparkles
        count={near}
        size={2.6}
        scale={[30, 18, 13]}
        position={[0, 0, -14]}
        speed={reduced ? 0 : 0.18}
        noise={0.55}
        color="#ffffff"
        opacity={0.95}
      />
    </>
  );
}

export default function StarfieldLayer() {
  const tier = useDeviceTier();
  // DPR cap: 1 on low-tier, 2 on a phone viewport (matches the Canvas2D field's cap and keeps the
  // GPU cost low now that mobile runs this by default), 2.5 on desktop for extra crispness.
  const narrowVP = typeof window !== 'undefined' && window.innerWidth < 768;
  const rawDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2;
  const dprMax = tier === 'low' ? 1 : Math.min(narrowVP ? 2 : 2.5, rawDpr);

  // NOTE: the "ease the starfield down over the final stretch so the contact section feels open"
  // effect is driven from fieldEngine.ts's frame loop, which writes `opacity` on `.starfield-layer`
  // imperatively (it already has a rAF loop polling window.scrollY; this site's Lenis setup makes a
  // `scroll` listener here unreliable). The opacity transition lives in index.css — deliberately NOT
  // an inline `style` prop, so a React re-render can't wipe the imperatively-set opacity.

  return (
    <div className="starfield-layer" aria-hidden="true">
      <Canvas
        dpr={[1, dprMax]}
        // depth + stencil buffers are dead weight for two flat Sparkles point layers — dropping
        // them saves GPU memory and a per-frame buffer clear. `antialias:false` + low-power keep it
        // cheap; the points are round sprites so MSAA on edges wasn't doing anything anyway.
        gl={{ antialias: false, alpha: true, depth: false, stencil: false, powerPreference: 'low-power' }}
        camera={{ position: [0, 0, 9], fov: 45, near: 1, far: 30 }}
      >
        <Suspense fallback={null}>
          <Stars tier={tier} />
        </Suspense>
      </Canvas>
    </div>
  );
}
