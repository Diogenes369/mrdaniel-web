/* The deck's sounds. One set of recipes, played two ways:
 *  - live on the page: a Web Audio context opened by the visitor's first click, tap or key
 *    (browsers allow no sound before that), each sound played the moment the deck does the thing it
 *    belongs to. No music on the page, only the sounds of what happens.
 *  - offline for the Instagram reel: in reel mode every sound is recorded as a cue instead, and
 *    scripts/reel-score.js renders the same recipes at those times, under the reel's music.
 *
 * The palette is foley, not music. What moves on screen is paper, felt, rubber, wood and air, so
 * each sound is what that thing would make, soft and close, in a small room: a card sliding past, a
 * muted mouse button, a beanbag landing, a rubber stamp on a desk, a pen ticking a box. No melodies
 * and no chimes (one felt-struck marimba note is the only pitched thing). Everything sits between
 * ~120 Hz and ~2 kHz: low enough that nothing is shrill, with enough between 300 Hz and 1.5 kHz that
 * a phone speaker, which plays almost nothing under 300 Hz, still carries it. The bus cuts what's
 * above 3.6 kHz, so even a hard strike stays round.
 *
 * The deck calls GrokSFX.emit(name, opts); the recipes below decide how each one sounds. Glyph
 * effects (a label decoding, a puff of particles) are deliberately silent: they happen many times a
 * slide, and a sound for each would turn the deck into noise.
 */
(function () {
  'use strict';

  const SFX = { enabled: true, recorder: null };
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // D major pentatonic, D3 to A5 (the reel's key; scripts/reel-score.js reads it from here).
  const N = { D3: hz(50), E3: hz(52), Fs3: hz(54), A3: hz(57), B3: hz(59), D4: hz(62), E4: hz(64), Fs4: hz(66), A4: hz(69), B4: hz(71), D5: hz(74), E5: hz(76), Fs5: hz(78), A5: hz(81) };

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

  // Pink noise (equal energy per octave, Paul Kellet's filter): air and paper sound like this, and
  // it keeps far less in the top octaves than white noise, so a filtered "hiss" never turns into a
  // shhh.
  const noiseCache = new WeakMap();
  function noise(ctx) {
    let b = noiseCache.get(ctx);
    if (!b) {
      const len = Math.floor(ctx.sampleRate * 2);
      b = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = b.getChannelData(0);
      const r = rng(7);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = r() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
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

  /** An oscillator with a pitch glide and a struck envelope: the body of a thud, a low note. */
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

  /** Filtered noise: air, paper, cloth. `fr` is [[time, hz], ...] for the filter's path. */
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

  /**
   * Something struck: a few milliseconds of soft noise (the strike; `hard` is how hard the thing that
   * hit it was) ringing a set of resonances, [hz, q, level] each (the object). A knuckle on a desk, a
   * key cap, a wood block and a stamp's desk are all this with different modes. Each mode rings for
   * about q / (π·hz) seconds per e-fold, so a high q is wood and a low q is cardboard.
   */
  function knock(ctx, out, t, o) {
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    const ex = ctx.createBiquadFilter();
    ex.type = 'lowpass';
    ex.frequency.value = o.hard || 1500;
    ex.Q.value = 0.5;
    const len = o.ex || 0.004;
    const eg = ctx.createGain();
    eg.gain.setValueAtTime(0, t);
    eg.gain.linearRampToValueAtTime(1, t + 0.0008);
    eg.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(ex);
    ex.connect(eg);
    const sum = ctx.createGain();
    sum.gain.value = o.gain || 0.05;
    (o.modes || []).forEach((m) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = m[0];
      bp.Q.value = m[1];
      // A narrow band lets less of a short strike through (its first swing scales with hz / q), so
      // each mode is brought back up by that much: the levels read as written.
      const g = ctx.createGain();
      g.gain.value = m[2] * (m[1] / m[0]) * 7500;
      eg.connect(bp);
      bp.connect(g);
      g.connect(sum);
    });
    if (o.contact) {
      const c = ctx.createGain();
      c.gain.value = o.contact;
      eg.connect(c);
      c.connect(sum);
    }
    route(ctx, out, sum, t, o);
    src.start(t, (t * 5.17) % 1.6);
    src.stop(t + len + 0.01);
  }

  // ── recipes ──────────────────────────────────────────────────────────────────────────────────
  // (ctx, out, t, o): `out` is { dry, wet }, `t` the start in the context's time, `o` the cue's data.
  const R = {
    // A slide change: a stiff card sliding past, right to left (the reading direction). Air and a
    // little paper grain, no weight under it and nothing bright on top.
    swap(ctx, out, t, o) {
      const dir = o.dir || 1;
      hiss(ctx, out, t, { type: 'bandpass', q: 0.8, fr: [[0, 240], [0.2, 560], [0.5, 280]], a: 0.17, d: 0.36, gain: 0.07, pan: 0.35 * dir, pan1: -0.35 * dir, send: 0.12 });
      hiss(ctx, out, t + 0.06, { type: 'bandpass', q: 1.6, fr: [[0, 880], [0.2, 1200], [0.4, 780]], a: 0.12, d: 0.26, gain: 0.011, pan: 0.25 * dir, pan1: -0.25 * dir });
    },
    // The cursor clicking: a quiet mouse, press and release.
    click(ctx, out, t) {
      const press = (tt, k, up) => knock(ctx, out, tt, { modes: [[860 * up, 10, 1], [1450 * up, 12, 0.3], [410 * up, 6, 0.5]], hard: 1700, ex: 0.003, gain: 0.05 * k, contact: 0.18 });
      press(t, 1, 1);
      press(t + 0.075, 0.6, 1.06);
    },
    // Keys under a typed line: a soft keyboard, about eleven keys a second at most, every sixth a
    // deeper space bar.
    type(ctx, out, t, o) {
      const dur = Math.max(0.12, o.dur || 0.5);
      const n = Math.max(2, Math.min(o.n || 10, Math.round(dur * 11)));
      const r = rng(t);
      for (let k = 0; k < n; k++) {
        const tt = t + (k / n) * dur + (r() - 0.5) * 0.02;
        const space = k % 6 === 5;
        const f = space ? 235 : 330 + r() * 80;
        knock(ctx, out, tt, { modes: [[f, 7, 1], [f * 2.3, 10, 0.4], [1200 + r() * 200, 12, 0.1]], hard: 1500, gain: (space ? 0.05 : 0.04) * (0.75 + r() * 0.35), pan: (r() - 0.5) * 0.3, contact: 0.1 });
      }
    },
    // A message going out in the team chat: a short breath of air, and the soft tap of it landing.
    stream(ctx, out, t) {
      hiss(ctx, out, t, { type: 'bandpass', q: 1, fr: [[0, 360], [0.14, 700]], a: 0.06, d: 0.12, gain: 0.03, pan: 0.2, pan1: -0.2 });
      knock(ctx, out, t + 0.16, { modes: [[620, 9, 1], [1250, 12, 0.25]], hard: 1300, gain: 0.03 });
    },
    // Glyphs pouring in to become the bot: a trickle of sand that thickens and gathers to the
    // middle, then the body settling with a soft pat.
    assemble(ctx, out, t, o) {
      const dur = Math.max(0.6, o.dur || 1.4);
      const r = rng(t);
      const n = 34;
      for (let k = 0; k < n; k++) {
        const x = Math.pow(k / n, 0.7);
        hiss(ctx, out, t + dur * 0.92 * x + r() * 0.02, { type: 'bandpass', q: 1.5, fr: [[0, 520 + r() * 480 + x * 240]], a: 0.002, d: 0.018 + r() * 0.02, gain: 0.006 + 0.016 * x, pan: (r() - 0.5) * (1 - x) * 0.9 });
      }
      hiss(ctx, out, t, { type: 'lowpass', q: 0.7, fr: [[0, 240], [dur, 700]], a: dur * 0.85, d: 0.18, gain: 0.02 });
      R.land(ctx, out, t + dur, { size: 300 });
    },
    // The bot taking off: the soft "fwp" of a small body leaving a surface. Bigger bots sound lower.
    hop(ctx, out, t, o) {
      const k = sizeK(o);
      hiss(ctx, out, t, { type: 'bandpass', q: 1.1, fr: [[0, 320 * k.pitch], [0.12, 640 * k.pitch]], a: 0.03, d: 0.12, gain: (o.small ? 0.022 : 0.032) * k.gain, send: 0.08 });
    },
    // ...and touching down: a beanbag on a table, a low pat with a little give.
    land(ctx, out, t, o) {
      const k = sizeK(o);
      const g = (o.small ? 0.7 : 1) * k.gain;
      tone(ctx, out, t, { f: 150 * k.pitch, f1: 92 * k.pitch, glide: 0.05, a: 0.002, d: 0.08, gain: 0.015 * g });
      hiss(ctx, out, t, { type: 'lowpass', q: 0.7, fr: [[0, 950 * k.pitch], [0.035, 380]], a: 0.001, d: 0.04, gain: 0.08 * g });
      knock(ctx, out, t, { modes: [[360 * k.pitch, 5, 1], [720 * k.pitch, 7, 0.4]], hard: 1000, gain: 0.06 * g });
    },
    // A change of shape: a soft rubber squeeze, two formants sliding up and back.
    morph(ctx, out, t) {
      hiss(ctx, out, t, { type: 'bandpass', q: 3.2, fr: [[0, 360], [0.13, 620], [0.28, 430]], a: 0.05, d: 0.24, gain: 0.03 });
      hiss(ctx, out, t, { type: 'bandpass', q: 3.5, fr: [[0, 880], [0.13, 1250], [0.28, 980]], a: 0.05, d: 0.22, gain: 0.01 });
    },
    // Asking for attention (the approval card, the team's question): two knuckle knocks on a desk.
    ping(ctx, out, t) {
      [0, 0.15].forEach((d, i) => knock(ctx, out, t + d, { modes: [[205, 12, 0.35], [470, 16, 0.8], [930, 18, 0.3]], hard: 1300, gain: i ? 0.085 : 0.1, contact: 0.12, send: 0.15 }));
    },
    // Made the lead bot: one low marimba note, struck with felt.
    star(ctx, out, t) {
      tone(ctx, out, t, { f: N.A3, a: 0.005, d: 0.75, gain: 0.07, send: 0.3 });
      tone(ctx, out, t, { f: N.A3 * 3.93, a: 0.002, d: 0.05, gain: 0.01 });
      knock(ctx, out, t, { modes: [[N.A3 * 2, 18, 1], [N.A3 * 3.93, 22, 0.25]], hard: 1000, gain: 0.06 });
    },
    // A bot appearing: a soft cork leaving a bottle, low.
    pop(ctx, out, t, o) {
      const k = sizeK(o);
      const p = (0.9 + rng(t)() * 0.2) * k.pitch;
      tone(ctx, out, t, { f: 300 * p, f1: 190 * p, glide: 0.035, a: 0.002, d: 0.05, gain: 0.04 * k.gain });
      hiss(ctx, out, t, { type: 'lowpass', q: 0.8, fr: [[0, 1100 * p], [0.02, 500]], a: 0.0008, d: 0.022, gain: 0.025 * k.gain });
    },
    // A flinch: the bot bumping back against nothing in particular.
    wince(ctx, out, t) {
      tone(ctx, out, t, { f: 125, f1: 82, glide: 0.07, a: 0.003, d: 0.09, gain: 0.025 });
      hiss(ctx, out, t, { type: 'lowpass', q: 0.7, fr: [[0, 700]], a: 0.002, d: 0.04, gain: 0.04 });
      knock(ctx, out, t, { modes: [[330, 5, 1]], hard: 800, gain: 0.03 });
    },
    // A wave: two soft sleeves of air.
    wave(ctx, out, t) {
      [0, 0.17].forEach((d, i) => hiss(ctx, out, t + d, { type: 'bandpass', q: 1, fr: [[0, 300], [0.1, 620], [0.16, 380]], a: 0.04, d: 0.12, gain: 0.022, pan: i ? -0.15 : 0.15 }));
    },
    // A rubber stamp coming down on paper on a desk: the thud, the paper slap, the desk answering,
    // and the stamp lifting off again.
    stamp(ctx, out, t, o) {
      const firm = o.kind === 'pass' ? 1 : 0.9;
      tone(ctx, out, t, { f: 110, f1: 66, glide: 0.06, a: 0.002, d: 0.13, gain: 0.03 * firm });
      hiss(ctx, out, t, { type: 'bandpass', q: 0.8, fr: [[0, 720], [0.04, 420]], a: 0.0008, d: 0.055, gain: 0.14 * firm });
      knock(ctx, out, t, { modes: [[185, 10, 0.45], [410, 14, 0.75], [760, 16, 0.3]], hard: 1000, gain: 0.07 * firm, send: 0.12 });
      hiss(ctx, out, t + 0.2, { type: 'bandpass', q: 1.2, fr: [[0, 600]], a: 0.01, d: 0.04, gain: 0.012 });
    },
    // A box ticked: a pen's quick stroke and its tip touching the paper.
    check(ctx, out, t) {
      hiss(ctx, out, t, { type: 'bandpass', q: 1.4, fr: [[0, 1200], [0.03, 820], [0.06, 1000]], a: 0.004, d: 0.05, gain: 0.022 });
      knock(ctx, out, t, { modes: [[620, 9, 1], [1180, 12, 0.3]], hard: 1300, gain: 0.03 });
    },
    // The approval went out: the button's soft press, then the card lifting away right to left.
    sent(ctx, out, t) {
      knock(ctx, out, t, { modes: [[540, 10, 1], [1100, 12, 0.3]], hard: 1200, gain: 0.03 });
      hiss(ctx, out, t, { type: 'bandpass', q: 0.9, fr: [[0, 320], [0.22, 740], [0.5, 420]], a: 0.14, d: 0.34, gain: 0.05, pan: 0.3, pan1: -0.4, send: 0.15 });
    },
    // Saved as a routine: a folder closing on its pages, a soft "thup".
    save(ctx, out, t) {
      hiss(ctx, out, t, { type: 'lowpass', q: 0.7, fr: [[0, 500], [0.09, 800]], a: 0.07, d: 0.05, gain: 0.025 });
      tone(ctx, out, t + 0.1, { f: 125, f1: 85, glide: 0.05, a: 0.002, d: 0.08, gain: 0.03 });
      knock(ctx, out, t + 0.1, { modes: [[260, 9, 1], [610, 12, 0.35]], hard: 1000, gain: 0.05 });
      hiss(ctx, out, t + 0.1, { type: 'bandpass', q: 0.9, fr: [[0, 700]], a: 0.001, d: 0.04, gain: 0.03 });
    },
    // A failed attempt: two dull, low knocks, the second one softer.
    fail(ctx, out, t) {
      knock(ctx, out, t, { modes: [[140, 8, 0.4], [320, 10, 0.75], [560, 10, 0.35]], hard: 800, gain: 0.11, contact: 0.1 });
      knock(ctx, out, t + 0.16, { modes: [[128, 8, 0.4], [290, 10, 0.7], [520, 10, 0.3]], hard: 700, gain: 0.08, contact: 0.08 });
    },
    // A passing attempt: one round wood-block "tock", low.
    pass(ctx, out, t) {
      knock(ctx, out, t, { modes: [[470, 32, 1], [1080, 28, 0.2], [235, 10, 0.4]], hard: 1500, gain: 0.08, send: 0.18 });
    },
    // The price doubling: a heartbeat, felt more than heard, with a low knock in it that a phone
    // can still play.
    alert(ctx, out, t) {
      [[0, 1], [0.19, 0.7], [0.62, 0.7], [0.81, 0.5]].forEach(([d, v]) => {
        tone(ctx, out, t + d, { f: 72, f1: 52, glide: 0.06, a: 0.004, d: 0.12, gain: 0.06 * v });
        knock(ctx, out, t + d, { modes: [[230, 5, 1], [470, 7, 0.4]], hard: 700, gain: 0.06 * v });
      });
    },
    // ...and back under the line: one long, easy breath out.
    relief(ctx, out, t) {
      hiss(ctx, out, t, { type: 'lowpass', q: 0.6, fr: [[0, 750], [0.45, 320]], a: 0.09, d: 0.42, gain: 0.04, send: 0.1 });
    },
    // The token counter climbing: a low wind rising, and a soft ratchet that speeds up with it.
    fill(ctx, out, t, o) {
      const dur = Math.max(0.5, o.dur || 3);
      hiss(ctx, out, t, { type: 'bandpass', q: 0.8, fr: [[0, 170], [dur, 520]], a: dur * 0.75, d: 0.3, gain: 0.03 });
      const n = Math.round(dur * 6);
      for (let k = 0; k < n; k++) {
        const x = k / n;
        knock(ctx, out, t + dur * Math.pow(x, 0.7), { modes: [[540 + 220 * x, 14, 1]], hard: 1100, gain: 0.012 + 0.012 * x });
      }
    },
    // The reviewer reading down the page: a fingertip sliding over paper, barely there.
    scan(ctx, out, t, o) {
      const dur = Math.max(0.4, o.dur || 1.3);
      hiss(ctx, out, t, { type: 'bandpass', q: 1.2, fr: [[0, 430], [dur, 560]], a: 0.25, d: dur, gain: 0.012 });
    },
    // A sheet of paper landing in the tray.
    drop(ctx, out, t) {
      const r = rng(t);
      hiss(ctx, out, t, { type: 'bandpass', q: 1.4, fr: [[0, 700 + r() * 200], [0.03, 480]], a: 0.001, d: 0.045, gain: 0.04, pan: (r() - 0.5) * 0.4 });
    },
    // The brief getting narrower: a cord drawn tight, a soft falling zip.
    shrink(ctx, out, t) {
      hiss(ctx, out, t, { type: 'bandpass', q: 2.4, fr: [[0, 820], [0.55, 340]], a: 0.06, d: 0.5, gain: 0.02 });
    },
    // The extra sheets swept off the tray.
    whisk(ctx, out, t) {
      hiss(ctx, out, t, { type: 'bandpass', q: 0.9, fr: [[0, 360], [0.22, 860], [0.45, 480]], a: 0.1, d: 0.3, gain: 0.04, pan: -0.3, pan1: 0.3, send: 0.1 });
      const r = rng(t);
      for (let k = 0; k < 5; k++) hiss(ctx, out, t + 0.05 + k * 0.05, { type: 'bandpass', q: 1.5, fr: [[0, 900 + r() * 300]], a: 0.004, d: 0.03, gain: 0.008 });
    },
    // The laptop lid closing: the air under it, then the soft clap as it shuts.
    lid(ctx, out, t) {
      hiss(ctx, out, t, { type: 'lowpass', q: 0.7, fr: [[0, 420], [0.09, 700]], a: 0.08, d: 0.04, gain: 0.02 });
      tone(ctx, out, t + 0.1, { f: 105, f1: 72, glide: 0.04, a: 0.002, d: 0.07, gain: 0.015 });
      knock(ctx, out, t + 0.1, { modes: [[230, 10, 0.6], [640, 16, 0.6], [1250, 18, 0.15]], hard: 1300, gain: 0.06, contact: 0.1 });
    },
    // A routing card thrown to its row: it flies, then lands on the row with a light tap.
    toss(ctx, out, t) {
      hiss(ctx, out, t, { type: 'bandpass', q: 1, fr: [[0, 420], [0.2, 820], [0.35, 520]], a: 0.06, d: 0.24, gain: 0.03, pan: 0.2, pan1: -0.25 });
      knock(ctx, out, t + 0.7, { modes: [[600, 9, 1], [1150, 12, 0.2]], hard: 1100, gain: 0.022 });
    },
    // A step up the stairs: a soft footfall, a little closer each time.
    step(ctx, out, t, o) {
      const i = Math.min(5, o.i || 0);
      const up = 1 + i * 0.04;
      tone(ctx, out, t, { f: 120 * up, f1: 85 * up, glide: 0.05, a: 0.003, d: 0.07, gain: 0.025 });
      knock(ctx, out, t, { modes: [[300 * up, 6, 1], [700 * up, 9, 0.35]], hard: 900, gain: 0.05 * (0.8 + i * 0.06) });
      hiss(ctx, out, t + 0.01, { type: 'bandpass', q: 1, fr: [[0, 800]], a: 0.004, d: 0.05, gain: 0.012 });
    },
    // A handwritten note being drawn: a pencil, quietly, stroke by stroke.
    scribble(ctx, out, t, o) {
      const dur = Math.max(0.3, o.dur || 0.9);
      const r = rng(t);
      const n = Math.max(3, Math.round(dur * 6));
      for (let k = 0; k < n; k++) {
        const f0 = 950 + r() * 350;
        hiss(ctx, out, t + (k / n) * dur, { type: 'bandpass', q: 1.8, fr: [[0, f0], [0.08, f0 * (0.8 + r() * 0.3)]], a: 0.015, d: 0.07 + r() * 0.05, gain: 0.011 + r() * 0.006 });
      }
    },
    // The writer redoing the page: an eraser, three strokes.
    fix(ctx, out, t) {
      const r = rng(t);
      for (let k = 0; k < 3; k++) hiss(ctx, out, t + k * 0.13, { type: 'bandpass', q: 1, fr: [[0, 520 + r() * 200], [0.1, 700 + r() * 200]], a: 0.03, d: 0.09, gain: 0.02 });
    },
  };

  // Each sound's level against the others, measured one by one (see scripts/sfx-check.mjs): the
  // moments (a stamp, "sent", a pass) sit on top, the bot's own sounds a little under them, and the
  // small hand sounds (keys, paper, a pencil) underneath, still there.
  const TRIM = {
    swap: 11.3, click: 3.2, type: 1.12, stream: 1.96, assemble: 0.9, hop: 39, land: 8, morph: 44, ping: 0.75, star: 0.86,
    pop: 7.45, wince: 3.24, wave: 64, stamp: 3.18, check: 3.26, sent: 13, save: 1.13, fail: 1.29, pass: 2.56, alert: 1.25,
    relief: 8.06, fill: 1.29, scan: 19.4, drop: 74, shrink: 39, whisk: 16.2, lid: 2.82, toss: 5.63, step: 2.39, scribble: 46, fix: 21.7,
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
    return { pitch: Math.max(0.78, Math.min(1.45, 1 / Math.sqrt(s))), gain: 0.55 + 0.45 * Math.min(1, s) };
  }

  // The same thing never needs to sound twice in a few milliseconds, and a crowd of events (eleven
  // bots popping in at once) should read as a cascade, not a pile: a minimum gap per sound and at
  // most three sounds in any 80 ms.
  const GAP = { swap: 0.12, click: 0.03, type: 0.05, stream: 0.08, assemble: 0.5, hop: 0.06, land: 0.06, morph: 0.15, ping: 0.4, star: 0.4, pop: 0.05, wince: 0.2, wave: 0.4, stamp: 0.2, check: 0.08, sent: 0.3, save: 0.3, fail: 0.2, pass: 0.2, alert: 0.4, relief: 0.4, fill: 0.5, scan: 0.5, drop: 0.03, shrink: 0.3, whisk: 0.3, lid: 0.3, toss: 0.1, step: 0.08, scribble: 0.4, fix: 0.3 };
  function gate() {
    const last = {};
    let recent = [];
    return (name, t) => {
      if (last[name] != null && t - last[name] < (GAP[name] || 0.05)) return false;
      recent = recent.filter((x) => t - x < 0.08);
      if (recent.length >= 3) return false;
      recent.push(t);
      last[name] = t;
      return true;
    };
  }

  /** A small, soft room: a desk in a quiet office, not a hall. */
  function room(ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      const r = rng(11 + ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const k = i / len;
        lp += (r() * 2 - 1 - lp) * (0.6 - 0.5 * k);
        d[i] = lp * Math.pow(1 - k, 3);
      }
    }
    return b;
  }

  /** The sounds' own bus: dry + a room, the rumble under 60 Hz out, and a top cut so nothing gets bright. */
  SFX.bus = function (ctx, dest, o) {
    o = o || {};
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const verb = ctx.createConvolver();
    verb.buffer = room(ctx, 1.0);
    const verbOut = ctx.createGain();
    verbOut.gain.value = o.room == null ? 0.22 : o.room;
    const low = ctx.createBiquadFilter();
    low.type = 'highpass';
    low.frequency.value = o.low || 60;
    low.Q.value = 0.6;
    const top = ctx.createBiquadFilter();
    top.type = 'lowpass';
    top.frequency.value = o.top || 3600;
    top.Q.value = 0.5;
    wet.connect(verb);
    verb.connect(verbOut);
    dry.connect(low);
    verbOut.connect(low);
    low.connect(top);
    top.connect(dest);
    return { dry: dry, wet: wet };
  };
  SFX.recipes = R;
  SFX.trim = TRIM;
  SFX.notes = N;
  SFX.gate = gate;
  SFX.tone = tone;
  SFX.hiss = hiss;
  SFX.knock = knock;
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

  /**
   * Called from the first click, tap or key: the only moment a browser lets a page start sound.
   * iOS needs the context resumed inside a touchend or click (a pointerdown alone may not count),
   * so the deck calls this from all of them; it is cheap after the first time.
   */
  SFX.unlock = function () {
    if (live.ctx) {
      if (live.ctx.state !== 'running' && !document.hidden) { try { live.ctx.resume(); } catch (e) { /* next gesture */ } }
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let ctx;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { return; }
    // On the page the sounds play on their own, without the reel's music and mastering, so they are
    // brought up here; the compressor only rounds the rare moment when several land together.
    const master = ctx.createGain();
    master.gain.value = SFX.liveGain;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 8;
    comp.ratio.value = 3;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    master.connect(comp);
    comp.connect(ctx.destination);
    live.ctx = ctx;
    live.out = SFX.bus(ctx, master);
    // A silent sample started inside the gesture is what older iOS needs to let the context play.
    try {
      const b = ctx.createBufferSource();
      b.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      b.connect(ctx.destination);
      b.start(0);
    } catch (e) { /* not needed elsewhere */ }
    if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) { /* next gesture */ } }
    document.addEventListener('visibilitychange', () => {
      if (!live.ctx) return;
      if (document.hidden) live.ctx.suspend();
      else live.ctx.resume();
    });
  };
  SFX.liveGain = 1.6;

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
