/**
 * MOTION V2 (PREVIEW) — Canvas2D particle field, ported from the Latitude teardown's technique
 * (hand-projected 3D sphere, per-ring spring-damper physics) and re-tuned to this site's own brand
 * tokens and layout. Points are drawn as direct filled vector circles, normal-blended — no sprite
 * bitmaps, no additive glow — for the sharpest possible edge at any DPR (see the draw call in the
 * frame loop below for why). Deliberately vanilla — no Three.js, no GSAP — so it costs the "already
 * paying for it" WebGL background nothing extra; this is its lightweight *alternative to that
 * particular scene*, gated behind the `?motion=2d` flag (see motionFlag.ts) — note it's paired with
 * a *real* Three.js starfield underneath it (StarfieldLayer.tsx), by explicit request.
 *
 * There was an aurora wash layer here (soft color-gradient blobs behind the points) — removed by
 * explicit request: pure black background + white starfield only, zero color wash. If it's ever
 * wanted back, the technique is documented in the Latitude teardown research this module is based on.
 *
 * Framework-agnostic on purpose: a bare `createFieldEngine()` factory over two <canvas> elements,
 * so the React wrapper (MotionField.tsx) only has to own the refs/lifecycle, not the physics.
 */

// Strictly monochrome by explicit request — pure black background, pure white points, zero color
// anywhere in this layer (no green accent hue, no aurora wash). Matches the real starfield's own
// near-white color exactly (see StarfieldLayer.tsx's Sparkles `color="#dff5e6"`).
const STAR = [241, 245, 249] as const; // zinc-200

// ---------- tuning (see the teardown's appendix for the source constants this was calibrated
// against; values below are re-tuned for a slightly smaller, calmer field than the original). ----------
const T = {
  rings: 13,
  latMax: 78,
  radiusW: 0.34,
  radiusWM: 0.30,
  radiusH: 0.30,
  axisCam: 3.1,
  tiltBase: -0.38,
  idleSpin: 0.05,
  breathAmp: 0.02,
  breathHz: 0.05,
  K: 42,
  C: 6.8,
  inertLo: 0.55,
  inertHi: 2.2,
  dragSens: 0.0062,
  tiltSens: 0.0026,
  tiltRange: 0.4,
  tiltK: 12,
  tiltC: 5.4,
  spinDamp: 1.2,
  randKick: 0.45,
  fieldR: 190,
  fieldStr: 40,
  fieldTau: 0.14,
  pK: 26,
  pC: 7.6,
  pKvar: 0.5,
} as const;

/** Framerate-independent exponential-decay smoothing — same formula already used in
 * src/hooks/useLenis.ts's local `damp()`; duplicated here rather than imported so this module has
 * zero dependency on Lenis/GSAP and can be tree-shaken away entirely for any visitor without the
 * `?motion=2d` flag (the whole point of this being the *lightweight* alternative). */
function damp(x: number, y: number, lambda: number, dt: number) {
  return x + (y - x) * (1 - Math.exp(-lambda * dt));
}

/** Deterministic integer hash → [0,1) float. Cheaper than seeding/storing a PRNG per particle, and
 * reproducible across resizes (a particle's "personality" — its stiffness variance, its color,
 * its scatter position — never reshuffles just because the window resized). */
function hash(n: number): number {
  n = (n ^ 61) ^ (n >>> 16);
  n = n + (n << 3);
  n = n ^ (n >>> 4);
  n = Math.imul(n, 0x27d4eb2d);
  n = n ^ (n >>> 15);
  return (n >>> 0) / 4294967296;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
// Hermite smoothstep — eases both ends of a 0..1 ramp (slow-fast-slow) instead of a linear ramp's
// constant rate, which is what makes an eased transition read as "graceful" rather than mechanical.
const smoothstep = (x: number) => x * x * (3 - 2 * x);
const TAU = Math.PI * 2;

// ---------- formations ----------
// Named shapes the field morphs between as the visitor scrolls — see pickFormation() below for how
// a scroll position picks/blends two of these. 'hero' is the ring-sphere (unchanged, has its own
// drag/spring physics); the rest are new, each a verified real Latitude formation re-implemented
// from a fresh live re-inspection of latitudeform.com (not guessed): 'helix' = the two
// counter-rotating strands seen climbing their "03/STUDIO" section (reads as a DNA double-helix),
// 'rings' = the concentric drifting rings formation, 'scatter' = the ambient wander already in use
// site-wide, 'contact' = the converging halo around their circular "Let's talk" CTA, confirmed live
// (a dashed rotating ring with a dense particle halo assembling around it).
export type FieldForm = 'hero' | 'helix' | 'rings' | 'scatter' | 'contact';

// Precomputed "rgb(r,g,b," prefix — each particle's actual draw call appends only its own alpha and
// closing paren (`STAR_RGB + alpha.toFixed(3) + ')'`), which is materially cheaper per particle than
// template-literal-interpolating all three channels every frame across N particles.
const STAR_RGB = `rgba(${STAR[0]},${STAR[1]},${STAR[2]},`;

export interface FieldEngineOptions {
  fieldCanvas: HTMLCanvasElement;
  /** Fewer particles, capped draw rate — see useDeviceTier.ts. */
  tier: 'high' | 'low';
  reducedMotion: boolean;
}

export interface FieldEngineHandle {
  /** Freezes/unfreezes the render loop without tearing it down — wired to the a11y "stop
   * animations" toggle so it can flip live without remounting the whole engine. */
  setFrozen(frozen: boolean): void;
  dispose(): void;
}

export function createFieldEngine(opts: FieldEngineOptions): FieldEngineHandle {
  const { fieldCanvas, tier, reducedMotion } = opts;
  const ctx = fieldCanvas.getContext('2d', { alpha: true });

  // A canvas can legitimately fail to produce a 2D context (exhausted context budget, a locked-down
  // browser policy) — fail silently rather than throw, since this whole feature is decorative.
  if (!ctx) {
    return { setFrozen() {}, dispose() {} };
  }
  let frozen = reducedMotion; // reduced-motion starts frozen and stays that way — never re-armed.
  const N = tier === 'high' ? 1400 : 520;

  // ---------- particle state (typed arrays — 1,400 particles × several Float32Arrays is a fraction
  // of a millisecond to allocate and keeps the per-frame loop free of per-particle object churn). ----------
  const px = new Float32Array(N), py = new Float32Array(N);
  const vx = new Float32Array(N), vy = new Float32Array(N);
  const rnd1 = new Float32Array(N), rnd2 = new Float32Array(N), rnd3 = new Float32Array(N);
  const kmul = new Float32Array(N);
  // Per-particle offset into the 0..1 progress of a formation-to-formation transition — mirrors
  // Latitude's own `stag[i] = r4[i] * T.stagger` exactly: without it every particle would start AND
  // finish morphing in lockstep, which reads as "one shape sliding into another," not organic. With
  // it, particles begin their individual morph at staggered points across the transition, arriving
  // as a soft wave rather than a snap — see STAGGER/the blend math in the main loop below.
  const stag = new Float32Array(N);
  const STAGGER = 0.22;
  const ringOf = new Uint8Array(N);
  const scatterX = new Float32Array(N), scatterY = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    rnd1[i] = hash(i * 4 + 7);
    rnd2[i] = hash(i * 4 + 2311);
    rnd3[i] = hash(i * 4 + 90001);
    kmul[i] = 1 - T.pKvar * 0.5 + rnd2[i] * T.pKvar;
    stag[i] = hash(i * 4 + 424242) * STAGGER;
  }

  const NR = T.rings;
  const lat: number[] = [], ang: number[] = [], wv: number[] = [], inert: number[] = [];
  const SLAT = Math.sin((T.latMax * Math.PI) / 180);
  for (let r = 0; r < NR; r++) {
    const u = (r / (NR - 1)) * 2 - 1;
    lat[r] = Math.asin(u * SLAT);
    const eq = 1 - Math.abs(u);
    inert[r] = T.inertLo + (T.inertHi - T.inertLo) * eq * eq;
    ang[r] = 0;
    wv[r] = 0;
  }
  // Distribute particles across rings weighted by ring circumference (cos(lat)), so density matches
  // a real sphere instead of bunching near the poles.
  {
    const cum: number[] = [];
    let s = 0;
    for (let r = 0; r < NR; r++) {
      s += Math.cos(lat[r]);
      cum[r] = s;
    }
    for (let i = 0; i < N; i++) {
      const target = ((i + 0.5) / N) * s;
      let r = 0;
      while (r < NR - 1 && cum[r] < target) r++;
      ringOf[i] = r;
    }
  }

  let W = 0, H = 0, DPR = 1;
  let cx = 0, cy = 0, R = 0, FOCAL = 0;
  // `: number` annotations are load-bearing here, not stylistic — T is `as const`, so its property
  // values are non-fresh literal types (e.g. -0.38) that DON'T widen to `number` on a plain `let`
  // the way a fresh literal would, which would otherwise make every later reassignment a type error.
  let yaw = 0, yawVel = 0, tilt: number = T.tiltBase, tiltVel = 0, tiltTarget: number = T.tiltBase;
  let mx = -1e4, my = -1e4, fieldAmt = 0;

  // Arrow-function *expression*, not a `function` declaration — TS's null-narrowing of `ctx` above
  // only survives into closures defined textually after the guard; a hoisted `function` declaration
  // is (conservatively, correctly) treated as possibly running before the guard ran.
  let seeded = false;
  const layout = () => {
    // Capped at 3 (was 2) — explicitly to force true native-resolution rendering on 3x-DPR phones
    // (iPhone Pro-class devices and most flagship Android) rather than silently downscaling their
    // sharpest points to look soft. Still capped, not raw devicePixelRatio, since a small number of
    // devices report absurd values (4+) that would blow the backing-buffer cost far past what the
    // visible sharpness gain is worth.
    DPR = Math.min(3, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    fieldCanvas.width = Math.round(W * DPR);
    fieldCanvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    R = Math.min(W * (tier === 'high' ? T.radiusW : T.radiusWM), H * T.radiusH);
    cx = W * 0.5;
    cy = H * 0.42; // slightly above center — leaves room for the scroll cue / CTA below
    FOCAL = T.axisCam * R;

    // Scatter targets recompute on resize (a particle's scatter home is a pure function of its own
    // seeded randoms and the current viewport, not stored/accumulated state). Deliberately plain
    // viewport-relative coordinates (0..W, 0..H) — an EARLIER version spanned 2.4 viewport-heights
    // of page-space per particle on the theory that scrolling would "reveal" the rest via a small
    // parallax factor, but at a realistic scroll speed that parallax could never actually traverse
    // that distance: roughly 60% of the field was mathematically stuck off-screen forever the moment
    // a visitor scrolled past the first viewport-height, which is exactly why every section below the
    // hero rendered with visibly zero particles. The organic "floating" motion instead comes from the
    // per-particle time-based wander added in the frame loop below (driftPhase), the same technique
    // the Latitude teardown's own ambient formations use — always within view, at any scroll depth.
    for (let i = 0; i < N; i++) {
      scatterX[i] = rnd1[i] * W;
      scatterY[i] = rnd2[i] * H;
      // Seed the actual (spring-driven) position too, but ONLY on first layout — a Float32Array
      // defaults every particle to (0,0), and without this every single one would visibly spring
      // in from the top-left corner as one converging clump on load instead of starting already
      // spread across the screen. A later resize must NOT re-teleport already-settled particles.
      if (!seeded) {
        px[i] = scatterX[i];
        py[i] = scatterY[i];
      }
    }
    seeded = true;
  };
  layout();

  // ---------- scroll-driven formation state machine ----------
  // Any element flagged data-field-form="hero|helix|rings|scatter|contact" is a "stop" — mirrors
  // Latitude's own pickStop()/data-form mechanism precisely (confirmed via the original teardown's
  // source read): each stop's PAGE-space vertical midpoint is measured once, then every frame the
  // stop nearest the current viewport CENTER (not top) is found and blended with its neighbor by how
  // far scroll has moved between them. Stops are measured once here rather than every frame (their
  // own vertical position is what moves, via scrollY, not the elements themselves), but re-measured
  // on resize since layout changes can shift a section's height.
  interface FormStop {
    y: number;
    form: FieldForm;
  }
  let stops: FormStop[] = [];
  function measureStops() {
    const els = document.querySelectorAll<HTMLElement>('[data-field-form]');
    stops = Array.from(els)
      .map((el) => ({
        y: el.getBoundingClientRect().top + window.scrollY + el.offsetHeight / 2,
        form: (el.dataset.fieldForm as FieldForm) || 'scatter',
      }))
      .sort((a, b) => a.y - b.y);
  }
  measureStops();
  window.addEventListener('resize', measureStops);

  /** Which two formations are active right now, and how far blended between them (0=fully A,
   * 1=fully B) — the *only* thing scroll position controls; every formation's own coordinates below
   * are otherwise purely functions of viewport size + elapsed time, never of scroll or page
   * position, which is the specific, hard-won fix for an earlier bug where scroll-coupled particle
   * coordinates went mathematically unreachable off-screen once scrolled past. `* 1.5` gain mirrors
   * Latitude's own `T.lead`: a formation should visibly start answering the first flick of the
   * wheel, not wait until the visitor is already halfway to the next section. */
  function pickFormation(): { A: FieldForm; B: FieldForm; t: number } {
    if (!stops.length) return { A: 'hero', B: 'hero', t: 0 };
    const sc = window.scrollY + H / 2;
    if (sc <= stops[0].y) return { A: stops[0].form, B: stops[0].form, t: 0 };
    const last = stops[stops.length - 1];
    if (sc >= last.y) return { A: last.form, B: last.form, t: 0 };
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i], b = stops[i + 1];
      if (sc >= a.y && sc < b.y) {
        const raw = (sc - a.y) / (b.y - a.y);
        return { A: a.form, B: b.form, t: smoothstep(clamp(raw * 1.5, 0, 1)) };
      }
    }
    return { A: last.form, B: last.form, t: 0 };
  }

  // ---------- readability guard ----------
  // Any element flagged [data-field-guard] (Hero.tsx's headline block, currently the only one) gets
  // the field dimmed specifically behind it, feathered so there's no visible rectangle — this is
  // what actually guarantees "100% readable" instead of hoping small/sharp points never happen to
  // land on a letter. Queried once (the element doesn't come and go), but its rect is re-read every
  // frame in the loop below since it's a normal-flow element that moves as the page scrolls.
  const guardEl = document.querySelector<HTMLElement>('[data-field-guard]');
  const GUARD_MIN = 0.12, GUARD_FEATHER = 56;
  function guardFactorAt(x: number, y: number, r: DOMRect | null): number {
    if (!r) return 1;
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    const d = Math.max(dx, dy);
    if (d <= 0) return GUARD_MIN;
    if (d >= GUARD_FEATHER) return 1;
    return GUARD_MIN + (1 - GUARD_MIN) * smoothstep(d / GUARD_FEATHER);
  }

  // Convergence point for the 'contact' formation (ContactPortal.tsx's circular CTA) — same
  // query-once/read-rect-every-frame contract as guardEl above, for the same reason (a normal-flow
  // element that moves as the page scrolls).
  const targetEl = document.querySelector<HTMLElement>('[data-field-target]');

  // ---------- boot entrance ----------
  // A brief materialize-in rather than the field snapping to full brightness the instant physics
  // starts — particles are already springing in from scatter positions toward the globe (see the
  // per-particle spring below), so this just makes that assembly READ as a deliberate entrance
  // rather than a flash. One-way ramp, not looped.
  const bootAt = performance.now();
  const BOOT_MS = 1100;

  // ---------- pointer / drag (window-level hit-testing, exactly like usePointer.ts already does
  // for the R3F scene — the canvas stays pointer-events:none so it can never intercept a real click
  // or block page scroll on its own). ----------
  const FINE = matchMedia('(pointer:fine)').matches;
  let dragging = false, armed = false, decided = false;
  let startX = 0, startY = 0, lastX = 0, lastY = 0, lastMove = 0, firstY = 0;
  const AXIS = 10; // px of travel before a touch gesture is judged drag-vs-scroll — see onMove

  const onBall = (x: number, y: number) => Math.hypot(x - cx, y - cy) < R * 1.3;

  function onDown(x: number, y: number) {
    // Only draggable while the hero ring-sphere is actually part of what's on screen — elsewhere on
    // the page this exact viewport-center point has no visible sphere at all (a different formation
    // occupies it), so "dragging" there would silently spin an invisible shape, which reads as a bug
    // rather than an interaction.
    const active = pickFormation();
    if (active.A !== 'hero' && active.B !== 'hero') return false;
    if (!onBall(x, y)) return false;
    lastX = startX = x;
    lastY = startY = firstY = y;
    lastMove = performance.now();
    if (FINE) {
      dragging = true;
      decided = true;
      return true;
    }
    armed = true;
    decided = false;
    return false;
  }
  function onMove(x: number, y: number) {
    mx = x;
    my = y;
    if (armed && !decided) {
      const dx = Math.abs(x - startX), dy = Math.abs(y - startY);
      if (Math.max(dx, dy) >= AXIS) {
        decided = true;
        if (dx > dy) {
          dragging = true;
          lastX = x;
          lastY = y;
          firstY = startY;
          lastMove = performance.now();
        } else {
          armed = false; // vertical gesture — hand it straight back to native page scroll
        }
      }
      return;
    }
    if (!dragging) return;
    const now = performance.now();
    const dt = Math.max((now - lastMove) / 1000, 1 / 240);
    const dx = x - lastX;
    yaw += dx * T.dragSens;
    yawVel = clamp((dx * T.dragSens) / dt, -14, 14);
    tiltTarget = clamp(T.tiltBase + (y - firstY) * -T.tiltSens, T.tiltBase - T.tiltRange, T.tiltBase + T.tiltRange);
    lastX = x;
    lastY = y;
    lastMove = now;
  }
  function onUp() {
    armed = false;
    decided = false;
    if (!dragging) return;
    dragging = false;
    const m = Math.abs(yawVel);
    for (let r = 0; r < NR; r++) wv[r] += (Math.random() - 0.5) * T.randKick * m;
    tiltTarget = T.tiltBase;
  }

  const onPointerDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement)?.closest?.('a,button,input,textarea')) return;
    if (onDown(e.clientX, e.clientY)) e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent) => onMove(e.clientX, e.clientY);
  // Only ever blocks native scroll once the gesture has already been judged horizontal — a
  // vertical touch always reaches the browser's own scroll handling untouched.
  const onTouchMove = (e: TouchEvent) => {
    if (dragging) e.preventDefault();
  };
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('touchmove', onTouchMove, { passive: false });

  const onResize = () => layout();
  window.addEventListener('resize', onResize);

  // ---------- formation sampler ----------
  // Mutates the shared `F` scratch object rather than returning a fresh one — same technique
  // Latitude's own engine uses for this exact purpose (their `o`/`oa` objects), since this runs up
  // to 2x per particle per frame (once for the outgoing formation, once for the incoming one during
  // a blend) and allocating a fresh object there would mean up to 2,800 short-lived objects/frame.
  const F = { x: 0, y: 0, a: 0, s: 0 };
  function sampleForm(form: FieldForm, i: number, time: number, ct: number, st: number, breathe: number, targetRect: DOMRect | null) {
    switch (form) {
      case 'hero': {
        const r = ringOf[i];
        const la = lat[r];
        const rr = R * breathe;
        const ringR = rr * Math.cos(la);
        const ringY = rr * Math.sin(la);
        const ph = rnd1[i] * TAU + ang[r];
        const X = ringR * Math.cos(ph), Z = ringR * Math.sin(ph);
        const Y2 = ringY * ct - Z * st, Z3 = ringY * st + Z * ct;
        const s = FOCAL / Math.max(Z3 + FOCAL, R * 0.35);
        F.x = cx + X * s;
        F.y = cy - Y2 * s;
        const front = clamp(0.5 - (Z3 / (R || 1)) * 0.5, 0, 1);
        F.a = (0.14 + front * 0.55) * (0.7 + rnd2[i] * 0.4);
        F.s = (1.1 + front * 1.3) * (0.8 + rnd3[i] * 0.6);
        break;
      }
      case 'helix': {
        // Two counter-rotating strands wrapping a shared vertical axis, continuously climbing —
        // confirmed live on latitudeform.com's "03/STUDIO" section, reads unmistakably as a DNA
        // double helix. `strand` (even/odd particle index) offsets one strand by π so they wind
        // opposite each other around the same axis instead of overlapping.
        const strand = i % 2;
        const amp = Math.min(W, H) * 0.09;
        const ph = rnd1[i] * Math.PI * 4.4 + time * 0.55 + strand * Math.PI;
        let climb = (rnd1[i] + time * 0.035) % 1;
        if (climb < 0) climb += 1;
        F.x = cx + Math.cos(ph) * amp + (rnd3[i] - 0.5) * 8;
        F.y = climb * H + (rnd2[i] - 0.5) * 9;
        const front = clamp(0.5 - Math.sin(ph) * 0.5, 0, 1);
        const edge = smoothstep(clamp(climb * 10, 0, 1)) * (1 - smoothstep(clamp((climb - 0.9) * 10, 0, 1)));
        F.a = (0.1 + front * 0.5) * (0.6 + rnd2[i] * 0.6) * edge;
        F.s = (0.9 + front * 1.3) * (0.8 + rnd3[i] * 0.6);
        break;
      }
      case 'rings': {
        // Three concentric rings drifting at slightly different rates (the middle ring reversed) —
        // confirmed live as a real Latitude formation (their "case 6").
        const ring = i % 3;
        const rr = Math.min(W, H) * (0.16 + ring * 0.11);
        const ph = rnd1[i] * TAU + time * (0.06 - ring * 0.015) * (ring === 1 ? -1 : 1);
        const tl = 0.34 + ring * 0.3;
        const X = Math.cos(ph) * rr, Z = Math.sin(ph) * rr;
        F.x = cx + X + Math.sin(time * 0.33 + rnd2[i] * TAU) * 7;
        F.y = cy + Z * Math.sin(tl) * 0.92 + (rnd3[i] - 0.5) * 9;
        const front = clamp(0.5 - (Z / rr) * 0.5, 0, 1);
        F.a = (0.14 + front * 0.45) * (0.55 + rnd2[i] * 0.7);
        F.s = (0.9 + front * 1.3) * (0.8 + rnd3[i] * 0.6);
        break;
      }
      case 'contact': {
        // Converges into a halo around ContactPortal.tsx's circular CTA — confirmed live as
        // Latitude's own "everything gathers on whatever is marked as the target" CTA formation.
        const tgtX = targetRect ? targetRect.left + targetRect.width / 2 : cx;
        const tgtY = targetRect ? targetRect.top + targetRect.height / 2 : cy;
        const tgtW = targetRect ? targetRect.width / 2 : Math.min(W, H) * 0.15;
        const tgtH = targetRect ? targetRect.height / 2 : Math.min(W, H) * 0.15;
        const a = rnd1[i] * TAU + time * 0.11;
        const spread = Math.pow(rnd2[i], 1.7) * Math.min(W, H) * 0.3;
        const rw = tgtW * 1.2 + spread, rh = tgtH * 1.2 + spread * 0.85;
        F.x = tgtX + Math.cos(a) * rw;
        F.y = tgtY + Math.sin(a) * rh;
        const near = 1 - Math.pow(rnd2[i], 1.7);
        F.a = 0.06 + near * near * 0.6;
        F.s = 0.9 + near * 1.8;
        break;
      }
      case 'scatter':
      default: {
        // Continuous upward flow, wrapped modulo viewport height — see the file-level note on why
        // this is stateless-and-time-based rather than scroll-coupled.
        const flowSpeed = 6 + rnd1[i] * 10;
        let flowY = (scatterY[i] - time * flowSpeed) % H;
        if (flowY < 0) flowY += H;
        const q = flowY / H;
        const edgeFade = smoothstep(clamp(q * 8, 0, 1)) * (1 - smoothstep(clamp((q - 0.88) * 8, 0, 1)));
        const wx = Math.sin(time * (0.05 + rnd3[i] * 0.06) + rnd1[i] * TAU) * (10 + rnd2[i] * 16);
        F.x = scatterX[i] + wx;
        F.y = flowY;
        F.a = (0.05 + rnd2[i] * 0.06) * edgeFade;
        F.s = 0.7;
        break;
      }
    }
  }

  // ---------- main loop ----------
  let last = performance.now();
  let raf = 0;
  let disposed = false;

  // Low-tier devices target ~30fps instead of the display's native rate — physics still advances
  // by the real elapsed `dt` on whichever frame actually runs, so motion speed is unaffected, only
  // its sampling rate is. Pointer/drag input is handled by its own listeners above, independent of
  // this cadence, so a capped draw rate never makes dragging the globe feel laggy.
  const frameBudgetMs = tier === 'low' ? 1000 / 30 : 0;

  // Live performance guard — useDeviceTier is a one-time heuristic (cores/memory/pointer type) and
  // can't see actual sustained frame cost, which also depends on things it can't know in advance
  // (how many other tabs/apps are competing for the GPU right now, thermal throttling on a phone
  // mid-session). If real frame time stays bad for ~1.5s straight, thin the DRAW loop by skipping
  // every other (then every third) particle — physics for every particle keeps running regardless,
  // so density recovers instantly and smoothly the moment performance does, no re-seeding or pop.
  let badFrames = 0, drawStride = 1;
  const BAD_FRAME_MS = 1000 / 24; // worse than ~24fps counts against the budget

  const frame = (now: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    if (frozen) return;
    if (frameBudgetMs && now - last < frameBudgetMs) return;

    let dt = (now - last) / 1000;
    last = now;
    if (dt * 1000 > BAD_FRAME_MS) {
      badFrames++;
      if (badFrames > 90 && drawStride < 3) {
        drawStride++;
        badFrames = 0;
      }
    } else if (badFrames > 0) {
      badFrames--;
    }
    if (dt > 0.05) dt = 0.05; // guards the spring integration against a huge dt after a tab was
    // backgrounded — without this a stale delta can send the ring physics into a visible "explosion".
    const time = now / 1000;

    // Which two named formations are active right now, and how far blended between them — see
    // pickFormation() above. Computed once per frame (cheap: a handful of stop comparisons), not
    // per particle.
    const { A: formA, B: formB, t: formT } = pickFormation();

    yaw += T.idleSpin * dt * 0.5;
    if (!dragging) {
      yaw += yawVel * dt;
      yawVel -= yawVel * Math.min(T.spinDamp * dt, 1);
    }
    for (let r = 0; r < NR; r++) {
      const torque = -T.K * (ang[r] - yaw) - T.C * (wv[r] - yawVel);
      wv[r] += (torque / inert[r]) * dt;
      ang[r] += wv[r] * dt;
    }
    tiltVel += (-T.tiltK * (tilt - tiltTarget) - T.tiltC * tiltVel) * dt;
    tilt += tiltVel * dt;
    const ct = Math.cos(tilt), st = Math.sin(tilt);

    // Cursor reactivity is available in every formation now, not hero-only — it's a nice ambient
    // touch wherever a fine pointer happens to be, not something worth gating by scroll position.
    const wantField = FINE ? 1 : 0;
    fieldAmt = damp(fieldAmt, wantField, 1 / T.fieldTau, dt);

    ctx.clearRect(0, 0, W, H);
    // 'source-over' (normal alpha blending), not 'lighter' (additive) — additive blending is what
    // makes overlapping points brighten and bleed into each other into one glowing mass wherever the
    // sphere gets dense (its front face, ring intersections); normal blending draws each point
    // independently, which is what actually reads as "sharp individual dots" rather than a nebula.
    ctx.globalCompositeOperation = 'source-over';
    const fr2 = T.fieldR * T.fieldR;
    const breathe = 1 + Math.sin(time * TAU * T.breathHz) * T.breathAmp;
    const bootFade = smoothstep(clamp((now - bootAt) / BOOT_MS, 0, 1));
    const guardRect = guardEl ? guardEl.getBoundingClientRect() : null;
    const targetRect = targetEl ? targetEl.getBoundingClientRect() : null;

    for (let i = 0; i < N; i++) {
      // Target position: sample the active formation(s) for this particle — a straight sample when
      // fully settled on one (formT===0 or A===B, the common case away from a transition), or a
      // per-particle-staggered blend between two adjacent ones while scrolling through a transition.
      let tx: number, ty: number, alpha: number, size: number;
      sampleForm(formA, i, time, ct, st, breathe, targetRect);
      if (formT <= 0 || formA === formB) {
        tx = F.x; ty = F.y; alpha = F.a; size = F.s;
      } else {
        const ax = F.x, ay = F.y, aa = F.a, asz = F.s;
        sampleForm(formB, i, time, ct, st, breathe, targetRect);
        const tt = clamp((formT - stag[i]) / (1 - STAGGER), 0, 1);
        const e = smoothstep(tt);
        tx = ax + (F.x - ax) * e;
        ty = ay + (F.y - ay) * e;
        alpha = aa + (F.a - aa) * e;
        size = asz + (F.s - asz) * e;
      }

      // Cursor repulsion — displaces the TARGET, never the point directly; the point then springs
      // toward that displaced target below. Skipping this indirection is what makes most
      // cursor-reactive backgrounds feel robotic rather than fluid.
      if (fieldAmt > 0.01) {
        const ddx = tx - mx, ddy = ty - my;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 < fr2 && d2 > 0.5) {
          const d = Math.sqrt(d2);
          const g = 1 - d / T.fieldR;
          const push = T.fieldStr * g * g * fieldAmt;
          tx += (ddx / d) * push;
          ty += (ddy / d) * push;
        }
      }

      const k = T.pK * kmul[i];
      vx[i] += ((tx - px[i]) * k - vx[i] * T.pC) * dt;
      vy[i] += ((ty - py[i]) * k - vy[i] * T.pC) * dt;
      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;

      // Physics runs for every particle regardless of drawStride — only the (comparatively
      // expensive) fill call is thinned under sustained load, so density recovers the instant
      // performance does, with no re-seeding or visible pop back to full.
      if (drawStride > 1 && i % drawStride !== 0) continue;
      const x = px[i], y = py[i];
      if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
      alpha *= bootFade * guardFactorAt(x, y, guardRect);
      if (alpha < 0.01) continue;
      // A directly-filled circle, not a scaled sprite bitmap — zero gradient, zero soft edge, only
      // the canvas's own ~1px edge anti-aliasing (which is sub-pixel smoothing, not a visible glow).
      // Radius deliberately tiny — down from an earlier ×3.5 (which gave ~5-20px dots, plainly too
      // big) to true pinpoint scale matching the real starfield's own star size: `size` is a small
      // dimensionless multiplier (~0.7-2.9 across ambient→front-facing-globe); this maps it to a
      // ~0.85-1.66px radius (≈1.7-3.3px diameter) instead of a big dot, with just enough range left
      // to still read as depth (closer globe points a touch larger than ambient ones).
      const r = 0.6 + size * 0.35;
      ctx.fillStyle = STAR_RGB + alpha.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  };
  raf = requestAnimationFrame(frame);

  return {
    setFrozen(next: boolean) {
      if (reducedMotion) return; // reduced-motion is a one-way door, never re-armed
      frozen = next;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('resize', onResize);
    },
  };
}
