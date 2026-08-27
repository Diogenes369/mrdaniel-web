/**
 * MOTION V2 (PREVIEW) — Canvas2D particle field + aurora wash, ported from the Latitude teardown's
 * technique (hand-projected 3D sphere, per-ring spring-damper physics, sprite-based additive
 * rendering) and re-tuned to this site's own brand tokens and layout. Deliberately vanilla —
 * no Three.js, no GSAP — so it costs the "already paying for it" WebGL background nothing extra;
 * this is its lightweight *alternative*, gated behind the `?motion=2d` flag (see motionFlag.ts).
 *
 * Framework-agnostic on purpose: a bare `createFieldEngine()` factory over two <canvas> elements,
 * so the React wrapper (MotionField.tsx) only has to own the refs/lifecycle, not the physics.
 */

// ---------- brand tokens (kept in sync BY HAND with src/index.css's @theme block — same convention
// already used for the dashboard/agent type duplication elsewhere in this codebase; Canvas2D can't
// read CSS custom properties without an extra getComputedStyle round trip per value, which isn't
// worth paying every time these are needed inside a hot per-particle loop). ----------
const STAR = [241, 245, 249] as const; // zinc-200 — the neutral majority particle color
const SIGNAL = [0, 255, 102] as const; // --color-glow — the accent minority particle color
const AURORA_A = [56, 189, 248] as const; // electric-blue
const AURORA_B = [34, 211, 238] as const; // neon-cyan
const AURORA_C = [118, 185, 0] as const; // brand-500 — a third, warmer glow tone

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

interface Sprite {
  canvas: HTMLCanvasElement;
}

function buildSprites(spritePx: number): [Sprite[], Sprite[]] {
  // 12 alpha steps — finer depth-cued fading, still cheap since these are baked once, not per frame.
  // Gradient shape is now a MOSTLY-SOLID disc (full alpha out to 58% radius) with only a short,
  // tight anti-aliasing taper to 0 by 78% — deliberately NOT the wide soft-glow-halo shape this had
  // before. That earlier shape, combined with additive ('lighter') blending on overlapping points,
  // is exactly what reads as "blurry glowing blobs" once enough particles cluster near the sphere's
  // front — every soft edge stacks and bleeds into its neighbors. A tight, mostly-solid disc doesn't
  // have much soft edge left to bleed, and particle drawing below now also uses normal ('source-over')
  // blending instead of additive, so two overlapping points no longer brighten each other at all —
  // together this is what actually produces "razor-sharp pinpoint dots" rather than a nebula.
  const AL = 12;
  const build = (rgb: readonly [number, number, number]) => {
    const out: Sprite[] = [];
    for (let a = 0; a < AL; a++) {
      const c = document.createElement('canvas');
      c.width = c.height = spritePx;
      const g = c.getContext('2d')!;
      const al = (a + 1) / AL;
      const grad = g.createRadialGradient(spritePx / 2, spritePx / 2, 0, spritePx / 2, spritePx / 2, spritePx / 2);
      grad.addColorStop(0.0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${al.toFixed(3)})`);
      grad.addColorStop(0.58, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${al.toFixed(3)})`);
      grad.addColorStop(0.78, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
      grad.addColorStop(1.0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, spritePx, spritePx);
      out.push({ canvas: c });
    }
    return out;
  };
  return [build(STAR), build(SIGNAL)];
}

export interface FieldEngineOptions {
  fieldCanvas: HTMLCanvasElement;
  auroraCanvas: HTMLCanvasElement;
  /** Fewer particles, smaller sprites, capped draw rate — see useDeviceTier.ts. */
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
  const { fieldCanvas, auroraCanvas, tier, reducedMotion } = opts;
  const ctx = fieldCanvas.getContext('2d', { alpha: true });
  const actx = auroraCanvas.getContext('2d', { alpha: true });

  // A canvas can legitimately fail to produce a 2D context (exhausted context budget, a locked-down
  // browser policy) — fail silently rather than throw, since this whole feature is decorative.
  if (!ctx || !actx) {
    return { setFrozen() {}, dispose() {} };
  }
  // Canvas2D's default smoothing quality is implementation-defined and, on several engines, biased
  // toward speed over fidelity — since every point sprite is drawn via a scaled-down drawImage
  // (spritePx source → a few CSS px on screen), the resampling quality here is what actually decides
  // whether a point reads as a crisp dot or a soft, slightly muddy blob. Explicit and high on both
  // contexts; the cost is paid once per drawImage call, not proportional to canvas resolution.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  actx.imageSmoothingEnabled = true;
  actx.imageSmoothingQuality = 'high';

  let frozen = reducedMotion; // reduced-motion starts frozen and stays that way — never re-armed.
  const N = tier === 'high' ? 1400 : 520;
  const spritePx = tier === 'high' ? 96 : 48;
  const [starSprites, signalSprites] = buildSprites(spritePx);
  const AL = starSprites.length;

  // ---------- particle state (typed arrays — 1,400 particles × several Float32Arrays is a fraction
  // of a millisecond to allocate and keeps the per-frame loop free of per-particle object churn). ----------
  const px = new Float32Array(N), py = new Float32Array(N);
  const vx = new Float32Array(N), vy = new Float32Array(N);
  const rnd1 = new Float32Array(N), rnd2 = new Float32Array(N), rnd3 = new Float32Array(N);
  const kmul = new Float32Array(N);
  const hue = new Uint8Array(N); // 0 = star, 1 = signal accent (~12% of particles)
  const ringOf = new Uint8Array(N);
  const scatterX = new Float32Array(N), scatterY = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    rnd1[i] = hash(i * 4 + 7);
    rnd2[i] = hash(i * 4 + 2311);
    rnd3[i] = hash(i * 4 + 90001);
    kmul[i] = 1 - T.pKvar * 0.5 + rnd2[i] * T.pKvar;
    hue[i] = rnd3[i] < 0.12 ? 1 : 0;
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

  // Arrow-function *expressions*, not `function` declarations — TS's null-narrowing of `ctx`/`actx`
  // above only survives into closures defined textually after the guard; a hoisted `function`
  // declaration is (conservatively, correctly) treated as possibly running before the guard ran.
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
    for (const c of [fieldCanvas, auroraCanvas]) {
      c.width = Math.round(W * DPR);
      c.height = Math.round(H * DPR);
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    actx.setTransform(DPR, 0, 0, DPR, 0, 0);

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

  // ---------- pointer / drag (window-level hit-testing, exactly like usePointer.ts already does
  // for the R3F scene — the canvas stays pointer-events:none so it can never intercept a real click
  // or block page scroll on its own). ----------
  const FINE = matchMedia('(pointer:fine)').matches;
  let dragging = false, armed = false, decided = false;
  let startX = 0, startY = 0, lastX = 0, lastY = 0, lastMove = 0, firstY = 0;
  const AXIS = 10; // px of travel before a touch gesture is judged drag-vs-scroll — see onMove

  const onBall = (x: number, y: number) => Math.hypot(x - cx, y - cy) < R * 1.3;

  function onDown(x: number, y: number) {
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

  // ---------- aurora ----------
  const AURORA_COLORS = [AURORA_A, AURORA_B, AURORA_C];
  const drawAurora = (time: number) => {
    actx.clearRect(0, 0, W, H);
    actx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      const rgb = AURORA_COLORS[k];
      const x = (0.2 + k * 0.3 + Math.sin(time * (0.03 + k * 0.01) + k) * 0.08) * W;
      const y = (0.25 + k * 0.22 + Math.cos(time * (0.025 + k * 0.008) + k * 2) * 0.07) * H;
      const rr = Math.max(W, H) * (0.42 + Math.sin(time * 0.017 + k) * 0.06);
      const g = actx.createRadialGradient(x, y, 0, x, y, rr);
      // Raised from 0.05/0.018 — at the original values this was measured at ~17/255 alpha
      // (~6.7%) by the time it reached a card's screen position, which is not enough color for a
      // frosted-glass card sitting over it to visibly pick up: `backdrop-filter` was demonstrably
      // working (confirmed via getImageData), there just wasn't enough light behind the glass to
      // bend. This is the one deliberately vivid layer in the whole system — everything else (the
      // point field, the cards) stays deliberately restrained around it.
      g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.20)`);
      g.addColorStop(0.55, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.075)`);
      g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
      actx.fillStyle = g;
      actx.beginPath();
      actx.arc(x, y, rr, 0, TAU);
      actx.fill();
    }
    actx.globalCompositeOperation = 'source-over';
  };

  // ---------- main loop ----------
  let last = performance.now();
  let aurAt = 0;
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

    // Hero-to-scatter dissolve — how much of the page has scrolled past the hero's own height. Reads
    // window.scrollY directly (not Lenis's document-wide progress, which is the wrong unit for "how
    // far past THIS one section" on a long page). The dissolve runs over 1.4 hero-heights rather than
    // exactly one, and is smoothstep-eased rather than linear — both changes exist purely so the
    // globe reads as gradually dissolving into the ambient field rather than visibly running out of
    // road right at the section boundary and snapping into its final rate of change.
    const heroPx = document.getElementById('hero')?.offsetHeight || window.innerHeight;
    const globeWeight = smoothstep(clamp(1 - window.scrollY / (heroPx * 1.4), 0, 1));

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

    const wantField = FINE && globeWeight > 0.15 ? 1 : 0;
    fieldAmt = damp(fieldAmt, wantField, 1 / T.fieldTau, dt);

    if (now - aurAt > 32) {
      drawAurora(time);
      aurAt = now;
    }

    ctx.clearRect(0, 0, W, H);
    // 'source-over' (normal alpha blending), not 'lighter' (additive) — additive blending is what
    // makes overlapping points brighten and bleed into each other into one glowing mass wherever the
    // sphere gets dense (its front face, ring intersections); normal blending draws each point
    // independently, which is what actually reads as "sharp individual dots" rather than a nebula.
    // The aurora wash a few lines up is intentionally left on 'lighter' — that IS meant to glow.
    ctx.globalCompositeOperation = 'source-over';
    const fr2 = T.fieldR * T.fieldR;
    const breathe = 1 + Math.sin(time * TAU * T.breathHz) * T.breathAmp;

    for (let i = 0; i < N; i++) {
      // Target position: blend between the ring/globe formation and this particle's scattered
      // "ambient wash" home, driven by how far the visitor has scrolled past the hero.
      let tx: number, ty: number, alpha: number, size: number;
      if (globeWeight > 0.01) {
        const r = ringOf[i];
        const la = lat[r];
        const rr = R * breathe;
        const ringR = rr * Math.cos(la);
        const ringY = rr * Math.sin(la);
        const ph = rnd1[i] * TAU + ang[r];
        const X = ringR * Math.cos(ph), Z = ringR * Math.sin(ph);
        const Y2 = ringY * ct - Z * st, Z3 = ringY * st + Z * ct;
        const s = FOCAL / Math.max(Z3 + FOCAL, R * 0.35);
        const gx = cx + X * s, gy = cy - Y2 * s;
        const front = clamp(0.5 - (Z3 / (R || 1)) * 0.5, 0, 1);
        const galpha = (0.14 + front * 0.55) * (0.7 + rnd2[i] * 0.4);
        // A pure multiplier (NOT pre-scaled by spritePx — spritePx is the *source bitmap*
        // resolution the sprite was baked at, unrelated to how many CSS px it's drawn at; folding
        // it in here once and then multiplying by spritePx again at the draw call was a real bug
        // that produced 25-106px "stars" — a wash of blown-out white rather than a field of points).
        const gsize = (1.1 + front * 1.3) * (0.8 + rnd3[i] * 0.6);
        // Straight linear blend between this particle's scattered "ambient" home and its globe
        // position — globeWeight is already eased by the scroll-distance clamp above, so a second
        // easing pass here isn't needed.
        tx = scatterX[i] * (1 - globeWeight) + gx * globeWeight;
        ty = scatterY[i] * (1 - globeWeight) + gy * globeWeight;
        alpha = 0.04 * (1 - globeWeight) + galpha * globeWeight;
        size = 0.8 * (1 - globeWeight) + gsize * globeWeight;
      } else {
        // Slow, per-particle Lissajous-ish wander around its own viewport-relative home — organic
        // and always in view at any scroll depth, unlike the scroll-linked parallax this replaced.
        // Amplitude and frequency both vary per particle (via its own seeded randoms) so the whole
        // field never moves as one visible unit — that desync IS what reads as "organic" rather
        // than "one shape sliding".
        const wx = Math.sin(time * (0.05 + rnd3[i] * 0.06) + rnd1[i] * TAU) * (14 + rnd2[i] * 22);
        const wy = Math.cos(time * (0.04 + rnd2[i] * 0.05) + rnd3[i] * TAU) * (14 + rnd1[i] * 22);
        tx = scatterX[i] + wx;
        ty = scatterY[i] + wy;
        alpha = 0.05 + rnd2[i] * 0.05;
        size = 0.7;
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
      // expensive) drawImage call is thinned under sustained load, so density recovers the instant
      // performance does, with no re-seeding or visible pop back to full.
      if (drawStride > 1 && i % drawStride !== 0) continue;
      const x = px[i], y = py[i];
      if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
      let ai = Math.round(alpha * AL) - 1;
      if (ai < 0) continue;
      if (ai >= AL) ai = AL - 1;
      const sprites = hue[i] === 1 ? signalSprites : starSprites;
      // `size` is a small dimensionless multiplier (~0.7-2.9) — this constant is the only place the
      // actual on-screen point diameter (in CSS px) is decided, independent of the sprite bitmap's
      // own resolution (spritePx). Deliberately small: this reads as a field of points, not blobs.
      const s = size * 7;
      ctx.drawImage(sprites[ai].canvas, x - s * 0.5, y - s * 0.5, s, s);
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
