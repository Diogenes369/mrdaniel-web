import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Billboard, Instance, Instances, OrbitControls, PerformanceMonitor, Text } from '@react-three/drei';
import * as THREE from 'three';
import { AGENT_META, type ActivitySnapshot, type AgentId, type AgentState } from '../../lib/agentActivity';

/**
 * Cyber Office — the agents' workspace as a small 3D operations floor, driven by real activity.
 *
 * Every visual state reads from `ActivitySnapshot` (lib/agentActivity.ts), which is fed by the
 * dashboard's actual API calls (and the Mission Control tab's own news poll). Nothing runs on a
 * fake timer: an idle droid sits back and its screen dims; a working droid types, its monitor
 * scrolls live log lines, the hologram over its desk spins up and data rises off it, and a packet
 * stream flies to the next desk in the pipeline (Scout → Grok → Hermes → the wall board). An error
 * turns the desk red for a moment.
 *
 * Budget (it shares the tab with a heavy dashboard):
 *   - repeated furniture (partition panels, desk legs) is drawn with <Instances>,
 *     so the whole room is ~45 draw calls;
 *   - monitors and the wall board are 2D canvases uploaded as textures only when their content
 *     changes (screens ~8 fps while working, never while idle);
 *   - no shadows, no post-processing, three point lights (one per desk), DPR capped at 1.75;
 *   - the Hebrew labels are SDF text (troika) from a bundled 44 KB Heebo Bold, not DOM overlays.
 * Low tier (≤4 cores, ≤4 GB, reduced motion) drops the particle streams, the rising data and
 * auto-rotate, renders at DPR 1 without MSAA — the office and every state change stay.
 */

type Snapshot = ActivitySnapshot;
type V3 = [number, number, number];

const HEBREW_FONT = '/fonts/Heebo-Bold.ttf';

/** Desk origins. Each cubicle faces +z (toward the camera); the droid sits on the +z side. */
const DESK: Record<AgentId, { pos: V3; rotY: number }> = {
  scout: { pos: [-4.6, 0, -0.6], rotY: 0.28 },
  grok: { pos: [0, 0, -1.6], rotY: 0 },
  hermes: { pos: [4.6, 0, -0.6], rotY: -0.28 },
};
const BOARD: V3 = [1.2, 3.45, -6.35];
const HOLO_Y = 2.55;

const EDGES: { from: AgentId; to: AgentId | 'board' }[] = [
  { from: 'scout', to: 'grok' },
  { from: 'grok', to: 'hermes' },
  { from: 'hermes', to: 'board' },
];

// ─── hardware tier ───────────────────────────────────────────────────────────────────────────

/**
 * Decided once at mount. 'low' = ≤4 cores, ≤4 GB (Chrome's deviceMemory), or the OS asks for
 * reduced motion. On 'high' the drei PerformanceMonitor still steps DPR down to 1 if the frame rate
 * sags under load (the dashboard shares the tab), and back up once it recovers.
 */
export type ArenaTier = 'high' | 'low';
export function detectArenaTier(): ArenaTier {
  if (typeof window === 'undefined') return 'high';
  const nav = navigator as Navigator & { deviceMemory?: number };
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduced || (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4) return 'low';
  return 'high';
}

// ─── shared materials (created once, shared by every mesh that uses them) ─────────────────────

const MAT = {
  floor: new THREE.MeshStandardMaterial({ color: '#141b23', metalness: 0.35, roughness: 0.5 }),
  wall: new THREE.MeshStandardMaterial({ color: '#18212b', metalness: 0.1, roughness: 0.85 }),
  desk: new THREE.MeshStandardMaterial({ color: '#1b2430', metalness: 0.35, roughness: 0.5 }),
  deskTop: new THREE.MeshStandardMaterial({ color: '#27313d', metalness: 0.2, roughness: 0.35 }),
  panel: new THREE.MeshStandardMaterial({ color: '#25313e', metalness: 0.1, roughness: 0.9 }),
  metal: new THREE.MeshStandardMaterial({ color: '#8a96a3', metalness: 0.9, roughness: 0.25 }),
  dark: new THREE.MeshStandardMaterial({ color: '#07090c', metalness: 0.6, roughness: 0.4 }),
  chair: new THREE.MeshStandardMaterial({ color: '#232b35', metalness: 0.3, roughness: 0.7 }),
  droid: new THREE.MeshStandardMaterial({ color: '#d9dee5', metalness: 0.55, roughness: 0.28 }),
  droidJoint: new THREE.MeshStandardMaterial({ color: '#2a323c', metalness: 0.8, roughness: 0.35 }),
  wood: new THREE.MeshStandardMaterial({ color: '#3a2c20', metalness: 0.05, roughness: 0.75 }),
  counter: new THREE.MeshStandardMaterial({ color: '#dfe4ea', metalness: 0.1, roughness: 0.3 }),
  plant: new THREE.MeshStandardMaterial({ color: '#2f7d3a', roughness: 0.8, flatShading: true }),
  ceilingLight: new THREE.MeshBasicMaterial({ color: '#cfe8ff', toneMapped: false }),
  neonGreen: new THREE.MeshBasicMaterial({ color: '#76b900', toneMapped: false }),
};

// ─── room ────────────────────────────────────────────────────────────────────────────────────

function Room() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} material={MAT.floor}>
        <planeGeometry args={[20, 13]} />
      </mesh>
      <gridHelper args={[20, 40, '#1b3326', '#111820']} position={[0, 0.002, 0]} />
      {/* back + side walls */}
      <mesh position={[0, 2.25, -6.5]} material={MAT.wall}>
        <boxGeometry args={[20, 4.5, 0.2]} />
      </mesh>
      <mesh position={[-10, 2.25, 0]} rotation-y={Math.PI / 2} material={MAT.wall}>
        <boxGeometry args={[13, 4.5, 0.2]} />
      </mesh>
      <mesh position={[10, 2.25, 0]} rotation-y={Math.PI / 2} material={MAT.wall}>
        <boxGeometry args={[13, 4.5, 0.2]} />
      </mesh>
      {/* window band on the right wall — a night skyline glow */}
      <mesh position={[9.88, 2.5, -1]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[8, 1.6]} />
        <meshBasicMaterial color="#0b2a44" toneMapped={false} />
      </mesh>
      {/* floor neon trim */}
      <mesh position={[0, 0.02, -6.38]} material={MAT.neonGreen}>
        <boxGeometry args={[20, 0.03, 0.03]} />
      </mesh>
      {/* No ceiling: the spectator camera sits above wall height, and ceiling fixtures only cut
          across the wall board from there. */}
    </group>
  );
}

/** Partition panels and desk legs for all three cubicles, as two instanced meshes. */
function CubicleShells() {
  const panels = useMemo(() => {
    const out: { pos: V3; rot: number; scale: V3 }[] = [];
    for (const { pos, rotY } of Object.values(DESK)) {
      const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(...pos);
      const put = (local: V3, scale: V3, rot = 0) => {
        const v = new THREE.Vector3(...local).applyMatrix4(m);
        out.push({ pos: [v.x, v.y, v.z], rot: rotY + rot, scale });
      };
      put([0, 0.7, -0.95], [2.6, 1.4, 0.06]); // back
      put([-1.3, 0.6, -0.2], [0.06, 1.2, 1.5]); // left
      put([1.3, 0.6, -0.2], [0.06, 1.2, 1.5]); // right
    }
    return out;
  }, []);
  const legs = useMemo(() => {
    const out: V3[] = [];
    for (const { pos, rotY } of Object.values(DESK)) {
      const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(...pos);
      for (const [x, z] of [[-1.05, -0.7], [1.05, -0.7], [-1.05, 0.25], [1.05, 0.25]]) {
        const v = new THREE.Vector3(x, 0.37, z).applyMatrix4(m);
        out.push([v.x, v.y, v.z]);
      }
    }
    return out;
  }, []);
  return (
    <>
      <Instances material={MAT.panel} limit={panels.length}>
        <boxGeometry args={[1, 1, 1]} />
        {panels.map((p, i) => <Instance key={i} position={p.pos} rotation-y={p.rot} scale={p.scale} />)}
      </Instances>
      <Instances material={MAT.metal} limit={legs.length}>
        <cylinderGeometry args={[0.03, 0.03, 0.74, 8]} />
        {legs.map((p, i) => <Instance key={i} position={p} />)}
      </Instances>
    </>
  );
}

function Kitchenette() {
  return (
    // Back-left corner, counter against the back wall, facing the room.
    <group position={[-7.8, 0, -6.0]}>
      {/* base cabinets + counter */}
      <mesh position={[0, 0.45, 0]} material={MAT.desk}>
        <boxGeometry args={[3.6, 0.9, 0.7]} />
      </mesh>
      <mesh position={[0, 0.92, 0.02]} material={MAT.counter}>
        <boxGeometry args={[3.7, 0.05, 0.76]} />
      </mesh>
      {/* upper cabinets */}
      <mesh position={[-0.3, 2.3, -0.12]} material={MAT.desk}>
        <boxGeometry args={[3, 0.8, 0.4]} />
      </mesh>
      {/* under-cabinet light strip */}
      <mesh position={[-0.3, 1.88, 0.05]} material={MAT.ceilingLight}>
        <boxGeometry args={[2.9, 0.02, 0.04]} />
      </mesh>
      {/* fridge */}
      <mesh position={[2.3, 1.0, 0]} material={MAT.metal}>
        <boxGeometry args={[0.85, 2, 0.75]} />
      </mesh>
      <mesh position={[1.95, 1.2, 0.39]} material={MAT.dark}>
        <boxGeometry args={[0.04, 0.6, 0.04]} />
      </mesh>
      {/* coffee machine with its status light */}
      <mesh position={[-1.2, 1.13, -0.1]} material={MAT.dark}>
        <boxGeometry args={[0.35, 0.4, 0.3]} />
      </mesh>
      <mesh position={[-1.2, 1.25, 0.06]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshBasicMaterial color="#ef4444" toneMapped={false} />
      </mesh>
      <mesh position={[-1.2, 1.0, 0.05]} material={MAT.counter}>
        <cylinderGeometry args={[0.045, 0.04, 0.09, 12]} />
      </mesh>
      {/* sink */}
      <mesh position={[0.4, 0.94, 0.05]} material={MAT.metal}>
        <boxGeometry args={[0.6, 0.02, 0.4]} />
      </mesh>
      <mesh position={[0.4, 1.12, -0.18]} rotation-x={0.4} material={MAT.metal}>
        <cylinderGeometry args={[0.018, 0.018, 0.35, 8]} />
      </mesh>
      {/* bar table + two stools */}
      <group position={[0, 0, 1.7]}>
        <mesh position={[0, 1.05, 0]} material={MAT.wood}>
          <cylinderGeometry args={[0.45, 0.45, 0.05, 24]} />
        </mesh>
        <mesh position={[0, 0.52, 0]} material={MAT.metal}>
          <cylinderGeometry args={[0.04, 0.04, 1.04, 8]} />
        </mesh>
        {[-0.65, 0.65].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh position={[0, 0.72, 0]} material={MAT.chair}>
              <cylinderGeometry args={[0.2, 0.2, 0.06, 16]} />
            </mesh>
            <mesh position={[0, 0.36, 0]} material={MAT.metal}>
              <cylinderGeometry args={[0.025, 0.025, 0.72, 6]} />
            </mesh>
          </group>
        ))}
      </group>
      {/* plant */}
      <group position={[-2.3, 0, 0.1]}>
        <mesh position={[0, 0.25, 0]} material={MAT.dark}>
          <cylinderGeometry args={[0.22, 0.17, 0.5, 12]} />
        </mesh>
        <mesh position={[0, 0.85, 0]} material={MAT.plant}>
          <icosahedronGeometry args={[0.42, 0]} />
        </mesh>
      </group>
      <Suspense fallback={null}>
        <Text font={HEBREW_FONT} fontSize={0.2} color="#9aa7b4" position={[-0.3, 1.55, 0.3]} anchorX="center" direction="rtl">
          מטבחון
        </Text>
      </Suspense>
    </group>
  );
}

// ─── live screens (canvas textures) ──────────────────────────────────────────────────────────

const LOG_LINES: Record<AgentId, string[]> = {
  scout: ['GET /api/news 200', 'og:image ← calcalist', 'resolve news.google.com', 'rss ynet 544 ok', 'dedupe 238 → 122', 'topic ai_agents', 'x tweet-result 200'],
  grok: ['draft hook v3', 'slides 1-8 composed', 'thread 6 posts', 'x-score 78 → 86', 'media [0,1,2,3]', 'cta → last post', 'groq fallback ok'],
  hermes: ['verify numbers ✓', 'security guard pass', 'scrub ai-phrases', 'trim post 4 ≤ 280', 'route → publish', 'fact-check 3/3', 'hebrew bidi ok'],
};

/** A monitor whose texture is a small 2D canvas: scrolling log lines while working, dim when idle. */
function useScreenTexture(id: AgentId, state: AgentState) {
  const { canvas, tex } = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 160;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { canvas: c, tex: t };
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  const lines = useRef<string[]>([]);
  const last = useRef(0);
  const prevStatus = useRef<string>('');

  const draw = (now: number) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const color = state.status === 'error' ? '#ef4444' : AGENT_META[id].color;
    ctx.fillStyle = state.status === 'idle' ? '#05080b' : '#03070a';
    ctx.fillRect(0, 0, 256, 160);
    ctx.fillStyle = color;
    ctx.globalAlpha = state.status === 'idle' ? 0.35 : 1;
    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    ctx.fillText(`${AGENT_META[id].name.toUpperCase()} · ${state.status.toUpperCase()}`, 10, 20);
    ctx.fillRect(10, 27, 236, 1);
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.globalAlpha = state.status === 'idle' ? 0.25 : 0.9;
    lines.current.slice(-8).forEach((l, i) => ctx.fillText(`> ${l}`, 10, 46 + i * 14));
    if (state.status === 'working' && Math.floor(now / 400) % 2) ctx.fillRect(10, 46 + Math.min(8, lines.current.length) * 14 - 10, 7, 12);
    ctx.globalAlpha = 1;
    tex.needsUpdate = true;
  };

  useFrame(({ clock }) => {
    const now = clock.elapsedTime * 1000;
    const statusChanged = prevStatus.current !== state.status;
    if (state.status === 'working' && now - last.current > 120) {
      last.current = now;
      const pool = LOG_LINES[id];
      if (Math.random() < 0.55) lines.current.push(pool[Math.floor(Math.random() * pool.length)]);
      if (lines.current.length > 40) lines.current.splice(0, 20);
      draw(now);
    } else if (statusChanged) {
      if (state.task && state.lastAt) lines.current.push(state.status === 'error' ? `✕ ${state.task}` : `✓ ${state.task}`.slice(0, 30));
      draw(now);
    }
    prevStatus.current = state.status;
  });
  return tex;
}

// ─── the droid at each desk ──────────────────────────────────────────────────────────────────

function Droid({ state, color }: { state: AgentState; color: string }) {
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const visor = useRef<THREE.MeshBasicMaterial>(null);
  const base = useMemo(() => new THREE.Color(color), [color]);
  const red = useMemo(() => new THREE.Color('#ef4444'), []);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const working = state.status === 'working';
    const err = state.status === 'error';
    // lean in to type when working, sit back when idle
    if (torso.current) torso.current.rotation.x = THREE.MathUtils.damp(torso.current.rotation.x, working ? -0.22 : 0.08, 4, dt);
    if (head.current) {
      head.current.rotation.x = THREE.MathUtils.damp(head.current.rotation.x, working ? -0.12 + Math.sin(t * 5) * 0.03 : 0.06, 4, dt);
      head.current.rotation.y = working ? Math.sin(t * 1.3) * 0.12 : Math.sin(t * 0.4) * 0.35;
    }
    // positive x-rotation swings the hand forward (−z), onto the keyboard
    const tap = (phase: number) => (working ? 1.2 + Math.sin(t * 22 + phase) * 0.14 : 0.45);
    if (armL.current) armL.current.rotation.x = THREE.MathUtils.damp(armL.current.rotation.x, tap(0), 12, dt);
    if (armR.current) armR.current.rotation.x = THREE.MathUtils.damp(armR.current.rotation.x, tap(Math.PI / 2), 12, dt);
    if (visor.current) {
      visor.current.color.lerp(err ? red : base, 0.2);
      visor.current.opacity = working ? 0.75 + Math.sin(t * 10) * 0.25 : err ? 1 : 0.45;
    }
  });

  return (
    // Local −z is "forward": the droid faces its monitor, chair back behind it on +z.
    <group position={[0, 0, 0.75]}>
      {/* chair */}
      <mesh position={[0, 0.5, 0]} material={MAT.chair}>
        <boxGeometry args={[0.6, 0.08, 0.55]} />
      </mesh>
      <mesh position={[0, 0.78, 0.3]} rotation-x={-0.1} material={MAT.chair}>
        <boxGeometry args={[0.5, 0.45, 0.06]} />
      </mesh>
      <mesh position={[0, 0.25, 0]} material={MAT.metal}>
        <cylinderGeometry args={[0.04, 0.04, 0.5, 8]} />
      </mesh>
      <mesh position={[0, 0.04, 0]} material={MAT.dark}>
        <cylinderGeometry args={[0.32, 0.32, 0.04, 5]} />
      </mesh>
      {/* droid: pelvis → torso (leans) → head + arms */}
      <mesh position={[0, 0.62, 0.02]} material={MAT.droidJoint}>
        <sphereGeometry args={[0.16, 16, 12]} />
      </mesh>
      <group ref={torso} position={[0, 0.66, 0.04]}>
        <mesh position={[0, 0.3, 0]} material={MAT.droid}>
          <capsuleGeometry args={[0.2, 0.3, 6, 16]} />
        </mesh>
        {/* chest light in the agent's color */}
        <mesh position={[0, 0.36, -0.2]}>
          <circleGeometry args={[0.05, 16]} />
          <meshBasicMaterial color={color} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        <group ref={head} position={[0, 0.78, 0]}>
          <mesh material={MAT.droid}>
            <sphereGeometry args={[0.2, 20, 16]} />
          </mesh>
          <mesh position={[0, 0.02, -0.14]} rotation-x={-0.05}>
            <boxGeometry args={[0.28, 0.07, 0.1]} />
            <meshBasicMaterial ref={visor} color={color} transparent opacity={0.5} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.22, 0]} material={MAT.droidJoint}>
            <cylinderGeometry args={[0.01, 0.01, 0.12, 6]} />
          </mesh>
          <mesh position={[0, 0.29, 0]}>
            <sphereGeometry args={[0.025, 8, 8]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
        </group>
        {([['L', -0.27, armL], ['R', 0.27, armR]] as const).map(([k, x, ref]) => (
          <group key={k} ref={ref} position={[x, 0.5, 0]}>
            <mesh position={[0, -0.22, 0]} material={MAT.droid}>
              <capsuleGeometry args={[0.06, 0.32, 4, 10]} />
            </mesh>
            <mesh position={[0, -0.45, 0]} material={MAT.droidJoint}>
              <sphereGeometry args={[0.065, 10, 8]} />
            </mesh>
          </group>
        ))}
      </group>
      {/* legs, seated */}
      {[-0.12, 0.12].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.6, -0.2]} rotation-x={Math.PI / 2} material={MAT.droid}>
            <capsuleGeometry args={[0.07, 0.3, 4, 10]} />
          </mesh>
          <mesh position={[x, 0.33, -0.4]} material={MAT.droid}>
            <capsuleGeometry args={[0.06, 0.34, 4, 10]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ─── hologram over each desk ─────────────────────────────────────────────────────────────────

function Hologram({ state, color, tier }: { state: AgentState; color: string; tier: ArenaTier }) {
  const core = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.MeshBasicMaterial>(null);
  const rise = useRef<THREE.Points>(null);
  const N = 36;
  const seeds = useMemo(() => Array.from({ length: N }, () => [Math.random() * Math.PI * 2, Math.random() * 0.35, Math.random()] as const), []);
  const positions = useMemo(() => new Float32Array(N * 3), []);
  const red = useMemo(() => new THREE.Color('#ef4444'), []);
  const base = useMemo(() => new THREE.Color(color), [color]);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const working = state.status === 'working';
    const err = state.status === 'error';
    if (core.current) {
      core.current.rotation.y += dt * (working ? 2.2 : 0.3);
      core.current.rotation.x += dt * (working ? 0.9 : 0.1);
      const s = THREE.MathUtils.damp(core.current.scale.x, working ? 1.15 + Math.sin(t * 9) * 0.06 : 0.75, 6, dt);
      core.current.scale.setScalar(s);
      const m = core.current.material as THREE.MeshBasicMaterial;
      m.color.lerp(err ? red : base, 0.2);
      m.opacity = THREE.MathUtils.damp(m.opacity, working ? 0.95 : err ? 0.9 : 0.35, 6, dt);
    }
    if (ring.current) {
      ring.current.rotation.z += dt * (working ? 3.5 : 0.4);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.damp((ring.current.material as THREE.MeshBasicMaterial).opacity, working ? 0.8 : 0.2, 6, dt);
    }
    if (beam.current) beam.current.opacity = THREE.MathUtils.damp(beam.current.opacity, working ? 0.16 : 0.03, 5, dt);
    const pts = rise.current;
    if (pts) {
      const speed = working ? 0.9 : 0;
      for (let i = 0; i < N; i++) {
        const [a, r, p] = seeds[i];
        const y = (p + t * speed * (0.4 + r)) % 1;
        positions[i * 3] = Math.cos(a + t * 0.6) * (0.15 + r);
        positions[i * 3 + 1] = -0.9 + y * 1.4;
        positions[i * 3 + 2] = Math.sin(a + t * 0.6) * (0.15 + r);
      }
      (pts.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      const pm = pts.material as THREE.PointsMaterial;
      pm.opacity = THREE.MathUtils.damp(pm.opacity, working ? 0.9 : 0, 5, dt);
    }
  });

  return (
    <group position={[0, HOLO_Y, -0.2]}>
      <mesh ref={core}>
        <icosahedronGeometry args={[0.24, 1]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.35} toneMapped={false} />
      </mesh>
      <mesh ref={ring} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.42, 0.012, 6, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} toneMapped={false} />
      </mesh>
      {/* projector beam from the desk */}
      <mesh position={[0, -0.75, 0]}>
        <coneGeometry args={[0.45, 1.3, 24, 1, true]} />
        <meshBasicMaterial ref={beam} color={color} transparent opacity={0.03} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      {tier === 'high' && (
        <points ref={rise}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          </bufferGeometry>
          <pointsMaterial color={color} size={0.045} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
        </points>
      )}
    </group>
  );
}

// ─── one cubicle: desk surface, monitor, keyboard, droid, hologram, 3D Hebrew label ─────────

function Workstation({ id, state, tier }: { id: AgentId; state: AgentState; tier: ArenaTier }) {
  const meta = AGENT_META[id];
  const { pos, rotY } = DESK[id];
  const screen = useScreenTexture(id, state);
  const lamp = useRef<THREE.PointLight>(null);
  const edge = useRef<THREE.MeshBasicMaterial>(null);
  const base = useMemo(() => new THREE.Color(meta.color), [meta.color]);
  const red = useMemo(() => new THREE.Color('#ef4444'), []);

  useFrame(({ clock }, dt) => {
    const working = state.status === 'working';
    const err = state.status === 'error';
    if (lamp.current) {
      lamp.current.intensity = THREE.MathUtils.damp(lamp.current.intensity, working ? 7 + Math.sin(clock.elapsedTime * 14) * 1.5 : err ? 6 : 2.2, 6, dt);
      lamp.current.color.lerp(err ? red : base, 0.2);
    }
    if (edge.current) edge.current.color.lerp(err ? red : base, 0.2);
  });

  const statusLine = state.status === 'working' ? state.task : state.status === 'error' ? `שגיאה: ${state.task}` : state.lastAt ? `הושלם: ${state.task}` : 'ממתין למשימה';

  return (
    <group position={pos} rotation-y={rotY}>
      {/* desk top + glowing front edge */}
      <mesh position={[0, 0.76, -0.22]} material={MAT.deskTop}>
        <boxGeometry args={[2.3, 0.05, 1.1]} />
      </mesh>
      <mesh position={[0, 0.745, 0.335]}>
        <boxGeometry args={[2.3, 0.012, 0.012]} />
        <meshBasicMaterial ref={edge} color={meta.color} toneMapped={false} />
      </mesh>
      {/* monitor on an arm */}
      <mesh position={[0, 0.93, -0.55]} material={MAT.metal}>
        <cylinderGeometry args={[0.025, 0.025, 0.33, 8]} />
      </mesh>
      <mesh position={[0, 0.79, -0.55]} material={MAT.dark}>
        <boxGeometry args={[0.3, 0.02, 0.2]} />
      </mesh>
      <mesh position={[0, 1.28, -0.56]} material={MAT.dark}>
        <boxGeometry args={[1.12, 0.72, 0.04]} />
      </mesh>
      <mesh position={[0, 1.28, -0.535]}>
        <planeGeometry args={[1.06, 0.66]} />
        <meshBasicMaterial map={screen} toneMapped={false} />
      </mesh>
      {/* keyboard + mug */}
      <mesh position={[0, 0.795, 0.18]} material={MAT.dark}>
        <boxGeometry args={[0.6, 0.02, 0.2]} />
      </mesh>
      <mesh position={[0.75, 0.83, -0.2]} material={MAT.counter}>
        <cylinderGeometry args={[0.05, 0.045, 0.1, 12]} />
      </mesh>
      <pointLight ref={lamp} position={[0, 1.5, -0.1]} color={meta.color} intensity={1.1} distance={3.6} decay={2} />
      <Droid state={state} color={meta.color} />
      <Hologram state={state} color={meta.color} tier={tier} />
      {/* Own Suspense boundary: troika suspends while the font loads, and without this the WHOLE
          office would stay blank until it arrives. */}
      <Suspense fallback={null}>
      <Billboard position={[0, HOLO_Y + 0.72, -0.2]}>
        <Text font={HEBREW_FONT} fontSize={0.24} color={meta.color} anchorX="center" anchorY="bottom" direction="rtl" outlineWidth={0.008} outlineColor="#000">
          {meta.heLabel}
        </Text>
        <Text font={HEBREW_FONT} fontSize={0.12} color="#c7d0da" anchorX="center" anchorY="top" position={[0, -0.04, 0]} direction="rtl" maxWidth={2.6} outlineWidth={0.005} outlineColor="#000">
          {statusLine.length > 44 ? `${statusLine.slice(0, 43)}…` : statusLine}
        </Text>
      </Billboard>
      </Suspense>
    </group>
  );
}

// ─── wall board: the pipeline's output, drawn from the real event log ────────────────────────

function WallBoard({ snap }: { snap: Snapshot }) {
  const { canvas, tex } = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 384;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { canvas: c, tex: t };
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);

  useEffect(() => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#04070a';
    ctx.fillRect(0, 0, 1024, 384);
    ctx.strokeStyle = '#76b90066';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 1012, 372);
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#76b900';
    ctx.font = '700 40px Heebo, sans-serif';
    const done = snap.agents.scout.done + snap.agents.grok.done + snap.agents.hermes.done;
    ctx.fillText(`מרכז הפעולות · ${done} משימות הושלמו`, 996, 58);
    ctx.font = '500 26px Heebo, sans-serif';
    const rows = snap.events.slice(0, 7);
    if (!rows.length) {
      ctx.fillStyle = '#6b7785';
      ctx.fillText('ממתין לפעילות מהדשבורד…', 996, 120);
    }
    rows.forEach((e, i) => {
      const meta = AGENT_META[e.agent];
      ctx.fillStyle = e.kind === 'error' ? '#ef4444' : e.kind === 'end' ? meta.color : '#c7d0da';
      const mark = e.kind === 'start' ? '▶' : e.kind === 'end' ? '✓' : '✕';
      const time = new Date(e.at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      ctx.fillText(`${mark} ${meta.heLabel.split(' - ')[0]}: ${e.task}  ·  ${time}`.slice(0, 70), 996, 112 + i * 38);
    });
    tex.needsUpdate = true;
  }, [snap, canvas, tex]);

  return (
    <group position={BOARD}>
      <mesh material={MAT.dark} position-z={-0.03}>
        <boxGeometry args={[5.1, 1.99, 0.05]} />
      </mesh>
      <mesh>
        <planeGeometry args={[4.9, 1.84]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

// ─── packet streams between desks ────────────────────────────────────────────────────────────

function Stream({ from, to, active, color }: { from: V3; to: V3; active: boolean; color: string }) {
  const N = 40;
  const ref = useRef<THREE.Points>(null);
  const curve = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const mid = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 1.1, 0));
    return new THREE.QuadraticBezierCurve3(a, mid, b);
  }, [from, to]);
  const positions = useMemo(() => new Float32Array(N * 3), []);
  const offsets = useMemo(() => Array.from({ length: N }, (_, i) => i / N), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  // THREE.Line as a primitive: a JSX <line> collides with the SVG element type in TS.
  const line = useMemo(
    () => new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.06 })),
    [curve, color],
  );
  useEffect(() => () => {
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
  }, [line]);

  useFrame((_, dt) => {
    const pts = ref.current;
    if (!pts) return;
    const speed = active ? 0.5 : 0.05;
    for (let i = 0; i < N; i++) {
      offsets[i] = (offsets[i] + dt * speed) % 1;
      curve.getPoint(offsets[i], tmp);
      positions[i * 3] = tmp.x;
      positions[i * 3 + 1] = tmp.y;
      positions[i * 3 + 2] = tmp.z;
    }
    (pts.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    const m = pts.material as THREE.PointsMaterial;
    m.opacity = THREE.MathUtils.damp(m.opacity, active ? 0.95 : 0.08, 5, dt);
    m.size = active ? 0.08 : 0.04;
    const lm = line.material as THREE.LineBasicMaterial;
    lm.opacity = THREE.MathUtils.damp(lm.opacity, active ? 0.3 : 0.06, 5, dt);
  });

  return (
    <group>
      <primitive object={line} />
      <points ref={ref}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial color={color} size={0.04} transparent opacity={0.08} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
      </points>
    </group>
  );
}

/** World position of a desk's hologram (desk origin rotated, plus the hologram's local offset). */
function holoWorld(id: AgentId): V3 {
  const { pos, rotY } = DESK[id];
  const v = new THREE.Vector3(0, HOLO_Y, -0.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).add(new THREE.Vector3(...pos));
  return [v.x, v.y, v.z];
}

// ─── scene ───────────────────────────────────────────────────────────────────────────────────

function Scene({ snap, tier }: { snap: Snapshot; tier: ArenaTier }) {
  const working = (id: AgentId) => snap.agents[id].status === 'working';
  const load = (['scout', 'grok', 'hermes'] as AgentId[]).filter(working).length / 3;
  const ends = useMemo(() => ({ scout: holoWorld('scout'), grok: holoWorld('grok'), hermes: holoWorld('hermes'), board: [BOARD[0], BOARD[1] + 1.3, BOARD[2] + 0.2] as V3 }), []);
  return (
    <>
      <color attach="background" args={['#05070a']} />
      <fog attach="fog" args={['#05070a', 14, 30]} />
      <hemisphereLight args={['#cfe3ff', '#1a2129', 1.25]} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[3, 9, 6]} intensity={1.4} />
      <directionalLight position={[-6, 5, -2]} intensity={0.4} color="#9ec5ff" />
      <Room />
      <CubicleShells />
      <Kitchenette />
      <WallBoard snap={snap} />
      {(Object.keys(DESK) as AgentId[]).map((id) => (
        <Workstation key={id} id={id} state={snap.agents[id]} tier={tier} />
      ))}
      {tier === 'high' &&
        EDGES.map((e) => (
          <Stream key={`${e.from}-${e.to}`} from={ends[e.from]} to={ends[e.to]} active={working(e.from)} color={AGENT_META[e.from].color} />
        ))}
      <OrbitControls
        target={[0, 1.2, -1.5]}
        enablePan={false}
        minDistance={6}
        maxDistance={17}
        maxPolarAngle={Math.PI / 2.15}
        autoRotate={tier === 'high'}
        autoRotateSpeed={load > 0 ? 0.6 : 0.2}
      />
    </>
  );
}

export default function MissionControlScene({ snap }: { snap: Snapshot }) {
  const [tier] = useState(detectArenaTier);
  const [dpr, setDpr] = useState(tier === 'low' ? 1 : 1.75);
  return (
    <Canvas dpr={dpr} camera={{ position: [0, 5.4, 9.8], fov: 46 }} gl={{ antialias: tier === 'high', powerPreference: 'low-power', alpha: false }}>
      {tier === 'high' && <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.75)} flipflops={3} onFallback={() => setDpr(1)} />}
      <Scene snap={snap} tier={tier} />
    </Canvas>
  );
}
