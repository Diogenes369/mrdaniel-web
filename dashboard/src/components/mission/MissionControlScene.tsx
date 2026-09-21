import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { AGENT_META, type ActivitySnapshot, type AgentId } from '../../lib/agentActivity';

/**
 * Mission Control — a spectator view of the dashboard's agents, driven by real activity.
 *
 * Every visual state reads from `ActivitySnapshot` (lib/agentActivity.ts), which is fed by the
 * dashboard's actual API calls. Nothing here is on a timer pretending to work: an idle node idles,
 * a working node brightens, pulses and fires a particle stream to the next agent in the pipeline
 * (Scout → Grok → Hermes → Core), and an error flashes red.
 *
 * Budget (it shares the tab with a heavy dashboard): ~40 meshes total, one instanced mesh for all
 * server racks, three 48-point particle streams updated in place (no allocation per frame), no
 * post-processing, no shadows, DPR capped at 1.75, and `powerPreference: 'low-power'`.
 */

type Snapshot = ActivitySnapshot;

const POS: Record<AgentId, [number, number, number]> = {
  scout: [-3.8, 0, 1.8],
  grok: [0, 0, -2.8],
  hermes: [3.8, 0, 1.8],
};
const CORE: [number, number, number] = [0, 0, 1.6];

/** Pipeline edges: where each agent's output flows. */
const EDGES: { from: AgentId; to: AgentId | 'core' }[] = [
  { from: 'scout', to: 'grok' },
  { from: 'grok', to: 'hermes' },
  { from: 'hermes', to: 'core' },
];

function Floor() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01}>
        <circleGeometry args={[9, 48]} />
        <meshStandardMaterial color="#07090d" metalness={0.6} roughness={0.35} />
      </mesh>
      <gridHelper args={[18, 36, '#1f3a2a', '#11161c']} position-y={0.001} />
      <mesh rotation-x={-Math.PI / 2} position-y={0.004}>
        <ringGeometry args={[4.6, 4.66, 96]} />
        <meshBasicMaterial color="#76b900" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

/** The server room: one InstancedMesh for every rack, each with a faint emissive face. */
function Racks({ load }: { load: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const COUNT = 22;
  const matrices = useMemo(() => {
    const m = new THREE.Matrix4();
    const out: THREE.Matrix4[] = [];
    for (let i = 0; i < COUNT; i++) {
      const a = (i / COUNT) * Math.PI * 1.35 + Math.PI * 0.82;
      const r = 6.6;
      const h = 1.6 + ((i * 37) % 7) / 7;
      m.compose(new THREE.Vector3(Math.cos(a) * r, h / 2, Math.sin(a) * r), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a + Math.PI / 2, 0)), new THREE.Vector3(0.9, h, 0.7));
      out.push(m.clone());
    }
    return out;
  }, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1a222c', emissive: new THREE.Color('#76b900'), emissiveIntensity: 0.08, metalness: 0.8, roughness: 0.4 }), []);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    if (mesh.userData.init !== true) {
      matrices.forEach((mx, i) => mesh.setMatrixAt(i, mx));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.userData.init = true;
    }
    // The whole room "breathes" with total load — racks light up while any agent works.
    mat.emissiveIntensity = 0.04 + load * 0.12 + Math.sin(clock.elapsedTime * 3) * 0.02 * load;
  });

  // frustumCulled off: the instance matrices land after the first frame, so the default bounding
  // sphere would cull the whole room.
  return <instancedMesh ref={ref} args={[undefined, mat, COUNT]} frustumCulled={false} />;
}

function AgentNode({ id, snap }: { id: AgentId; snap: Snapshot }) {
  const core = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const state = snap.agents[id];
  const meta = AGENT_META[id];
  const base = useMemo(() => new THREE.Color(meta.color), [meta.color]);
  const red = useMemo(() => new THREE.Color('#ef4444'), []);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const working = state.status === 'working';
    const err = state.status === 'error';
    const target = err ? 1.6 : working ? 2.4 : 0.35;
    const m = core.current?.material as THREE.MeshStandardMaterial | undefined;
    if (m) {
      m.emissiveIntensity = THREE.MathUtils.damp(m.emissiveIntensity, target + (working ? Math.sin(t * 8) * 0.5 : 0), 6, dt);
      m.emissive.lerp(err ? red : base, 0.15);
    }
    if (core.current) {
      core.current.rotation.y += dt * (working ? 1.6 : 0.25);
      core.current.position.y = 1.1 + Math.sin(t * 1.4 + POS[id][0]) * 0.06;
      const s = working ? 1 + Math.sin(t * 8) * 0.04 : 1;
      core.current.scale.setScalar(s);
    }
    if (ring.current) {
      ring.current.rotation.z += dt * (working ? 3 : 0.4);
      ring.current.rotation.x = Math.PI / 2 + Math.sin(t * 0.7) * 0.15;
    }
    if (halo.current) {
      const hm = halo.current.material as THREE.MeshBasicMaterial;
      hm.opacity = THREE.MathUtils.damp(hm.opacity, working ? 0.35 : err ? 0.3 : 0.08, 5, dt);
      halo.current.scale.setScalar(1 + (working ? (t * 1.5) % 1 : 0) * 0.6);
    }
    if (light.current) light.current.intensity = THREE.MathUtils.damp(light.current.intensity, working ? 6 : err ? 4 : 0.8, 5, dt);
  });

  return (
    <group position={POS[id]}>
      {/* pedestal */}
      <mesh position-y={0.15}>
        <cylinderGeometry args={[0.75, 0.9, 0.3, 6]} />
        <meshStandardMaterial color="#0d1117" metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.31} ref={halo}>
        <ringGeometry args={[0.8, 0.95, 48]} />
        <meshBasicMaterial color={meta.color} transparent opacity={0.08} depthWrite={false} />
      </mesh>
      {/* the node itself: a glowing server core */}
      <mesh ref={core} position-y={1.1}>
        <octahedronGeometry args={[0.45, 0]} />
        <meshStandardMaterial color="#0a0a0a" emissive={meta.color} emissiveIntensity={0.35} metalness={0.4} roughness={0.2} />
      </mesh>
      <mesh ref={ring} position-y={1.1}>
        <torusGeometry args={[0.72, 0.018, 8, 64]} />
        <meshBasicMaterial color={meta.color} />
      </mesh>
      <pointLight ref={light} position={[0, 1.2, 0]} color={meta.color} intensity={0.8} distance={4.5} decay={2} />
      {/* floating name tag */}
      <Html position={[0, 2.15, 0]} center distanceFactor={9} zIndexRange={[20, 0]}>
        <div
          className="pointer-events-none select-none whitespace-nowrap rounded-lg border bg-black/70 px-2.5 py-1 text-center backdrop-blur-sm"
          style={{ borderColor: `${meta.color}66` }}
          dir="rtl"
        >
          <div className="font-mono text-[13px] font-bold" style={{ color: meta.color }} dir="ltr">
            {meta.name} {state.status === 'working' ? '●' : state.status === 'error' ? '✕' : '○'}
          </div>
          <div className="max-w-[180px] truncate text-[10px] text-zinc-300">{state.status === 'idle' && !state.lastAt ? meta.role : state.task}</div>
        </div>
      </Html>
    </group>
  );
}

/** A particle stream along a curved path; brightness and speed follow the source agent's state. */
function Stream({ from, to, active, color }: { from: [number, number, number]; to: [number, number, number]; active: boolean; color: string }) {
  const N = 48;
  const ref = useRef<THREE.Points>(null);
  const curve = useMemo(() => {
    const a = new THREE.Vector3(from[0], 1.1, from[2]);
    const b = new THREE.Vector3(to[0], 1.1, to[2]);
    const mid = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 1.4, 0));
    return new THREE.QuadraticBezierCurve3(a, mid, b);
  }, [from, to]);
  const positions = useMemo(() => new Float32Array(N * 3), []);
  const offsets = useMemo(() => Array.from({ length: N }, (_, i) => i / N), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  // THREE.Line as a primitive: a JSX <line> collides with the SVG element type in TS.
  const line = useMemo(
    () => new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.08 })),
    [curve, color],
  );

  useFrame((_, dt) => {
    const pts = ref.current;
    if (!pts) return;
    const speed = active ? 0.55 : 0.06;
    for (let i = 0; i < N; i++) {
      offsets[i] = (offsets[i] + dt * speed) % 1;
      curve.getPoint(offsets[i], tmp);
      positions[i * 3] = tmp.x;
      positions[i * 3 + 1] = tmp.y;
      positions[i * 3 + 2] = tmp.z;
    }
    const attr = pts.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
    const m = pts.material as THREE.PointsMaterial;
    m.opacity = THREE.MathUtils.damp(m.opacity, active ? 0.95 : 0.12, 5, dt);
    m.size = active ? 0.09 : 0.05;
    const lm = line.material as THREE.LineBasicMaterial;
    lm.opacity = THREE.MathUtils.damp(lm.opacity, active ? 0.35 : 0.08, 5, dt);
  });

  return (
    <group>
      <primitive object={line} />
      <points ref={ref}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial color={color} size={0.05} transparent opacity={0.12} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
      </points>
    </group>
  );
}

/** The publish core every pipeline ends in. */
function Core({ busy }: { busy: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * (busy ? 1.2 : 0.2);
    ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.5) * 0.3;
    const m = ref.current.material as THREE.MeshStandardMaterial;
    m.emissiveIntensity = THREE.MathUtils.damp(m.emissiveIntensity, busy ? 1.8 : 0.4, 4, dt);
  });
  return (
    <group position={CORE}>
      <mesh ref={ref} position-y={0.9}>
        <icosahedronGeometry args={[0.32, 1]} />
        <meshStandardMaterial color="#050505" emissive="#76b900" emissiveIntensity={0.4} wireframe />
      </mesh>
      <Html position={[0, 1.55, 0]} center distanceFactor={9}>
        <div className="pointer-events-none select-none font-mono text-[10px] tracking-widest text-lime-300/80">PUBLISH CORE</div>
      </Html>
    </group>
  );
}

/**
 * Hardware tier, decided once at mount. 'low' = ≤4 cores, ≤4 GB (Chrome's deviceMemory), or the
 * OS asks for reduced motion: DPR 1, no MSAA, the racks and particle streams dropped, no
 * auto-rotate. On 'high' the drei PerformanceMonitor still steps DPR down to 1 if the frame rate
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

function Scene({ snap, tier }: { snap: Snapshot; tier: ArenaTier }) {
  const working = (id: AgentId) => snap.agents[id].status === 'working';
  const load = (['scout', 'grok', 'hermes'] as AgentId[]).filter(working).length / 3;
  return (
    <>
      <color attach="background" args={['#040507']} />
      <fog attach="fog" args={['#040507', 12, 26]} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[4, 8, 5]} intensity={0.6} />
      <Floor />
      {tier === 'high' && <Racks load={load} />}
      {(Object.keys(POS) as AgentId[]).map((id) => (
        <AgentNode key={id} id={id} snap={snap} />
      ))}
      <Core busy={working('hermes')} />
      {tier === 'high' && EDGES.map((e) => (
        <Stream key={`${e.from}-${e.to}`} from={POS[e.from]} to={e.to === 'core' ? CORE : POS[e.to]} active={working(e.from)} color={AGENT_META[e.from].color} />
      ))}
      <OrbitControls enablePan={false} minDistance={6} maxDistance={16} maxPolarAngle={Math.PI / 2.2} autoRotate={tier === 'high'} autoRotateSpeed={load > 0 ? 0.9 : 0.35} />
    </>
  );
}

export default function MissionControlScene({ snap }: { snap: Snapshot }) {
  const [tier] = useState(detectArenaTier);
  const [dpr, setDpr] = useState(tier === 'low' ? 1 : 1.75);
  return (
    <Canvas
      dpr={dpr}
      camera={{ position: [0, 5.2, 9.5], fov: 45 }}
      gl={{ antialias: tier === 'high', powerPreference: 'low-power', alpha: false }}
    >
      {tier === 'high' && <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.75)} flipflops={3} onFallback={() => setDpr(1)} />}
      <Scene snap={snap} tier={tier} />
    </Canvas>
  );
}
