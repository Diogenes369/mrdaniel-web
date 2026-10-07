import { GlyphRenderer, type FrameInput } from './glyphRenderer';
import { fieldState, type BeatKey } from './fieldState';
import { buildWordsTexture, SEED_TERMS } from './glyphs';

/**
 * The frame loop behind the glyph field: reads the page (which beat is under the reading line,
 * where the pointer is, which text blocks need quiet, where the headline sits), turns that into a
 * handful of numbers, and lets springs carry every number to its target. Nothing jumps: a beat
 * change, the lens following the hand and the headline assembling are all integrated motion.
 */

interface Stage {
  /** How loud the noise is. */
  chaos: number;
  /** 0 = noise, 1 = a typed page. */
  order: number;
  /** 0 = full field, 1 = a sparse lattice. */
  calm: number;
  /** How strongly the pointer lens reads the noise. */
  lens: number;
  /** Overall ink of the field (the headline is exempt). */
  dim: number;
}

const STAGES: Record<BeatKey, Stage> = {
  hero: { chaos: 1, order: 0, calm: 0, lens: 1, dim: 0.62 },
  noise: { chaos: 1.3, order: 0, calm: 0, lens: 0.9, dim: 0.7 },
  order: { chaos: 0.7, order: 1, calm: 0, lens: 0.6, dim: 0.62 },
  path: { chaos: 0.3, order: 1, calm: 0.4, lens: 0.45, dim: 0.5 },
  start: { chaos: 0.3, order: 0.5, calm: 0.8, lens: 0.5, dim: 0.5 },
};
/** Every route outside the story, and the homepage below it: a quiet field that still answers the hand. */
const IDLE: Stage = { chaos: 0.45, order: 0.15, calm: 0.72, lens: 0.55, dim: 0.42 };
const KEYS: (keyof Stage)[] = ['chaos', 'order', 'calm', 'lens', 'dim'];

interface Spring {
  x: number;
  v: number;
}
const spring = (x = 0): Spring => ({ x, v: 0 });
/** Semi-implicit spring step; `zeta` < 1 overshoots a little, which is what makes it feel physical. */
function stepSpring(s: Spring, target: number, k: number, zeta: number, dt: number) {
  const c = 2 * Math.sqrt(k) * zeta;
  s.v += (k * (target - s.x) - c * s.v) * dt;
  s.x += s.v * dt;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const STRETCH: Record<string, string> = {
  '62.5%': 'extra-condensed',
  '75%': 'condensed',
  '87.5%': 'semi-condensed',
};

/** Below this many glyph rows per letter, a glyph-built headline stops being readable — keep the DOM text. */
const MIN_ROWS_PER_LETTER = 9;

export interface FieldOptions {
  touch: boolean;
  isStopped: () => boolean;
  onReady: () => void;
  onHeadlineLive: (live: boolean) => void;
}

export function startField(canvas: HTMLCanvasElement, opts: FieldOptions): () => void {
  let renderer = GlyphRenderer.create(canvas);
  if (!renderer) return () => {};

  const host = canvas.parentElement ?? canvas;
  let disposed = false;
  let raf = 0;
  let ready = false;

  // ── size ────────────────────────────────────────────────────────────────────────────────────
  let viewW = 0;
  let viewH = 0;
  const cellFor = (w: number): [number, number] => (w < 768 ? [5, 9] : [7, 12]);
  const applySize = () => {
    if (!renderer) return;
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    if (w === viewW && h === viewH) return;
    viewW = w;
    viewH = h;
    renderer.resize(w, h, Math.min(2, window.devicePixelRatio || 1), cellFor(w));
    maskDirty = true;
  };
  const ro = new ResizeObserver(() => applySize());
  ro.observe(host);

  // ── words ───────────────────────────────────────────────────────────────────────────────────
  let phrasesVersion = -1;
  const syncWords = () => {
    if (!renderer || phrasesVersion === fieldState.phrasesVersion) return;
    phrasesVersion = fieldState.phrasesVersion;
    renderer.setWords(buildWordsTexture([...fieldState.phrases, ...SEED_TERMS]));
  };

  // ── headline mask ───────────────────────────────────────────────────────────────────────────
  let maskDirty = true;
  let maskVersion = -1;
  let maskOn = false;
  let maskBuiltSize = '';
  let maskStart = 0;
  let maskEl: HTMLElement | null = null;
  const buildMask = (): boolean => {
    const el = fieldState.headline;
    if (!renderer || !el) return false;
    const cs = getComputedStyle(el);
    const fontPx = parseFloat(cs.fontSize) || 0;
    // The headline is drawn on its own sub-grid (pass 2), so count rows of sub-cells. A ring mark
    // is a short run of Latin capitals, which read at seven rows (a dot-matrix display's height),
    // so it can be built at sizes where a Hebrew headline could not.
    const rows = (fontPx * 0.68) / renderer.subCell[1];
    if (rows < (el.dataset.glyphRing !== undefined ? 7 : MIN_ROWS_PER_LETTER)) return false;
    const box = el.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return false;
    const c = document.createElement('canvas');
    c.width = Math.ceil(box.width);
    c.height = Math.ceil(box.height);
    const ctx = c.getContext('2d');
    if (!ctx) return false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.lineJoin = 'round';
    ctx.lineWidth = fontPx * 0.035;
    // A mark with a ring (data-glyph-ring, the J.A.R.V.I.S mark on /jarvis): the ring first, then
    // the band the name runs through is cleared, so the ring breaks where the name crosses it.
    if (el.dataset.glyphRing !== undefined) {
      const ring = Math.max(2, fontPx * 0.07);
      const cx = c.width / 2;
      const cy = c.height / 2;
      ctx.lineWidth = ring;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(cx, cy) - ring, 0, Math.PI * 2);
      ctx.stroke();
      const band = fontPx * 1.05;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, cy - band / 2, c.width, band);
      ctx.fillStyle = '#fff';
      ctx.lineWidth = fontPx * 0.035;
    }
    // The stretch rides in the font shorthand: canvas has no reliable font-variation API.
    ctx.font = `${cs.fontWeight} ${STRETCH[cs.fontStretch] ?? ''} ${fontPx}px ${cs.fontFamily}`;
    // Drawn in the element's own direction: an LTR mark set right-aligned in RTL would carry its
    // trailing punctuation to the wrong end (the deck's field had "MR. DANIEL" come out ".MR").
    const ltr = cs.direction === 'ltr';
    ctx.direction = ltr ? 'ltr' : 'rtl';
    ctx.textAlign = ltr ? 'left' : 'right';
    ctx.textBaseline = 'alphabetic';
    // Draw word by word at the positions the browser actually laid them out, so the glyph letters
    // sit exactly where the (transparent) real text is — selection and wrapping stay the DOM's.
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      for (const m of text.matchAll(/\S+/g)) {
        const at = m.index ?? 0;
        range.setStart(node, at);
        range.setEnd(node, at + m[0].length);
        const r = range.getBoundingClientRect();
        if (r.width < 1) continue;
        const ascent = ctx.measureText(m[0]).fontBoundingBoxAscent || fontPx * 0.9;
        const x = ltr ? r.left - box.left : r.right - box.left;
        const y = r.top - box.top + ascent;
        ctx.strokeText(m[0], x, y);
        ctx.fillText(m[0], x, y);
      }
    }
    renderer.setMask(c);
    maskBuiltSize = `${Math.round(box.width)}x${Math.round(box.height)}`;
    return true;
  };
  const refreshMask = (now: number) => {
    const el = fieldState.headline;
    if (el && !maskDirty && maskVersion === fieldState.headlineVersion) {
      const b = el.getBoundingClientRect();
      if (`${Math.round(b.width)}x${Math.round(b.height)}` !== maskBuiltSize) maskDirty = true;
    }
    if (!maskDirty && maskVersion === fieldState.headlineVersion) return;
    maskDirty = false;
    maskVersion = fieldState.headlineVersion;
    const ok = buildMask();
    // A page can hand the headline from one element to another (the J.A.R.V.I.S ring returns
    // further down /jarvis): the new one assembles from the noise again, and only the element the
    // field is drawing goes transparent (data-glyph-live), so the other keeps its solid look.
    if (ok && (!maskOn || el !== maskEl)) maskStart = now + 280;
    if (maskEl && maskEl !== el) delete maskEl.dataset.glyphLive;
    if (el) {
      if (ok) el.dataset.glyphLive = '';
      else delete el.dataset.glyphLive;
    }
    maskEl = el;
    if (ok !== maskOn) {
      maskOn = ok;
      opts.onHeadlineLive(ok);
    }
  };
  const onFonts = () => {
    renderer?.buildAtlas();
    maskDirty = true;
  };
  document.fonts?.addEventListener?.('loadingdone', onFonts);

  // ── pointer ─────────────────────────────────────────────────────────────────────────────────
  const ptr = { x: -1e4, y: -1e4, lastMove: -1e9, touch: false, inside: true };
  const onMove = (e: PointerEvent) => {
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    ptr.lastMove = performance.now();
    ptr.touch = e.pointerType !== 'mouse';
    ptr.inside = true;
  };
  const onOut = (e: MouseEvent) => {
    if (!e.relatedTarget) ptr.inside = false;
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onMove, { passive: true });
  document.addEventListener('mouseout', onOut);

  // ── state carried between frames ────────────────────────────────────────────────────────────
  const stage: Record<keyof Stage, Spring> = {
    chaos: spring(IDLE.chaos),
    order: spring(IDLE.order),
    calm: spring(IDLE.calm),
    lens: spring(0),
    dim: spring(0),
  };
  const lensX = spring(window.innerWidth * 0.3);
  const lensY = spring(window.innerHeight * 0.45);
  const lensOn = spring(0);
  let lensR = 150;
  let time = 0;
  let flow = 0;
  let lastNow = performance.now();
  let lastDraw = 0;
  let lastScrollY = window.scrollY;
  let scrollV = 0;
  const ripples = new Float32Array(16);
  const quiet = new Float32Array(32);

  const targetStage = (): Stage => {
    const vh = window.innerHeight;
    const line = vh * 0.5;
    const beats = [...fieldState.beats.entries()]
      .map(([el, key]) => ({ key, r: el.getBoundingClientRect() }))
      .sort((a, b) => a.r.top - b.r.top);
    if (!beats.length) return IDLE;
    if (line < beats[0].r.top) return STAGES[beats[0].key];
    for (let i = 0; i < beats.length; i++) {
      const { key, r } = beats[i];
      if (line >= r.top && line < r.bottom) {
        const frac = (line - r.top) / Math.max(1, r.height);
        const next = beats[i + 1] ? STAGES[beats[i + 1].key] : IDLE;
        const t = smooth(0.55, 1, frac);
        const a = STAGES[key];
        return {
          chaos: a.chaos + (next.chaos - a.chaos) * t,
          order: a.order + (next.order - a.order) * t,
          calm: a.calm + (next.calm - a.calm) * t,
          lens: a.lens + (next.lens - a.lens) * t,
          dim: a.dim + (next.dim - a.dim) * t,
        };
      }
    }
    return IDLE;
  };

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (!renderer) return;
    // Phones and in-app webviews draw at ~30fps: the glyphs move cell by cell anyway, and the
    // battery is the visitor's.
    if (opts.touch && now - lastDraw < 31) return;
    lastDraw = now;
    const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
    lastNow = now;
    const stopped = opts.isStopped();

    applySize();
    syncWords();
    refreshMask(now);

    const sy = window.scrollY;
    const rawV = (sy - lastScrollY) / dt;
    lastScrollY = sy;
    scrollV += (rawV - scrollV) * (1 - Math.exp(-8 * dt));

    if (!stopped) {
      time += dt;
      flow += dt * (1 + Math.min(4, Math.abs(scrollV) / 700));
    }

    // Story stage → springs (two half-steps keep a 30fps frame as smooth as a 60fps one).
    const tgt = targetStage();
    for (let i = 0; i < 2; i++) for (const k of KEYS) stepSpring(stage[k], tgt[k], 34, 1, dt / 2);

    // Lens: the hand when there is one, otherwise a slow walk through the open side of the hero.
    const idleMs = now - ptr.lastMove;
    const handActive = ptr.touch ? idleMs < 1400 : ptr.inside && idleMs < 8000;
    let tx: number;
    let ty: number;
    let tOn: number;
    if (handActive) {
      tx = ptr.x;
      ty = ptr.y;
      tOn = 1;
    } else {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const t = stopped ? 0 : time;
      const wide = w >= 1024;
      tx = (wide ? w * 0.26 : w * 0.5) + Math.sin(t * 0.31) * w * (wide ? 0.12 : 0.28);
      ty = (wide ? h * 0.48 : h * 0.62) + Math.sin(t * 0.47 + 1.3) * h * 0.14;
      tOn = 0.75;
    }
    for (let i = 0; i < 2; i++) {
      stepSpring(lensX, tx, 90, 0.72, dt / 2);
      stepSpring(lensY, ty, 90, 0.72, dt / 2);
      stepSpring(lensOn, tOn, 26, 1, dt / 2);
    }
    const speed = Math.hypot(lensX.v, lensY.v);
    const baseR = window.innerWidth < 768 ? 104 : 150;
    lensR += (baseR + Math.min(90, speed * 0.05) - lensR) * (1 - Math.exp(-6 * dt));

    // Ripples.
    ripples.fill(0);
    fieldState.ripples = fieldState.ripples.filter((r) => now - r.at < 1700);
    fieldState.ripples.forEach((r, i) => {
      ripples.set([r.x, r.y, (now - r.at) / 1000, 1], i * 4);
    });

    // Quiet patches behind the text blocks currently on screen.
    let qn = 0;
    const vh = window.innerHeight;
    for (const el of fieldState.quiet) {
      if (qn >= 8) break;
      const r = el.getBoundingClientRect();
      if (r.bottom < -60 || r.top > vh + 60 || r.width < 1) continue;
      quiet.set([r.left, r.top, r.right, r.bottom], qn * 4);
      qn++;
    }

    // Headline.
    let maskRect: [number, number, number, number] = [0, 0, 0, 0];
    let maskAmt = 0;
    if (maskOn && fieldState.headline) {
      const r = fieldState.headline.getBoundingClientRect();
      maskRect = [r.left, r.top, r.right, r.bottom];
      const p = stopped ? 1 : Math.min(1, Math.max(0, (now - maskStart) / 1500));
      maskAmt = 1 - Math.pow(1 - p, 3);
    }

    const frame: FrameInput = {
      time,
      flow,
      scroll: sy,
      vel: stopped ? 0 : scrollV,
      chaos: stage.chaos.x,
      order: Math.min(1, Math.max(0, stage.order.x)),
      calm: Math.min(1, Math.max(0, stage.calm.x)),
      dim: Math.max(0, stage.dim.x),
      lens: [lensX.x, lensY.x, lensR, Math.max(0, lensOn.x * stage.lens.x)],
      ripples,
      quiet,
      quietN: qn,
      maskRect,
      maskAmt,
    };
    renderer.render(frame);
    if (!ready) {
      ready = true;
      opts.onReady();
    }
  };

  // ── context loss (iOS reclaims WebGL under memory pressure) ─────────────────────────────────
  const onLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    renderer = null;
  };
  const onRestored = () => {
    if (disposed) return;
    renderer = GlyphRenderer.create(canvas);
    if (!renderer) return;
    viewW = viewH = 0;
    phrasesVersion = -1;
    maskDirty = true;
    applySize();
    raf = requestAnimationFrame(tick);
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  applySize();
  const fontsReady = Promise.race([
    Promise.all([
      document.fonts?.load('700 12px Cousine', 'אבגAB'),
      document.fonts?.load('900 condensed 100px "Noto Sans Hebrew"', 'בואו'),
    ]),
    new Promise((resolve) => window.setTimeout(resolve, 2500)),
  ]).catch(() => undefined);
  void fontsReady.then(() => {
    if (disposed) return;
    onFonts();
    raf = requestAnimationFrame(tick);
  });

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onMove);
    document.removeEventListener('mouseout', onOut);
    document.fonts?.removeEventListener?.('loadingdone', onFonts);
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    if (maskEl) delete maskEl.dataset.glyphLive;
    opts.onHeadlineLive(false);
    renderer?.dispose();
    renderer = null;
  };
}
