/* The deck engine: a 1920×1080 stage (1080×~1920 on portrait phones) scaled to fit, slide
 * enter/leave with one gsap.context per slide (so leaving halfway reverts everything that slide
 * did), the bot director, the glyph field's stage per slide, and input: keys, clicks, swipes,
 * the rail. Navigation follows presentation habit: → Space PageDown next, ← PageUp back.
 */
(function () {
  'use strict';

  const html = document.documentElement;
  const stage = document.getElementById('stage');
  const viewport = document.getElementById('viewport');
  const overlay = document.getElementById('overlayLayer');
  const liveRegion = document.getElementById('liveRegion');
  const slideEls = Array.from(stage.querySelectorAll('.slide'));
  const keys = slideEls.map((s) => s.dataset.key);
  const DEF = window.SLIDES || {};
  const Field = window.GlyphField;
  const Bots = window.Bots;
  const FX = window.FX;
  const mq = (q) => (window.matchMedia ? window.matchMedia(q).matches : false);
  const reduce = mq('(prefers-reduced-motion: reduce)');
  const touch = mq('(pointer: coarse)');
  const CALM = { chaos: 0.42, order: 0.18, calm: 0.8, lens: 0.32, dim: 0.34 };

  // full: the deck on its own page. embed: inside an iframe on the site (starts when it scrolls
  // into view, sleeps while off screen). reel: a fixed 1080×1920 vertical cut for Instagram that
  // plays itself, with every slide kept clear of the Reels interface.
  const params = new URLSearchParams(location.search);
  let inFrame = false;
  try { inFrame = window.self !== window.top; } catch (e) { inFrame = true; }
  const MODE = params.has('reel') ? 'reel' : inFrame || params.has('embed') ? 'embed' : 'full';
  html.dataset.mode = MODE;

  const state = { i: -1, W: 1920, H: 1080, scale: 1, orient: '', lastNav: 0, swipedAt: 0 };
  let active = null;
  const leaving = new Map();
  let main = null;
  let fieldOk = false;

  if (!window.gsap || !Bots || !FX) {
    html.classList.remove('is-booting');
    return;
  }
  gsap.config({ nullTargetWarn: false });

  // ── geometry ─────────────────────────────────────────────────────────────────────────────────
  function layout() {
    const cs = getComputedStyle(viewport);
    const pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
    const pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0;
    const aw = Math.max(1, viewport.clientWidth - pl - pr);
    const ah = Math.max(1, viewport.clientHeight - pt - pb);
    const portrait = MODE === 'reel' || aw / ah < 0.82;
    let W, H;
    if (MODE === 'reel') {
      W = 1080;
      H = 1920;
    } else if (portrait) {
      W = 1080;
      H = Math.round(Math.min(2340, Math.max(1720, (W * ah) / aw)) / 20) * 20;
    } else {
      W = 1920;
      H = 1080;
    }
    const s = Math.min(aw / W, ah / H);
    const ox = pl + (aw - W * s) / 2;
    const oy = pt + (ah - H * s) / 2;
    const orient = portrait ? 'portrait' : 'landscape';
    const changed = W !== state.W || H !== state.H || orient !== state.orient;
    state.W = W; state.H = H; state.scale = s; state.orient = orient;
    stage.style.width = W + 'px';
    stage.style.height = H + 'px';
    stage.style.transform = `translate(${ox.toFixed(2)}px, ${oy.toFixed(2)}px) scale(${s.toFixed(5)})`;
    stage.dataset.orient = orient;
    FX.scale = s;
    FX.Particles.resize(W, H, s);
    return changed;
  }
  const sRect = () => stage.getBoundingClientRect();
  function toStage(r) {
    const sr = sRect();
    const s = state.scale || 1;
    return { x: (r.left - sr.left + r.width / 2) / s, y: (r.top - sr.top + r.height / 2) / s, w: r.width / s, h: r.height / s };
  }
  const pointOf = (el) => toStage(el.getBoundingClientRect());
  function toView(x, y) {
    const sr = sRect();
    return { x: sr.left + x * state.scale, y: sr.top + y * state.scale };
  }

  // ── chrome: section label + rail ─────────────────────────────────────────────────────────────
  const chromeSection = stage.querySelector('.chrome-section');
  const railTrack = stage.querySelector('.rail-track');
  const railCaret = stage.querySelector('.rail-caret');
  const ticks = slideEls.map((s, i) => {
    const t = document.createElement('span');
    t.className = 'rail-tick';
    t.style.right = (i / (slideEls.length - 1)) * 100 + '%';
    railTrack.appendChild(t);
    return t;
  });
  let lastSection = null;
  function setChrome(section) {
    if (section === lastSection) return;
    lastSection = section;
    chromeSection.textContent = section;
    if (!reduce && section) {
      const prev = FX.ctx;
      FX.ctx = null;
      FX.decode(chromeSection, { duration: 0.6 });
      FX.ctx = prev;
    }
  }
  function setRail(i, instant) {
    const n = slideEls.length;
    const x = -(i / (n - 1)) * railTrack.offsetWidth;
    gsap.killTweensOf(railCaret);
    if (instant || reduce) gsap.set(railCaret, { x: x });
    else gsap.to(railCaret, { x: x, duration: 0.9, ease: 'elastic.out(1, 0.62)' });
    ticks.forEach((t, k) => t.classList.toggle('is-past', k <= i));
  }

  // ── slide context ────────────────────────────────────────────────────────────────────────────
  function run(slide, fn) {
    if (!slide.alive) return;
    const prev = FX.ctx;
    FX.ctx = slide;
    try { slide.ctx.add(fn); } catch (err) { console.error('[deck]', slide.key, err); } finally { FX.ctx = prev; }
  }

  function makeS(slide, o) {
    const el = slide.el;
    const S = {
      el: el,
      first: !!o.first,
      fieldOk: fieldOk,
      reduce: reduce,
      main: main,
      tl: null,
      q: (sel) => el.querySelector(sel),
      qa: (sel) => Array.from(el.querySelectorAll(sel)),
      anchor: (name) => slide.anchors[name] || (() => { const a = el.querySelector(`[data-anchor="${name}"]`); return a ? pointOf(a) : { x: state.W / 2, y: state.H / 2, w: 120, h: 120 }; })(),
      point: (node) => pointOf(node),
      at: (t, fn) => { slide.tl.call(() => run(slide, fn), null, t); },
      later: (d, fn) => { const dc = gsap.delayedCall(d, () => run(slide, fn)); slide.keep.push(dc); return dc; },
      keep: (tw) => { slide.keep.push(tw); return tw; },
      dispose: (fn) => { slide.disposers.push(fn); },
      rise: (node, t, opt) => { if (node) slide.tl.add(FX.rise(node, opt), t); },
      wipe: (node, t, opt) => { if (node) slide.tl.add(FX.wipe(node, opt), t); },
      decode: (node, t, opt) => { if (node) slide.tl.add(FX.decode(node, opt), t); },
      type: (node, t, opt) => { if (node) slide.tl.add(FX.type(node, opt), t); },
      draw: (path, t, opt) => {
        if (!path) return;
        const tw = FX.draw(path, opt);
        if (t != null) slide.tl.add(tw, t);
      },
      typeLine: (ln, t, cps) => {
        const n = Math.max(1, ln.textContent.replace(/\s+$/, '').length);
        const from = 'inset(-20% 100% -20% 0%)';
        const to = 'inset(-20% 0% -20% 0%)';
        slide.tl.fromTo(ln, { clipPath: from, webkitClipPath: from }, { clipPath: to, webkitClipPath: to, duration: Math.max(0.16, n / (cps || 50)), ease: `steps(${n})`, clearProps: 'clipPath,webkitClipPath' }, t);
      },
      typeText: (node, text, t, cps) => {
        if (!node) return;
        const orig = node.textContent;
        slide.disposers.push(() => { node.textContent = orig; });
        const proxy = { n: 0 };
        slide.tl.to(proxy, { n: text.length, duration: text.length / (cps || 20), ease: 'none', onUpdate: () => { node.textContent = text.slice(0, Math.round(proxy.n)); } }, t);
      },
      row: (row, t) => {
        if (!row) return;
        slide.tl.from(row, { opacity: 0, x: 34, duration: 0.7, ease: 'expo.out' }, t);
        const term = row.querySelector('.term');
        const plain = row.querySelector('.plain');
        if (term) slide.tl.add(FX.decode(term), t + 0.05);
        if (plain) slide.tl.add(FX.wipe(plain, { duration: 0.8 }), t + 0.12);
      },
      frameIn: (node, t) => {
        if (!node) return;
        const from = 'inset(0% 0% 0% 100%)';
        const to = 'inset(0% 0% 0% 0%)';
        slide.tl.fromTo(node, { clipPath: from, webkitClipPath: from, opacity: 0.35 }, { clipPath: to, webkitClipPath: to, opacity: 1, duration: 0.9, ease: 'power3.out', clearProps: 'clipPath,webkitClipPath,opacity' }, t);
      },
      hand: (fig, t) => {
        if (!fig) return;
        const text = fig.querySelector('.hand__text');
        const paths = fig.querySelectorAll('path');
        slide.tl.fromTo(fig, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, t);
        if (text) slide.tl.from(text, { opacity: 0, y: 12, rotation: -5, duration: 0.7, ease: 'back.out(2)' }, t);
        paths.forEach((p, i) => slide.tl.add(FX.draw(p, { duration: i ? 0.3 : 0.7 }), t + 0.25 + i * 0.6));
      },
      spawn: (id, opts) => {
        const old = slide.bots.get(id);
        if (old) Bots.remove(old.id, false);
        const b = Bots.create(slide.key + ':' + id, opts);
        slide.bots.set(id, b);
        return b;
      },
      bot: (id) => slide.bots.get(id) || null,
      bots: () => [main].concat(Array.from(slide.bots.values())),
      cursor: (opt) => FX.cursor(overlay, opt),
      ripple: (x, y) => { if (!fieldOk) return; const v = toView(x, y); Field.ripple(v.x, v.y); },
      burst: (x, y, opt) => { if (!reduce) FX.Particles.burst(x, y, opt); },
      stream: (ax, ay, bx, by, opt) => { if (!reduce) FX.Particles.stream(ax, ay, bx, by, opt); },
      cls: (node, name) => {
        if (!node) return;
        node.classList.add(name);
        slide.disposers.push(() => node.classList.remove(name));
      },
      shake: (amt) => {
        if (reduce) return;
        const a = amt || 7;
        gsap.fromTo(el, { x: 0 }, { x: a, duration: 0.045, repeat: 5, yoyo: true, ease: 'sine.inOut', clearProps: 'x' });
      },
      connect: (svg, fromName, toNames) => {
        if (!svg) return;
        const box = pointOf(svg);
        const left = box.x - box.w / 2, top = box.y - box.h / 2;
        svg.setAttribute('viewBox', `0 0 ${box.w.toFixed(1)} ${box.h.toFixed(1)}`);
        const a = slide.anchors[fromName];
        if (!a) return;
        slide.disposers.push(() => { svg.innerHTML = ''; svg.removeAttribute('viewBox'); });
        toNames.forEach((name, i) => {
          const b = slide.anchors[name];
          if (!b) return;
          const x1 = a.x - left, y1 = a.y - top + a.h * 0.5 + 18;
          const x2 = b.x - left, y2 = b.y - top - b.h * 0.5 - 16;
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', x1); line.setAttribute('y1', y1); line.setAttribute('x2', x1); line.setAttribute('y2', y1);
          svg.appendChild(line);
          gsap.to(line, { attr: { x2: x2, y2: y2 }, duration: 0.7, delay: i * 0.08, ease: 'power3.out' });
        });
      },
    };
    return S;
  }

  // A slide whose content is taller or wider than its box (the reel's safe area, a font that
  // arrived late, an unusual window) is scaled down around its centre instead of spilling under the
  // chrome or the rail. Measured before anchors, so the bots stand where the scaled content is.
  function fitSlide(el) {
    const fit = el.firstElementChild;
    if (!fit) return;
    fit.style.transform = '';
    const cs = getComputedStyle(el);
    const s = state.scale || 1;
    const sr = el.getBoundingClientRect();
    const top = sr.top + parseFloat(cs.paddingTop) * s;
    const bottom = sr.bottom - parseFloat(cs.paddingBottom) * s;
    const left = sr.left + parseFloat(cs.paddingLeft) * s;
    const right = sr.right - parseFloat(cs.paddingRight) * s;
    let lo = Infinity, hi = -Infinity, l = Infinity, r = -Infinity;
    Array.from(fit.children).concat(Array.from(fit.querySelectorAll('.hand'))).forEach((c) => {
      const b = c.getBoundingClientRect();
      if (!b.width || !b.height) return;
      lo = Math.min(lo, b.top); hi = Math.max(hi, b.bottom); l = Math.min(l, b.left); r = Math.max(r, b.right);
    });
    if (!isFinite(lo)) return;
    const m = 6 * s;
    let k = Math.min(1, (bottom - top - 2 * m) / Math.max(1, hi - lo), (right - left - 2 * m) / Math.max(1, r - l));
    // Scale around the container's centre, then nudge whatever still hangs outside back in.
    const fr = fit.getBoundingClientRect();
    const cx = (fr.left + fr.right) / 2, cy = (fr.top + fr.bottom) / 2;
    const t2 = cy + (lo - cy) * k, b2 = cy + (hi - cy) * k, l2 = cx + (l - cx) * k, r2 = cx + (r - cx) * k;
    let dy = 0, dx = 0;
    if (b2 > bottom - m) dy = bottom - m - b2;
    if (t2 + dy < top + m) dy = top + m - t2;
    if (r2 > right - m) dx = right - m - r2;
    if (l2 + dx < left + m) dx = left + m - l2;
    if (k < 0.995 || Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      fit.style.transformOrigin = '50% 50%';
      fit.style.transform = `translate(${(dx / s).toFixed(1)}px, ${(dy / s).toFixed(1)}px) scale(${k.toFixed(4)})`;
    }
  }

  // ── enter / leave ────────────────────────────────────────────────────────────────────────────
  function enter(n, dir, o) {
    o = o || {};
    const el = slideEls[n];
    const key = el.dataset.key;
    const def = DEF[key] || {};
    const lv = leaving.get(n);
    if (lv) lv.finish();
    state.i = n;
    el.classList.add('is-active');
    el.removeAttribute('aria-hidden');
    if ('inert' in el) el.inert = false;
    stage.dataset.slide = key;
    setChrome(def.section || '');
    setRail(n, o.first || o.instant);
    if (liveRegion && !o.first) liveRegion.textContent = el.getAttribute('aria-label') || '';
    if (MODE !== 'reel') {
      try { history.replaceState(null, '', '#' + key); } catch (e) { /* a sandboxed frame may refuse; the deck works without it */ }
    }

    fitSlide(el);
    const slide = { idx: n, el: el, key: key, def: def, disposers: [], bots: new Map(), keep: [], alive: true, anchors: {} };
    slide.quiet = Array.from(el.querySelectorAll('[data-quiet]'));
    el.querySelectorAll('[data-anchor]').forEach((a) => { slide.anchors[a.dataset.anchor] = pointOf(a); });
    active = slide;

    if (fieldOk) {
      Field.setStage(def.field || CALM);
      Field.setWordsFill(def.fill || 'Grok');
      Field.setMask(def.mask ? el.querySelector(def.mask) : null);
      if (!o.first && !o.instant) Field.kick(dir);
    }
    if (!o.first && !o.instant && !reduce) FX.Particles.sweep(dir);

    // The bot hops to its mark on the new slide.
    const m = def.main || {};
    const a = slide.anchors[m.anchor || 'main'];
    main.normalize();
    if (o.first) main.bodyAlpha = 0;
    if (a) {
      const size = a.w * (m.size || 1);
      if (o.first || o.instant || reduce) main.place(a.x, a.y, size);
      else {
        main.goTo(a.x, a.y, size, {
          hop: true,
          onLand: () => {
            if (active !== slide) return;
            if (MODE === 'reel') reel.cues.push({ type: 'land', i: n, t: performance.now() });
            if (fieldOk) { const c = main.center(); const v = toView(c.x, c.y + c.r); Field.ripple(v.x, v.y); }
          },
        });
      }
    }
    main.setShape(m.shape || 'circle', { instant: !!o.first });
    main.setTone(m.tone || 'ink');
    main.setMood(m.mood || 'idle');
    main.look(null);
    main.work(false);
    main.walk(false);
    main.setPing(false);
    main.setStar(false);
    // Opened straight onto a later slide: the bot still builds itself out of the noise.
    if (o.first && key !== 'cover') main.assemble({ duration: 1.2 });
    if (!o.first && fieldOk) { const c = main.center(); const v = toView(c.x, c.y); Field.ripple(v.x, v.y); }

    const S = makeS(slide, o);
    FX.ctx = slide;
    slide.ctx = gsap.context(() => {
      slide.tl = gsap.timeline();
      S.tl = slide.tl;
      try { if (def.enter) def.enter(S); } catch (err) { console.error('[deck] ' + key, err); }
    });
    FX.ctx = null;
    if (reduce || o.instant) slide.tl.progress(1);
    if (MODE === 'reel') scheduleReel(slide);
  }

  // ── reel: each slide stays up for its choreography plus the time it takes to read it ──────────
  const READ_SEL = '.h2, .lead, .display, .body, .body-sm, .plain, .term, .statement, .check-text, .rule-list li, .stair-title, .stair-body, .plans-note, .plan-line, .msg .what, .bullets li, .block-title, .rung p, .news, .quote, .tie, .reality, .misses li, .hand__text';
  // `cues` is the sound track's score: when each slide came in and when the bot landed on it, in
  // (virtual) milliseconds; scripts/render-grok-reel.mjs turns them into frame times.
  const reel = { timer: null, done: false, log: [], cues: [] };
  window.__reel = reel;
  function scheduleReel(slide) {
    if (reel.timer) reel.timer.kill();
    reel.cues.push({ type: 'slide', i: slide.idx, key: slide.key, t: performance.now() });
    const words = Array.from(slide.el.querySelectorAll(READ_SEL)).reduce((n, el) => n + (el.textContent.trim().split(/\s+/).filter(Boolean).length), 0);
    const show = slide.tl.duration();
    const last = slide.idx === slideEls.length - 1;
    let dur = Math.max(show + 1.4, words / 3.1 + 1.8);
    dur = Math.min(slide.key === 'cover' ? 7.2 : 10.4, Math.max(slide.key === 'cover' ? 6.4 : 6.5, dur));
    if (last) dur += 1.6;
    reel.log.push({ key: slide.key, words: words, show: +show.toFixed(2), dur: +dur.toFixed(2) });
    reel.timer = gsap.delayedCall(dur, () => {
      if (last) { reel.done = true; return; }
      go(slide.idx + 1, { force: true });
    });
  }

  function leave(slide, dir, instant) {
    if (!slide) return;
    slide.alive = false;
    const el = slide.el;
    el.classList.remove('is-active');
    el.classList.add('is-leaving');
    el.setAttribute('aria-hidden', 'true');
    if ('inert' in el) el.inert = true;
    slide.bots.forEach((b) => Bots.remove(b.id, !instant && !reduce));
    slide.bots.clear();
    let done = false;
    let tween = null;
    const finish = () => {
      if (done) return;
      done = true;
      if (tween) tween.kill();
      slide.keep.forEach((t) => { if (t && t.kill) t.kill(); });
      try { if (slide.ctx) slide.ctx.revert(); } catch (e) { console.error('[deck] revert', e); }
      slide.disposers.splice(0).reverse().forEach((fn) => { try { fn(); } catch (e) { /* keep cleaning */ } });
      el.querySelectorAll('.is-glyph-live').forEach((x) => x.classList.remove('is-glyph-live'));
      el.classList.remove('is-leaving');
      gsap.set(el, { clearProps: 'opacity,transform' });
      leaving.delete(slide.idx);
    };
    if (instant || reduce) { finish(); return; }
    if (slide.tl) slide.tl.pause();
    leaving.set(slide.idx, { finish: finish });
    tween = gsap.to(el, { opacity: 0, y: -18 * dir, duration: 0.34, ease: 'power2.in', onComplete: finish });
  }

  function go(n, o) {
    o = o || {};
    n = Math.max(0, Math.min(slideEls.length - 1, n));
    if (n === state.i && !o.force) return;
    const now = performance.now();
    if (!o.force && now - state.lastNav < 130) return;
    state.lastNav = now;
    const dir = n >= state.i ? 1 : -1;
    const cur = active;
    active = null;
    if (cur) leave(cur, dir, o.instant);
    enter(n, dir, o);
  }
  const next = () => go(state.i + 1);
  const prev = () => go(state.i - 1);

  function refresh() {
    if (!active) return;
    const i = state.i;
    const cur = active;
    active = null;
    leave(cur, 1, true);
    state.i = -1;
    enter(i, 1, { instant: true });
  }

  // ── input ────────────────────────────────────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    const onButton = e.target && e.target.closest && e.target.closest('button');
    if ((k === ' ' || k === 'Enter') && onButton) return;
    if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ' || k === 'Enter') { e.preventDefault(); next(); }
    else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') { e.preventDefault(); prev(); }
    else if (k === 'Home') { e.preventDefault(); go(0); }
    else if (k === 'End') { e.preventDefault(); go(slideEls.length - 1); }
    else if (e.code === 'KeyF') { e.preventDefault(); toggleFS(); }
  });

  stage.addEventListener('click', (e) => {
    if (performance.now() - state.swipedAt < 450) return;
    const act = e.target.closest('[data-action]');
    if (act) {
      const a = act.dataset.action;
      if (a === 'next') next();
      else if (a === 'prev') prev();
      else if (a === 'fullscreen') toggleFS();
      return;
    }
    const track = e.target.closest('.rail-track');
    if (track) {
      const r = track.getBoundingClientRect();
      const pct = Math.min(1, Math.max(0, (r.right - e.clientX) / Math.max(1, r.width)));
      go(Math.round(pct * (slideEls.length - 1)));
      return;
    }
    if (e.target.closest('.rail, a, button')) return;
    next();
  });

  let tx0 = null, ty0 = 0;
  stage.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; tx0 = t.clientX; ty0 = t.clientY; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (tx0 == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - tx0, dy = t.clientY - ty0;
    tx0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      state.swipedAt = performance.now();
      if (dx < 0) next(); else prev();
    }
  }, { passive: true });

  let uiTimer = 0;
  function pokeUI() {
    stage.classList.add('show-ui');
    html.classList.remove('hide-cursor');
    clearTimeout(uiTimer);
    uiTimer = setTimeout(() => {
      stage.classList.remove('show-ui');
      if (document.fullscreenElement) html.classList.add('hide-cursor');
    }, 2600);
  }
  window.addEventListener('pointermove', pokeUI, { passive: true });
  window.addEventListener('pointerdown', pokeUI, { passive: true });

  let wake = null;
  function requestWake() {
    if (!document.fullscreenElement || wake || !navigator.wakeLock) return;
    navigator.wakeLock.request('screen').then((w) => { wake = w; w.addEventListener('release', () => { wake = null; }); }).catch(() => { wake = null; });
  }
  function toggleFS() {
    try {
      if (!document.fullscreenElement) {
        const p = html.requestFullscreen ? html.requestFullscreen() : null;
        if (p && p.catch) p.catch(() => {});
      } else if (document.exitFullscreen) {
        const p = document.exitFullscreen();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) { /* fullscreen is optional */ }
  }
  document.addEventListener('fullscreenchange', () => { requestWake(); if (!document.fullscreenElement) html.classList.remove('hide-cursor'); });

  window.addEventListener('hashchange', () => {
    const n = keys.indexOf((location.hash || '').replace('#', ''));
    if (n >= 0 && n !== state.i) go(n, { force: true });
  });

  let rzTimer = 0;
  window.addEventListener('resize', () => {
    const changed = layout();
    setRail(Math.max(0, state.i), true);
    if (changed) { clearTimeout(rzTimer); rzTimer = setTimeout(refresh, 140); }
  });

  // ── boot ─────────────────────────────────────────────────────────────────────────────────────
  function fontsReady() {
    const f = document.fonts;
    if (!f || !f.load) return Promise.resolve();
    // Only the faces the first frame measures; the rest arrive while the cover plays.
    const critical = [
      f.load('400 54px "Rubik Lines"', 'אבג Grok'),
      f.load('900 condensed 100px "Noto Sans Hebrew"', 'Grok אב'),
      f.load('400 31px Heebo', 'אב'),
      f.load('700 19px Cousine', 'אבAB'),
    ];
    ['800 condensed 40px "Noto Sans Hebrew"', '500 28px Heebo', '700 28px Heebo', '400 19px Cousine', '600 36px "Playpen Sans Hebrew"']
      .forEach((d) => f.load(d, 'אבAB').catch(() => undefined));
    return Promise.race([Promise.all(critical).catch(() => undefined), new Promise((r) => setTimeout(r, 1500))]);
  }

  let last = performance.now();
  let frames = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (!visible) { last = now; return; }
    frames++;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (fieldOk) Field.frame(now, dt);
    Bots.frame(now, dt);
    FX.Particles.frame(now);
  }
  // A page opened without animation frames (a background tab, a thumbnail capture) must still
  // show a complete slide: if frames have not started, jump the slide and the bots to their end.
  function watchdog() {
    if (frames > 2 || !active) return;
    if (active.tl) active.tl.progress(1);
    Bots.frame(performance.now(), 1 / 30);
    Bots.list.forEach((b) => { b.bodyAlpha = 1; b.alpha = 1; b.pop.x = b.pop.t = 1; b.render(performance.now(), 0); });
  }

  let visible = true;
  function watchVisibility(onFirst) {
    if (!('IntersectionObserver' in window)) { onFirst(); return; }
    let first = true;
    const io = new IntersectionObserver((entries) => {
      const on = entries.some((e) => e.isIntersecting);
      visible = on;
      if (on) gsap.ticker.wake();
      else gsap.ticker.sleep();
      if (on && first) { first = false; onFirst(); }
    }, { threshold: 0.12 });
    io.observe(stage);
  }

  function start() {
    FX.makeGlyphTexture();
    if (fieldOk) Field.fontsReady();
    // Faces that arrive after the first frame redraw the glyph atlas and the button texture.
    if (document.fonts && document.fonts.addEventListener) {
      document.fonts.addEventListener('loadingdone', () => { FX.makeGlyphTexture(); if (fieldOk) Field.fontsReady(); });
    }
    const fromHash = MODE === 'reel' ? -1 : keys.indexOf((location.hash || '').replace('#', ''));
    const begin = () => {
      try {
        go(fromHash >= 0 ? fromHash : 0, { first: true, force: true });
      } finally {
        html.classList.remove('is-booting');
        clearTimeout(window.__bootFallback);
      }
      if (MODE !== 'reel') pokeUI();
      requestAnimationFrame(loop);
      setTimeout(watchdog, 1800);
    };
    if (MODE === 'embed') {
      const hint = stage.querySelector('.hint');
      if (hint) hint.textContent = 'לחיצה על השקף מעבירה הלאה';
      watchVisibility(begin);
    } else begin();
  }

  function boot() {
    layout();
    FX.reduce = reduce;
    FX.Particles.init(document.getElementById('fxCanvas'));
    FX.Particles.resize(state.W, state.H, state.scale);
    Bots.init(document.getElementById('botsLayer'), { reduce: reduce, pointOf: pointOf });
    Bots.onReact = (b) => {
      const c = b.center();
      if (fieldOk) { const v = toView(c.x, c.y); Field.ripple(v.x, v.y); }
      if (!reduce) FX.Particles.burst(c.x, c.y - c.r * 0.3, { count: 14, speed: Math.max(80, c.r * 1.4) });
    };
    main = Bots.create('main', { x: state.W * 0.25, y: state.H * 0.5, size: 300, hidden: true });
    if (Field) {
      Field.getScale = () => state.scale;
      if (MODE === 'reel') Field.cellScale = 1.5;
      fieldOk = Field.init(document.getElementById('fieldCanvas'), document.getElementById('fieldLayer'), { touch: touch, reduce: reduce });
      Field.lensProvider = () => {
        if (!main) return null;
        const c = main.center();
        const v = toView(c.x, c.y);
        return { x: v.x, y: v.y, on: 0.85 };
      };
      Field.quietProvider = () => (active ? active.quiet.map((q) => q.getBoundingClientRect()) : []);
      Field.onHeadline = (node, live) => {
        if (!node) return;
        if (live) node.classList.add('is-glyph-live');
        else if (!node.closest('.is-leaving')) node.classList.remove('is-glyph-live');
      };
    }
    fontsReady().then(start, start);
  }

  window.Deck = { go: go, next: next, prev: prev, state: state };
  boot();
})();
