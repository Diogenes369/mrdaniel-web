/* The deck's sounds. One set of recipes, played two ways:
 *  - live on the page: a Web Audio context opened by the visitor's first click or key (browsers
 *    allow no sound before that), each sound played the moment the deck does the thing it belongs
 *    to. No music on the page, only the sounds of what happens.
 *  - offline for the Instagram reel: in reel mode every sound is recorded as a cue instead, and
 *    scripts/reel-score.js renders the same recipes at those times, under the reel's music.
 *
 * The palette stays low and warm: noise kept under ~2 kHz, sines and soft mallets in D major
 * pentatonic (the reel's key), nothing piercing and nothing longer than it needs to be. The deck
 * calls GrokSFX.emit(name, opts); the recipes below decide how each one sounds.
 */
(function () {
  'use strict';

  const SFX = { enabled: true, recorder: null };
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // D major pentatonic, D3 to A5.
  const N = { D3: hz(50), E3: hz(52), Fs3: hz(54), A3: hz(57), B3: hz(59), D4: hz(62), E4: hz(64), Fs4: hz(66), A4: hz(69), B4: hz(71), D5: hz(74), E5: hz(76), Fs5: hz(78), A5: hz(81) };
  const PENTA = [N.D4, N.E4, N.Fs4, N.A4, N.B4, N.D5];

  /** Seeded from the cue's own time, so an offline render is the same every time. */
  function rng(seed) {
    let s = (Math.floor(seed * 100003) ^ 0x9e3779b9) >>> 0 || 1;
    return () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  const noiseCache = new WeakMap();
  function noise(ctx) {
    let b = noiseCache.get(ctx);
    if (!b) {
      const len = Math.floor(ctx.sampleRate * 2);
      b = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = b.getChannelData(0);
      const r = rng(7);
      for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
      noiseCache.set(ctx, b);
    }
    return b;
  }

  /** Gain that rises to `peak` over `a` and dies away over `d` (exponentially, like a struck thing). */
  function env(ctx, t, a, d, peak) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    return g;
  }

  function route(ctx, out, node, t, o) {
    let n = node;
    if (o.pan || o.pan1 != null) {
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(o.pan || 0, t);
      if (o.pan1 != null) p.pan.linearRampToValueAtTime(o.pan1, t + (o.a || 0) + (o.d || 0));
      n.connect(p);
      n = p;
    }
    n.connect(out.dry);
    if (o.send) {
      const s = ctx.createGain();
      s.gain.value = o.send;
      n.connect(s);
      s.connect(out.wet);
    }
  }

  /** An oscillator with a pitch glide and a struck envelope. */
  function tone(ctx, out, t, o) {
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide || o.d || 0.1));
    const a = o.a || 0.004;
    const d = o.d || 0.2;
    const g = env(ctx, t, a, d, o.gain || 0.1);
    let n = osc;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      f.Q.value = 0.5;
      n.connect(f);
      n = f;
    }
    n.connect(g);
    route(ctx, out, g, t, o);
    osc.start(t);
    osc.stop(t + a + d + 0.05);
  }

  /** Filtered noise; `fr` is [[time, hz], ...] for the filter's path. */
  function hiss(ctx, out, t, o) {
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.Q.value = o.q || 1;
    const fr = o.fr || [[0, 1000]];
    f.frequency.setValueAtTime(fr[0][1], t + fr[0][0]);
    for (let i = 1; i < fr.length; i++) f.frequency.exponentialRampToValueAtTime(fr[i][1], t + fr[i][0]);
    const a = o.a || 0.002;
    const d = o.d || 0.05;
    const g = env(ctx, t, a, d, o.gain || 0.1);
    src.connect(f);
    f.connect(g);
    route(ctx, out, g, t, o);
    const off = (t * 7.31) % 1.6;
    src.start(t, off);
    src.stop(t + a + d + 0.05);
  }

  /** A soft mallet: the note, plus its fourth partial for a moment, for the wood. */
  function mallet(ctx, out, t, f, gain, pan, send) {
    tone(ctx, out, t, { f: f, a: 0.004, d: 0.5, gain: gain, pan: pan, send: send == null ? 0.25 : send });
    tone(ctx, out, t, { f: f * 4, a: 0.002, d: 0.045, gain: gain * 0.2, pan: pan });
  }

  // ── recipes ──────────────────────────────────────────────────────────────────────────────────
  // (ctx, out, t, o): `out` is { dry, wet }, `t` the start in the context's time, `o` the cue's data.
  const R = {
    // A slide change: low air moving right to left (the reading direction), and a soft weight under
    // it. Low-passed throughout, so there is no hiss.
    swap(ctx, out, t, o) {
      const dir = o.dir || 1;
      hiss(ctx, out, t, { type: 'lowpass', q: 0.7, fr: [[0, 180], [0.16, 900], [0.55, 240]], a: 0.15, d: 0.42, gain: 0.11, pan: 0.4 * dir, pan1: -0.4 * dir, send: 0.2 });
      tone(ctx, out, t + 0.03, { f: 110, f1: 50, glide: 0.22, a: 0.008, d: 0.3, gain: 0.08 });
    },
    // The cursor clicking: a press and a release, the way a mouse button sounds.
    click(ctx, out, t) {
      const press = (tt, g) => {
        hiss(ctx, out, tt, { type: 'bandpass', q: 1.6, fr: [[0, 1700]], a: 0.0008, d: 0.014, gain: g });
        tone(ctx, out, tt, { f: 260, a: 0.001, d: 0.02, gain: g * 0.3 });
      };
      press(t, 0.34);
      press(t + 0.075, 0.17);
    },
    // Keys under a typed line: soft ticks, as many as the line is long (up to ~24 a second).
    type(ctx, out, t, o) {
      const dur = Math.max(0.12, o.dur || 0.5);
      const n = Math.max(2, Math.min(o.n || 10, Math.round(dur * 24)));
      const r = rng(t);
      for (let k = 0; k < n; k++) {
        const tt = t + (k / n) * dur + (r() - 0.5) * 0.008;
        hiss(ctx, out, tt, { type: 'bandpass', q: 1.3, fr: [[0, 1150 + r() * 650]], a: 0.0008, d: 0.012, gain: 0.05 + r() * 0.03, pan: (r() - 0.5) * 0.3 });
        if (k % 5 === 0) tone(ctx, out, tt, { f: 300, a: 0.001, d: 0.018, gain: 0.025 });
      }
    },
    // A label resolving out of noise: a few quiet notes scattered over the decode.
    decode(ctx, out, t, o) {
      const dur = Math.min(0.9, Math.max(0.3, o.dur || 0.6));
      const r = rng(t);
      for (let k = 0; k < 6; k++) {
        tone(ctx, out, t + (k / 6) * dur, { f: PENTA[Math.floor(r() * PENTA.length)], type: 'triangle', a: 0.002, d: 0.06, gain: 0.03, pan: (r() - 0.5) * 0.5, lp: 1800 });
      }
    },
    // A small puff of glyphs.
    burst(ctx, out, t, o) {
      const k = Math.min(1, (o.count || 16) / 24);
      hiss(ctx, out, t, { type: 'lowpass', q: 0.6, fr: [[0, 1100], [0.12, 300]], a: 0.004, d: 0.13, gain: 0.06 + k * 0.05, send: 0.15 });
      tone(ctx, out, t, { f: 360, f1: 210, glide: 0.08, a: 0.004, d: 0.09, gain: 0.05 + k * 0.04 });
    },
    // A message travelling between bots: three quick rising notes.
    stream(ctx, out, t) {
      [N.D4, N.Fs4, N.A4].forEach((f, i) => tone(ctx, out, t + i * 0.055, { f: f, a: 0.002, d: 0.08, gain: 0.06, pan: 0.3 - i * 0.3, send: 0.2 }));
    },
    // Glyphs flying in to become something: grains rising, then the thing settling.
    assemble(ctx, out, t, o) {
      const dur = Math.max(0.6, o.dur || 1.4);
      const r = rng(t);
      for (let k = 0; k < 14; k++) {
        const f = Math.pow(k / 14, 1.3);
        tone(ctx, out, t + dur * f * 0.85, { f: PENTA[Math.min(PENTA.length - 1, Math.floor(f * PENTA.length))] * (r() < 0.5 ? 0.5 : 1), type: 'triangle', a: 0.002, d: 0.07, gain: 0.02 + f * 0.02, pan: (r() - 0.5) * 0.7, lp: 1600 });
      }
      hiss(ctx, out, t, { type: 'lowpass', q: 0.7, fr: [[0, 260], [dur, 1300]], a: dur * 0.9, d: 0.2, gain: 0.04 });
      mallet(ctx, out, t + dur, N.D4, 0.055, 0, 0.35);
      mallet(ctx, out, t + dur + 0.02, N.A4, 0.04, 0, 0.35);
    },
    // The bot taking off: a little rising "bloop". Smaller bots sound smaller.
    hop(ctx, out, t, o) {
      const k = sizeK(o);
      tone(ctx, out, t, { f: 230 * k.pitch, f1: 450 * k.pitch, glide: 0.11, a: 0.012, d: 0.13, gain: (o.small ? 0.055 : 0.075) * k.gain, send: 0.1 });
    },
    // ...and touching down: a short wooden knock.
    land(ctx, out, t, o) {
      const k = sizeK(o);
      tone(ctx, out, t, { f: 300 * k.pitch, f1: 175 * k.pitch, glide: 0.016, a: 0.004, d: 0.08, gain: (o.small ? 0.05 : 0.065) * k.gain });
      tone(ctx, out, t, { f: 483 * k.pitch, a: 0.001, d: 0.03, gain: 0.03 * k.gain });
      hiss(ctx, out, t, { type: 'lowpass', q: 0.6, fr: [[0, 1200]], a: 0.001, d: 0.022, gain: 0.03 * k.gain });
    },
    // A change of shape: a soft rubbery wobble in pitch.
    morph(ctx, out, t) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(196, t);
      osc.frequency.exponentialRampToValueAtTime(330, t + 0.14);
      osc.frequency.exponentialRampToValueAtTime(247, t + 0.32);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1000;
      const g = env(ctx, t, 0.03, 0.32, 0.06);
      osc.connect(f);
      f.connect(g);
      route(ctx, out, g, t, { send: 0.15 });
      osc.start(t);
      osc.stop(t + 0.4);
    },
    // Asking for attention (the approval card, the team's question): a two-note notification.
    ping(ctx, out, t) {
      mallet(ctx, out, t, N.E5, 0.075, 0.15, 0.3);
      mallet(ctx, out, t + 0.12, N.A4, 0.07, -0.15, 0.3);
    },
    star(ctx, out, t) {
      [N.A4, N.D5, N.Fs5].forEach((f, i) => mallet(ctx, out, t + i * 0.075, f, 0.055, 0.3 - i * 0.3, 0.35));
    },
    // A bot appearing: a small bubble.
    pop(ctx, out, t, o) {
      const k = sizeK(o);
      const r = rng(t);
      const p = 0.88 + r() * 0.24;
      tone(ctx, out, t, { f: 480 * p * k.pitch, f1: 700 * p * k.pitch, glide: 0.04, a: 0.004, d: 0.06, gain: 0.05 * k.gain });
    },
    surprise(ctx, out, t) {
      tone(ctx, out, t, { f: 320, f1: 600, glide: 0.12, a: 0.012, d: 0.12, gain: 0.06 });
    },
    sad(ctx, out, t) {
      tone(ctx, out, t, { f: 370, f1: 247, glide: 0.34, type: 'triangle', a: 0.02, d: 0.36, gain: 0.05, lp: 900 });
    },
    wince(ctx, out, t) {
      tone(ctx, out, t, { f: 170, f1: 100, glide: 0.12, a: 0.006, d: 0.14, gain: 0.07 });
      hiss(ctx, out, t, { type: 'lowpass', fr: [[0, 500]], a: 0.002, d: 0.06, gain: 0.04 });
    },
    wave(ctx, out, t) {
      [N.D5, N.B4, N.D5].forEach((f, i) => mallet(ctx, out, t + i * 0.13, f, 0.05, 0.2 - i * 0.2, 0.25));
    },
    // A rubber stamp landing: a thud and paper, then the verdict in two notes.
    stamp(ctx, out, t, o) {
      tone(ctx, out, t, { f: 100, f1: 45, glide: 0.2, a: 0.004, d: 0.28, gain: 0.11 });
      hiss(ctx, out, t, { type: 'bandpass', q: 0.9, fr: [[0, 650]], a: 0.002, d: 0.09, gain: 0.12 });
      if (o.kind === 'pass') {
        mallet(ctx, out, t + 0.12, N.D4, 0.08, 0.1, 0.3);
        mallet(ctx, out, t + 0.21, N.A4, 0.08, -0.1, 0.3);
      } else {
        tone(ctx, out, t + 0.1, { f: N.E3, type: 'triangle', a: 0.004, d: 0.22, gain: 0.07, lp: 700 });
        tone(ctx, out, t + 0.28, { f: N.D3, type: 'triangle', a: 0.004, d: 0.34, gain: 0.07, lp: 700 });
      }
    },
    check(ctx, out, t) {
      hiss(ctx, out, t, { type: 'bandpass', q: 1.4, fr: [[0, 1500]], a: 0.0008, d: 0.01, gain: 0.05 });
      mallet(ctx, out, t, N.Fs4, 0.065, 0.1, 0.2);
      mallet(ctx, out, t + 0.07, N.A4, 0.065, -0.1, 0.2);
    },
    // The approval went out: air lifting away and a bright little "done".
    sent(ctx, out, t) {
      hiss(ctx, out, t, { type: 'bandpass', q: 1.1, fr: [[0, 450], [0.3, 1300]], a: 0.12, d: 0.2, gain: 0.04, pan: 0.3, pan1: -0.3 });
      mallet(ctx, out, t + 0.08, N.A4, 0.075, 0, 0.35);
      mallet(ctx, out, t + 0.17, N.D5, 0.075, 0, 0.35);
    },
    save(ctx, out, t) {
      [N.D4, N.Fs4, N.A4].forEach((f, i) => mallet(ctx, out, t + i * 0.08, f, 0.065, 0, 0.3));
    },
    fail(ctx, out, t) {
      tone(ctx, out, t, { f: N.E3, type: 'triangle', a: 0.004, d: 0.17, gain: 0.08, lp: 700 });
      tone(ctx, out, t + 0.16, { f: N.D3, type: 'triangle', a: 0.004, d: 0.3, gain: 0.08, lp: 700 });
    },
    pass(ctx, out, t) {
      [N.D4, N.A4, N.D5].forEach((f, i) => mallet(ctx, out, t + i * 0.09, f, 0.07, 0.2 - i * 0.2, 0.3));
    },
    // The price doubling: a low two-tone, twice.
    alert(ctx, out, t) {
      [0, 0.38].forEach((d0, j) => {
        tone(ctx, out, t + d0, { f: N.A3, type: 'triangle', a: 0.004, d: 0.12, gain: j ? 0.04 : 0.06, lp: 1000 });
        tone(ctx, out, t + d0 + 0.15, { f: hz(53), type: 'triangle', a: 0.004, d: 0.18, gain: j ? 0.04 : 0.06, lp: 1000 });
      });
      tone(ctx, out, t, { f: 90, f1: 45, glide: 0.2, a: 0.002, d: 0.25, gain: 0.07 });
    },
    relief(ctx, out, t) {
      mallet(ctx, out, t, N.A3, 0.065, 0, 0.25);
      mallet(ctx, out, t + 0.09, N.D4, 0.065, 0, 0.25);
    },
    // A counter climbing: ticks closing in, over a quiet rising tone.
    fill(ctx, out, t, o) {
      const dur = Math.max(0.5, o.dur || 3);
      const n = Math.round(dur * 9);
      for (let k = 0; k < n; k++) {
        const x = k / n;
        hiss(ctx, out, t + dur * Math.pow(x, 0.62), { type: 'bandpass', q: 1.3, fr: [[0, 900 + 600 * x]], a: 0.0008, d: 0.01, gain: 0.03 + 0.03 * x });
      }
      tone(ctx, out, t, { f: N.D3, f1: N.D4, glide: dur, type: 'triangle', a: dur * 0.6, d: dur * 0.5, gain: 0.025, lp: 600 });
    },
    // The reviewer reading the page: a soft scanning hum.
    scan(ctx, out, t, o) {
      const dur = Math.max(0.4, o.dur || 1.3);
      hiss(ctx, out, t, { type: 'bandpass', q: 3, fr: [[0, 500], [dur, 1100]], a: 0.15, d: dur, gain: 0.02 });
      tone(ctx, out, t, { f: N.A3, a: 0.15, d: dur, gain: 0.01 });
    },
    // A sheet of paper landing in the tray.
    drop(ctx, out, t) {
      const r = rng(t);
      hiss(ctx, out, t, { type: 'bandpass', q: 1, fr: [[0, 900 + r() * 400]], a: 0.001, d: 0.035, gain: 0.045, pan: (r() - 0.5) * 0.4 });
      tone(ctx, out, t, { f: 240 + r() * 40, a: 0.001, d: 0.02, gain: 0.02 });
    },
    shrink(ctx, out, t) {
      tone(ctx, out, t, { f: N.A4, f1: hz(60), glide: 0.6, a: 0.02, d: 0.6, gain: 0.045, lp: 900 });
    },
    whisk(ctx, out, t) {
      hiss(ctx, out, t, { type: 'bandpass', q: 1, fr: [[0, 420], [0.3, 1300]], a: 0.1, d: 0.25, gain: 0.045, pan: -0.3, pan1: 0.3 });
    },
    // The laptop lid closing.
    lid(ctx, out, t) {
      hiss(ctx, out, t, { type: 'lowpass', fr: [[0, 700]], a: 0.003, d: 0.05, gain: 0.07 });
      tone(ctx, out, t, { f: 130, f1: 80, glide: 0.1, a: 0.002, d: 0.1, gain: 0.07 });
    },
    // A routing card thrown to its row.
    toss(ctx, out, t) {
      hiss(ctx, out, t, { type: 'bandpass', q: 1, fr: [[0, 650], [0.25, 1400]], a: 0.05, d: 0.2, gain: 0.035, pan: 0.2, pan1: -0.2 });
    },
    // Climbing a step: a note further up the scale each time.
    step(ctx, out, t, o) {
      const up = [N.D4, N.E4, N.Fs4, N.A4, N.B4, N.D5];
      mallet(ctx, out, t, up[Math.min(up.length - 1, o.i || 0)], 0.065, 0, 0.2);
    },
    // A handwritten note being drawn: a pencil, quietly.
    scribble(ctx, out, t, o) {
      const dur = Math.max(0.3, o.dur || 0.9);
      const r = rng(t);
      for (let k = 0; k < 9; k++) {
        hiss(ctx, out, t + (k / 9) * dur, { type: 'bandpass', q: 2, fr: [[0, 1200 + r() * 500]], a: 0.01, d: 0.05 + r() * 0.04, gain: 0.014 + r() * 0.01 });
      }
    },
    // The writer redoing the page: a soft brush.
    fix(ctx, out, t) {
      hiss(ctx, out, t, { type: 'lowpass', q: 0.7, fr: [[0, 500], [0.2, 1200], [0.45, 400]], a: 0.08, d: 0.35, gain: 0.035 });
    },
  };

  // Each sound's level against the others, measured one by one (2026-10-06): the moments (a stamp,
  // "sent", a pass) sit on top, the bot's own sounds a little under them, and the small UI ticks
  // (keys, paper, a pencil) underneath, still audible.
  const TRIM = {
    swap: 0.72, stamp: 0.62, sent: 0.95, save: 0.88, relief: 1.1, assemble: 1.15, ping: 1.1, wave: 1.1,
    fail: 1.2, check: 1.2, step: 1.2, shrink: 1.35, fill: 1.25, hop: 1.2, land: 1.15, morph: 1.35,
    wince: 1.1, sad: 1.5, surprise: 1.5, lid: 1.4, click: 0.5, type: 2, decode: 1.7, pop: 1.7,
    burst: 0.93, stream: 1.1, drop: 2.1, toss: 3.2, whisk: 2.9, scribble: 2.6, fix: 3, scan: 2,
  };
  function play(name, ctx, out, t, o) {
    const k = TRIM[name];
    if (!k || k === 1) { R[name](ctx, out, t, o); return; }
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    dry.gain.value = wet.gain.value = k;
    dry.connect(out.dry);
    wet.connect(out.wet);
    R[name](ctx, { dry: dry, wet: wet }, t, o);
  }

  /** Bigger bots sound lower and fuller, the small ones higher and lighter. */
  function sizeK(o) {
    const s = o && o.size ? Math.max(0.3, Math.min(1.8, o.size / 180)) : 1;
    return { pitch: Math.max(0.75, Math.min(1.6, 1 / Math.sqrt(s))), gain: 0.55 + 0.45 * Math.min(1, s) };
  }

  // The same thing never needs to sound twice in a few milliseconds, and a crowd of events (eleven
  // bots popping in at once) should read as a cascade, not a pile: a minimum gap per sound and at
  // most four sounds in any 60 ms.
  const GAP = { swap: 0.12, click: 0.03, type: 0.05, decode: 0.3, burst: 0.07, stream: 0.08, assemble: 0.5, hop: 0.05, land: 0.05, morph: 0.15, ping: 0.4, star: 0.4, pop: 0.035, surprise: 0.25, sad: 0.3, wince: 0.2, wave: 0.4, stamp: 0.2, check: 0.08, sent: 0.3, save: 0.3, fail: 0.2, pass: 0.2, alert: 0.4, relief: 0.4, fill: 0.5, scan: 0.5, drop: 0.025, shrink: 0.3, whisk: 0.3, lid: 0.3, toss: 0.1, step: 0.08, scribble: 0.4, fix: 0.3 };
  function gate() {
    const last = {};
    let recent = [];
    return (name, t) => {
      if (last[name] != null && t - last[name] < (GAP[name] || 0.05)) return false;
      recent = recent.filter((x) => t - x < 0.06);
      if (recent.length >= 4) return false;
      recent.push(t);
      last[name] = t;
      return true;
    };
  }

  /** A short dark room for the mallets and the air to sit in. */
  function room(ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      const r = rng(11 + ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const k = i / len;
        lp += (r() * 2 - 1 - lp) * (0.75 - 0.6 * k);
        d[i] = lp * Math.pow(1 - k, 2.4);
      }
    }
    return b;
  }

  /** The sounds' own bus: dry + a room, then a gentle top cut so nothing gets bright. */
  SFX.bus = function (ctx, dest, o) {
    o = o || {};
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const verb = ctx.createConvolver();
    verb.buffer = room(ctx, 1.5);
    const verbOut = ctx.createGain();
    verbOut.gain.value = o.room == null ? 0.3 : o.room;
    const top = ctx.createBiquadFilter();
    top.type = 'lowpass';
    top.frequency.value = o.top || 7000;
    top.Q.value = 0.5;
    wet.connect(verb);
    verb.connect(verbOut);
    dry.connect(top);
    verbOut.connect(top);
    top.connect(dest);
    return { dry: dry, wet: wet };
  };
  SFX.recipes = R;
  SFX.notes = N;
  SFX.gate = gate;
  SFX.tone = tone;
  SFX.hiss = hiss;
  SFX.mallet = mallet;
  SFX.env = env;
  SFX.noise = noise;
  SFX.rng = rng;

  /** Plays a list of cues ({ type, t, ...data }, t in seconds) into any context, through the gate. */
  SFX.schedule = function (ctx, out, cues, offset) {
    const admit = gate();
    cues.slice().sort((a, b) => a.t - b.t).forEach((c) => {
      if (R[c.type] && admit(c.type, c.t)) play(c.type, ctx, out, c.t + (offset || 0), c);
    });
  };

  // ── live ─────────────────────────────────────────────────────────────────────────────────────
  const live = { ctx: null, out: null, admit: gate() };
  try {
    SFX.enabled = localStorage.getItem('grok-deck-sound') !== 'off';
  } catch (e) { /* storage blocked: sound stays on */ }

  /** Called from the first click or key: the only moment a browser lets a page start sound. */
  SFX.unlock = function () {
    if (live.ctx) {
      if (live.ctx.state === 'suspended' && !document.hidden) live.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let ctx;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { return; }
    // On the page the sounds play on their own, without the reel's music and mastering, so they are
    // brought up here; the compressor only catches the rare pile-up of several at once.
    const master = ctx.createGain();
    master.gain.value = 2.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 6;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    master.connect(comp);
    comp.connect(ctx.destination);
    live.ctx = ctx;
    live.out = SFX.bus(ctx, master);
    document.addEventListener('visibilitychange', () => {
      if (!live.ctx) return;
      if (document.hidden) live.ctx.suspend();
      else live.ctx.resume();
    });
  };

  /** 'none' until the first click or key, then the context's own state. */
  SFX.state = function () { return live.ctx ? live.ctx.state : 'none'; };

  SFX.setEnabled = function (on) {
    SFX.enabled = !!on;
    try { localStorage.setItem('grok-deck-sound', on ? 'on' : 'off'); } catch (e) { /* not remembered */ }
  };

  SFX.emit = function (name, o) {
    if (SFX.recorder) { SFX.recorder(name, o || {}); return; }
    const ctx = live.ctx;
    if (!ctx || !SFX.enabled || !R[name] || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (!live.admit(name, now)) return;
    try { play(name, ctx, live.out, now + 0.01, o || {}); } catch (e) { /* a sound never breaks the deck */ }
  };

  window.GrokSFX = SFX;
})();
