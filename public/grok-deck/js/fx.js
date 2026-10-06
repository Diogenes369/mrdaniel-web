/* Motion helpers for the deck, in the site's motion grammar:
 *  - headlines rise line by line out of a mask (expo.out, ~1.1s, stagger 0.09), the way the site's
 *    sceneMotion layer lifts section h2s;
 *  - prose is wiped in from the reading start (the right edge, this is Hebrew);
 *  - machine labels decode out of noise, letter by letter, in reading order;
 *  - terminal lines type in steps, never eased;
 *  - glyph particles: the field's own letters flying in to build something, or bursting out of it.
 * Every helper is seek-safe: it only adds tweens to the timeline it is given and registers a
 * cleanup, so a slide left halfway leaves nothing behind.
 */
(function () {
  'use strict';

  const FX = { scale: 1, reduce: false, ctx: null };
  const HEB = 'אבגדהוזחטיכלמנסעפצקרשת';
  const LAT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const DIG = '0123456789';
  const rnd = (s) => s[Math.floor(Math.random() * s.length)];
  // Every effect that is an action also makes its sound (js/sfx.js decides what that sounds like).
  const sfx = (name, o) => { if (window.GrokSFX) window.GrokSFX.emit(name, o); };

  function dispose(fn) {
    if (FX.ctx && FX.ctx.disposers) FX.ctx.disposers.push(fn);
  }
  FX.dispose = dispose;

  // ── glyph texture: the button fill and the bots' skin share the field's material ──────────────
  FX.makeGlyphTexture = function () {
    const dpr = 2;
    const cw = 12, ch = 19, cols = 14, rows = 4;
    const c = document.createElement('canvas');
    c.width = cols * cw * dpr;
    c.height = rows * ch * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.font = '700 15px Cousine, "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const MARKS = HEB + '+=:-';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const r = rand();
        if (r < 0.18) continue;
        ctx.fillStyle = `rgba(214, 255, 140, ${0.16 + r * 0.3})`;
        ctx.fillText(MARKS[Math.floor(rand() * MARKS.length)], x * cw + cw / 2, y * ch + ch * 0.55);
      }
    }
    const root = document.documentElement.style;
    root.setProperty('--glyph-tex', `url(${c.toDataURL('image/png')})`);
    root.setProperty('--glyph-tex-size', `${cols * cw}px ${rows * ch}px`);
  };

  // ── line rise ────────────────────────────────────────────────────────────────────────────────
  // The element must sit at the top-left of a position:relative .rise-host. Each line gets a band
  // (a clipped strip) holding a clone of the whole element shifted so only that line shows; the
  // clone rises inside its band. Bidi, inline markup and wrapping stay exactly the browser's.
  FX.rise = function (el, o) {
    o = o || {};
    const tl = gsap.timeline();
    if (!el || FX.reduce) return tl;
    const host = el.parentElement;
    const er = el.getBoundingClientRect();
    // The effective scale on screen (stage scale × any fit applied to the slide).
    const scale = er.width / Math.max(1, el.offsetWidth) || FX.scale || 1;
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0.5 && r.height > 0.5);
    range.detach && range.detach();
    const lines = [];
    rects.sort((a, b) => a.top - b.top);
    for (const r of rects) {
      const top = (r.top - er.top) / scale;
      const bottom = (r.bottom - er.top) / scale;
      const mid = (top + bottom) / 2;
      const hit = lines.find((l) => mid > l.top && mid < l.bottom);
      if (hit) { hit.top = Math.min(hit.top, top); hit.bottom = Math.max(hit.bottom, bottom); }
      else lines.push({ top: top, bottom: bottom });
    }
    lines.sort((a, b) => a.top - b.top);
    const H = el.offsetHeight;
    const W = el.offsetWidth;
    if (!lines.length) lines.push({ top: 0, bottom: H });
    lines.forEach((ln, i) => {
      ln.bt = i === 0 ? Math.min(0, ln.top) - 10 : (lines[i - 1].bottom + ln.top) / 2;
      ln.bb = i === lines.length - 1 ? Math.max(H, ln.bottom) + 14 : (ln.bottom + lines[i + 1].top) / 2;
    });
    const ox = el.offsetLeft;
    const oy = el.offsetTop;
    const clones = [];
    const bands = lines.map((ln) => {
      const band = document.createElement('div');
      band.className = 'rise-band';
      band.setAttribute('aria-hidden', 'true');
      band.style.top = oy + ln.bt + 'px';
      band.style.height = ln.bb - ln.bt + 'px';
      band.style.left = ox + 'px';
      band.style.width = W + 'px';
      band.style.right = 'auto';
      const clone = el.cloneNode(true);
      clone.removeAttribute('id');
      clone.removeAttribute('data-quiet');
      clone.classList.add('rise-clone');
      clone.style.width = W + 'px';
      clone.style.top = -ln.bt + 'px';
      // The clone carries only its own line (the clip moves with it), so while it waits below the
      // band no other line can show through the window.
      const clip = `inset(${ln.bt.toFixed(1)}px -60px ${(H - ln.bb).toFixed(1)}px -60px)`;
      clone.style.clipPath = clip;
      clone.style.webkitClipPath = clip;
      band.appendChild(clone);
      host.appendChild(band);
      clones.push(clone);
      return band;
    });
    el.classList.add('is-rising');
    const cleanup = () => {
      bands.forEach((b) => b.remove());
      bands.length = 0;
      el.classList.remove('is-rising');
    };
    dispose(cleanup);
    clones.forEach((c, i) => gsap.set(c, { y: lines[i].bb - lines[i].bt + 6 }));
    tl.to(clones, { y: 0, duration: o.duration || 1.1, ease: o.ease || 'expo.out', stagger: o.stagger == null ? 0.09 : o.stagger });
    tl.call(cleanup);
    return tl;
  };

  // ── wipe from the reading start ──────────────────────────────────────────────────────────────
  FX.wipe = function (el, o) {
    o = o || {};
    if (!el) return gsap.timeline();
    const ltr = o.dir === 'ltr';
    const from = ltr ? 'inset(-12% 100% -12% 0%)' : 'inset(-12% 0% -12% 100%)';
    const to = 'inset(-12% 0% -12% 0%)';
    return gsap.fromTo(el, { clipPath: from, webkitClipPath: from, x: ltr ? -14 : 14 }, {
      clipPath: to, webkitClipPath: to, x: 0, duration: o.duration || 0.95, ease: o.ease || 'power3.out', clearProps: 'clipPath,webkitClipPath,transform',
    });
  };

  // ── decode: noise → words, in reading order, same script per letter so bidi never jumps ──────
  FX.decode = function (el, o) {
    o = o || {};
    const tl = gsap.timeline();
    if (!el) return tl;
    const nodes = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue.trim()) nodes.push(n);
    const orig = nodes.map((n) => n.nodeValue);
    const total = Math.max(1, orig.reduce((a, s) => a + [...s].length, 0));
    const restore = () => nodes.forEach((n, k) => { n.nodeValue = orig[k]; });
    dispose(restore);
    const noise = (c) => (/[א-ת]/.test(c) ? rnd(HEB) : /[A-Za-z]/.test(c) ? rnd(LAT) : /[0-9]/.test(c) ? rnd(DIG) : c);
    const proxy = { p: 0 };
    const dur = o.duration || Math.min(1.3, 0.45 + total * 0.014);
    let last = 0;
    const paint = (force) => {
      const now = performance.now();
      if (!force && now - last < 40) return;
      last = now;
      let idx = 0;
      nodes.forEach((n, k) => {
        const chars = [...orig[k]];
        n.nodeValue = chars.map((c, i) => ((idx + i) / total < proxy.p * 1.15 - 0.12 ? c : noise(c))).join('');
        idx += chars.length;
      });
    };
    tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01, onStart: () => { if (!o.quiet) sfx('decode', { dur: dur }); }, onComplete: () => paint(true) });
    tl.to(proxy, { p: 1, duration: dur, ease: 'none', onUpdate: () => paint(false), onComplete: restore, onInterrupt: restore });
    return tl;
  };

  // ── typewriter: a stepped clip, one step per character (monospace lines only) ────────────────
  FX.type = function (el, o) {
    o = o || {};
    if (!el) return gsap.timeline();
    const n = Math.max(1, [...el.textContent].length);
    const ltr = o.dir ? o.dir === 'ltr' : getComputedStyle(el).direction === 'ltr';
    const from = ltr ? 'inset(-15% 100% -15% 0%)' : 'inset(-15% 0% -15% 100%)';
    const to = 'inset(-15% 0% -15% 0%)';
    const dur = o.duration || n / (o.cps || 40);
    return gsap.fromTo(el, { clipPath: from, webkitClipPath: from }, { clipPath: to, webkitClipPath: to, duration: dur, ease: `steps(${n})`, clearProps: 'clipPath,webkitClipPath', onStart: () => sfx('type', { n: n, dur: dur }) });
  };

  // ── stroke draw (solid strokes) ──────────────────────────────────────────────────────────────
  FX.draw = function (path, o) {
    o = o || {};
    if (!path || !path.getTotalLength) return gsap.timeline();
    const len = path.getTotalLength();
    return gsap.fromTo(path, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: o.duration || 0.8, ease: o.ease || 'power2.inOut', clearProps: 'strokeDasharray,strokeDashoffset' });
  };

  // ── glyph particles ──────────────────────────────────────────────────────────────────────────
  const GLYPHS = HEB + 'GROKBTgrokbt' + ':=+-.';
  const P = { canvas: null, ctx: null, list: [], W: 1920, H: 1080, scale: 1, dpr: 1 };
  FX.Particles = P;
  P.init = function (canvas) { P.canvas = canvas; P.ctx = canvas.getContext('2d'); };
  P.resize = function (W, H, scale) {
    if (!P.canvas) return;
    P.W = W; P.H = H; P.scale = scale;
    P.dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.max(1, Math.round(W * scale * P.dpr));
    const ph = Math.max(1, Math.round(H * scale * P.dpr));
    if (P.canvas.width !== pw || P.canvas.height !== ph) { P.canvas.width = pw; P.canvas.height = ph; }
  };
  P.clear = function () { P.list.length = 0; if (P.ctx) P.ctx.clearRect(0, 0, P.canvas.width, P.canvas.height); };
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // Glyphs fly in from the noise and settle on target points; they hold until `release` (ms from now).
  P.assemble = function (points, o) {
    o = o || {};
    const now = performance.now();
    const spread = o.spread || 520;
    const cx = o.cx, cy = o.cy;
    const dur = o.duration || 1300;
    const hold = o.hold == null ? 260 : o.hold;
    let lastArrive = 0;
    points.forEach((pt, i) => {
      const a = Math.random() * Math.PI * 2;
      const r = spread * (0.45 + Math.random() * 0.75);
      const x0 = cx + Math.cos(a) * r;
      const y0 = cy + Math.sin(a) * r * 0.75;
      const delay = (i / points.length) * dur * 0.45 + Math.random() * dur * 0.15;
      const d = dur * (0.5 + Math.random() * 0.35);
      const t0 = now + delay;
      lastArrive = Math.max(lastArrive, t0 + d);
      const ctrlA = a + (Math.random() < 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.6);
      P.list.push({
        kind: 'in', x0: x0, y0: y0, x1: pt[0], y1: pt[1],
        cx: (x0 + pt[0]) / 2 + Math.cos(ctrlA) * r * 0.35, cy: (y0 + pt[1]) / 2 + Math.sin(ctrlA) * r * 0.35,
        t0: t0, dur: d, ch: rnd(GLYPHS), size: o.size || 15, color: o.color || '#8FD400',
        swap: Math.random() * 200, release: 0, fade: 320,
      });
    });
    const release = lastArrive + hold;
    P.list.forEach((p) => { if (p.kind === 'in' && !p.release) p.release = release; });
    sfx('assemble', { dur: (lastArrive - now) / 1000 });
    return release - now;
  };

  // A small burst of glyphs out of a point (a stamp, a pop, a landing).
  P.burst = function (x, y, o) {
    o = o || {};
    const now = performance.now();
    const n = o.count || 22;
    sfx('burst', { count: n });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const sp = (o.speed || 150) * (0.5 + Math.random() * 0.8);
      P.list.push({
        kind: 'out', x0: x, y0: y, x1: x + Math.cos(a) * sp, y1: y + Math.sin(a) * sp * 0.8 - (o.lift || 30),
        cx: x + Math.cos(a) * sp * 0.6, cy: y + Math.sin(a) * sp * 0.4 - (o.lift || 30) * 1.4,
        t0: now + Math.random() * 60, dur: (o.duration || 700) * (0.7 + Math.random() * 0.6), ch: rnd(GLYPHS),
        size: o.size || 14, color: o.color || '#8FD400', swap: 0,
      });
    }
  };

  // A short stream of glyphs travelling from one point to another (a message between bots).
  P.stream = function (ax, ay, bx, by, o) {
    o = o || {};
    const now = performance.now();
    const n = o.count || 12;
    const mx = (ax + bx) / 2, my = Math.min(ay, by) - (o.arc || 80);
    sfx('stream');
    for (let i = 0; i < n; i++) {
      P.list.push({
        kind: 'stream', x0: ax + (Math.random() - 0.5) * 18, y0: ay + (Math.random() - 0.5) * 18, x1: bx + (Math.random() - 0.5) * 24, y1: by + (Math.random() - 0.5) * 12,
        cx: mx + (Math.random() - 0.5) * 60, cy: my + (Math.random() - 0.5) * 40,
        t0: now + i * (o.gap || 34), dur: o.duration || 620, ch: rnd(GLYPHS), size: o.size || 15, color: o.color || '#C8F46E', swap: 0,
      });
    }
  };

  // A slide change: a front of glyphs crosses the stage in the reading direction (right to left
  // going forward), as if the page were being typed over. Light, quick, gone in under a second.
  P.sweep = function (dir, o) {
    o = o || {};
    const now = performance.now();
    const n = o.count || 72;
    const dur = o.duration || 560;
    const from = dir > 0 ? P.W + 30 : -30;
    const to = dir > 0 ? -30 : P.W + 30;
    for (let k = 0; k < n; k++) {
      const f = k / n;
      const x = from + (to - from) * f + (Math.random() - 0.5) * 60;
      const y = Math.random() * P.H;
      const drift = -dir * (30 + Math.random() * 90);
      P.list.push({
        kind: 'out', x0: x, y0: y, x1: x + drift, y1: y + (Math.random() - 0.5) * 40,
        cx: x + drift * 0.5, cy: y + (Math.random() - 0.5) * 30,
        t0: now + f * dur, dur: 320 + Math.random() * 280, ch: rnd(GLYPHS),
        size: 13 + Math.floor(Math.random() * 6), color: Math.random() < 0.3 ? '#C8F46E' : '#8FD400', swap: 0, a0: 0.6,
      });
    }
  };

  P.frame = function (now) {
    const ctx = P.ctx;
    if (!ctx) return;
    if (!P.list.length) {
      if (P.dirty) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, P.canvas.width, P.canvas.height); P.dirty = false; }
      return;
    }
    P.dirty = true;
    const k = P.scale * P.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, P.canvas.width, P.canvas.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let font = '';
    const keep = [];
    for (const p of P.list) {
      if (now < p.t0) { keep.push(p); continue; }
      let t = Math.min(1, (now - p.t0) / p.dur);
      let alpha = 1;
      if (p.kind === 'in') {
        if (p.release && now > p.release) {
          const f = (now - p.release) / p.fade;
          if (f >= 1) continue;
          alpha = 1 - f;
        } else alpha = Math.min(1, t * 2.2);
        t = easeInOut(t);
      } else if (p.kind === 'out') {
        if (t >= 1) continue;
        alpha = (p.a0 || 1) * (1 - t);
        t = easeOut(t);
      } else {
        if (t >= 1) continue;
        alpha = t < 0.15 ? t / 0.15 : t > 0.8 ? (1 - t) / 0.2 : 1;
        t = easeInOut(t);
      }
      keep.push(p);
      const u = 1 - t;
      const x = u * u * p.x0 + 2 * u * t * p.cx + t * t * p.x1;
      const y = u * u * p.y0 + 2 * u * t * p.cy + t * t * p.y1;
      if (p.kind === 'in' && t < 0.97 && now - p.swap > 70) { p.ch = rnd(GLYPHS); p.swap = now; }
      const f = `700 ${p.size}px Cousine, "Courier New", monospace`;
      if (f !== font) { ctx.font = f; font = f; }
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.fillStyle = p.color;
      ctx.fillText(p.ch, x, y);
    }
    ctx.globalAlpha = 1;
    P.list = keep;
  };

  // ── cursor sprite (a person's hand, or the bot's own pointer) ────────────────────────────────
  FX.cursor = function (layer, o) {
    o = o || {};
    const el = document.createElement('div');
    el.className = 'cursor-sprite';
    const fill = o.tone === 'ink' ? '#8FD400' : '#E6ECDD';
    el.innerHTML = `<svg viewBox="0 0 22 27" aria-hidden="true"><path d="M2 2 L2 22 L7.4 17.2 L10.9 25 L14.6 23.4 L11.2 15.8 L18.6 15.8 Z" fill="${fill}" stroke="#0A0B09" stroke-width="1.7" stroke-linejoin="round"/></svg>`;
    layer.appendChild(el);
    const pos = { x: o.x || 0, y: o.y || 0 };
    gsap.set(el, { x: pos.x, y: pos.y, opacity: 0, scale: 0.6 });
    gsap.to(el, { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(2)' });
    const api = {
      el: el,
      point: () => ({ x: pos.x, y: pos.y }),
      moveTo(x, y, mo) {
        mo = mo || {};
        return gsap.to(pos, {
          x: x, y: y, duration: mo.duration || 0.7, ease: mo.ease || 'power3.inOut',
          onUpdate: () => gsap.set(el, { x: pos.x, y: pos.y }),
        });
      },
      click() {
        sfx('click');
        gsap.fromTo(el, { scale: 1 }, { scale: 0.82, duration: 0.09, yoyo: true, repeat: 1, ease: 'power2.out' });
        const ring = document.createElement('div');
        ring.className = 'click-ring';
        ring.style.left = pos.x + 'px';
        ring.style.top = pos.y + 'px';
        layer.appendChild(ring);
        dispose(() => ring.remove());
        gsap.fromTo(ring, { scale: 0.2, opacity: 1 }, { scale: 1.3, opacity: 0, duration: 0.55, ease: 'power2.out', onComplete: () => ring.remove() });
      },
      away() { gsap.to(el, { opacity: 0, scale: 0.6, duration: 0.3, onComplete: () => el.remove() }); },
      remove() { el.remove(); },
    };
    dispose(() => el.remove());
    return api;
  };

  window.FX = FX;
})();
