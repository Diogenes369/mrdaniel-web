/* The Instagram reel's soundtrack, rendered in a headless browser so its sound effects are the
 * deck's own (public/grok-deck/js/sfx.js, loaded first). scripts/reel-audio.mjs injects both into
 * a blank page and calls:
 *
 *   await GrokReelScore.render(sheet, { parts })   → number of frames rendered
 *   GrokReelScore.chunk(i, size)                   → base64 of interleaved float32 PCM
 *
 * The music is a minimal groove in D major that keeps time with the deck: four bars to a slide,
 * so every cut lands on a downbeat, and the chord moves with it (D at one slide, G at the next).
 * Soft round kick, a clap on two and four, a quiet shaker, a sub bass, short chord stabs and a pad
 * underneath. The cover is the build: no drums, the chord hanging on A until the first cut drops
 * onto D. The "stops" slide opens without drums, and the close rings out on D.
 */
(function () {
  'use strict';

  const S = window.GrokSFX;
  const RATE = 48000;
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Bass note and the four voices of each chord, kept under the sound effects.
  const CH = {
    D: { bass: 38, keys: [57, 61, 64, 66] }, // Dmaj9
    Bm: { bass: 35, keys: [57, 62, 64, 66] }, // Bm11
    G: { bass: 43, keys: [54, 57, 59, 62] }, // Gmaj9
    A: { bass: 45, keys: [55, 57, 62, 64] }, // A7sus4
  };
  // By bar: the cover hangs on A for its two bars; from the first cut, D-Bm on one slide, G-A on
  // the next.
  const CYCLE = ['A', 'A', 'D', 'D', 'Bm', 'Bm', 'G', 'G'];
  const CLOSE = ['D', 'D', 'G', 'A', 'D'];

  // Levels, measured as stems (2026-10-06): the effects' active moments sit about 3 LU above the
  // music, so a click or a stamp reads clearly while the groove stays present under everything.
  const MUSIC_GAIN = 0.21;
  const SFX_GAIN = 2.4;

  function kick(ctx, out, t, v) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.09);
    const g = S.env(ctx, t, 0.002, 0.34, 0.85 * v);
    o.connect(g);
    g.connect(out.dry);
    o.start(t);
    o.stop(t + 0.42);
    S.hiss(ctx, out, t, { type: 'lowpass', fr: [[0, 2400]], a: 0.0005, d: 0.006, gain: 0.07 * v });
  }

  function clap(ctx, out, t, v) {
    [0, 0.011, 0.023].forEach((d, i) => S.hiss(ctx, out, t + d, { type: 'bandpass', q: 0.8, fr: [[0, 1500]], a: 0.0008, d: i === 2 ? 0.12 : 0.012, gain: (i === 2 ? 0.17 : 0.12) * v, send: 0.25 }));
    S.tone(ctx, out, t, { f: 190, f1: 160, glide: 0.05, a: 0.001, d: 0.06, gain: 0.05 * v });
  }

  function shaker(ctx, out, t, v, pan) {
    S.hiss(ctx, out, t, { type: 'bandpass', q: 0.9, fr: [[0, 4200]], a: 0.004, d: 0.03, gain: 0.045 * v, pan: pan });
  }

  function bass(ctx, out, t, midi, len, v) {
    const f = hz(midi);
    const o1 = ctx.createOscillator();
    o1.frequency.value = f;
    // A quiet second harmonic so a phone speaker, which can't play the fundamental, still has the line.
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = f * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.22;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = ctx.createGain();
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

  function stab(ctx, out, t, keys, v, decay) {
    keys.forEach((m, i) => {
      const f = hz(m);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 1.2;
      lp.frequency.setValueAtTime(2300, t);
      lp.frequency.exponentialRampToValueAtTime(650, t + 0.18);
      const g = S.env(ctx, t, 0.003, decay || 0.26, 0.04 * v);
      [-6, 6].forEach((c) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = c;
        o.connect(lp);
        o.start(t);
        o.stop(t + (decay || 0.26) + 0.1);
      });
      lp.connect(g);
      const p = ctx.createStereoPanner();
      p.pan.value = (i / (keys.length - 1) - 0.5) * 0.6;
      g.connect(p);
      p.connect(out.dry);
      const s = ctx.createGain();
      s.gain.value = 0.3;
      p.connect(s);
      s.connect(out.wet);
    });
  }

  function pad(ctx, out, t0, t1, keys, v, fadeIn) {
    keys.forEach((m, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = hz(m);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 800;
      const g = ctx.createGain();
      const a = fadeIn || 0.5;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.018 * v, t0 + a);
      g.gain.setValueAtTime(0.018 * v, Math.max(t0 + a, t1 - 0.25));
      g.gain.linearRampToValueAtTime(0, t1 + 0.25);
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

  function music(ctx, out, sheet) {
    const end = sheet.duration;
    const slides = sheet.cues.filter((c) => c.type === 'slide').sort((a, b) => a.t - b.t);
    const cuts = slides.slice(1).map((c) => c.t);
    const gaps = cuts.slice(1).map((t, i) => t - cuts[i]).sort((a, b) => a - b);
    const span = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 10.4;
    const bar = span / 4;
    const step = bar / 16;
    const first = cuts.length ? cuts[0] : 2 * bar;
    const origin = first - Math.floor(first / bar + 1e-6) * bar;
    const lastCut = cuts.length ? cuts[cuts.length - 1] : end;
    const slideAt = (t) => cuts.filter((c) => c <= t + 1e-6).length;

    const plan = [];
    for (let b = 0; origin + b * bar < end - 0.05; b++) {
      const tb = origin + b * bar;
      const s = slideAt(tb + 0.01);
      const sl = slides[s] || {};
      const inClose = s === slides.length - 1 && slides.length > 1;
      const closeBar = inClose ? Math.round((tb - lastCut) / bar) : -1;
      const name = inClose ? CLOSE[Math.min(CLOSE.length - 1, closeBar)] : CYCLE[b % CYCLE.length];
      const intoSlide = Math.round((tb - (sl.t || 0)) / bar);
      const drums = s > 0 && !(sl.key === 'stops' && intoSlide < 2) && !(inClose && closeBar >= 2);
      plan.push({ tb: tb, name: name, drums: drums, ring: inClose && closeBar >= 4, cover: s === 0 });
    }

    // The pad, one span per chord, rising out of silence under the cover.
    let span0 = 0;
    plan.forEach((p, i) => {
      const next = plan[i + 1];
      if (next && next.name === p.name && !next.ring) return;
      const t0 = span0 === 0 ? 0 : plan[span0].tb;
      const t1 = next ? next.tb : end;
      pad(ctx, out, t0, t1, CH[p.name].keys, 1, span0 === 0 ? 2.2 : 0.4);
      span0 = i + 1;
    });

    plan.forEach((p, b) => {
      const ch = CH[p.name];
      if (p.ring) {
        stab(ctx, out, p.tb, ch.keys, 1.1, 1.6);
        bass(ctx, out, p.tb, ch.bass, Math.max(0.3, end - p.tb - 0.3), 1);
        return;
      }
      for (let k = 0; k < 16; k++) {
        const t = p.tb + k * step;
        if (t >= end - 0.05) break;
        if (p.drums) {
          if (k === 0 || k === 10 || (k === 7 && b % 2 === 1)) kick(ctx, out, t, k === 0 ? 1 : 0.75);
          if (k === 4 || k === 12) clap(ctx, out, t, 0.85);
        }
        // A hint of swing on the off sixteenths; quieter while the drums are out.
        shaker(ctx, out, t + (k % 2 ? step * 0.1 : 0), [0.55, 0.28, 0.85, 0.3][k % 4] * (p.drums ? 1 : 0.6), k % 4 === 2 ? 0.25 : -0.15);
      }
      const notes = b % 2 ? [[0, 5, 0], [7, 2, 0], [10, 4, 0]] : [[0, 6, 0], [10, 3, 0], [14, 2, 7]];
      notes.forEach(([k, len, up]) => bass(ctx, out, p.tb + k * step, ch.bass + up, len * step * 0.92, 1));
      [3, 11].forEach((k) => stab(ctx, out, p.tb + k * step, ch.keys, p.cover ? 0.75 : 1));
    });
  }

  let rendered = null;

  window.GrokReelScore = {
    async render(sheet, o) {
      o = o || {};
      const parts = o.parts || ['music', 'sfx'];
      const frames = Math.ceil(sheet.duration * RATE);
      const ctx = new OfflineAudioContext(2, frames, RATE);
      const master = ctx.createGain();
      master.connect(ctx.destination);
      // The last bars fade together, effects and music.
      master.gain.setValueAtTime(1, Math.max(0, sheet.duration - 2.8));
      master.gain.linearRampToValueAtTime(0, sheet.duration - 0.05);
      if (parts.includes('music')) {
        const g = ctx.createGain();
        g.gain.value = MUSIC_GAIN * (o.musicGain || 1);
        g.connect(master);
        music(ctx, S.bus(ctx, g, { room: 0.22, top: 8500 }), sheet);
      }
      if (parts.includes('sfx')) {
        const g = ctx.createGain();
        g.gain.value = SFX_GAIN * (o.sfxGain || 1);
        // The effects are short and struck, all attack: a fast bus compressor rounds their peaks so
        // the master limiter after it has almost nothing to do and the groove never ducks under them.
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -20;
        comp.knee.value = 8;
        comp.ratio.value = 4;
        comp.attack.value = 0.001;
        comp.release.value = 0.12;
        g.connect(comp);
        comp.connect(master);
        S.schedule(ctx, S.bus(ctx, g), sheet.cues.filter((c) => c.type !== 'slide'));
      }
      const buf = await ctx.startRendering();
      rendered = [buf.getChannelData(0), buf.getChannelData(1)];
      return buf.length;
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
