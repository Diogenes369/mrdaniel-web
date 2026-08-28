/**
 * MOTION V2 (PREVIEW) — Canvas2D particle field, ported from the Latitude teardown's technique
 * (hand-projected 3D sphere, per-ring spring-damper physics) and re-tuned to this site's own brand
 * tokens and layout. Each point is a crisp direct-filled vector circle (razor edge at any DPR); on
 * high-tier devices a soft additive-glow sprite is blitted underneath the brighter points first
 * (see the two-pass draw at the end of the frame loop) so the field reads as genuinely glowing
 * without the cores losing their edge. Deliberately vanilla — no Three.js, no GSAP — so it costs the "already
 * paying for it" WebGL background nothing extra; this is its lightweight *alternative to that
 * particular scene*, gated behind the `?motion=2d` flag (see motionFlag.ts) — note it's paired with
 * a *real* Three.js starfield underneath it (StarfieldLayer.tsx), by explicit request.
 *
 * There was an aurora wash layer here (soft color-gradient blobs behind the points) — removed by
 * explicit request: pure black background + white starfield only, zero color wash. If it's ever
 * wanted back, the technique is documented in the Latitude teardown research this module is based on.
 *
 * Framework-agnostic on purpose: a bare `createFieldEngine()` factory over a single <canvas>
 * element, so the React wrapper (MotionField.tsx) only has to own the ref/lifecycle, not the physics.
 */

// Pristine white particles (Latitude-form aesthetic) — variable alpha + additive bloom carry the
// "hyper-realistic" read, not hue. The bulk is `STAR` (pure white); ~1 in 4 render in `STAR_COOL`
// (a barely-there cool white) for subtle variation. On the near-OLED-black body this reads as a
// deep-space particle field.
const STAR = [255, 255, 255] as const; // pure white
const STAR_COOL = [214, 221, 245] as const; // faint cool-white variation

// ---------- tuning (see the teardown's appendix for the source constants this was calibrated
// against; values below are re-tuned for a slightly smaller, calmer field than the original). ----------
const T = {
  rings: 13,
  latMax: 78,
  // Enlarged (was 0.34 / 0.30 / 0.30) so the hero headline + subheadline sit comfortably INSIDE the
  // projected globe boundary on every viewport, per explicit request. radiusWM (low-tier / phone) is
  // the largest of the three: a phone viewport is narrow, so the globe has to be near-full-width to
  // enclose the wrapped headline — R still = min(W*factor, H*factor), so it can never overflow the
  // shorter axis.
  radiusW: 0.48,
  radiusWM: 0.49,
  radiusH: 0.52,
  axisCam: 3.1,
  tiltBase: -0.38,
  // Raised from an original 0.05, then again ~35% here (0.085 -> 0.115) per explicit request for
  // a "lively, energetic, commanding" globe on landing — still reads as a deliberate rotation
  // rather than a spinning toy at this rate.
  idleSpin: 0.115,
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
  // Particle spring, retuned for "razor-sharp" synchronisation (per explicit request):
  //  • pK 34 → 56  — much stiffer, so a particle sits far closer to its ideal target every frame:
  //    less steady-state tracking lag while the target sweeps with scroll, snappier arrival.
  //  • pC 10 → 17  — damping ratio ζ = pC/(2·√pK) ≈ 1.14, i.e. slightly OVER-damped: the spring
  //    approaches its target with no overshoot and no residual wobble, which is what actually kills
  //    the on-arrival "jitter".
  //  • pKvar 0.5 → 0.14 — per-particle stiffness spread cut to ±7 %, so every particle in a
  //    formation converges at very nearly the same rate → the shape moves as one locked body
  //    instead of a loose swarm. Combined with the fixed-timestep sub-stepping in the frame loop
  //    (which removes frame-time jitter entirely), the flow reads as crisp and hyper-fluid.
  pK: 56,
  pC: 17,
  pKvar: 0.14,
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
// a scroll position picks/blends two of these. 'hero' is the ring-sphere (its own drag/spring
// physics); it now PERSISTS across the first two stops (Hero + SystemMetrics) so the globe stays
// visible well down the page before it morphs away. Every other shape is STRICTLY LATERAL
// (horizontal, never a vertical stack) and spans the FULL viewport width edge-to-edge on desktop
// AND mobile:
//   'dna'     = a lateral DNA double-helix — two counter-rotating strands + connecting rungs
//     winding around a horizontal axis, flowing edge-to-edge across the whole width.
//   'wave'    = wide horizontal rolling wave bands, full viewport width.
//   'rings'   = ultra-wide concentric flattened ellipses, the outermost reaching the viewport
//     edges (edge-to-edge). Centred — no longer gutter-anchored.
//   'scatter' = the faint ambient wander, thinned across the centre.
//   'contact' = particles that wrap around the circular "Let's talk" CTA in 1:1 sync with scroll.
// Each lateral form applies the same viewport-relative `mob` scale-up (see layout()) so it stays
// bold and legible on phones instead of rendering thin, and a soft centre readability dim.
// (A 'lattice'/cyber-grid-matrix formation lived here — removed by explicit request; its aligned
// dot-grid read as a structured pattern rather than a smooth dark backdrop. Its sections fall back
// to 'wave' / 'scatter'.)
export type FieldForm = 'hero' | 'dna' | 'wave' | 'rings' | 'scatter' | 'contact';

// Precomputed strings so the per-particle draw allocates nothing. The particle pass now sets
// `ctx.fillStyle` ONCE to the solid colour and varies each point's opacity via `ctx.globalAlpha`
// (a plain float write) instead of building `rgba(…,a)` + `Number.toFixed(3)` per particle — the
// latter was N string allocations + N colour re-parses every frame. `STAR_RGB` is still used by the
// wireframe stroke (a handful of calls per frame, not worth changing).
const STAR_RGB = `rgba(${STAR[0]},${STAR[1]},${STAR[2]},`;
const STAR_SOLID = `${STAR_RGB}1)`;
const STAR_COOL_SOLID = `rgba(${STAR_COOL[0]},${STAR_COOL[1]},${STAR_COOL[2]},1)`;

// Global brightness/luminance lift across the entire field (particles + wireframe). Raised 1.28 →
// 1.6 for the "crisp, glowing, ultra-visible" overhaul — paired with the additive-glow bloom pass
// in the draw loop (see `glowSprite`) and a larger particle radius, so points render vivid against
// the #080910 background instead of a faint dust.
const GLOBAL_BRIGHT = 1.6;

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
  // Baseline state. The draw loop briefly flips `globalCompositeOperation` to 'lighter' for the
  // additive-glow pass and always flips it back to 'source-over' immediately after; `fillStyle` is
  // only rewritten in the core pass when a particle's tint bucket differs from the previous one
  // (silver ↔ cool accent), so it's still a handful of writes per frame, not N.
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = STAR_SOLID;
  // `frozen` halts the animation loop. For a reduced-motion visitor we DON'T start frozen — the
  // field is allowed to assemble once (a brief, one-time settle, not a looping animation), then
  // `freeze()` locks it as a STATIC image. Starting frozen would skip the draw entirely and leave a
  // blank canvas. `staticDrawn` lets exactly one frame paint after a freeze so the last state stays
  // on screen.
  let frozen = false;
  let staticDrawn = false;
  // Particle count. Now that mobile defaults ON (see lib/motionFlag.ts), a capable phone still
  // reports `tier === 'high'` — so a narrow viewport gets its own middle tier (~1000) to keep the
  // per-frame physics + draw cost comfortably inside a 60fps budget on real devices.
  const narrowVP = typeof window !== 'undefined' && window.innerWidth < 768;
  const N = tier === 'low' ? 520 : narrowVP ? 1000 : 1400;
  // Strength of the mid-transition "stream toward the camera" burst — trimmed on low-tier so the
  // extra per-particle perspective/curl math and the larger bloomed points stay inside a 30fps
  // budget on weak phones.
  const BURST_SCALE = tier === 'low' ? 0.55 : 1;

  // ---------- additive glow sprite ----------
  // One cached 64px white radial-gradient bitmap. In the draw loop the brightest particles get a
  // SMALL, TIGHT version of this blitted under their crisp core with `globalCompositeOperation =
  // 'lighter'`, so a point reads as having a compact halo — not a soft fog. The gradient falls off
  // fast (most of its energy in the inner ~30%) so overlapping halos don't wash the field out.
  // High-tier only — the extra per-frame drawImage pass isn't worth it on a device already thinning
  // its draw loop under load.
  const GLOW_ENABLED = tier === 'high';
  let glowSprite: HTMLCanvasElement | null = null;
  if (GLOW_ENABLED && typeof document !== 'undefined') {
    const GS = 64;
    const gspr = document.createElement('canvas');
    gspr.width = gspr.height = GS;
    const gc = gspr.getContext('2d');
    if (gc) {
      const grd = gc.createRadialGradient(GS / 2, GS / 2, 0, GS / 2, GS / 2, GS / 2);
      grd.addColorStop(0, 'rgba(255,255,255,0.95)');
      grd.addColorStop(0.22, 'rgba(255,255,255,0.28)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0.06)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      gc.fillStyle = grd;
      gc.fillRect(0, 0, GS, GS);
      glowSprite = gspr;
    }
  }
  const FR2 = T.fieldR * T.fieldR; // cursor-repulsion radius², was recomputed every frame

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
  // 0.16 — particles begin their morph at staggered points across a transition (organic, not a
  // lockstep snap). Widened a touch from 0.12 for the overhaul so the "pour into formation" cascade
  // reads as a longer, more liquid sweep now that the morph window itself is much wider (see DWELL).
  const STAGGER = 0.16;
  const ringOf = new Uint8Array(N);
  const scatterX = new Float32Array(N), scatterY = new Float32Array(N);
  // 1 → this particle renders in the cool-white accent, 0 → pure white. Seeded from its own
  // dedicated hash so the tint never correlates with a particle's size/stiffness personality.
  const tintCool = new Uint8Array(N);
  // ~4% of particles are "hero stars" — bigger, brighter, with a stronger bloom, scattered through
  // every formation like the bright foreground stars in the Latitude field.
  const brightStar = new Uint8Array(N);
  // Per-frame deferred-draw scratch: the main loop runs physics for every particle and records the
  // ones it wants painted here; two cheap passes afterwards blit the glow halos (additive) then the
  // crisp cores (source-over) in the right order without re-sampling the (expensive) formations.
  const drawX = new Float32Array(N), drawY = new Float32Array(N), drawR = new Float32Array(N), drawA = new Float32Array(N);
  const drawCool = new Uint8Array(N);

  for (let i = 0; i < N; i++) {
    rnd1[i] = hash(i * 4 + 7);
    rnd2[i] = hash(i * 4 + 2311);
    rnd3[i] = hash(i * 4 + 90001);
    kmul[i] = 1 - T.pKvar * 0.5 + rnd2[i] * T.pKvar;
    stag[i] = hash(i * 4 + 424242) * STAGGER;
    tintCool[i] = hash(i * 4 + 777013) > 0.74 ? 1 : 0; // ~26% cool accent
    brightStar[i] = hash(i * 4 + 555019) > 0.96 ? 1 : 0; // ~4% hero stars
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
  // Viewport-relative "mobile-ness": 0 on desktop / landscape-tablet, ramping to 1 on a narrow
  // phone (recomputed in layout()). Every lateral formation multiplies its amplitude / thickness /
  // density by a function of this so the shapes stay bold and legible on small screens rather than
  // rendering thin — NOT tied to the hardware `tier`, which a capable phone reports as 'high'.
  let mob = 0;
  // `: number` annotations are load-bearing here, not stylistic — T is `as const`, so its property
  // values are non-fresh literal types (e.g. -0.38) that DON'T widen to `number` on a plain `let`
  // the way a fresh literal would, which would otherwise make every later reassignment a type error.
  let yaw = 0, yawVel = 0, tilt: number = T.tiltBase, tiltVel = 0, tiltTarget: number = T.tiltBase;
  let mx = -1e4, my = -1e4, fieldAmt = 0;
  // Smoothed cursor-driven rotation offset — separate from `yaw` itself (which keeps accumulating via
  // idle spin / drag independently) so hovering near the globe tilts/turns it toward the cursor as a
  // gentle passive influence, without fighting or resetting whatever the drag/idle-spin state is doing.
  // See the hover block in frame() below for how the target it damps toward is computed.
  let hoverYaw = 0;

  // Scroll-velocity-scaled clock for the flowing formations (dna / rings / wave). `flowT` advances
  // by dt every frame, PLUS extra when the page is being scrolled fast, so those formations visibly
  // race along with the wheel/touch and ease back to a gentle idle drift the moment scrolling stops
  // — "locked to the scroll dynamics" without re-coupling particle *positions* to scrollY (which is
  // the bug that once stranded whole formations off-screen). `scrollVelS` is a smoothed |px/s|.
  let flowT = 0, scrollVelS = 0, lastSY = typeof window !== 'undefined' ? window.scrollY : 0;

  // Arrow-function *expression*, not a `function` declaration — TS's null-narrowing of `ctx` above
  // only survives into closures defined textually after the guard; a hoisted `function` declaration
  // is (conservatively, correctly) treated as possibly running before the guard ran.
  let seeded = false;
  const layout = () => {
    // DPR cap: 2 on a narrow (phone) viewport, 3 on desktop. 2x is already retina-sharp for these
    // sub-2px points, and dropping a 3x phone's backing store from 9x to 4x area is the single
    // biggest 60fps win now that mobile runs this engine by default. Still capped (not raw DPR) so a
    // device reporting an absurd value can't blow the buffer cost.
    DPR = Math.min(window.innerWidth < 768 ? 2 : 3, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    fieldCanvas.width = Math.round(W * DPR);
    fieldCanvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    R = Math.min(W * (tier === 'high' ? T.radiusW : T.radiusWM), H * T.radiusH);
    cx = W * 0.5;
    cy = H * 0.45; // ~centred on the hero text block so the enlarged globe encloses it
    FOCAL = T.axisCam * R;
    mob = smoothstep(clamp((900 - W) / 520, 0, 1)); // 0 desktop/landscape-tablet → 1 phone

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
  // Any element flagged data-field-form="hero|dna|wave|rings|scatter|contact" is a "stop" — mirrors
  // Latitude's own pickStop()/data-form mechanism precisely (confirmed via the original teardown's
  // source read): each stop's PAGE-space vertical midpoint is measured once, then every frame the
  // stop nearest the current viewport CENTER (not top) is found and blended with its neighbor by how
  // far scroll has moved between them. Stops are measured once here rather than every frame (their
  // own vertical position is what moves, via scrollY, not the elements themselves), but re-measured
  // on resize since layout changes can shift a section's height.
  // (A per-stop `anchorDir` / gutter-offset field lived here for the left/right-anchored formations —
  // removed along with the last of those; every stop is now centred, so there's nothing to store.)
  interface FormStop {
    y: number;
    form: FieldForm;
  }
  let stops: FormStop[] = [];
  // Formations an authorless page (an inner route with no [data-field-form] markup) cycles through,
  // in scroll order. Deliberately omits 'contact' (that one converges on a real on-screen element
  // that only exists on the homepage).
  const AUTO_CYCLE: FieldForm[] = ['hero', 'dna', 'rings', 'wave'];
  function measureStops() {
    const els = document.querySelectorAll<HTMLElement>('[data-field-form]');
    if (els.length >= 2) {
      stops = Array.from(els, (el) => ({
        y: el.getBoundingClientRect().top + window.scrollY + el.offsetHeight / 2,
        form: (el.dataset.fieldForm as FieldForm) || 'scatter',
      })).sort((a, b) => a.y - b.y);
      return;
    }
    // Page-aware synthetic stops. Inner sub-pages carry no formation markup, so without this the
    // field stays frozen on the globe the whole way down. Spread an even Globe→DNA→Rings→Wave cycle
    // across the page's ACTUAL scrollable height (documentElement.scrollHeight − viewport), anchored
    // to the same viewport-centre reference pickFormation() uses, so any page length cycles through
    // every shape exactly once. Re-runs on the same font/resize/ResizeObserver backstops as the real
    // measurement, so it tracks late layout growth.
    const vh = window.innerHeight;
    const scrollable = Math.max(0, document.documentElement.scrollHeight - vh);
    if (scrollable < vh * 0.6) {
      stops = [{ y: vh / 2, form: 'hero' }]; // too short to cycle — just hold the globe
      return;
    }
    stops = AUTO_CYCLE.map((form, i) => ({
      y: vh / 2 + (scrollable * i) / (AUTO_CYCLE.length - 1),
      form,
    }));
  }
  measureStops();

  // A stop's PAGE-space Y keeps shifting for a while after the engine boots — web fonts swap in,
  // lazy sections hydrate, images reserve their height — and every one of those pushes the sections
  // below it further down the page. `measureStops()` originally only re-ran on `resize`, so those
  // post-boot shifts were never picked up: every formation resolved against a stale (too-small) Y,
  // which read as shapes settling "early" and, far worse once the gutter offset was widened, whole
  // formations sitting in the centre column (a half-applied left↔right anchor blend) instead of out
  // in their margin. Re-measure aggressively until the layout stops moving: on font load, on a few
  // backstop delays, and continuously via a ResizeObserver on the document height.
  const docFonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (docFonts?.ready) {
    docFonts.ready.then(() => measureStops()).catch(() => {});
  }
  const remeasureTimers = [180, 600, 1500, 3200, 6000].map((ms) => window.setTimeout(measureStops, ms));
  let lastDocH = document.documentElement.scrollHeight;
  const docResizeObs =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          // Height-only: a width change already routes through onResize()/layout() below, and
          // firing measureStops() on every observed frame during a resize drag would be wasteful.
          const h = document.documentElement.scrollHeight;
          if (Math.abs(h - lastDocH) > 1) {
            lastDocH = h;
            measureStops();
          }
        })
      : null;
  docResizeObs?.observe(document.documentElement);

  // Fraction of the scroll distance between two adjacent stops spent fully settled (not blending) at
  // EACH end — e.g. 0.32 means the first 32% of that gap is spent locked on formation A, the middle
  // 36% is the actual morph, and formation B is already fully resolved (and just holds there,
  // completely settled) for the final 32% before the visitor even reaches the next stop's own
  // midpoint. Replaces an earlier flat "lead" multiplier that started blending immediately at 0% —
  // this instead gives each shape real dwell time to be seen fully formed before it starts changing
  // again, per explicit request ("give users time to appreciate each shape instead of snapping
  // immediately"), while STILL resolving well before the next stop is reached, which is what leaves
  // the back end of that hold window as real runway for the particle spring physics to physically
  // finish traveling before the visitor's eye/viewport actually arrives there.
  // Lowered 0.39 → 0.24 for the scroll-morphing overhaul: the middle (morphing) window widens from
  // ~22% to ~52% of the gap between stops, so particles visibly flow / sweep / pour between shapes
  // as the visitor scrolls rather than snapping between long static holds. Each end still gets a
  // real ~24% settled dwell so a formation is briefly seen fully formed.
  const DWELL = 0.24;
  const DWELL_SPAN = 1 - DWELL * 2;
  // Transitions landing on 'contact' resolve almost immediately instead of following the general
  // dwell curve — that formation's target is a REAL on-screen element (the CTA ring), not an
  // abstract point cluster, so per explicit request the halo must already be fully converged and
  // orbiting well before the section is even centered, not merely "before the footer". Resolving by
  // 12% here leaves 88% of the entire magazines->contact scroll distance as pure "already fully
  // formed and holding" runway — the section is typically still only partway into the viewport (its
  // own height means it starts entering the screen before this segment even begins) at that point,
  // so the halo is locked in well ahead of the ring reaching mid-viewport.
  const CONTACT_START = 0, CONTACT_END = 0.12;
  const CONTACT_SPAN = CONTACT_END - CONTACT_START;
  // Fraction of the (final section stop → contact stop) scroll gap over which the sparse contact
  // layer eases in (`contactP`, see the frame loop) — well under 1 so it's fully (faintly) present
  // a beat before the section centres, then just holds. No "wrap"/assembly any more — the tight
  // ring was removed by explicit request.
  const CONTACT_WRAP_FRAC = 0.62;

  /** Which two formations are active right now, and how far blended between them (0=fully A,
   * 1=fully B) — the *only* thing scroll position controls; every formation's own coordinates below
   * are otherwise purely functions of viewport size + elapsed time, never of scroll or page
   * position, which is the specific, hard-won fix for an earlier bug where scroll-coupled particle
   * coordinates went mathematically unreachable off-screen once scrolled past.
   *
   * Mutates and returns the shared `_pick` scratch object — one fewer allocation per frame (and
   * per pointerdown). Callers read it immediately, never retain it. */
  const _pick: { A: FieldForm; B: FieldForm; t: number } = { A: 'hero', B: 'hero', t: 0 };
  function pickFormation() {
    if (!stops.length) {
      _pick.A = _pick.B = 'hero';
      _pick.t = 0;
      return _pick;
    }
    const sc = window.scrollY + H / 2;
    const last = stops[stops.length - 1];
    if (sc <= stops[0].y) {
      _pick.A = _pick.B = stops[0].form;
      _pick.t = 0;
    } else if (sc >= last.y) {
      _pick.A = _pick.B = last.form;
      _pick.t = 0;
    } else {
      _pick.A = _pick.B = last.form;
      _pick.t = 0;
      for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i], b = stops[i + 1];
        if (sc >= a.y && sc < b.y) {
          const raw = (sc - a.y) / (b.y - a.y);
          const held =
            b.form === 'contact'
              ? clamp((raw - CONTACT_START) / CONTACT_SPAN, 0, 1)
              : clamp((raw - DWELL) / DWELL_SPAN, 0, 1);
          _pick.A = a.form;
          _pick.B = b.form;
          _pick.t = smoothstep(held);
          break;
        }
      }
    }
    return _pick;
  }

  // ---------- readability guard ----------
  // Every element flagged [data-field-guard] (Hero.tsx's headline block AND SystemMetrics' content,
  // now that the globe persists behind it) gets the field dimmed specifically behind it, feathered
  // so there's no visible rectangle — this is what guarantees "100% readable" instead of hoping
  // small/sharp points never land on a letter. Queried once (the elements don't come and go).
  //
  // Every guard element lives on one of the first two stops (the hero/globe sections), so the whole
  // guard pass — the per-frame getBoundingClientRect reads AND the per-particle factor lookup — is
  // now SKIPPED unless 'hero' is one of the two active formations (see `doGuard` in the frame loop).
  // Below SystemMetrics the guard rects are far off-screen and always resolve to 1 anyway; computing
  // them for the whole rest of the page was wasted work. `guardRectsBuf` is filled in place each
  // frame (no `.map()` allocation).
  const guardEls = Array.from(document.querySelectorAll<HTMLElement>('[data-field-guard]'));
  const guardRectsBuf: DOMRect[] = new Array(guardEls.length);
  const GUARD_MIN = 0.12, GUARD_FEATHER = 56;
  function guardFactor1(x: number, y: number, r: DOMRect): number {
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    const d = Math.max(dx, dy);
    if (d <= 0) return GUARD_MIN;
    if (d >= GUARD_FEATHER) return 1;
    return GUARD_MIN + (1 - GUARD_MIN) * smoothstep(d / GUARD_FEATHER);
  }
  function guardFactorAt(x: number, y: number): number {
    let f = 1;
    for (let g = 0; g < guardRectsBuf.length; g++) {
      const gf = guardFactor1(x, y, guardRectsBuf[g]);
      if (gf < f) f = gf;
    }
    return f;
  }

  // Convergence point for the 'contact' formation (ContactPortal.tsx's circular CTA). Its rect is
  // only read on frames where 'contact' is actually one of the two active formations (near the very
  // bottom of the page) — see the frame loop.
  const targetEl = document.querySelector<HTMLElement>('[data-field-target]');

  // The R3F cosmic starfield wrapper (StarfieldLayer.tsx). We fade it down over the final stretch of
  // the page from THIS loop — it already polls window.scrollY every frame, and this site's Lenis
  // setup makes a plain `scroll` listener inside StarfieldLayer itself fire unreliably. Only the
  // opacity is touched, and only when it actually changes.
  let starfieldEl = document.querySelector<HTMLElement>('.starfield-layer');
  let starfieldFadeApplied = -1;

  // ---------- boot entrance ----------
  // A brief materialize-in rather than the field snapping to full brightness the instant physics
  // starts — particles are already springing in from scatter positions toward the globe (see the
  // per-particle spring below), so this just makes that assembly READ as a deliberate entrance
  // rather than a flash. One-way ramp, not looped.
  const bootAt = performance.now();
  // Shortened from 1100 — the globe should be "immediately visible, crisp, bright" on load, not
  // fade in over a full second-plus.
  const BOOT_MS = 650;

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

  // The ONLY non-passive listener in the engine — it can `preventDefault()` a touch gesture that's
  // been judged a horizontal globe-drag. A permanently-registered non-passive `touchmove` on
  // `window` forces the browser to block on JS for every vertical scroll touch too, so instead it's
  // attached only while a touch is actively armed on the globe and detached the instant the gesture
  // ends or is handed back to native scroll — normal scrolling never touches a non-passive handler.
  const onTouchMove = (e: TouchEvent) => {
    if (dragging) e.preventDefault();
  };
  let touchMoveBound = false;
  const bindTouchMove = () => {
    if (touchMoveBound) return;
    touchMoveBound = true;
    window.addEventListener('touchmove', onTouchMove, { passive: false });
  };
  const unbindTouchMove = () => {
    if (!touchMoveBound) return;
    touchMoveBound = false;
    window.removeEventListener('touchmove', onTouchMove);
  };

  const onPointerDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement)?.closest?.('a,button,input,textarea')) return;
    const took = onDown(e.clientX, e.clientY);
    if (!FINE && (armed || dragging)) bindTouchMove();
    if (took) e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent) => {
    onMove(e.clientX, e.clientY);
    if (!FINE && !armed && !dragging) unbindTouchMove(); // gesture handed back to native scroll
  };
  const onPointerUpAll = () => {
    onUp();
    unbindTouchMove();
  };
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUpAll);
  window.addEventListener('pointercancel', onPointerUpAll);

  // Canvas resize is DEBOUNCED (trailing, ~150 ms): `layout()` reallocates the canvas backing store
  // (`fieldCanvas.width = …`, an expensive buffer + clear) and `measureStops()` walks every stop
  // element — running both on every `resize` event during a drag was real jank. During the debounce
  // window the frame loop keeps using the last-good viewport metrics and the canvas is CSS-stretched
  // to fit (`width/height: 100% !important`), which is imperceptible for the brief settle.
  let resizeTimer = 0;
  const onResize = () => {
    if (resizeTimer) return;
    resizeTimer = window.setTimeout(() => {
      resizeTimer = 0;
      layout();
      measureStops();
    }, 150);
  };
  window.addEventListener('resize', onResize, { passive: true });

  // ---------- formation sampler ----------
  // Mutates the shared `F` scratch object rather than returning a fresh one — same technique
  // Latitude's own engine uses for this exact purpose (their `o`/`oa` objects), since this runs up
  // to 2x per particle per frame (once for the outgoing formation, once for the incoming one during
  // a blend) and allocating a fresh object there would mean up to 2,800 short-lived objects/frame.
  const F = { x: 0, y: 0, a: 0, s: 0 };
  function sampleForm(form: FieldForm, i: number, time: number, flowT: number, ct: number, st: number, breathe: number, targetRect: DOMRect | null, contactP: number) {
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
        F.a = (0.2 + front * 0.55) * (0.7 + rnd2[i] * 0.4);
        F.s = (1.1 + front * 1.3) * (0.8 + rnd3[i] * 0.6);
        break;
      }
      case 'dna': {
        // DNA double-helix — two counter-rotating strands (offset by π) plus connecting rungs.
        // ORIENTATION IS VIEWPORT-DEPENDENT:
        //   • Desktop (W ≥ 768): the helix axis is VERTICAL — it climbs top→bottom, edge-to-edge
        //     down the full viewport height, strands swinging left/right across a central column.
        //   • Mobile  (W < 768): the whole structure is rotated 90° so the axis is HORIZONTAL —
        //     it runs left→right across the FULL screen width, strands swinging up/down. A tall
        //     narrow phone can't fit a vertical helix legibly, so this is the explicit bidi fix.
        // The winding phase advances with the axial position so it reads as a real coherent spiral;
        // `flowT` (scroll-velocity-scaled time) drives the climb + winding.
        const dnaVertical = W >= 768;

        let climb = (rnd1[i] + flowT * 0.03) % 1; // 0..1 along the helix axis
        if (climb < 0) climb += 1;
        const edge =
          smoothstep(clamp(climb * 12, 0, 1)) * (1 - smoothstep(clamp((climb - 0.92) * 12, 0, 1)));

        // Axial span (edge-to-edge along the long dimension) and lateral strand amplitude.
        const axisLen = dnaVertical ? H : W;
        const acrossLen = dnaVertical ? W : H;
        const span = axisLen * 1.1;                            // -5%..105% of the long axis
        const along = (climb - 0.5) * span + axisLen * 0.5;    // absolute px along the axis
        const amp = acrossLen * (dnaVertical ? 0.15 : 0.13) * breathe; // strand swing, px
        const thick = dnaVertical ? 6 : 6 + 4 * mob;           // strand cross-section spread, px
        const turns = dnaVertical ? 4.5 : 5;

        const ph = climb * Math.PI * turns + flowT * 0.5;
        const role = i % 8;
        let across: number;          // lateral offset from the axis centreline, px
        if (role === 0) {
          const rung = rnd2[i] * 2 - 1;                        // rung particle: spans the diameter
          across = Math.cos(ph) * amp * rung + (rnd3[i] - 0.5) * (thick * 0.9);
          F.a = 0.15 * (0.6 + rnd3[i] * 0.5) * edge;
          F.s = 0.9 + rnd3[i] * 0.6 + mob * 0.4;
        } else {
          const p2 = ph + (role % 2) * Math.PI;                // even/odd → opposite strand
          across = Math.cos(p2) * amp + (rnd2[i] - 0.5) * thick;
          const front = clamp(0.5 - Math.sin(p2) * 0.5, 0, 1);
          F.a = (0.2 + front * 0.52) * (0.6 + rnd2[i] * 0.55) * edge;
          F.s = (1.1 + front * 1.5) * (0.85 + rnd3[i] * 0.55) + mob * 0.5;
        }

        if (dnaVertical) {
          F.x = cx + across;   // strands swing horizontally
          F.y = along;         // climbs down the screen
        } else {
          F.x = along;         // runs across the screen
          F.y = cy + across;   // strands swing vertically
        }
        // Gentle centre readability dim — always keyed to the horizontal reading column where text
        // sits, so a desktop vertical helix never fully obscures the centred headline.
        F.a *= 0.58 + 0.42 * smoothstep(clamp(Math.abs(F.x / W - 0.5) * 3.1, 0, 1));
        break;
      }
      case 'rings': {
        // ULTRA-WIDE concentric rings — 4 strongly-flattened horizontal ellipses sharing cx/cy, the
        // outermost stretching right out to the viewport edges (edge-to-edge) on desktop AND mobile;
        // NOT gutter-anchored any more. `flowT` (scroll-velocity-scaled time) drives each ring's
        // orbital angle at its own rate / direction, so the particles stream faster along the
        // ellipses under an active scroll and calm to an idle drift when it stops.
        const RN = 3;
        const ring = i % RN;
        const t01 = ring / (RN - 1);                       // 0 (inner) · 0.5 · 1 (outer)
        // Slight per-particle radial jitter (0.96–1.04) so each ring reads as a BAND, not a hairline.
        // Pull the outer ring in a little on phones (× up to 0.85) so it doesn't blow past both side
        // edges, and keep the vertical flatten modest so the stack stays inside a tall viewport.
        const rx = (0.18 + t01 * 0.4) * W * breathe * (0.96 + rnd3[i] * 0.08) * (1 - 0.15 * mob);
        const ry = rx * (0.2 + 0.05 * t01) * (1 + 0.28 * mob); // flattened; a touch taller on phones
        const ph = rnd1[i] * TAU + flowT * (0.05 - ring * 0.012) * (ring % 2 ? -1 : 1);
        F.x = cx + Math.cos(ph) * rx + Math.sin(flowT * 0.3 + rnd2[i] * TAU) * 5;
        F.y = cy + Math.sin(ph) * ry + (rnd3[i] - 0.5) * 4;
        const front = clamp(0.5 - Math.sin(ph) * 0.5, 0, 1);
        // Soften only the extreme left/right tips so the outer ring melts into the edge.
        const tipFade = 1 - smoothstep(clamp((Math.abs(F.x / W - 0.5) - 0.46) / 0.07, 0, 1)) * 0.5;
        F.a = (0.26 + front * 0.5) * (0.6 + rnd2[i] * 0.55) * tipFade;
        F.s = (1.1 + front * 1.5) * (0.82 + rnd3[i] * 0.5);
        // Gentle centre readability dim.
        F.a *= 0.66 + 0.34 * smoothstep(clamp(Math.abs(F.x / W - 0.5) * 3.1, 0, 1));
        break;
      }
      case 'wave': {
        // Wide horizontal rolling wave bands, full viewport width edge-to-edge — confirmed live as
        // the ambient field behind Latitude's "independent digital studio" section. Deliberately the
        // one formation that ISN'T a point-cluster: fixed x per particle spread across the whole
        // width (not scroll- or time-coupled, same reasoning as scatter's own flow — see the
        // file-level note above), each row's y undulating via a travelling sine so the bands read as
        // a rolling wave rather than static horizontal lines.
        const ROWS = 6;
        const row = i % ROWS;
        const rowT = ROWS > 1 ? row / (ROWS - 1) : 0.5;
        F.x = (rnd1[i] * 1.08 - 0.04) * W;
        // Shared `mob` (see layout()) → taller bands on a narrow phone so the rolling wave stays
        // legible, not a flat line.
        const baseY = H * (0.26 + rowT * 0.5);
        // Per-particle phase scatter kept SMALL (0.6 rad) so each row holds together as one coherent
        // travelling line. `flowT` (scroll-velocity-scaled time) drives the travel, so the bands
        // roll faster under an active scroll and calm to an idle swell when it stops.
        const amp = (34 + row * 8) * (1 + 0.28 * mob) * breathe;
        const speed = 0.32 + row * 0.045;
        const wave = Math.sin(F.x * 0.011 + flowT * speed + row * 1.3 + rnd2[i] * 0.6) * amp;
        const swell = Math.sin(F.x * 0.0035 - flowT * speed * 0.55 + rnd3[i] * TAU) * 14 * breathe;
        F.y = baseY + wave + swell;
        const edgeFade =
          smoothstep(clamp((F.x / W) * 9, 0, 1)) * (1 - smoothstep(clamp((F.x / W - 0.93) * 9, 0, 1)));
        F.a = (0.19 + rnd2[i] * 0.24) * edgeFade;
        F.s = 1.0 + rnd3[i] * 0.9;
        break;
      }
      case 'contact': {
        // SWIRLING VORTEX around the CTA — a multi-armed spiral of particles orbiting the button,
        // winding a few turns from an inner clear ring out toward the rim, the inner arms spinning
        // faster (differential rotation, like Latitude's closing "Let's talk" vortex). Stays clear
        // of the CTA rect; eases in via `contactP`. The soft central core glow is drawn separately
        // in the frame loop.
        const minWH = W < H ? W : H;
        const rawTgtY = targetRect ? targetRect.top + targetRect.height / 2 : cy;
        const tgtX = targetRect ? targetRect.left + targetRect.width / 2 : cx;
        const tgtY = clamp(rawTgtY, H * 0.22, H * 0.78);
        const btnR = targetRect ? Math.max(targetRect.width, targetRect.height) * 0.5 : minWH * 0.2;
        const keepOut = btnR * 1.3 + minWH * 0.035;

        const ARMS = 3;
        const idx01 = rnd1[i];                                   // 0 (inner) .. 1 (rim)
        const arm = (i % ARMS) * (TAU / ARMS);
        const rad = keepOut + idx01 * (minWH * 0.42 - keepOut);
        const wob = Math.sin(time * 0.5 + rnd2[i] * TAU) * (5 + idx01 * 7);
        const ang = arm + idx01 * TAU * 3.4 + time * (0.24 - idx01 * 0.14);
        F.x = tgtX + Math.cos(ang) * (rad + wob);
        F.y = tgtY + Math.sin(ang) * (rad + wob) * 0.92;
        const fade = smoothstep(clamp(contactP * 1.3, 0, 1));
        F.a = (0.05 + (1 - idx01) * 0.04 + idx01 * 0.13 + rnd2[i] * 0.04) * fade;
        F.s = 0.75 + idx01 * 1.15 + (brightStar[i] ? 1.5 : 0);
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
        // Thin the ambient flow across the centre reading column (per the gutter-only request) —
        // full strength out at the edges, ~35% through the middle third — so even this faint layer
        // never texturises the space directly behind the site's text/cards.
        const centerFade = 0.35 + 0.65 * smoothstep(clamp(Math.abs(F.x / W - 0.5) * 3.1, 0, 1));
        F.a = (0.12 + rnd2[i] * 0.12) * edgeFade * centerFade;
        F.s = 0.85;
        break;
      }
    }
  }

  // ---------- hero wireframe ----------
  // Ultra-thin latitude rings + a handful of longitude meridians, stroked as actual paths (not
  // approximated by particle density) so the globe reads as a structure the points are orbiting ON,
  // not just a point cloud that happens to be sphere-shaped — confirmed live as the wireframe visible
  // under Latitude's own hero sphere. Shares the exact same projection math (and the exact same `ct`,
  // `st`, `ang[]`, `breathe`) as the 'hero' particle case above, so it automatically tilts/rotates in
  // lockstep with both idle spin, drag, AND the new hover effect — no separate state to keep in sync.
  const WIRE_SEG = 56;
  const drawHeroWireframe = (ct: number, st: number, breathe: number, alphaMul: number) => {
    if (alphaMul <= 0.003) return;
    const rr = R * breathe;
    ctx.lineWidth = 0.55;
    ctx.strokeStyle = STAR_RGB + Math.min(1, 0.09 * alphaMul * GLOBAL_BRIGHT).toFixed(3) + ')';
    // Latitude rings — every other ring only, so the wireframe reads as a grid rather than a solid
    // shaded ball (13 rings all stroked would visually merge into a filled sphere at this radius).
    for (let r = 0; r < NR; r += 2) {
      const la = lat[r];
      const ringR = rr * Math.cos(la);
      const ringY = rr * Math.sin(la);
      ctx.beginPath();
      for (let s = 0; s <= WIRE_SEG; s++) {
        const ph = (s / WIRE_SEG) * TAU + ang[r];
        const X = ringR * Math.cos(ph), Z = ringR * Math.sin(ph);
        const Y2 = ringY * ct - Z * st, Z3 = ringY * st + Z * ct;
        const sc = FOCAL / Math.max(Z3 + FOCAL, R * 0.35);
        const x = cx + X * sc, y = cy - Y2 * sc;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Longitude meridians — pole-to-pole great circles, spun by the same mid-ring angle so they turn
    // with the rest of the sphere as one rigid structure.
    const MER = 6;
    const spin = ang[Math.floor(NR / 2)];
    for (let m = 0; m < MER; m++) {
      const baseAng = (m / MER) * TAU + spin;
      ctx.beginPath();
      for (let s = 0; s <= WIRE_SEG; s++) {
        const la = -Math.PI / 2 + (s / WIRE_SEG) * Math.PI;
        const ringR = rr * Math.cos(la);
        const ringY = rr * Math.sin(la);
        const X = ringR * Math.cos(baseAng), Z = ringR * Math.sin(baseAng);
        const Y2 = ringY * ct - Z * st, Z3 = ringY * st + Z * ct;
        const sc = FOCAL / Math.max(Z3 + FOCAL, R * 0.35);
        const x = cx + X * sc, y = cy - Y2 * sc;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  };

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
    // While frozen, paint exactly one more frame (so the current formation stays on screen as a
    // static image) then idle. `freeze()` resets `staticDrawn` so the freeze-moment state gets
    // captured; `unfreeze()` clears `frozen` and resumes.
    if (frozen && staticDrawn) return;
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

    // Scroll-velocity-scaled flow clock (see `flowT` declaration). A DEADZONE ignores sub-40 px/s
    // deltas so spurious layout-shift scroll jitter (content-visibility, lazy sections) can't keep
    // the flow boosted; the smoothed velocity decays fast (rate 9) so the formations resolve
    // crisply within ~0.3 s of the user actually stopping; the boost itself is gentle and capped
    // at 2.6×, and only engages above ~60 px/s of genuine scrolling.
    const sy = window.scrollY;
    const rawSV = Math.abs(sy - lastSY) / Math.max(dt, 1e-3);
    lastSY = sy;
    scrollVelS = damp(scrollVelS, rawSV > 40 ? rawSV : 0, 9, dt);
    flowT += dt * (1 + clamp((scrollVelS - 60) / 2200, 0, 1.6));
    // Fixed-timestep sub-stepping for the particle spring — integrating the stiff spring in one big
    // variable-length step is what makes motion micro-jitter with frame-time wobble (and risks
    // ringing on a slow frame). Thresholds tuned so a healthy display (≥ ~53 fps, dt < 19 ms) runs
    // SUB = 1 — a single step is stable at that dt (spring ω ≈ 7.5, well inside 2/ω) and the earlier
    // 1/72 s threshold was silently forcing SUB = 2 at a normal 60 fps, doubling the spring work.
    const SUB = dt > 0.026 ? 3 : dt > 0.019 ? 2 : 1;
    const sdt = dt / SUB;

    // Which two named formations are active right now, and how far blended between them — see
    // pickFormation() above. Computed once per frame (cheap: a handful of stop comparisons), not
    // per particle.
    const { A: formA, B: formB, t: formT } = pickFormation();
    // How much of the *current* blend is 'hero' (0..1) — used both to fade the wireframe rings in/out
    // in step with the particle formation blend, and to gate the hover-tilt effect below so it only
    // engages while the globe is actually the thing on screen.
    const heroWeight = (formA === 'hero' ? 1 - formT : 0) + (formB === 'hero' ? formT : 0);

    yaw += T.idleSpin * dt * 0.5;
    if (!dragging) {
      yaw += yawVel * dt;
      yawVel -= yawVel * Math.min(T.spinDamp * dt, 1);
    }

    // Hover interaction: moving the cursor near the globe (without clicking) gently turns and tilts
    // it toward the pointer — dragging still overrides this via `dragging` below, and it fades out by
    // heroWeight/distance so it never does anything on sections where no sphere is actually visible.
    let hoverYawTarget = 0;
    let hoverTiltTarget = T.tiltBase;
    if (!dragging && FINE && heroWeight > 0.03 && mx > -1e3) {
      const hdx = clamp((mx - cx) / (R * 2.4 || 1), -1, 1);
      const hdy = clamp((my - cy) / (R * 2.4 || 1), -1, 1);
      const reach = clamp(1 - Math.hypot(hdx, hdy) * 0.5, 0, 1);
      hoverYawTarget = hdx * 0.55 * reach * heroWeight;
      hoverTiltTarget = T.tiltBase - hdy * 0.24 * reach * heroWeight;
    }
    hoverYaw = damp(hoverYaw, hoverYawTarget, 6, dt);
    if (!dragging) tiltTarget = hoverTiltTarget;

    for (let r = 0; r < NR; r++) {
      const torque = -T.K * (ang[r] - (yaw + hoverYaw)) - T.C * (wv[r] - yawVel);
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
    // (globalCompositeOperation is 'source-over' here; the glow pass at the end of the loop flips it
    // to 'lighter' and restores it before the next frame.)
    const breathe = 1 + Math.sin(time * TAU * T.breathHz) * T.breathAmp;
    const bootFade = smoothstep(clamp((now - bootAt) / BOOT_MS, 0, 1));
    const heroActive = formA === 'hero' || formB === 'hero';
    const contactActive = formA === 'contact' || formB === 'contact';

    // Guard rects (getBoundingClientRect ×2) + the per-particle guard lookup are computed ONLY while
    // the globe is on screen — every [data-field-guard] element lives on the first two stops, so
    // below them the guard always resolves to 1. Filled in place; no allocation.
    const doGuard = heroActive && guardEls.length > 0;
    if (doGuard) {
      for (let g = 0; g < guardEls.length; g++) guardRectsBuf[g] = guardEls[g].getBoundingClientRect();
    }
    // The CTA rect is only needed by the 'contact' formation, only active near the page bottom.
    const targetRect = contactActive && targetEl ? targetEl.getBoundingClientRect() : null;

    // Contact ring wrap progress — a linear 0..1 read straight off the scroll position through the
    // final approach, so the 'contact' formation can draw its ring around the CTA in 1:1 sync with
    // the wheel / touch drag (no easing on this value → no snap). Computed once per frame.
    let contactP = 0;
    {
      const n = stops.length;
      if (n >= 2 && stops[n - 1].form === 'contact') {
        const a = stops[n - 2].y, b = stops[n - 1].y;
        const sc = window.scrollY + H / 2;
        contactP = clamp((sc - a) / Math.max(1, (b - a) * CONTACT_WRAP_FRAC), 0, 1);
      }
    }

    // Soft central core glow for the closing 'contact' vortex — a faint cool-white radial bloom at
    // the CTA centre, easing in with `contactP` (like the purple core of Latitude's "Let's talk"
    // vortex, kept subtle and near-white here). Additive, drawn behind the particle pass.
    if (contactActive && targetRect && contactP > 0.02) {
      const gx = targetRect.left + targetRect.width / 2;
      const gy = clamp(targetRect.top + targetRect.height / 2, H * 0.22, H * 0.78);
      const gr = Math.min(W, H) * (0.16 + 0.06 * contactP);
      const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      const ga = 0.05 * smoothstep(clamp(contactP, 0, 1));
      gg.addColorStop(0, `rgba(190, 200, 255, ${ga.toFixed(3)})`);
      gg.addColorStop(1, 'rgba(190, 200, 255, 0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = gg;
      ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
      ctx.globalCompositeOperation = 'source-over';
    }

    // Ease the cosmic starfield down a little as the visitor reaches the closing "בואו נדבר"
    // section — but keep plenty of stars present (Latitude's closing vortex sits IN the starfield),
    // so only a gentle dim. Driven by `contactP`.
    if (!starfieldEl) starfieldEl = document.querySelector<HTMLElement>('.starfield-layer');
    if (starfieldEl) {
      const near = contactActive ? smoothstep(clamp(contactP, 0, 1)) : 0;
      const sfFade = 1 - near * 0.42; // floor ~0.58 — stars stay visible under the vortex
      if (Math.abs(sfFade - starfieldFadeApplied) > 0.004) {
        starfieldFadeApplied = sfFade;
        starfieldEl.style.setProperty('opacity', sfFade.toFixed(3));
      }
    }

    // Wireframe drawn before the particle pass so the points read as sitting ON the structure, not
    // floating in front of it.
    drawHeroWireframe(ct, st, breathe, heroWeight * bootFade);

    let drawCount = 0;
    for (let i = 0; i < N; i++) {
      // Target position: sample the active formation(s) for this particle — a straight sample when
      // fully settled on one (formT===0 or A===B, the common case away from a transition), or a
      // per-particle-staggered blend between two adjacent ones while scrolling through a transition.
      let tx: number, ty: number, alpha: number, size: number;
      sampleForm(formA, i, time, flowT, ct, st, breathe, targetRect, contactP);
      if (formT <= 0 || formA === formB) {
        tx = F.x; ty = F.y; alpha = F.a; size = F.s;
      } else {
        const ax = F.x, ay = F.y, aa = F.a, asz = F.s;
        sampleForm(formB, i, time, flowT, ct, st, breathe, targetRect, contactP);
        const tt = clamp((formT - stag[i]) / (1 - STAGGER), 0, 1);
        const e = smoothstep(tt);

        // Straight blend of the two shape positions…
        let bx = ax + (F.x - ax) * e;
        let by = ay + (F.y - ay) * e;
        let ba = aa + (F.a - aa) * e;
        let bs = asz + (F.s - asz) * e;

        // …then the Latitude-style Z-FLOW DISASSEMBLY: mid-transition a particle DETACHES from the
        // shape and streams toward the camera — it radiates outward from the viewport centre
        // (perspective magnify → it appears to rush past you), grows and blooms, curls along the
        // way, then decelerates and reassembles into shape B. `burst` is a hump (0 at both ends,
        // peak mid-blend); per-particle `rnd3`/`stag` stagger it into a continuous flowing wave
        // rather than one synchronized zoom. Radiating from the centre also CLEARS the reading
        // column during the hand-off, so content stays legible.
        const burst = ((1 - e) * e * 4) * BURST_SCALE;
        const zAmt = burst * (0.45 + rnd3[i] * 1.15);
        const ndx = bx - cx, ndy = by - cy;
        const persp = 1 + zAmt * 1.9;                       // >1 → toward the camera
        bx = cx + ndx * persp;
        by = cy + ndy * persp;
        const curl = zAmt * (26 + rnd1[i] * 26);
        const cphase = e * Math.PI * 2 + rnd2[i] * TAU;
        bx += Math.cos(cphase) * curl;
        by += Math.sin(cphase) * curl * 0.7;
        ba *= 1 + zAmt * 0.65;                              // bloom brighter as it approaches
        bs *= 1 + zAmt * 1.5;                               // and larger

        tx = bx; ty = by; alpha = ba; size = bs;
      }

      // Cursor repulsion — displaces the TARGET, never the point directly; the point then springs
      // toward that displaced target below. Skipping this indirection is what makes most
      // cursor-reactive backgrounds feel robotic rather than fluid.
      if (fieldAmt > 0.01) {
        const ddx = tx - mx, ddy = ty - my;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 < FR2 && d2 > 0.5) {
          const d = Math.sqrt(d2);
          const g = 1 - d / T.fieldR;
          const push = T.fieldStr * g * g * fieldAmt;
          tx += (ddx / d) * push;
          ty += (ddy / d) * push;
        }
      }

      // Stiff critically-/over-damped spring, integrated at a fixed ~120 Hz sub-step (see SUB/sdt)
      // so the motion is frame-rate independent and free of frame-time jitter. Target (tx,ty) is
      // held constant across the sub-steps of a frame — it moves far slower than 120 Hz, so this is
      // exact enough while keeping the costly formation sampling to once per frame.
      const k = T.pK * kmul[i];
      let pxi = px[i], pyi = py[i], vxi = vx[i], vyi = vy[i];
      for (let s = 0; s < SUB; s++) {
        vxi += ((tx - pxi) * k - vxi * T.pC) * sdt;
        vyi += ((ty - pyi) * k - vyi * T.pC) * sdt;
        pxi += vxi * sdt;
        pyi += vyi * sdt;
      }
      px[i] = pxi; py[i] = pyi; vx[i] = vxi; vy[i] = vyi;

      // Physics runs for every particle regardless of drawStride — only the (comparatively
      // expensive) fill call is thinned under sustained load, so density recovers the instant
      // performance does, with no re-seeding or visible pop back to full.
      if (drawStride > 1 && i % drawStride !== 0) continue;
      const x = px[i], y = py[i];
      if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
      // GLOBAL_BRIGHT applied here (once, post-formation-math) rather than tuned into every
      // formation's own alpha constants individually — a single dial for overall field luminance.
      // The guard dim is skipped entirely off the hero sections (see `doGuard`).
      alpha *= bootFade * GLOBAL_BRIGHT;
      if (doGuard) alpha *= guardFactorAt(x, y);
      // Drop the barely-there dots entirely rather than smearing them across the field as a low-alpha
      // haze — the raised floor (0.04, was 0.01) is a big part of "crisp, not foggy". Then lift the
      // mid-range toward opaque with a gentle gamma curve so surviving points read as distinct,
      // high-contrast specks (like the starfield) instead of a wash of translucent grey.
      if (alpha < 0.04) continue;
      alpha = alpha >= 1 ? 1 : Math.pow(alpha, 0.82);
      let r = 0.8 + size * 0.42 + mob * 0.35;
      // ~4% "hero stars" — brighter and a touch larger, so they punch through with a stronger bloom
      // in the glow pass (the crisp bright foreground stars of the Latitude field).
      if (brightStar[i]) {
        r += 0.9;
        alpha = Math.min(1, alpha * 1.5 + 0.12);
      }
      drawX[drawCount] = x;
      drawY[drawCount] = y;
      drawR[drawCount] = r;
      drawA[drawCount] = alpha;
      drawCool[drawCount] = tintCool[i];
      drawCount++;
    }

    // Pass 1 — additive glow bloom (high-tier only). A SMALL, TIGHT halo blitted under the brightest
    // points with 'lighter' blending — enough to make a point read as luminous, not a fog bank.
    // Radius and alpha are deliberately conservative and the halo shrinks further on phones (where a
    // soft wash is most noticeable). Drawn first so the crisp cores in pass 2 sit sharply on top.
    if (glowSprite && drawCount > 0) {
      ctx.globalCompositeOperation = 'lighter';
      const glowScale = 1 - 0.3 * mob;
      for (let d = 0; d < drawCount; d++) {
        const a = drawA[d];
        const rr = drawR[d];
        if (a < 0.24 || rr < 1.15) continue; // only the brightest / largest points get a bloom
        const gr = (rr * 3 + 1.5) * glowScale;
        ctx.globalAlpha = a * 0.22;
        ctx.drawImage(glowSprite, drawX[d] - gr, drawY[d] - gr, gr * 2, gr * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // Pass 2 — crisp cores. Directly-filled circles; `fillStyle` is only rewritten when the tint
    // bucket flips (silver ↔ cool accent), so it's at most a handful of state changes, not N.
    let coolApplied = -1;
    for (let d = 0; d < drawCount; d++) {
      const cool = drawCool[d];
      if (cool !== coolApplied) {
        coolApplied = cool;
        ctx.fillStyle = cool ? STAR_COOL_SOLID : STAR_SOLID;
      }
      ctx.globalAlpha = drawA[d];
      ctx.beginPath();
      ctx.arc(drawX[d], drawY[d], drawR[d], 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (frozen) staticDrawn = true; // this was the one static frame — stop until unfrozen
  };
  raf = requestAnimationFrame(frame);

  // Reduced motion: let the field assemble once into the current formation, then hard-freeze it as
  // a static image (no perpetual animation). The short assembly is a one-time entrance, not a loop.
  if (reducedMotion) {
    remeasureTimers.push(
      window.setTimeout(() => {
        frozen = true;
        staticDrawn = false; // capture the settled state on the next frame, then idle
      }, 1400),
    );
  }

  return {
    setFrozen(next: boolean) {
      // Also serves the a11y "stop animations" toggle. Reduced motion stays a one-way door — once
      // the field has settled it is never re-animated.
      if (reducedMotion && !next) return;
      frozen = next;
      if (!next) staticDrawn = false;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUpAll);
      window.removeEventListener('pointercancel', onPointerUpAll);
      unbindTouchMove();
      window.removeEventListener('resize', onResize);
      if (resizeTimer) window.clearTimeout(resizeTimer);
      remeasureTimers.forEach((id) => window.clearTimeout(id));
      docResizeObs?.disconnect();
    },
  };
}
