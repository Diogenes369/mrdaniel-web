import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { Sparkles } from '@react-three/drei';
import { MathUtils, Object3D } from 'three';
import type { Mesh, Group, InstancedMesh, PerspectiveCamera } from 'three';
import { prefersReducedMotion } from '../lib/gsap';
import { advanceTransitionPulse, dampScrollState, getSmoothScrollState, getTransitionPulse } from '../hooks/useLenis';
import { getPointerState, getPointerIdleMs } from '../hooks/usePointer';
import { isIOSWebKit, type DeviceTier } from '../hooks/useDeviceTier';
import { isDebugMode } from '../lib/debugConsole';

interface SceneObjectsProps {
  tier: DeviceTier;
  bloomEnabled: boolean;
  /** Gates the extra decorative bodies (TertiaryPlanet, CrystalCluster, second CosmicShard,
   * DebrisField) — separate from `tier` because this is *also* off on iOS regardless of hardware
   * tier (see Scene3D.tsx), not just on low-tier hardware. */
  extrasEnabled: boolean;
}

const GREEN = '#76B900';
const GLOW = '#00FF66';

/** Smoothstep easing — turns a linear 0..1 ramp into an organic ease-in/ease-out curve. */
function smoothstep(t: number) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** How "in the hero" the page currently is: 1 at the very top, easing to 0 by ~35% scroll. */
function heroFactor(progress: number) {
  return 1 - smoothstep(progress * 2.8);
}

/**
 * Large-scale, scroll-progress-keyed sweep (NOT time-keyed) layered on top of a body's own idle
 * drift once it has left its hero-edge position. Driven by Lenis's already-smoothed scroll
 * progress rather than raw time, so it only advances as the user actually scrolls — the "flying
 * across the full site" effect — while a small time-driven wobble underneath keeps it alive when
 * scroll is still. `seed` decorrelates bodies so they never move in lockstep.
 */
function travelDrift(progress: number, seed: number) {
  const a = progress * Math.PI * 1.7 + seed;
  return {
    x: Math.sin(a) * 3.2,
    y: Math.cos(a * 0.8) * 2.0,
    z: Math.sin(a * 0.6) * 2.0,
  };
}

/** The exact visible half-width/half-height of the camera frustum at world depth `depthZ`, computed
 * live from the camera's actual (fov/aspect-aware, auto-updated-on-resize) state. Positions are
 * defined against a fixed 16:9-desktop `BASELINE_*` reference and then rescaled by this every
 * frame, so bodies always reach the TRUE edges of whatever viewport is actually visible —
 * spreading wide on ultra-wide monitors and pulling in correctly on narrow mobile screens —
 * instead of sitting at fixed world coordinates tuned for one aspect ratio. */
function viewportSpreadAt(camera: PerspectiveCamera, depthZ: number) {
  const dist = Math.max(0.5, camera.position.z - depthZ);
  const vFov = (camera.fov * Math.PI) / 180;
  const halfHeight = Math.tan(vFov / 2) * dist;
  const halfWidth = halfHeight * camera.aspect;
  return { halfWidth, halfHeight };
}
const BASELINE_HALF_WIDTH = 8.7;
const BASELINE_HALF_HEIGHT = 4.9;

/** Unlit wireframe material — no lighting computation per fragment (cheaper than the old PBR
 * chrome/glass), self-colored dark-cyber-green edges. `toneMapped={false}` keeps the edge color at
 * its raw intensity regardless of the renderer's scene-wide tone mapping. Deliberately low default
 * opacity for a subdued "deep, dark" cyber-green read rather than a bright neon one.
 *
 * Note on line thickness: WebGL's `linewidth` is ignored on effectively every desktop/mobile GPU
 * driver (a long-standing platform limitation, not a Three.js gap), so wireframe edges always
 * render at ~1px regardless of any thickness value set here — there is no real lever to pull for
 * "thinner" strokes beyond that 1px floor. The "thinner, sleeker" read instead comes from lower
 * geometry detail (fewer, sparser edges) and this lower opacity, both applied at each call site. */
function WireframeMaterial({ color, opacity = 0.42 }: { color: string; opacity?: number }) {
  return <meshBasicMaterial color={color} wireframe transparent opacity={opacity} toneMapped={false} depthWrite={false} />;
}

/** Subtle continuous tilt toward the pointer/touch position AND its instantaneous velocity (a
 * quick cursor flick nudges it further than a slow drift would) — lerped, never snapped. `strength`
 * scales how reactive a given body is, so secondary bodies can feel present without stealing focus
 * from the primary one. */
function PointerTiltGroup({ strength, children }: { strength: number; children: React.ReactNode }) {
  const ref = useRef<Group>(null);
  const rot = useRef({ x: 0, y: 0 });
  const reduced = useRef(prefersReducedMotion()).current;

  useFrame((_, delta) => {
    if (reduced || !ref.current) return;
    const { x: px, y: py, vx: pvx, vy: pvy } = getPointerState();
    // Tuned for high sensitivity: a bigger share of raw position plus a wider velocity cap, so a
    // quick cursor flick reads as an immediate, pronounced reaction rather than a gentle nudge.
    const targetY = px * 0.68 * strength + Math.max(-0.42, Math.min(0.42, pvx * 0.09)) * strength;
    const targetX = -py * 0.46 * strength + Math.max(-0.36, Math.min(0.36, -pvy * 0.09)) * strength;
    rot.current.y += (targetY - rot.current.y) * Math.min(1, delta * 4.4);
    rot.current.x += (targetX - rot.current.x) * Math.min(1, delta * 4.4);
    ref.current.rotation.y = rot.current.y;
    ref.current.rotation.x = rot.current.x;
  });

  return <group ref={ref}>{children}</group>;
}

/**
 * Positions and continuously spins (on all three axes) ONE fixed body (or pair of bodies, passed
 * as children) — geometry never changes, ever, so nothing pops or morphs. At page load (`progress`
 * 0, so `heroFactor` = 1) the body sits exactly at `edge`, chosen to sit on the outer margins of
 * the hero viewport, with only a small time-driven wobble so it still reads as "alive" rather than
 * frozen. As the user scrolls past the hero, it blends smoothly (every frame, driven by the
 * already-smoothed Lenis progress — never a jump cut) into a continuous idle wander around
 * `center`, additionally swept across the FULL page by `travelDrift` and stretched to the true
 * viewport edges by `viewportSpreadAt`. Scroll velocity speeds up the existing motion AND drives a
 * smooth (lerped, never-snapping) pitch tilt, so the body visibly reacts to scroll direction.
 */
function ScrollBody({
  edge,
  center,
  amp,
  freq,
  phase,
  spin,
  scaleRange = [1, 1],
  children,
  debugLabel,
}: {
  edge: [number, number, number];
  center: [number, number, number];
  amp: [number, number, number];
  freq: [number, number, number];
  phase: number;
  spin: [number, number, number];
  scaleRange?: [number, number];
  children: React.ReactNode;
  /** When set (and isDebugMode() is on), logs this body's live transform once/sec — see
   * DebugTelemetry below for the reasoning. Only PrimaryPlanet passes this, to avoid log spam. */
  debugLabel?: string;
}) {
  const groupRef = useRef<Group>(null);
  const clockRef = useRef(0);
  // Properly-integrated oscillator phase for each axis — NOT `elapsedTime * freq * speedMul`.
  // That form looks equivalent but isn't: its instantaneous rate of change is
  // `freq * (speedMul + elapsedTime * d(speedMul)/dt)`, so once `elapsedTime` has grown large
  // (any session running for more than a few seconds), even a small per-frame change in
  // `speedMul` — exactly what happens at every scroll-direction reversal, since velocity's sign
  // flips through zero — gets multiplied by that large elapsed time and shows up as a visible
  // snap. Integrating `freq * speedMul * delta` into an accumulator every frame instead means a
  // change in speedMul only ever affects the CURRENT frame's tiny increment, never retroactively
  // amplified — so direction reversals stay smooth regardless of how long the page has been open.
  const phaseAccum = useRef({ x: 0, y: 0, z: 0 });
  const spinAccum = useRef({ x: 0, y: 0, z: 0 });
  const tilt = useRef(0);
  const roll = useRef(0);
  const elevation = useRef(0);
  // 0..1 blend toward the idle "infinity path" wander below — ramps in slowly (only once the user
  // has genuinely stopped, so it never fights active pointer/scroll interaction) and snaps back out
  // fast the instant either resumes.
  const idleBlend = useRef(0);
  // Rotation driven directly by `progress` (position), not `velocity` — a second, independent
  // motion source on top of the velocity-driven tilt/roll below. Even in a worst case where the
  // velocity signal is somehow unreliable on a given platform, this guarantees a large, obvious,
  // unambiguous rotation change tied purely to scroll position, since `progress` has been
  // confirmed reliable by on-device telemetry on every platform tested so far.
  const progressSpin = useRef(0);
  const lastBodyLogAt = useRef(0);
  const bodyDebugOn = useRef(!!debugLabel && isDebugMode()).current;
  const reduced = useRef(prefersReducedMotion()).current;

  useFrame((state, delta) => {
    if (!groupRef.current || reduced) return;
    clockRef.current += delta;
    const t = clockRef.current;
    const { progress, velocity } = getSmoothScrollState();
    const speedMul = 1 + Math.min(Math.abs(velocity) * 0.03, 1.5);
    const heroT = heroFactor(progress);
    const drift = travelDrift(progress, phase);

    // Idle detection: no real pointer/touch movement recently AND scroll has settled. Once true,
    // blend from the small hero-park wobble (2 sine terms, period short enough to technically
    // repeat) into a wider Lissajous-style wander — x/y driven by an irrational frequency ratio
    // (1 : √2), so the path never exactly retraces itself within any realistic idle stretch, giving
    // the "organic, non-repetitive infinity path" read the moment nobody's driving the scene.
    const isIdle = getPointerIdleMs() > 2200 && Math.abs(velocity) < 2;
    idleBlend.current = MathUtils.lerp(idleBlend.current, isIdle ? 1 : 0, Math.min(1, delta * (isIdle ? 0.6 : 3.2)));

    const parkWobbleX = Math.sin(t * 0.12 + phase) * 0.32;
    const parkWobbleY = Math.cos(t * 0.1 + phase * 0.6) * 0.26;
    const infinityX = Math.sin(t * 0.11 + phase) * 0.9;
    const infinityY = Math.sin(t * 0.11 * Math.SQRT2 + phase * 1.3) * Math.cos(t * 0.11 + phase) * 0.65;
    const wobbleX = MathUtils.lerp(parkWobbleX, infinityX, idleBlend.current);
    const wobbleY = MathUtils.lerp(parkWobbleY, infinityY, idleBlend.current);

    phaseAccum.current.x += freq[0] * speedMul * delta;
    phaseAccum.current.y += freq[1] * speedMul * delta;
    phaseAccum.current.z += freq[2] * speedMul * delta;

    const travelX = center[0] + Math.sin(phaseAccum.current.x + phase) * amp[0] + drift.x * (1 - heroT);
    const travelY = center[1] + Math.sin(phaseAccum.current.y + phase * 0.7) * amp[1] + drift.y * (1 - heroT);
    const travelZ =
      center[2] +
      Math.sin(phaseAccum.current.z + phase * 0.4) * amp[2] +
      drift.z * (1 - heroT) * 0.6 +
      (progress - 0.5) * 2.2;

    let x = travelX + (edge[0] + wobbleX - travelX) * heroT;
    let y = travelY + (edge[1] + wobbleY - travelY) * heroT;
    const z = travelZ + (edge[2] - travelZ) * heroT;

    const { halfWidth, halfHeight } = viewportSpreadAt(state.camera as PerspectiveCamera, z);
    x *= halfWidth / BASELINE_HALF_WIDTH;
    y *= halfHeight / BASELINE_HALF_HEIGHT;

    // "Perfect Motion" page-transition cue: a brief pull toward center on route change (see
    // triggerRouteTransitionPulse in App.tsx), riding the same time-driven loop as everything
    // else — not a separate GSAP/ScrollTrigger animation.
    const pulse = getTransitionPulse();
    x *= 1 - pulse * 0.35;
    y *= 1 - pulse * 0.35;

    // Gentle scroll-velocity-driven elevation (Y bob), lerped — never snapped — on top of the
    // body's own travel path, so faster scrolling reads as a slight floating "lift" rather than
    // just a flat position change.
    const elevationTarget = Math.max(-0.55, Math.min(0.55, velocity * 0.016));
    elevation.current = MathUtils.lerp(elevation.current, elevationTarget, Math.min(1, delta * 2.4));

    groupRef.current.position.set(x, y + elevation.current, z);

    const [heroScale, travelScale] = scaleRange;
    groupRef.current.scale.setScalar(travelScale + (heroScale - travelScale) * heroT);

    // Multi-axis velocity reaction: X = pitch (existing), Z = roll (new) — different lerp rates so
    // the two axes don't move in perfect lockstep, reading as a genuine 3D wobble rather than one
    // flat tilt.
    const tiltTarget = Math.max(-0.5, Math.min(0.5, velocity * 0.024));
    tilt.current = MathUtils.lerp(tilt.current, tiltTarget, Math.min(1, delta * 3.4));
    const rollTarget = Math.max(-0.32, Math.min(0.32, velocity * 0.014));
    roll.current = MathUtils.lerp(roll.current, rollTarget, Math.min(1, delta * 2.6));

    spinAccum.current.x += delta * spin[0] * speedMul;
    spinAccum.current.y += delta * spin[1] * speedMul;
    spinAccum.current.z += delta * spin[2] * speedMul;

    // Second, velocity-independent rotation source (see progressSpin above): a full-circle sweep
    // mapped directly to scroll progress, lerped so a sudden progress jump (e.g. an anchor-link
    // scroll) eases in rather than snapping.
    progressSpin.current = MathUtils.lerp(progressSpin.current, progress * Math.PI * 2, Math.min(1, delta * 3));

    groupRef.current.rotation.set(
      spinAccum.current.x + tilt.current,
      spinAccum.current.y + progressSpin.current,
      spinAccum.current.z + roll.current
    );

    // Debug-only: proves whether THIS body's own transform math is actually changing frame to
    // frame on-device, independent of the generic frame-loop fps telemetry elsewhere — if these
    // numbers visibly change every second but the body still looks static on screen, the bug is
    // downstream of this math (rendering/compositing), not in the animation logic itself.
    if (bodyDebugOn) {
      const now = state.clock.elapsedTime * 1000;
      if (now - lastBodyLogAt.current > 1000) {
        lastBodyLogAt.current = now;
        console.info(`[Scene3D debug] ${debugLabel} transform:`, {
          position: [Number(x.toFixed(3)), Number((y + elevation.current).toFixed(3)), Number(z.toFixed(3))],
          rotationY: Number((spinAccum.current.y + progressSpin.current).toFixed(3)),
          progress: Number(progress.toFixed(3)),
          velocity: Number(velocity.toFixed(2)),
        });
      }
    }
  });

  return (
    <group ref={groupRef} position={edge}>
      {children}
    </group>
  );
}

/** The flagship: a nested pair of wireframe geodesic spheres (sparse outer shell + dense inner
 * core, tilted apart slightly) that gently tilts to follow the pointer or a touch drag — see
 * PointerTiltGroup. Solid and fully assembled at all times — no fracturing/disassembly. Geometry
 * is fixed forever; only spin + tilt animate. */
function PrimaryPlanet({ tier }: { tier: DeviceTier }) {
  const outerRef = useRef<Mesh>(null);
  const innerRef = useRef<Mesh>(null);
  const reduced = useRef(prefersReducedMotion()).current;
  const detail = tier === 'high' ? 1 : 0;

  useFrame((_, delta) => {
    if (reduced) return;
    if (outerRef.current) outerRef.current.rotation.y += delta * 0.05;
    if (innerRef.current) innerRef.current.rotation.y -= delta * 0.07;
  });

  return (
    <ScrollBody
      edge={[3.6, 1.6, -3.0]}
      center={[2.4, 0.7, -2.4]}
      amp={[0.7, 0.5, 0.7]}
      freq={[0.05, 0.065, 0.038]}
      phase={1.1}
      spin={[0, 0, 0]}
      scaleRange={[0.6, 1]}
      debugLabel="PrimaryPlanet"
    >
      <PointerTiltGroup strength={1}>
        <mesh ref={outerRef} rotation={[0.4, 0.3, 0]}>
          <icosahedronGeometry args={[1.5, detail]} />
          <WireframeMaterial color={GLOW} opacity={0.4} />
        </mesh>
        <mesh ref={innerRef} rotation={[0.7, 1.0, 0.3]}>
          <icosahedronGeometry args={[0.85, detail]} />
          <WireframeMaterial color={GLOW} opacity={0.55} />
        </mesh>
      </PointerTiltGroup>
    </ScrollBody>
  );
}

/** A single, unchanging wireframe planetary body — continuous multi-axis spin, subtler pointer
 * reactivity, no morphing. */
function SecondaryPlanet({ tier }: { tier: DeviceTier }) {
  const detail = tier === 'high' ? 1 : 0;
  return (
    <ScrollBody
      edge={[-3.6, -1.7, -3.2]}
      center={[-2.4, -0.5, -2.8]}
      amp={[3.0, 2.2, 1.8]}
      freq={[0.045, 0.058, 0.04]}
      phase={2.7}
      spin={[0.035, 0.06, 0.02]}
    >
      <PointerTiltGroup strength={0.45}>
        <mesh>
          <icosahedronGeometry args={[1.0, detail]} />
          <WireframeMaterial color={GREEN} opacity={0.34} />
        </mesh>
      </PointerTiltGroup>
    </ScrollBody>
  );
}

/** A single, unchanging wireframe planetary body — high tier only. */
function TertiaryPlanet() {
  return (
    <ScrollBody
      edge={[0, -2.5, -4.0]}
      center={[0.4, -1.8, -3.4]}
      amp={[2.4, 1.8, 1.6]}
      freq={[0.05, 0.045, 0.03]}
      phase={4.4}
      spin={[0.028, 0.05, 0.018]}
    >
      <mesh>
        <icosahedronGeometry args={[0.75, 1]} />
        <WireframeMaterial color={GREEN} opacity={0.32} />
      </mesh>
    </ScrollBody>
  );
}

/** A single, unchanging faceted wireframe shard — elongated and thin, reading as debris/a comet
 * fragment rather than a full planet. Same ScrollBody engine as the planets (peripheral
 * hero-parking, scroll travel, idle wobble), tuned with a slower frequency and slightly heavier
 * lerp feel for a "weightier" autonomous drift. */
function CosmicShard({
  edge,
  center,
  phase,
}: {
  edge: [number, number, number];
  center: [number, number, number];
  phase: number;
}) {
  return (
    <ScrollBody
      edge={edge}
      center={center}
      amp={[1.6, 1.2, 1.1]}
      freq={[0.032, 0.04, 0.026]}
      phase={phase}
      spin={[0.02, 0.05, 0.014]}
      scaleRange={[0.5, 1]}
    >
      <mesh scale={[0.42, 1.35, 0.42]} rotation={[0.3, 0.4, 0.2]}>
        <octahedronGeometry args={[0.55, 0]} />
        <WireframeMaterial color={GLOW} opacity={0.44} />
      </mesh>
    </ScrollBody>
  );
}

/** A single, unchanging faceted wireframe cluster — high tier only. */
function CrystalCluster() {
  return (
    <ScrollBody
      edge={[0, 2.3, -3.8]}
      center={[0.6, 1.6, -3.3]}
      amp={[1.8, 1.3, 1.2]}
      freq={[0.03, 0.036, 0.024]}
      phase={5.8}
      spin={[0.015, 0.03, 0.01]}
      scaleRange={[0.5, 1]}
    >
      <mesh rotation={[0.4, 0.6, 0.1]}>
        <icosahedronGeometry args={[0.68, 0]} />
        <WireframeMaterial color={GREEN} opacity={0.36} />
      </mesh>
    </ScrollBody>
  );
}

/** The half-sphere neon-green wireframe "planet horizon" anchored to the Hero section — a large
 * geodesic wireframe sphere sunk mostly below the viewport so only its upper curvature shows as a
 * horizon arc, à la a Vanta.NET-style triangulated network.
 *
 * The apex (topmost visible point) is placed at a FIXED fraction of the viewport height — computed
 * as `topY`, then `centerY = topY - radius` — so the visible curve's vertical position is entirely
 * independent of the sphere's radius. A previous version scaled the radius by viewport width
 * *without* re-deriving centerY from it, so on wide viewports the sphere grew far taller than
 * intended and its apex rose well into the hero title. Radius here only controls how flat vs.
 * bowed the curve reads across the screen width, never how high it sits.
 *
 * Sinks further down and out of frame as the user scrolls past the hero (driven by the same
 * `heroFactor` every other body uses), rather than fading via a material-opacity tween — cheaper
 * (no material ref needed) and always in sync with the rest of the hero-exit motion. */
function EarthHorizon({ tier }: { tier: DeviceTier }) {
  const ref = useRef<Mesh>(null);
  const reduced = useRef(prefersReducedMotion()).current;
  const detail = tier === 'high' ? 2 : 1;
  const DEPTH_Z = -9;

  useFrame((state, delta) => {
    if (!ref.current) return;
    const { progress } = getSmoothScrollState();
    const heroT = heroFactor(progress);
    const { halfWidth, halfHeight } = viewportSpreadAt(state.camera as PerspectiveCamera, DEPTH_Z);

    const radius = halfWidth * 1.7;
    // Apex stays at 72% of the way from viewport center to the bottom edge — comfortably inside
    // the bottom half, well clear of the vertically-centered hero title/CTA block above it.
    const topY = -halfHeight * 0.72;
    const centerY = topY - radius - (1 - heroT) * halfHeight * 1.6;

    ref.current.position.set(0, centerY, DEPTH_Z);
    ref.current.scale.setScalar(radius);
    if (!reduced) ref.current.rotation.y += delta * 0.012;
  });

  return (
    <mesh ref={ref} position={[0, -9, DEPTH_Z]}>
      <icosahedronGeometry args={[1, detail]} />
      <WireframeMaterial color={GLOW} opacity={0.28} />
    </mesh>
  );
}

/** GPU-instanced field of small wireframe debris fragments — one draw call for the whole field
 * regardless of count, each instance's transform written straight into the shared instance buffer
 * every frame (no per-instance React state/reconciliation). Slides forward with scroll progress on
 * top of a slow individual drift, reinforcing the "flying through a debris field" read alongside
 * CameraRig's dolly. Skipped entirely (zero draw calls) unless extras are enabled. */
function DebrisField({ enabled }: { enabled: boolean }) {
  const count = enabled ? 50 : 0;
  const meshRef = useRef<InstancedMesh>(null);
  const reduced = useRef(prefersReducedMotion()).current;
  const dummy = useMemo(() => new Object3D(), []);
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        pos: [(Math.random() - 0.5) * 24, (Math.random() - 0.5) * 14, -5 - Math.random() * 16] as [number, number, number],
        spin: 0.15 + Math.random() * 0.35,
        scale: 0.05 + Math.random() * 0.09,
        phase: Math.random() * Math.PI * 2,
      })),
    [count]
  );

  useFrame((state) => {
    if (!meshRef.current || reduced) return;
    const t = state.clock.elapsedTime;
    const { progress } = getSmoothScrollState();
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      const z = s.pos[2] + progress * 6;
      dummy.position.set(s.pos[0], s.pos[1] + Math.sin(t * 0.15 + s.phase) * 0.4, z);
      dummy.rotation.set(t * s.spin, t * s.spin * 0.7, 0);
      dummy.scale.setScalar(s.scale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (count === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <tetrahedronGeometry args={[1, 0]} />
      <WireframeMaterial color={GREEN} opacity={0.26} />
    </instancedMesh>
  );
}

/** Gentle forward dolly tied to scroll progress — the literal "camera flies through the scene"
 * half of the cosmic-journey effect, layered on top of every body's own scroll-driven parallax.
 * Lerped (never snapped) so scroll-direction reversals stay smooth. */
function CameraRig() {
  const reduced = useRef(prefersReducedMotion()).current;
  useFrame(({ camera }) => {
    if (reduced) return;
    const { progress } = getSmoothScrollState();
    const targetZ = 9 - progress * 3.5;
    camera.position.z += (targetZ - camera.position.z) * 0.1;
  });
  return null;
}

/** Distant background starfield — a single cheap GPU-animated point cloud (drei's `Sparkles`):
 * one draw call, no per-star CPU work, twinkle driven entirely by a vertex shader uniform. Sized
 * and positioned to sit well behind the planets so it never competes with them for focus, just the
 * "cyber glow" backdrop. Star count is intentionally conservative (~200 on high tier, fewer on
 * low) to keep scroll buttery on every device. */
function StarField({ tier }: { tier: DeviceTier }) {
  const count = tier === 'high' ? 260 : 150;
  return (
    <Sparkles
      count={count}
      size={1.7}
      scale={[30, 18, 16]}
      position={[0, 0, -14]}
      speed={0.15}
      noise={0.25}
      color="#dff5e6"
      opacity={0.95}
    />
  );
}

/** Advances the shared damped-scroll state and the route-transition pulse exactly once per
 * rendered frame — see `dampScrollState`/`advanceTransitionPulse`. Rendered first so every other
 * object's `useFrame` reads already-smoothed values this frame. */
function ScrollDamper() {
  useFrame((_, delta) => {
    dampScrollState(delta);
    advanceTransitionPulse(delta);
  });
  return null;
}

/** Debug-only (see isDebugMode) — logs to the console (visible via eruda on-device) once on mount
 * with the resolved config, then once per second with live fps/scroll telemetry. Only mounted at
 * all when debug mode is on, so it costs a normal visitor nothing — not even a useFrame call. */
function DebugTelemetry({ tier, extrasEnabled, bloomEnabled }: { tier: DeviceTier; extrasEnabled: boolean; bloomEnabled: boolean }) {
  const frameCount = useRef(0);
  const lastLogAt = useRef(0);

  useEffect(() => {
    console.info('[Scene3D debug] config:', {
      tier,
      extrasEnabled,
      bloomEnabled,
      isIOSWebKit: isIOSWebKit(),
      devicePixelRatio: window.devicePixelRatio,
      userAgent: navigator.userAgent,
    });
    lastLogAt.current = performance.now();
  }, [tier, extrasEnabled, bloomEnabled]);

  useFrame((_, delta) => {
    frameCount.current += 1;
    const now = performance.now();
    const elapsed = now - lastLogAt.current;
    if (elapsed < 1000) return;

    const { progress, velocity } = getSmoothScrollState();
    console.info('[Scene3D debug] tick:', {
      fps: Math.round((frameCount.current / elapsed) * 1000),
      lastFrameDeltaMs: Math.round(delta * 1000),
      scrollProgress: Number(progress.toFixed(3)),
      scrollVelocity: Number(velocity.toFixed(2)),
    });
    frameCount.current = 0;
    lastLogAt.current = now;
  });

  return null;
}

export default function SceneObjects({ tier, bloomEnabled, extrasEnabled }: SceneObjectsProps) {
  return (
    <>
      <ScrollDamper />
      {isDebugMode() && <DebugTelemetry tier={tier} extrasEnabled={extrasEnabled} bloomEnabled={bloomEnabled} />}
      <CameraRig />

      <StarField tier={tier} />
      <EarthHorizon tier={tier} />

      <PrimaryPlanet tier={tier} />
      <SecondaryPlanet tier={tier} />
      {extrasEnabled && <TertiaryPlanet />}

      <CosmicShard edge={[-3.4, 1.8, -3.6]} center={[-2.6, 1.1, -3.0]} phase={3.6} />
      {extrasEnabled && <CosmicShard edge={[3.2, -2.2, -4.4]} center={[2.3, -1.5, -3.8]} phase={6.4} />}
      {extrasEnabled && <CrystalCluster />}

      <DebrisField enabled={extrasEnabled} />

      {bloomEnabled && (
        // N8AO, ChromaticAberration and DepthOfField are deliberately omitted — each was a
        // measurable GPU cost during scroll for a subtle payoff. Bloom alone (few mip levels),
        // tuned brighter than before per an explicit "more ambient glow" request: a lower
        // luminanceThreshold catches more of the wireframe edges (not just the single brightest
        // points), and a higher intensity gives a genuinely visible glow instead of a barely-there
        // one — still soft (mipmapBlur), not blown-out.
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.22} luminanceThreshold={0.3} luminanceSmoothing={0.5} mipmapBlur levels={4} />
        </EffectComposer>
      )}
    </>
  );
}
