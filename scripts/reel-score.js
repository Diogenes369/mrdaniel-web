/* The Instagram reel's soundtrack, rendered in a headless browser so its sound effects are the
 * deck's own (public/grok-deck/js/sfx.js, loaded first). scripts/reel-audio.mjs injects both into
 * a blank page and calls:
 *
 *   await GrokReelScore.render(sheet, { parts })   → number of frames rendered
 *   GrokReelScore.chunk(i, size)                   → base64 of interleaved float32 PCM
 *
 * The music (second version, 2026-10-07: the owner asked for something happier and more rhythmic,
 * heard a little over the effects, that never stalls) is a bright pop groove in D major at the
 * deck's tempo (sheet.bpm, 100). The deck holds every slide for whole half bars, so each cut lands
 * on the first or third beat. A round kick on every beat, a clap on two and four, an open hat, the
 * bass and short chord plucks on the off-beats, a shaker on the sixteenths that leans a hair late
 * on the odd ones, and a marimba hook on a 3-3-2 bounce; the chord moves every bar (D, A, Bm, G).
 * It never stops: the cover opens on the hook over the plucks and the clap, and the kick and the
 * bass drop in on the first cut; the close only thins out (no kick, the bass on one and three) and
 * rolls back into the outro, whose last accent lands with the crew's wave and ends on D.
 *
 * The effects keep their place in two ways. They are rendered first, and their level between
 * 250 Hz and 1.6 kHz, where the foley lives, drives a dip in the music's middle: a wide bell that
 * is always a dB down (the effects' pocket) and goes a few dB deeper for the few hundred
 * milliseconds a sound needs, deepest under the loudest ones, with the whole groove a touch down
 * under those. So the music can be the louder layer and still never cover a click or a slide
 * change, and nothing about its timing moves.
 */
(function () {
  'use strict';

  const S = window.GrokSFX;
  const RATE = 48000;
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Each chord: the bass root, the off-beat pluck (a close triad between D4 and B4) and the pad.
  const CH = {
    D: { bass: 38, pluck: [62, 66, 69], pad: [57, 62, 66] },
    A: { bass: 33, pluck: [61, 64, 69], pad: [57, 61, 64] },
    Bm: { bass: 35, pluck: [62, 66, 71], pad: [59, 62, 66] },
    G: { bass: 31, pluck: [62, 67, 71], pad: [55, 59, 62] },
  };
  // A chord a bar from the first cut: I, V, vi, IV, the plainest happy progression there is. The
  // cover's bars lead in on IV and V, so the first cut lands on the home chord.
  const CYCLE = ['D', 'A', 'Bm', 'G'];
  const INTRO = ['G', 'A'];

  // The marimba hook, a bar per chord in sixteenths ([step, note, length in steps]): a 3-3-2
  // bounce, then an answer that walks down. It stays between A4 and B5, under anything shrill.
  const HOOK = {
    D: [[[0, 81], [3, 78], [6, 81], [8, 83], [11, 81], [14, 78]], [[0, 81, 3], [4, 78], [6, 76], [10, 74], [12, 78, 4]]],
    A: [[[0, 76], [3, 73], [6, 76], [8, 78], [11, 76], [14, 73]], [[0, 81, 3], [4, 76], [6, 73], [10, 76], [12, 69, 4]]],
    Bm: [[[0, 78], [3, 74], [6, 78], [8, 81], [11, 78], [14, 74]], [[0, 78, 3], [4, 74], [6, 71], [10, 74], [12, 78, 4]]],
    G: [[[0, 74], [3, 71], [6, 74], [8, 76], [11, 78], [14, 81]], [[0, 79, 3], [4, 76], [6, 74], [10, 71], [12, 74], [14, 76]]],
  };

  // The music against the effects, measured as stems (2026-10-07): integrated, the music is about
  // 4 LU over the effects at full range and about 1 LU over them through a phone speaker (a
  // 300 Hz high-pass), where the effects, built for that speaker, lose almost nothing and the
  // groove's low end is gone. At a slide change the card's whoosh peaks about 3 dB over the
  // music's 3 s level (about 6 on a phone) and a click about 2 dB under it: heard, inside the
  // music rather than on top of it. (The first version had the effects 3 LU over the music at
  // full range and some 25 over it on a phone.) SFX_GAIN stays where the DUCK thresholds were
  // measured.
  const MUSIC_GAIN = 0.75;
  const SFX_GAIN = 1.7;
  // Each instrument's level in the groove, measured one at a time (2026-10-07). The first version
  // of this score was a kick and a bass with everything else 25 to 30 LU under them: on a phone
  // speaker, which plays almost nothing under 300 Hz, the music all but vanished while the effects
  // (built for that speaker) stayed, so the effects sounded louder than the music. Now the
  // plucks, the marimba, the clap and the hats carry the groove on any speaker, and the kick and
  // the bass are the floor under them.
  const MIX = { kick: 0.67, bass: 0.42, clap: 16.5, hat: 37.5, shaker: 28, pluck: 17.3, marimba: 11.1, pad: 2.25, crash: 16 };
  // The odd sixteenths lean this much of a step late: enough to bounce, not enough to swing.
  const SWING = 0.1;
  // The effects' pocket in the music. band: the effects' band (Hz) the sidechain listens to; their
  // level from floor to floor + range (dBFS, after SFX_GAIN) takes the dip from none to all of it:
  // mid dB more on the bell (carve is always there), broad dB on everything. floor is about the
  // median of that level while the effects play and floor + range about its 90th percentile, so
  // the quieter half of the sounds leave the groove alone and it dips about a quarter of the time.
  const DUCK = { band: [250, 1600], floor: -24, range: 10, carve: 1, mid: 2.5, broad: 0.8, bell: 700, q: 0.55, rate: 200, ahead: 0.012, attack: 0.004, release: 0.14 };

  function kick(ctx, out, t, v) {
    v *= MIX.kick;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.09);
    const g = S.env(ctx, t, 0.002, 0.3, 0.85 * v);
    o.connect(g);
    g.connect(out.dry);
    o.start(t);
    o.stop(t + 0.38);
    S.hiss(ctx, out, t, { type: 'lowpass', fr: [[0, 2400]], a: 0.0005, d: 0.006, gain: 0.07 * v });
  }

  function clap(ctx, out, t, v) {
    v *= MIX.clap;
    [0, 0.011, 0.023].forEach((d, i) => S.hiss(ctx, out, t + d, { type: 'bandpass', q: 0.8, fr: [[0, 1500]], a: 0.0008, d: i === 2 ? 0.12 : 0.012, gain: (i === 2 ? 0.17 : 0.12) * v, send: 0.25 }));
    S.tone(ctx, out, t, { f: 190, f1: 160, glide: 0.05, a: 0.001, d: 0.06, gain: 0.05 * v });
  }

  // The open hat on the off-beats: a short, soft "tss" of pink noise up high, the push that makes
  // the groove move. The music bus cuts above 8.5 kHz, so it never hisses.
  function hat(ctx, out, t, v) {
    v *= MIX.hat;
    S.hiss(ctx, out, t, { type: 'highpass', q: 0.5, fr: [[0, 6000]], a: 0.003, d: 0.11, gain: 0.06 * v, pan: 0.18, send: 0.08 });
  }

  // A brushed shaker: soft, short and well under the bright top end (the noise is pink).
  function shaker(ctx, out, t, v, pan) {
    v *= MIX.shaker;
    S.hiss(ctx, out, t, { type: 'bandpass', q: 1.1, fr: [[0, 3000]], a: 0.006, d: 0.035, gain: 0.07 * v, pan: pan });
  }

  function bass(ctx, out, t, midi, len, v) {
    v *= MIX.bass;
    const f = hz(midi);
    const o1 = ctx.createOscillator();
    o1.frequency.value = f;
    // A saw under the sine: its harmonics are the line on a phone speaker, which can't play the
    // fundamental at all.
    const o2 = ctx.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.value = f;
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    lp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.42 * v, t + 0.008);
    g.gain.setTargetAtTime(0.3 * v, t + 0.01, 0.12);
    g.gain.setTargetAtTime(0, t + Math.max(0.05, len - 0.04), 0.025);
    o1.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(lp);
    lp.connect(out.dry);
    o1.start(t);
    o2.start(t);
    o1.stop(t + len + 0.25);
    o2.stop(t + len + 0.25);
  }

  // A chord plucked short: a saw per note with the filter closing fast, spread a little.
  function pluck(ctx, out, t, keys, v, decay) {
    v *= MIX.pluck;
    const d = decay || 0.13;
    keys.forEach((m, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(m);
      o.detune.value = (i - 1) * 5;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.9;
      lp.frequency.setValueAtTime(2600, t);
      lp.frequency.exponentialRampToValueAtTime(700, t + Math.min(0.2, d));
      const g = S.env(ctx, t, 0.002, d, 0.05 * v);
      const p = ctx.createStereoPanner();
      p.pan.value = (i - 1) * 0.3;
      o.connect(lp);
      lp.connect(g);
      g.connect(p);
      p.connect(out.dry);
      const s = ctx.createGain();
      s.gain.value = 0.25;
      p.connect(s);
      s.connect(out.wet);
      o.start(t);
      o.stop(t + d + 0.05);
    });
  }

  // A marimba bar: the note, its tuned overtone (about two octaves up, gone in a moment) and the
  // soft knock of the mallet.
  function marimba(ctx, out, t, midi, v, steps) {
    v *= MIX.marimba;
    const f = hz(midi);
    const pan = ((midi - 76) / 10) * 0.35;
    S.tone(ctx, out, t, { f: f, a: 0.002, d: 0.2 + 0.04 * (steps || 2), gain: 0.06 * v, pan: pan, send: 0.2 });
    S.tone(ctx, out, t, { f: f * 3.93, a: 0.001, d: 0.05, gain: 0.012 * v, pan: pan });
    S.hiss(ctx, out, t, { type: 'bandpass', q: 1.5, fr: [[0, Math.min(3000, f * 3)]], a: 0.0005, d: 0.01, gain: 0.012 * v, pan: pan });
  }

  function pad(ctx, out, t0, t1, keys, v, fadeIn) {
    v *= MIX.pad;
    keys.forEach((m, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = hz(m);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 800;
      const g = ctx.createGain();
      const a = fadeIn || 0.3;
      g.gain.value = 0;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.012 * v, t0 + a);
      g.gain.setValueAtTime(0.012 * v, Math.max(t0 + a, t1 - 0.2));
      g.gain.linearRampToValueAtTime(0, t1 + 0.2);
      const p = ctx.createStereoPanner();
      p.pan.value = (i / (keys.length - 1) - 0.5) * 0.8;
      o.connect(lp);
      lp.connect(g);
      g.connect(p);
      p.connect(out.dry);
      o.start(t0);
      o.stop(t1 + 0.3);
    });
  }

  // The outro's one accent, with the crew's wave: a soft, dark cymbal swell.
  function crash(ctx, out, t, v) {
    v *= MIX.crash;
    S.hiss(ctx, out, t, { type: 'bandpass', q: 0.5, fr: [[0, 5200], [1.2, 3800]], a: 0.004, d: 1.3, gain: 0.05 * v, send: 0.5 });
  }

  /** The bar grid and the arrangement: which chord, which section and whether the hook plays. */
  function form(sheet) {
    const end = sheet.duration;
    const slides = sheet.cues.filter((c) => c.type === 'slide').sort((a, b) => a.t - b.t);
    const cuts = slides.slice(1).map((c) => c.t);
    // The deck holds each slide for whole half bars at sheet.bpm, so the bar comes straight from the
    // tempo. An older cue sheet without one falls back to four bars per (median) slide.
    let bar;
    if (sheet.bpm) bar = (4 * 60) / sheet.bpm;
    else {
      const gaps = cuts.slice(1).map((t, i) => t - cuts[i]).sort((a, b) => a - b);
      bar = (gaps.length ? gaps[Math.floor(gaps.length / 2)] : 10.4) / 4;
    }
    const first = cuts.length ? cuts[0] : 2 * bar;
    // Bars count back from the first cut, so the cover gets whole bars too (the first may begin a
    // frame before the video does).
    const firstBar = Math.max(1, Math.round(first / bar));
    const origin = first - firstBar * bar;
    let bars = Math.ceil((end - origin) / bar - 1e-6);
    // The last bar is the final chord; if it would start too close to the end to ring, the bar
    // before takes it.
    if (origin + (bars - 1) * bar > end - 0.35) bars -= 1;
    const at = (key) => (slides.find((c) => c.key === key) || {}).t;
    const close = at('close');
    const outro = at('outro');
    const chord = (b) => {
      if (b < firstBar) return INTRO[Math.max(0, INTRO.length - (firstBar - b))];
      if (b >= bars - 2) return 'D';
      if (b === bars - 3) return 'A';
      return CYCLE[(b - firstBar) % CYCLE.length];
    };
    const section = (t) => (t < first - 1e-3 ? 'intro' : close != null && t >= close - 1e-3 && (outro == null || t < outro - 1e-3) ? 'thin' : 'full');
    // The hook sings on every other eight bars, starting with the cover so it is the first thing
    // heard; the eight that hold the close and the outro are always a singing eight.
    const sings = (b) => b < firstBar || Math.floor((b - firstBar) / 8) % 2 === 0 || (close != null && origin + (b + 1) * bar > close);
    return { end, bar, step: bar / 16, first, firstBar, origin, bars, close, outro, chord, section, sings, fills: [first, outro].filter((t) => t != null) };
  }

  function music(ctx, out, sheet, o) {
    const F = form(sheet);
    const { end, bar, step, origin, bars } = F;
    const on = (name) => !o.only || o.only.includes(name);

    // The pad, one span per chord, under everything.
    let from = 0;
    for (let b = 0; b < bars; b++) {
      const name = F.chord(b);
      if (b + 1 < bars && F.chord(b + 1) === name) continue;
      const t0 = Math.max(0, origin + from * bar);
      const t1 = b === bars - 1 ? end : origin + (b + 1) * bar;
      if (on('pad')) pad(ctx, out, t0, t1, CH[name].pad, 1, from === 0 ? 1 : 0.3);
      from = b + 1;
    }

    for (let b = 0; b < bars; b++) {
      const tb = origin + b * bar;
      const ch = CH[F.chord(b)];
      if (b === bars - 1) {
        // The last chord, on the bar's downbeat, rings into the end.
        const ring = Math.max(0.3, end - tb);
        if (on('kick')) kick(ctx, out, tb, 1);
        if (on('bass')) bass(ctx, out, tb, ch.bass, ring, 1);
        if (on('pluck')) pluck(ctx, out, tb, ch.pluck, 1.1, Math.min(0.9, ring));
        if (on('marimba')) [74, 78, 81].forEach((m, i) => marimba(ctx, out, tb + i * 0.03, m, 0.85, 6));
        continue;
      }
      // The outro's accent, on the downbeat of the bar before the last: where the crew waves.
      if (b === bars - 2 && F.outro != null && tb >= F.outro && on('crash')) crash(ctx, out, tb, 1);
      const sing = F.sings(b);
      const hook = HOOK[F.chord(b)][b >= F.firstBar && (b - F.firstBar) % 8 >= 4 ? 1 : 0];
      for (let k = 0; k < 16; k++) {
        const t0 = tb + k * step;
        if (t0 < -0.05 || t0 >= end - 0.05) continue;
        const t = Math.max(0, t0 + (k % 2 ? SWING * step : 0));
        const sec = F.section(t0);
        const fill = F.fills.find((f) => t0 >= f - 4 * step - 1e-3 && t0 < f - 1e-3);
        if (sec === 'full' && k % 4 === 0 && on('kick')) kick(ctx, out, t, k === 0 ? 1 : k === 8 ? 0.92 : 0.85);
        // A clap on two and four, and a roll of them into the first cut and into the outro.
        if (on('clap')) {
          if (fill != null) clap(ctx, out, t, 0.5 + 0.13 * Math.round((t0 - (fill - 4 * step)) / step));
          else if (k === 4 || k === 12) clap(ctx, out, t, 0.85);
        }
        if (sec !== 'thin' && k % 4 === 2 && on('hat')) hat(ctx, out, t, k === 14 ? 1 : 0.85);
        if (on('shaker')) shaker(ctx, out, t, k % 4 === 2 ? 0.8 : k % 2 ? 0.45 : 0.6, k % 8 === 4 ? 0.25 : -0.15);
        // The bass pumps on the off-beats, the third one up an octave; in the thin close it holds
        // the root on one and three instead.
        if (on('bass')) {
          if (sec === 'full' && k % 4 === 2) bass(ctx, out, t, ch.bass + (k === 10 ? 12 : 0), step * 1.5, k === 10 ? 0.85 : 1);
          else if (sec === 'full' && k === 0) bass(ctx, out, t, ch.bass, step * 0.9, 0.55);
          else if (sec === 'thin' && (k === 0 || k === 8)) bass(ctx, out, t, ch.bass, step * 7, 0.7);
        }
        if (k % 4 === 2 && on('pluck')) pluck(ctx, out, t, ch.pluck, k === 6 || k === 14 ? 0.85 : 1);
        if (sing && on('marimba')) hook.forEach(([hk, m, len]) => { if (hk === k) marimba(ctx, out, t, m, sec === 'thin' ? 0.8 : 1, len || 2); });
      }
    }
  }

  // RBJ biquads for the sidechain's ears: a per-sample filter.
  function biquad(type, f, q) {
    const w = (2 * Math.PI * f) / RATE;
    const c = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    const lo = type === 'lowpass';
    const b0 = lo ? (1 - c) / 2 : (1 + c) / 2;
    const b1 = lo ? 1 - c : -(1 + c);
    const a0 = 1 + al;
    const a1 = -2 * c;
    const a2 = 1 - al;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (x) => {
      const y = (b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      return y;
    };
  }

  /**
   * How far the music steps aside (0 to 1) every 5 ms, from the effects' level in their band. It
   * looks a few ms ahead, so the dip is already there when a sound starts, and lets go over a
   * fraction of a second, so the groove comes back up rather than jumping.
   */
  function sidechain([L, R]) {
    const hp = biquad('highpass', DUCK.band[0], 0.707);
    const lp = biquad('lowpass', DUCK.band[1], 0.707);
    const per = RATE / DUCK.rate;
    const n = Math.ceil(L.length / per);
    const lvl = new Float32Array(n);
    const att = 1 - Math.exp(-1 / (DUCK.attack * RATE));
    const rel = 1 - Math.exp(-1 / (DUCK.release * RATE));
    let env = 0;
    for (let i = 0; i < L.length; i++) {
      const r = Math.abs(lp(hp((L[i] + R[i]) * 0.5)));
      env += (r - env) * (r > env ? att : rel);
      const j = Math.floor(i / per);
      if (env > lvl[j]) lvl[j] = env;
    }
    const ahead = Math.round(DUCK.ahead * DUCK.rate);
    const s = new Float32Array(n);
    const db = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      let e = 0;
      for (let k = j; k <= Math.min(n - 1, j + ahead); k++) e = Math.max(e, lvl[k]);
      db[j] = 20 * Math.log10(e + 1e-9);
      const x = Math.max(0, Math.min(1, (db[j] - DUCK.floor) / DUCK.range));
      s[j] = x * x * (3 - 2 * x);
    }
    return { s: s, db: db };
  }

  async function effects(sheet, frames, o) {
    const ctx = new OfflineAudioContext(2, frames, RATE);
    const g = ctx.createGain();
    g.gain.value = SFX_GAIN * (o.sfxGain || 1);
    // The effects are short and struck, all attack: a fast bus compressor rounds their peaks so
    // the master limiter after it has almost nothing to do.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.001;
    comp.release.value = 0.12;
    g.connect(comp);
    comp.connect(ctx.destination);
    S.schedule(ctx, S.bus(ctx, g), sheet.cues.filter((c) => c.type !== 'slide'));
    const buf = await ctx.startRendering();
    return [buf.getChannelData(0), buf.getChannelData(1)];
  }

  async function groove(sheet, frames, duck, o) {
    const ctx = new OfflineAudioContext(2, frames, RATE);
    const g = ctx.createGain();
    g.gain.value = MUSIC_GAIN * (o.musicGain || 1);
    g.connect(ctx.destination);
    const bell = ctx.createBiquadFilter();
    bell.type = 'peaking';
    bell.frequency.value = DUCK.bell;
    bell.Q.value = DUCK.q;
    const whole = ctx.createGain();
    if (!duck) bell.gain.value = 0;
    else {
      const span = (duck.length - 1) / DUCK.rate;
      bell.gain.setValueCurveAtTime(Float32Array.from(duck, (x) => -DUCK.carve - DUCK.mid * x), 0, span);
      whole.gain.setValueCurveAtTime(Float32Array.from(duck, (x) => Math.pow(10, (-DUCK.broad * x) / 20)), 0, span);
    }
    bell.connect(whole);
    whole.connect(g);
    // A gentle glue on the groove before the dip: it only rounds the kick's and the clap's peaks,
    // so the master limiter has little left to do and the groove sits even.
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -8;
    glue.knee.value = 8;
    glue.ratio.value = 3;
    glue.attack.value = 0.005;
    glue.release.value = 0.2;
    glue.connect(bell);
    music(ctx, S.bus(ctx, glue, { room: 0.22, top: 8500 }), sheet, o);
    const buf = await ctx.startRendering();
    return [buf.getChannelData(0), buf.getChannelData(1)];
  }

  let rendered = null;

  window.GrokReelScore = {
    stats: null,
    async render(sheet, o) {
      o = o || {};
      const parts = o.parts || ['music', 'sfx'];
      const frames = Math.ceil(sheet.duration * RATE);
      // The effects first: the music's pocket is cut to them. (`duck: false` with no effects asked
      // for skips them, for measuring the music alone.)
      const ducked = o.duck !== false;
      const fx = parts.includes('sfx') || ducked ? await effects(sheet, frames, o) : null;
      const mix = [new Float32Array(frames), new Float32Array(frames)];
      if (parts.includes('sfx')) {
        mix[0].set(fx[0]);
        mix[1].set(fx[1]);
      }
      if (parts.includes('music')) {
        const sc = ducked ? sidechain(fx) : null;
        const mu = await groove(sheet, frames, sc && sc.s, o);
        for (let c = 0; c < 2; c++) for (let s = 0; s < frames; s++) mix[c][s] += mu[c][s];
        if (sc) {
          const busy = sc.db.filter((d) => d > -70).sort((a, b) => a - b);
          const pct = (p) => (busy.length ? +busy[Math.floor((busy.length - 1) * p)].toFixed(1) : null);
          this.stats = {
            duckMean: +(sc.s.reduce((a, b) => a + b, 0) / sc.s.length).toFixed(3),
            duckHalf: +(sc.s.filter((x) => x > 0.5).length / sc.s.length).toFixed(3),
            duckAny: +(sc.s.filter((x) => x > 0.05).length / sc.s.length).toFixed(3),
            fxBand: { p50: pct(0.5), p90: pct(0.9), p99: pct(0.99) },
          };
        }
      }
      // The last chord rings out under a short fade, effects and music together.
      const F = form(sheet);
      const fadeFrom = Math.max(sheet.duration - 2.4, Math.min(sheet.duration - 0.4, F.origin + (F.bars - 1) * F.bar + 0.05));
      for (let s = Math.floor(fadeFrom * RATE); s < frames; s++) {
        const k = Math.max(0, 1 - (s / RATE - fadeFrom) / (sheet.duration - 0.03 - fadeFrom));
        mix[0][s] *= k;
        mix[1][s] *= k;
      }
      rendered = mix;
      return frames;
    },
    chunk(i, size) {
      const [L, R] = rendered;
      const s = i * size;
      const e = Math.min(L.length, s + size);
      if (s >= e) return '';
      const out = new Float32Array((e - s) * 2);
      for (let k = s, j = 0; k < e; k++) {
        out[j++] = L[k];
        out[j++] = R[k];
      }
      const u8 = new Uint8Array(out.buffer);
      let bin = '';
      for (let k = 0; k < u8.length; k += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(k, k + 0x8000));
      return btoa(bin);
    },
  };
})();
