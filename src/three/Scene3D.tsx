import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { AdaptiveDpr, AdaptiveEvents, PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import SceneObjects from './SceneObjects';
import AuroraField from './AuroraField';
import { useDeviceTier, isIOSWebKit } from '../hooks/useDeviceTier';
import { usePointerTracking } from '../hooks/usePointer';
import { getA11yPrefs, subscribeA11y } from '../lib/a11yStore';
import { isTouchFirst } from '../lib/perfMode';

/** Live-tracks the accessibility widget's "stop animations" toggle so the canvas below can freeze
 * its render loop entirely (`frameloop="never"`) — the individual `useFrame` hooks throughout
 * SceneObjects.tsx aren't reactive to this (they snapshot `prefersReducedMotion()` once at mount),
 * so stopping the whole R3F render loop here is what actually halts the WebGL motion. */
function useA11yStopMotion() {
  const [stop, setStop] = useState(() => getA11yPrefs().stopAnimations);
  useEffect(() => subscribeA11y((p) => setStop(p.stopAnimations)), []);
  return stop;
}

interface ContextListeners {
  canvas: HTMLCanvasElement;
  onLost: (e: Event) => void;
  onRestored: (e: Event) => void;
}

/** iOS Safari aggressively reclaims WebGL contexts under memory pressure (e.g. after backgrounding
 * the tab or switching apps) — without a `webglcontextlost` handler that calls `preventDefault()`,
 * the browser treats the loss as permanent and the canvas stays blank/frozen even after returning
 * to the tab, instead of automatically restoring. `frameloop="always"` (the R3F default, set
 * explicitly here) means the render loop resumes driving frames on its own once the context comes
 * back — no extra wiring needed in `onRestored` beyond acknowledging it. */
function useWebGLContextRecovery() {
  const ref = useRef<ContextListeners | null>(null);

  useEffect(
    () => () => {
      const current = ref.current;
      if (!current) return;
      current.canvas.removeEventListener('webglcontextlost', current.onLost);
      current.canvas.removeEventListener('webglcontextrestored', current.onRestored);
    },
    []
  );

  return (canvas: HTMLCanvasElement) => {
    const onLost = (e: Event) => {
      e.preventDefault();
      console.warn('[Scene3D] WebGL context lost — awaiting automatic restoration.');
    };
    const onRestored = () => {
      console.info('[Scene3D] WebGL context restored.');
    };
    canvas.addEventListener('webglcontextlost', onLost, false);
    canvas.addEventListener('webglcontextrestored', onRestored, false);
    ref.current = { canvas, onLost, onRestored };
  };
}

// Camera FOV is a pure framing concern (a narrower viewport needs a wider FOV to keep bodies in
// frame) — deliberately NOT used for any performance decision below. Perf is gated entirely by
// useDeviceTier's actual hardware signals, not viewport width, so a narrow-but-capable phone still
// gets the full effect.
function useResponsiveFov() {
  const [fov, setFov] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 68 : 45));
  useEffect(() => {
    const onResize = () => setFov(window.innerWidth < 768 ? 68 : 45);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return fov;
}

export default function Scene3D() {
  usePointerTracking();
  const deviceTier = useDeviceTier();
  const [degraded, setDegraded] = useState(false);
  const fov = useResponsiveFov();
  const wireContextRecovery = useWebGLContextRecovery();
  // Computed once — the platform doesn't change mid-session, so no need for this to be reactive.
  const [onIOS] = useState(isIOSWebKit);
  // Bloom is a full-screen multi-pass blur: the single most expensive thing on the page. On a
  // phone it costs battery and scroll smoothness for a glow nobody can tell apart at that size, so
  // every touch-first device (Android included, not just iOS) renders the scene without it.
  const [touchFirst] = useState(isTouchFirst);
  // dpr={[1, dprCap]} lets R3F clamp the *real* window.devicePixelRatio into that range itself —
  // on a high-tier device (including capable high-DPI phones, e.g. iOS Retina) this renders at up
  // to native resolution (explicitly Math.min(2, devicePixelRatio) — capped at 2x to bound GPU
  // cost) instead of a fixed, often-blurry 1x. Kept as a [min, max] range rather than a single
  // fixed number so <AdaptiveDpr> below can still dynamically scale it down within that range if
  // PerformanceMonitor detects sustained frame drops. NOT gated on `onIOS` — high-DPI rendering
  // and antialiasing are cheap and iOS handles them fine; it's specifically multi-pass
  // post-processing (below) that iOS WebKit's GPU driver struggles with.
  const dprMax = deviceTier === 'low' || degraded ? 1 : Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2);
  // Bloom (EffectComposer, a multi-pass offscreen-framebuffer effect) and the extra decorative
  // bodies below are gated off on iOS specifically, regardless of hardware tier — this is a
  // documented WebKit GPU-driver weak point (not a raw-power one), so a brand-new iPhone hits it
  // exactly as much as an old one. Everything else (rotation, parallax, scroll reactivity, DPI)
  // stays fully enabled on iOS.
  const richEffectsEnabled = deviceTier === 'high' && !degraded && !onIOS && !touchFirst;
  const stopMotion = useA11yStopMotion();

  return (
    <div className="scene3d-layer" aria-hidden="true">
      <Canvas
        frameloop={stopMotion ? 'never' : 'always'}
        dpr={[1, dprMax]}
        gl={{
          antialias: deviceTier === 'high',
          alpha: true,
          powerPreference: 'high-performance',
        }}
        camera={{ position: [0, 0, 9], fov, near: 1, far: 30 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.08;
          wireContextRecovery(gl.domElement);
        }}
      >
        <PerformanceMonitor onDecline={() => setDegraded(true)} />
        <AdaptiveDpr pixelated={false} />
        <AdaptiveEvents />

        {/* No scene lighting rig here on purpose: every body in SceneObjects is an unlit wireframe
            (meshBasicMaterial, toneMapped=false) — a deliberate swap from the old PBR chrome/glass
            rings, which needed a real light + baked-Environment rig to read at all. Wireframe lines
            are self-colored and GPU-cheap (no lighting computation per fragment), so removing the
            old 3-point rig + baked Environment is a genuine frame-cost saving, not just dead code. */}

        {/* Shader backdrop, drawn first and behind everything. Not on the low tier: it is one
            full-screen fragment pass, which is exactly the budget that tier does not have. */}
        {deviceTier !== 'low' && !degraded && <AuroraField />}

        <Suspense fallback={null}>
          <SceneObjects tier={deviceTier} bloomEnabled={richEffectsEnabled} extrasEnabled={richEffectsEnabled} />
        </Suspense>
      </Canvas>
    </div>
  );
}
