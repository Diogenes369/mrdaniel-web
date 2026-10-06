/* The Grok Bot character.
 *
 * An original figure in the spirit of the app's avatars (a geometric head and two slanted eyes,
 * shapes the app's avatar editor offers: circle, triangle, diamond, square, star, heart, flower,
 * sparkle, clover, house), built from the site's material: one green ink, a skin of real Hebrew
 * letters and density marks (the same tile the glyph buttons wear), and a shadow made of glyph
 * density instead of a drop shadow.
 *
 * Everything that moves is a spring: position, size, squash and stretch, tilt, gaze, eyelids. A
 * hop is the one scripted move (anticipation squash, an arc, a landing that the springs absorb).
 * Shapes morph point-for-point: every outline is resampled to the same N points by angle.
 */
(function () {
  'use strict';

  // What a bot does, it also sounds (js/sfx.js): the hop and the landing, popping in, a change of
  // shape or mood. `size` lets a small bot sound smaller than the main one.
  const sfx = (name, o) => { if (window.GrokSFX) window.GrokSFX.emit(name, o); };

  const NS = 'http://www.w3.org/2000/svg';
  const N = 84;
  const R = 100;
  const TAU = Math.PI * 2;

  // ── shapes ───────────────────────────────────────────────────────────────────────────────────
  function polar(fn) {
    const out = [];
    for (let i = 0; i < 360; i++) {
      const a = -Math.PI / 2 + (i / 360) * TAU;
      const r = fn(a);
      out.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return out;
  }
  function roundedPoly(verts, rad, seg) {
    seg = seg || 14;
    const n = verts.length;
    const out = [];
    const normal = (p, q) => {
      const ex = q[0] - p[0], ey = q[1] - p[1];
      let nx = ey, ny = -ex;
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
      const l = Math.hypot(nx, ny) || 1;
      return [nx / l, ny / l];
    };
    for (let i = 0; i < n; i++) {
      const p = verts[(i - 1 + n) % n], v = verts[i], q = verts[(i + 1) % n];
      const n1 = normal(p, v), n2 = normal(v, q);
      const a1 = Math.atan2(n1[1], n1[0]);
      let d = Math.atan2(n2[1], n2[0]) - a1;
      while (d < 0) d += TAU;
      while (d > TAU) d -= TAU;
      for (let s = 0; s <= seg; s++) {
        const a = a1 + (d * s) / seg;
        out.push([v[0] + Math.cos(a) * rad, v[1] + Math.sin(a) * rad]);
      }
    }
    return out;
  }
  const regular = (k, rot, r) => Array.from({ length: k }, (_, i) => [Math.cos(rot + (i / k) * TAU) * r, Math.sin(rot + (i / k) * TAU) * r]);

  // Resample any star-shaped outline to N points by angle from its area centroid, then scale it
  // to the same visual area as a circle of radius R.
  function resample(outline) {
    const n = outline.length;
    let A = 0, cx = 0, cy = 0;
    for (let i = 0; i < n; i++) {
      const [x0, y0] = outline[i], [x1, y1] = outline[(i + 1) % n];
      const f = x0 * y1 - x1 * y0;
      A += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
    }
    A *= 0.5; cx /= 6 * A; cy /= 6 * A;
    const pts = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const a = -Math.PI / 2 + (i / N) * TAU;
      const dx = Math.cos(a), dy = Math.sin(a);
      let best = 0;
      for (let j = 0; j < n; j++) {
        const ax = outline[j][0] - cx, ay = outline[j][1] - cy;
        const ex = outline[(j + 1) % n][0] - cx - ax, ey = outline[(j + 1) % n][1] - cy - ay;
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = (ax * ey - ay * ex) / den;
        const u = (ax * dy - ay * dx) / den;
        if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6 && t > best) best = t;
      }
      pts[2 * i] = dx * best;
      pts[2 * i + 1] = dy * best;
    }
    let area = 0;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      area += pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1];
    }
    const k = R / Math.sqrt(Math.abs(area / 2) / Math.PI);
    for (let i = 0; i < pts.length; i++) pts[i] *= k;
    return pts;
  }

  const heart = [];
  for (let i = 0; i < 240; i++) {
    const t = (i / 240) * TAU;
    heart.push([16 * Math.pow(Math.sin(t), 3), -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
  }
  const star = (k, rIn, rOut, p) => (a) => rIn + (rOut - rIn) * Math.pow(Math.abs(Math.cos((k * (a + Math.PI / 2)) / 2)), p);

  const SHAPES = {
    circle: resample(polar(() => 1)),
    triangle: resample(roundedPoly(regular(3, -Math.PI / 2, 0.9), 0.36)),
    diamond: resample(roundedPoly(regular(4, -Math.PI / 2, 0.86), 0.3)),
    square: resample(roundedPoly(regular(4, -Math.PI / 4, 0.8), 0.32)),
    star: resample(polar(star(5, 0.58, 1.12, 2.4))),
    sparkle: resample(polar(star(4, 0.5, 1.18, 4))),
    flower: resample(polar((a) => 0.84 + 0.16 * Math.cos(6 * (a + Math.PI / 2)))),
    clover: resample(polar((a) => 0.74 + 0.26 * Math.pow(Math.abs(Math.cos(2 * (a + Math.PI / 4))), 0.55))),
    heart: resample(heart),
    house: resample(roundedPoly([[-0.76, -0.12], [0, -0.86], [0.76, -0.12], [0.76, 0.8], [-0.76, 0.8]], 0.2)),
  };
  // Where the eyes sit on each head (and how big they may be).
  const FACE = {
    circle: [0, -6, 1], triangle: [0, 22, 0.9], diamond: [0, 0, 0.95], square: [0, -4, 1], star: [0, 8, 0.86],
    sparkle: [0, 0, 0.8], flower: [0, -4, 0.96], clover: [0, -2, 0.94], heart: [0, -4, 0.98], house: [0, 22, 0.92],
  };

  function pathFrom(pts) {
    const n = pts.length / 2;
    const X = (i) => pts[2 * ((i + n) % n)], Y = (i) => pts[2 * ((i + n) % n) + 1];
    let d = `M${X(0).toFixed(1)} ${Y(0).toFixed(1)}`;
    for (let i = 0; i < n; i++) {
      const c1x = X(i) + (X(i + 1) - X(i - 1)) / 6, c1y = Y(i) + (Y(i + 1) - Y(i - 1)) / 6;
      const c2x = X(i + 1) - (X(i + 2) - X(i)) / 6, c2y = Y(i + 1) - (Y(i + 2) - Y(i)) / 6;
      d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${X(i + 1).toFixed(1)} ${Y(i + 1).toFixed(1)}`;
    }
    return d + 'Z';
  }
  function pointInPoly(x, y, pts) {
    let inside = false;
    const n = pts.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = pts[2 * i], yi = pts[2 * i + 1], xj = pts[2 * j], yj = pts[2 * j + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // Bot animations belong to the bot, not to the slide that asked for them: build them outside any
  // recording gsap.context, so leaving a slide halfway never reverts a hop, a morph or a blink.
  let FREE = null;
  const free = (fn) => {
    if (!window.gsap || !gsap.context) return fn();
    if (!FREE) FREE = gsap.context(() => {});
    let out;
    FREE.ignore(() => { out = fn(); });
    return out;
  };

  const TONES = { ink: '#8FD400', fill: '#76B900', hi: '#C8F46E', pale: '#9FE870', deep: '#5C9200' };
  const MOODS = {
    idle: { openL: 1, openR: 1, tiltL: 12, tiltR: 12, dy: 0, happy: 0, size: 1 },
    happy: { openL: 1, openR: 1, tiltL: 12, tiltR: 12, dy: -2, happy: 1, size: 1 },
    focus: { openL: 0.56, openR: 0.56, tiltL: 6, tiltR: 6, dy: 3, happy: 0, size: 1 },
    sleepy: { openL: 0.2, openR: 0.2, tiltL: 8, tiltR: 8, dy: 7, happy: 0, size: 1 },
    surprised: { openL: 1.12, openR: 1.12, tiltL: 0, tiltR: 0, dy: -5, happy: 0, size: 1.18 },
    sad: { openL: 0.78, openR: 0.78, tiltL: -17, tiltR: 17, dy: 9, happy: 0, size: 0.94 },
    skeptic: { openL: 0.4, openR: 1, tiltL: 4, tiltR: 14, dy: 0, happy: 0, size: 1 },
    wince: { openL: 0.1, openR: 0.1, tiltL: 22, tiltR: -22, dy: 2, happy: 0, size: 1.05 },
  };

  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

  // ── springs ──────────────────────────────────────────────────────────────────────────────────
  function S(x, k, z) { return { x: x, v: 0, t: x, k: k, z: z }; }
  function step(s, dt) {
    const c = 2 * Math.sqrt(s.k) * s.z;
    s.v += (s.k * (s.t - s.x) - c * s.v) * dt;
    s.x += s.v * dt;
  }

  // ── skin: a tile of real letters and density marks, generated once ─────────────────────────
  let skinURL = '';
  function skin() {
    if (skinURL) return skinURL;
    const cols = 16, rows = 7, cw = 9, ch = 14, k = 3;
    const c = document.createElement('canvas');
    c.width = cols * cw * k;
    c.height = rows * ch * k;
    const ctx = c.getContext('2d');
    ctx.scale(k, k);
    ctx.font = '700 11px Cousine, "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let seed = 11;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const MARKS = 'אבגדהוזחטיכלמנסעפצקרשתGROKBT+=:-';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const r = rand();
        if (r < 0.22) continue;
        ctx.fillStyle = `rgba(10, 11, 9, ${0.1 + r * 0.2})`;
        ctx.fillText(MARKS[Math.floor(rand() * MARKS.length)], x * cw + cw / 2, y * ch + ch * 0.55);
      }
    }
    skinURL = c.toDataURL('image/png');
    return skinURL;
  }
  const TILE_W = 144, TILE_H = 98, CELL = 9;

  const el = (name, attrs, parent) => {
    const n = document.createElementNS(NS, name);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };

  let uid = 0;
  const Bots = { list: new Map(), layer: null, reduce: false, onReact: null };

  function Bot(id, o) {
    o = o || {};
    this.id = id;
    this.uid = ++uid;
    this.shape = o.shape || 'circle';
    this.pts = new Float32Array(SHAPES[this.shape]);
    this.toneName = o.tone || 'ink';
    this.mood = o.mood || 'idle';
    const size = o.size || 150;

    this.px = S(o.x || 0, 170, 0.78);
    this.py = S(o.y || 0, 170, 0.78);
    this.size = S(size, 140, 0.82);
    this.sx = S(1, 380, 0.34);
    this.sy = S(1, 380, 0.34);
    this.rot = S(0, 120, 0.5);
    this.gx = S(0, 220, 0.86);
    this.gy = S(0, 220, 0.86);
    this.pop = S(o.hidden ? 0 : 1, 200, 0.55);
    const m = MOODS[this.mood];
    this.eye = {
      openL: S(m.openL, 260, 0.8), openR: S(m.openR, 260, 0.8), tiltL: S(m.tiltL, 160, 0.7), tiltR: S(m.tiltR, 160, 0.7),
      dy: S(m.dy, 160, 0.8), happy: S(m.happy, 180, 0.9), size: S(m.size, 200, 0.6),
    };
    this.blinkK = 1;
    this.nextBlink = performance.now() + 900 + Math.random() * 2600;
    this.nextGlance = performance.now() + 2500 + Math.random() * 3000;
    this.glance = null;
    this.lookTarget = null;
    this.hop = null;
    this.follow = null;
    this.walking = false;
    this.working = false;
    this.texX = 0;
    this.texNext = 0;
    this.phase = Math.random() * 10;
    this.alpha = o.hidden ? 0 : 1;
    this.toneNow = hex(TONES[this.toneName]);
    this.toneTo = this.toneNow.slice();
    this.toneFrom = this.toneNow.slice();
    this.toneT = 1;
    this.bodyAlpha = 1;
    this.arcY = 0;
    this.extraY = 0;

    const root = document.createElement('div');
    root.className = 'bot';
    root.dataset.bot = id;
    const body = document.createElement('div');
    body.className = 'bot-body';
    root.appendChild(body);
    const svg = el('svg', { viewBox: '-120 -120 240 240', 'aria-hidden': 'true' }, body);
    const defs = el('defs', null, svg);
    const clip = el('clipPath', { id: `bclip${this.uid}` }, defs);
    this.clipPath = el('path', {}, clip);
    this.pattern = el('pattern', { id: `bskin${this.uid}`, patternUnits: 'userSpaceOnUse', width: TILE_W, height: TILE_H, x: -TILE_W / 2, y: -TILE_H / 2 }, defs);
    el('image', { href: skin(), width: TILE_W, height: TILE_H, preserveAspectRatio: 'none' }, this.pattern);

    this.shadow = el('text', { x: 0, y: 132, 'text-anchor': 'middle', class: 'bot-shadow', fill: '#8FD400', 'font-family': 'Cousine, Courier New, monospace', 'font-weight': '700', 'font-size': '26', 'letter-spacing': '3', opacity: '0.42' }, svg);
    this.shadow.textContent = '.:-=-:.';

    this.g = el('g', {}, svg);
    this.bodyPath = el('path', { class: 'bot-hit', fill: TONES[this.toneName] }, this.g);
    this.tex = el('rect', { x: -130, y: -130, width: 260, height: 260, fill: `url(#bskin${this.uid})`, 'clip-path': `url(#bclip${this.uid})`, 'pointer-events': 'none' }, this.g);
    this.rim = el('path', { fill: 'none', stroke: 'rgba(10,11,9,0.22)', 'stroke-width': '3', 'pointer-events': 'none' }, this.g);

    this.face = el('g', { 'pointer-events': 'none' }, this.g);
    const mkEye = (side) => {
      const g = el('g', {}, this.face);
      const cap = el('rect', { x: -12, y: -26, width: 24, height: 52, rx: 12, fill: '#0A0B09' }, g);
      const arc = el('path', { d: 'M-14 6 Q0 -14 14 6', fill: 'none', stroke: '#0A0B09', 'stroke-width': '9', 'stroke-linecap': 'round', opacity: '0' }, g);
      const glint = el('rect', { x: -3, y: -18, width: 6, height: 10, fill: 'rgba(230,236,221,0.55)' }, g);
      return { g: g, cap: cap, arc: arc, glint: glint, side: side };
    };
    this.eyeL = mkEye(-1);
    this.eyeR = mkEye(1);

    this.ping = el('rect', { x: 56, y: -96, width: 18, height: 18, fill: '#C8F46E', opacity: '0' }, svg);
    this.starEl = el('path', { d: starPath(0, -140, 16, 7), fill: '#C8F46E', opacity: '0' }, svg);

    this.label = null;
    if (o.label) {
      this.label = document.createElement('div');
      this.label.className = 'bot-label';
      this.label.textContent = o.label;
      root.appendChild(this.label);
    }

    this.root = root;
    this.body = body;
    this.bodyPath.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.react(); if (Bots.onReact) Bots.onReact(this); });
    this.bodyPath.addEventListener('click', (e) => e.stopPropagation());
    Bots.layer.appendChild(root);
    this.drawShape();
    this.render(performance.now(), 0);
  }

  function starPath(cx, cy, ro, ri) {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? ri : ro;
      d += (i ? 'L' : 'M') + (cx + Math.cos(a) * r).toFixed(1) + ' ' + (cy + Math.sin(a) * r).toFixed(1);
    }
    return d + 'Z';
  }

  Bot.prototype.drawShape = function () {
    const d = pathFrom(this.pts);
    this.bodyPath.setAttribute('d', d);
    this.clipPath.setAttribute('d', d);
    this.rim.setAttribute('d', d);
  };
  Bot.prototype.face0 = function () { return FACE[this.shape] || FACE.circle; };

  // ── commands ─────────────────────────────────────────────────────────────────────────────────
  Bot.prototype.place = function (x, y, size) {
    this.cancelHop();
    this.px.x = this.px.t = x; this.py.x = this.py.t = y;
    this.px.v = this.py.v = 0;
    if (size) { this.size.x = this.size.t = size; this.size.v = 0; }
  };
  Bot.prototype.cancelHop = function () { if (this.hop) { this.hop.tween.kill(); this.hop = null; this.arcY = 0; } };
  Bot.prototype.goTo = function (x, y, size, o) {
    o = o || {};
    this.follow = null;
    if (size) this.size.t = size;
    const dist = Math.hypot(x - this.px.x, y - this.py.x);
    if (Bots.reduce) { this.place(x, y, size); return; }
    if (!o.hop || dist < 24) {
      this.cancelHop();
      this.px.t = x; this.py.t = y;
      return;
    }
    this.cancelHop();
    const self = this;
    const x0 = this.px.x, y0 = this.py.x;
    const arc = o.arc == null ? Math.min(260, Math.max(70, dist * 0.28)) : o.arc;
    const dur = o.duration || Math.min(0.95, Math.max(0.5, 0.42 + dist / 2600));
    const prog = { t: 0 };
    const tl = free(() => gsap.timeline({ delay: o.delay || 0 }));
    free(() => {
    // anticipation
    tl.call(() => { self.sy.t = 0.84; self.sx.t = 1.12; });
    tl.to({}, { duration: 0.11 });
    tl.call(() => { self.sy.t = 1.12; self.sx.t = 0.9; self.sy.v += 4; sfx('hop', { size: self.size.t }); });
    tl.to(prog, {
      t: 1, duration: dur, ease: 'power1.inOut',
      onUpdate() {
        const t = prog.t;
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        self.px.x = self.px.t = x0 + (x - x0) * e;
        self.py.x = self.py.t = y0 + (y - y0) * e;
        self.px.v = self.py.v = 0;
        self.arcY = -Math.sin(Math.PI * t) * arc;
        self.rot.t = Math.max(-14, Math.min(14, (x - x0) * 0.025)) * (1 - t * 1.6);
      },
      onComplete() {
        self.arcY = 0; self.rot.t = 0;
        self.sy.t = 1; self.sx.t = 1;
        self.sy.v -= 7.5; self.sx.v += 6;
        self.hop = null;
        sfx('land', { size: self.size.t });
        if (o.onLand) o.onLand();
      },
    });
    });
    this.hop = { tween: tl };
  };
  // A position provider evaluated every frame (a bot walking along something that moves).
  Bot.prototype.track = function (fn) { this.cancelHop(); this.follow = fn; };
  Bot.prototype.hopInPlace = function (h) {
    if (Bots.reduce || this.hop) return;
    const self = this;
    const prog = { t: 0 };
    h = h || 40;
    const tl = free(() => {
      const t = gsap.timeline();
      t.call(() => { self.sy.t = 0.86; self.sx.t = 1.1; });
      t.to({}, { duration: 0.09 });
      t.call(() => { self.sy.t = 1.08; self.sx.t = 0.94; sfx('hop', { size: self.size.t, small: true }); });
      t.to(prog, { t: 1, duration: 0.42, ease: 'none', onUpdate() { self.arcY = -Math.sin(Math.PI * prog.t) * h; }, onComplete() { self.arcY = 0; self.sy.t = 1; self.sx.t = 1; self.sy.v -= 6; self.sx.v += 5; self.hop = null; sfx('land', { size: self.size.t, small: true }); } });
      return t;
    });
    this.hop = { tween: tl };
  };
  Bot.prototype.setShape = function (name, o) {
    o = o || {};
    if (!SHAPES[name]) return;
    if (name === this.shape && this.settled !== false) return;
    const from = new Float32Array(this.pts);
    const to = SHAPES[name];
    this.shape = name;
    if (this.morph) this.morph.kill();
    if (Bots.reduce || o.instant) { this.pts.set(to); this.drawShape(); this.settled = true; return; }
    const self = this;
    const p = { t: 0 };
    this.settled = false;
    this.sy.v += 3; this.sx.v -= 2.5;
    sfx('morph', { size: this.size.t });
    this.morph = free(() => gsap.to(p, {
      t: 1, duration: o.duration || 0.7, ease: o.ease || 'back.out(1.6)',
      onUpdate() {
        for (let i = 0; i < self.pts.length; i++) self.pts[i] = from[i] + (to[i] - from[i]) * p.t;
        self.drawShape();
      },
      onComplete() { self.settled = true; },
    }));
  };
  Bot.prototype.setTone = function (tone) {
    if (!TONES[tone] || tone === this.toneName) return;
    this.toneName = tone;
    this.toneFrom = this.toneNow.slice();
    this.toneTo = hex(TONES[tone]);
    this.toneT = Bots.reduce ? 0.999 : 0;
  };
  Bot.prototype.setMood = function (mood) {
    const m = MOODS[mood];
    if (!m) return;
    if (mood !== this.mood && (mood === 'surprised' || mood === 'sad')) sfx(mood === 'sad' ? 'sad' : 'surprise');
    this.mood = mood;
    const e = this.eye;
    e.openL.t = m.openL; e.openR.t = m.openR; e.tiltL.t = m.tiltL; e.tiltR.t = m.tiltR;
    e.dy.t = m.dy; e.happy.t = m.happy; e.size.t = m.size;
    if (mood === 'surprised') { this.sy.v += 5; }
    if (mood === 'sad') { this.sy.t = 0.96; this.sx.t = 1.03; } else { this.sy.t = 1; this.sx.t = 1; }
  };
  Bot.prototype.look = function (target) { this.lookTarget = target || null; this.glance = null; };
  Bot.prototype.blink = function () { this.nextBlink = 0; };
  Bot.prototype.work = function (on) { this.working = !!on; };
  Bot.prototype.walk = function (on) { this.walking = !!on; };
  Bot.prototype.setPing = function (on) {
    if (!!on === !!this.pinging) return;
    this.pinging = !!on;
    if (on) sfx('ping');
    const el = this.ping;
    free(() => {
      gsap.killTweensOf(el);
      if (on) gsap.fromTo(el, { attr: { opacity: 0 } }, { attr: { opacity: 1 }, duration: 0.15, repeat: -1, yoyo: true, repeatDelay: 0.45, ease: 'steps(1)' });
      else gsap.to(el, { attr: { opacity: 0 }, duration: 0.15 });
    });
  };
  Bot.prototype.setStar = function (on) {
    if (!!on === !!this.starred) return;
    this.starred = !!on;
    if (on) sfx('star');
    const el = this.starEl;
    free(() => {
      gsap.killTweensOf(el);
      if (Bots.reduce) { gsap.set(el, { attr: { opacity: on ? 1 : 0 }, scale: 1, rotation: 0, transformOrigin: '50% 50%' }); return; }
      if (on) gsap.fromTo(el, { attr: { opacity: 0 }, scale: 0, rotation: -120, transformOrigin: '50% 50%' }, { attr: { opacity: 1 }, scale: 1, rotation: 0, duration: 0.8, ease: 'back.out(2.4)' });
      else gsap.to(el, { attr: { opacity: 0 }, scale: 0, duration: 0.25, transformOrigin: '50% 50%' });
    });
  };
  Bot.prototype.popIn = function (o) {
    o = o || {};
    const self = this;
    if (Bots.reduce) { this.pop.x = this.pop.t = 1; this.alpha = 1; return; }
    free(() => gsap.delayedCall(o.delay || 0, () => { self.alpha = 1; self.pop.t = 1; self.pop.v += 4; sfx('pop', { size: self.size.t }); }));
  };
  Bot.prototype.popOut = function (cb) {
    const self = this;
    this.pop.t = 0;
    free(() => gsap.delayedCall(Bots.reduce ? 0 : 0.35, () => { self.alpha = 0; if (cb) cb(); }));
  };
  Bot.prototype.wobble = function (amt) {
    if (Bots.reduce) return;
    this.rot.v += (amt || 1) * 260;
  };
  Bot.prototype.nod = function () {
    if (Bots.reduce) return;
    const self = this;
    this.sy.v -= 5;
    free(() => gsap.delayedCall(0.28, () => { self.sy.v -= 4; }));
  };
  Bot.prototype.wince = function () {
    if (Bots.reduce) return;
    sfx('wince');
    this.sy.v -= 6; this.sx.v += 5; this.rot.v += (Math.random() < 0.5 ? -1 : 1) * 160;
  };
  Bot.prototype.wave = function () {
    if (Bots.reduce) return;
    sfx('wave');
    const self = this;
    this.setMood('happy');
    free(() => [0, 0.22, 0.44, 0.66].forEach((t, i) => gsap.delayedCall(t, () => { self.rot.v += (i % 2 ? -1 : 1) * 300; })));
  };
  Bot.prototype.react = function () {
    const prev = this.mood === 'happy' ? 'idle' : this.mood;
    this.setMood('happy');
    this.sy.v -= 7; this.sx.v += 6;
    this.hopInPlace(34);
    const self = this;
    free(() => gsap.delayedCall(0.9, () => { if (self.mood === 'happy') self.setMood(prev); }));
  };
  // Glyphs fly in from the noise and become the bot.
  Bot.prototype.assemble = function (o) {
    o = o || {};
    const P = window.FX && window.FX.Particles;
    if (!P || Bots.reduce) { this.alpha = 1; this.pop.x = this.pop.t = 1; this.bodyAlpha = 1; return; }
    const self = this;
    const size = this.size.t;
    const k = size / (2 * R);
    const cx = this.px.t, cy = this.py.t;
    const pts = [];
    const target = Math.round(Math.min(560, Math.max(160, size * 1.15)));
    let guard = 0;
    while (pts.length < target && guard++ < target * 30) {
      const x = (Math.random() * 2 - 1) * R * 1.25, y = (Math.random() * 2 - 1) * R * 1.25;
      if (pointInPoly(x, y, this.pts)) pts.push([cx + x * k, cy + y * k]);
    }
    this.alpha = 1; this.pop.x = this.pop.t = 1;
    this.bodyAlpha = 0;
    this.eye.openL.x = this.eye.openR.x = 0;
    this.eye.openL.t = this.eye.openR.t = 0;
    const ms = P.assemble(pts, { cx: cx, cy: cy, spread: size * 1.5, duration: o.duration ? o.duration * 1000 : 1400, color: TONES[this.toneName], size: Math.max(11, size * 0.04) });
    free(() => gsap.to(this, { bodyAlpha: 1, duration: 0.42, delay: Math.max(0, ms / 1000 - 0.3), ease: 'power2.out' }));
    free(() => gsap.delayedCall(ms / 1000 + 0.05, () => {
      self.sy.v -= 6; self.sx.v += 5;
      self.setMood(self.mood);
      if (window.FX) window.FX.Particles.burst(cx, cy + size * 0.5, { count: 14, speed: size * 0.5, size: Math.max(11, size * 0.035), lift: 4 });
      if (o.onDone) o.onDone();
    }));
  };
  // Back to a clean, fully visible state (used when a slide is entered, whatever happened before).
  Bot.prototype.normalize = function () {
    gsap.killTweensOf(this);
    this.bodyAlpha = 1;
    this.alpha = 1;
    this.pop.t = 1;
    if (this.pop.x < 0.5) this.pop.x = 1;
    this.follow = null;
    this.walking = false;
  };
  Bot.prototype.destroy = function () {
    this.cancelHop();
    if (this.morph) this.morph.kill();
    gsap.killTweensOf(this.ping); gsap.killTweensOf(this.starEl); gsap.killTweensOf(this);
    this.root.remove();
  };
  Bot.prototype.center = function () { return { x: this.px.x, y: this.py.x + this.arcY, r: this.size.x / 2 }; };

  // ── per frame ────────────────────────────────────────────────────────────────────────────────
  Bot.prototype.render = function (now, dt) {
    const reduce = Bots.reduce;
    if (dt > 0) {
      if (this.follow && !this.hop) {
        const p = this.follow();
        if (p) { this.px.t = p.x; this.py.t = p.y; }
      }
      const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
      const h = dt / sub;
      for (let i = 0; i < sub; i++) {
        step(this.px, h); step(this.py, h); step(this.size, h); step(this.sx, h); step(this.sy, h);
        step(this.rot, h); step(this.gx, h); step(this.gy, h); step(this.pop, h);
        for (const k in this.eye) step(this.eye[k], h);
      }
    }
    // blink + glances
    if (now > this.nextBlink) {
      this.blinkStart = now;
      this.nextBlink = now + 2200 + Math.random() * 3600;
      if (Math.random() < 0.22) this.doubleBlink = true;
    }
    let blink = 1;
    if (this.blinkStart) {
      const t = (now - this.blinkStart) / 1000;
      const one = (tt) => (tt < 0 ? 1 : tt < 0.06 ? 1 - tt / 0.06 : tt < 0.17 ? (tt - 0.06) / 0.11 : 1);
      blink = Math.max(0.06, Math.min(one(t), this.doubleBlink ? one(t - 0.22) : 1));
      if (t > 0.45) { this.blinkStart = 0; this.doubleBlink = false; }
    }

    // gaze
    let gx = 0, gy = 0.1;
    const c = this.center();
    let target = this.lookTarget;
    if (!target && now > this.nextGlance && !reduce) {
      this.glance = { x: c.x + (Math.random() - 0.5) * 900, y: c.y + (Math.random() - 0.4) * 500, until: now + 700 + Math.random() * 700 };
      this.nextGlance = now + 2600 + Math.random() * 3800;
    }
    if (!target && this.glance && now < this.glance.until) target = this.glance;
    if (target) {
      let tx, ty;
      if (typeof target === 'function') { const p = target(); tx = p.x; ty = p.y; }
      else if (target.nodeType === 1) { const p = Bots.pointOf(target); tx = p.x; ty = p.y; }
      else { tx = target.x; ty = target.y; }
      const vx = tx - c.x, vy = ty - c.y;
      const len = Math.hypot(vx, vy) || 1;
      const amt = Math.min(1, len / 340);
      gx = (vx / len) * amt; gy = (vy / len) * amt;
    }
    this.gx.t = gx; this.gy.t = gy;

    // working: the skin types across in steps
    if (this.working && !reduce && now > this.texNext) {
      this.texX = (this.texX - CELL) % TILE_W;
      this.texNext = now + 85;
      this.pattern.setAttribute('x', String(-TILE_W / 2 + this.texX));
    }

    // tone: a short colour ease, owned by the bot
    if (this.toneT < 1) {
      this.toneT = Math.min(1, this.toneT + Math.max(dt, 0.001) / 0.45);
      const k = 1 - Math.pow(1 - this.toneT, 3);
      this.toneNow = this.toneFrom.map((v, i) => Math.round(v + (this.toneTo[i] - v) * k));
      this.bodyPath.setAttribute('fill', `rgb(${this.toneNow.join(',')})`);
    }

    // compose
    const t = now / 1000 + this.phase;
    const idle = !this.hop && !reduce;
    const breathe = idle ? Math.sin(t * 1.6) * 0.014 : 0;
    const floatY = idle ? Math.sin(t * 1.25) * 3.2 : 0;
    let walkY = 0, walkR = 0;
    if (this.walking && !reduce) {
      const sp = Math.min(1, Math.abs(this.px.v) / 120);
      walkY = -Math.abs(Math.sin(t * 11)) * 9 * sp;
      walkR = Math.sin(t * 11) * 4 * sp;
    }
    const workBob = this.working && !reduce ? Math.abs(Math.sin(t * 7)) * -2.5 : 0;
    const scale = (this.size.x / (2 * R)) * Math.max(0, this.pop.x);
    const x = this.px.x;
    const y = this.py.x + this.arcY + floatY + walkY + workBob + this.extraY;
    this.root.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    this.root.style.opacity = String(this.alpha);
    this.body.style.transform = `scale(${Math.max(0.0001, scale).toFixed(4)})`;
    const sx = this.sx.x * (1 - breathe * 0.6);
    const sy = this.sy.x * (1 + breathe);
    this.g.setAttribute('transform', `rotate(${(this.rot.x + walkR).toFixed(2)}) translate(0 ${R}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(0 ${-R})`);
    this.g.setAttribute('opacity', String(this.bodyAlpha));

    // shadow stays on the ground while the body hops
    const lift = -(this.arcY + walkY) / Math.max(0.0001, scale);
    const sh = Math.max(0.3, 1 - Math.max(0, lift) / 260);
    this.shadow.setAttribute('transform', `translate(0 ${(lift + R * (sy - 1) * 0.0).toFixed(1)}) scale(${(sh * sx).toFixed(3)} 1)`);
    this.shadow.setAttribute('opacity', String((0.42 * sh * this.bodyAlpha).toFixed(3)));

    // eyes
    const f = this.face0();
    const e = this.eye;
    const ex = this.gx.x * 16, ey = this.gy.x * 12 + e.dy.x + f[1];
    const es = f[2] * e.size.x;
    this.face.setAttribute('transform', `translate(${(f[0] + ex).toFixed(2)} ${ey.toFixed(2)})`);
    const happy = Math.max(0, Math.min(1, e.happy.x));
    const eyeDraw = (eye, open, tilt) => {
      const o = Math.max(0.04, open * blink);
      eye.g.setAttribute('transform', `translate(${eye.side * 30 * f[2]} 0) rotate(${tilt.toFixed(2)}) scale(${es.toFixed(3)} ${(es * o).toFixed(3)})`);
      eye.cap.setAttribute('opacity', String(1 - happy));
      eye.glint.setAttribute('opacity', String((1 - happy) * Math.min(1, o)));
      eye.arc.setAttribute('opacity', String(happy));
      eye.arc.setAttribute('transform', `scale(1 ${(1 / Math.max(0.2, o)).toFixed(3)})`);
    };
    eyeDraw(this.eyeL, e.openL.x, e.tiltL.x);
    eyeDraw(this.eyeR, e.openR.x, e.tiltR.x);

    if (this.label) {
      this.label.style.transform = `translate(-50%, ${(this.size.x / 2 + 26).toFixed(1)}px)`;
    }
  };

  // ── manager ──────────────────────────────────────────────────────────────────────────────────
  Bots.init = function (layer, o) {
    Bots.layer = layer;
    Bots.reduce = !!(o && o.reduce);
    Bots.pointOf = (o && o.pointOf) || ((n) => { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  };
  Bots.create = function (id, o) {
    if (Bots.list.has(id)) Bots.list.get(id).destroy();
    const b = new Bot(id, o);
    Bots.list.set(id, b);
    return b;
  };
  Bots.get = function (id) { return Bots.list.get(id) || null; };
  Bots.remove = function (id, animated) {
    const b = Bots.list.get(id);
    if (!b) return;
    Bots.list.delete(id);
    if (animated && !Bots.reduce) b.popOut(() => b.destroy());
    else b.destroy();
  };
  Bots.frame = function (now, dt) { Bots.list.forEach((b) => b.render(now, dt)); };
  Bots.SHAPES = Object.keys(SHAPES);
  Bots.TONES = TONES;

  window.Bots = Bots;
})();
