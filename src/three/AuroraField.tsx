import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, Vector2, type ShaderMaterial } from 'three';
import { getSmoothScrollState, getTransitionPulse } from '../hooks/useLenis';
import { getPointerState } from '../hooks/usePointer';
import { prefersReducedMotion } from '../lib/gsap';

/**
 * The backdrop layer under the wireframe bodies (homepage redesign, 2026-09-23): a slow
 * domain-warped aurora in the brand green → cyan ramp, plus a faint perspective "data floor" of
 * grid lines along the bottom of the viewport with light pulses running along it.
 *
 * Built as ONE full-screen fragment pass, deliberately: the vertex shader writes clip space
 * directly, so the quad covers the viewport whatever the camera does, costs no geometry, and never
 * depth-tests against the scene (it is drawn first, behind everything). No render targets, no
 * post-processing — the cost is one cheap shader over the screen, which is why it can run on the
 * mid tier where Bloom is already off. `Scene3D` does not mount it on the low tier at all.
 *
 * Readability is the constraint that sets every constant below: the aurora peaks at ~0.2 alpha
 * and fades toward the vertical centre, where body copy sits, and it dims as the page scrolls
 * past the hero so long-form sections read on near-black.
 */

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.999, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uScroll;   // 0..1 page progress, already damped by Lenis
  uniform float uPulse;    // route-transition pulse, 0..1
  uniform vec2  uPointer;  // -1..1
  uniform float uAspect;

  // Hash + value noise + fbm: small, branch-free, and identical on every GPU (no texture lookup).
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.02 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = vec2((uv.x - 0.5) * uAspect, uv.y - 0.5);
    float t = uTime * 0.035;

    // ── Aurora: domain-warped fbm ribbons, drifting with time and scroll, nudged by the pointer.
    vec2 q = vec2(fbm(p * 1.4 + vec2(t, -t)), fbm(p * 1.4 + vec2(-t * 0.7, t * 1.3) + 4.1));
    vec2 w = p * 1.1 + q * 1.6 + vec2(uPointer.x * 0.08, uPointer.y * 0.05 + uScroll * 1.2);
    float n = fbm(w + vec2(0.0, t * 2.0));
    float ribbon = smoothstep(0.52, 0.86, n);

    // Kept to the upper band and the edges; the vertical centre (where copy sits) stays darker.
    float band = smoothstep(0.15, 0.95, uv.y) * 0.85;
    float centreDim = 1.0 - 0.55 * smoothstep(0.42, 0.0, abs(uv.y - 0.48));
    vec3 green = vec3(0.463, 0.725, 0.0);   // #76B900
    vec3 cyan  = vec3(0.133, 0.827, 0.933); // #22d3ee
    vec3 auroraCol = mix(green, cyan, smoothstep(0.2, 0.9, q.x + uScroll * 0.6));
    float heroFade = mix(1.0, 0.45, smoothstep(0.0, 0.3, uScroll));
    float aurora = ribbon * band * centreDim * heroFade * (0.20 + uPulse * 0.12);

    // ── Data floor: perspective grid in the bottom 35%, lines thinning toward the horizon.
    float horizon = 0.34;
    float floorMask = smoothstep(horizon, 0.0, uv.y);
    float depth = 1.0 / max(horizon - uv.y + 0.02, 0.02);
    vec2 g = vec2(p.x * depth * 0.9, depth * 0.35 - uTime * 0.12);
    vec2 gl = abs(fract(g) - 0.5) / fwidth(g);
    float line = 1.0 - min(min(gl.x, gl.y), 1.0);
    // Light pulses travelling toward the viewer along a few lanes.
    float lane = step(0.93, hash(vec2(floor(g.x), 3.0)));
    float pulse = lane * smoothstep(0.9, 1.0, fract(g.y * 0.25 + hash(vec2(floor(g.x), 7.0))));
    float grid = (line * 0.10 + pulse * 0.35) * floorMask * floorMask * heroFade;

    vec3 col = auroraCol * aurora + green * grid;
    float alpha = clamp(aurora + grid, 0.0, 0.32);
    gl_FragColor = vec4(col, alpha);
  }
`;

export default function AuroraField() {
  const mat = useRef<ShaderMaterial>(null);
  const { size } = useThree();
  const reduced = useRef(prefersReducedMotion()).current;

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uPulse: { value: 0 },
      uPointer: { value: new Vector2() },
      uAspect: { value: 1 },
    }),
    []
  );

  useFrame((_, delta) => {
    const u = mat.current?.uniforms;
    if (!u) return;
    // Reduced motion: the field holds still (time frozen) but still follows scroll, which the
    // visitor controls — the same rule the wireframe bodies follow.
    if (!reduced) u.uTime.value += Math.min(delta, 0.05);
    u.uScroll.value = getSmoothScrollState().progress;
    u.uPulse.value = getTransitionPulse();
    const ptr = getPointerState();
    (u.uPointer.value as Vector2).set(ptr.x, ptr.y);
    u.uAspect.value = size.width / Math.max(size.height, 1);
  });

  return (
    <mesh renderOrder={-10} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={mat}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthTest={false}
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}
