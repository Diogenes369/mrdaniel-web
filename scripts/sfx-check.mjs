#!/usr/bin/env node
/**
 * Measures every sound in public/grok-deck/js/sfx.js on its own, so their levels and their colour
 * can be balanced by numbers rather than by ear on one pair of speakers.
 *
 * Each recipe is rendered alone (offline, in headless Chrome, through the same bus the site and the
 * reel use) and reported as:
 *   loud    the loudest 150 ms, K-weighted (the curve LUFS uses), in dB: how loud it lands
 *   peak    sample peak, dBFS
 *   centre  spectral centroid, Hz: the sound's "height"; a soft, low palette stays well under 1 kHz
 *   <250    share of the energy under 250 Hz: felt on headphones, lost on a phone speaker
 *   >2k     share above 2 kHz: where shrill lives
 *   trim    the TRIM factor that would put it on its group's target
 *
 *   node scripts/sfx-check.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openChrome } from './lib/headless.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RATE = 48000;
const SLOT = 3;

// Targets for the loudest 150 ms, by role: the moments on top, the bot under them, the hands under that.
const GROUPS = {
  moment: { target: -25, names: ['stamp', 'sent', 'save', 'pass', 'fail', 'alert', 'lid', 'ping'] },
  move: { target: -27, names: ['swap'] },
  bot: { target: -28, names: ['hop', 'land', 'pop', 'morph', 'wince', 'wave', 'star', 'assemble', 'step'] },
  hand: { target: -30, names: ['click', 'type', 'check', 'drop', 'toss', 'stream', 'whisk', 'relief', 'shrink', 'fill'] },
  faint: { target: -34, names: ['scribble', 'fix', 'scan'] },
};
const EXTRA = { swap: { dir: 1 }, type: { n: 14, dur: 0.6 }, assemble: { dur: 1.4 }, hop: { size: 300 }, land: { size: 300 }, pop: { size: 90 }, stamp: { kind: 'pass' }, fill: { dur: 2.8 }, scan: { dur: 1.3 }, step: { i: 2 }, scribble: { dur: 1 } };

const PAGE = `(async () => {
  const S = window.GrokSFX;
  const names = Object.keys(S.recipes);
  const ctx = new OfflineAudioContext(2, Math.ceil((names.length * ${SLOT} + 1) * ${RATE}), ${RATE});
  const out = S.bus(ctx, ctx.destination);
  const extra = ${JSON.stringify(EXTRA)};
  S.schedule(ctx, out, names.map((type, k) => Object.assign({ type: type, t: 0.5 + k * ${SLOT} }, extra[type] || {})));
  const buf = await ctx.startRendering();
  window.__out = [buf.getChannelData(0), buf.getChannelData(1)];
  return names;
})()`;

// BS.1770 K-weighting at 48 kHz (high shelf, then the RLB high-pass).
function kweight(x) {
  const stages = [
    [[1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]],
    [[1, -2, 1], [1, -1.99004745483398, 0.99007225036621]],
  ];
  let y = Float64Array.from(x);
  for (const [b, a] of stages) {
    const o = new Float64Array(y.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < y.length; i++) {
      const v = b[0] * y[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
      x2 = x1; x1 = y[i]; y2 = y1; y1 = v; o[i] = v;
    }
    y = o;
  }
  return y;
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const ar = re[i + k + len / 2], ai = im[i + k + len / 2];
        const tr = ar * wr - ai * wi, ti = ar * wi + ai * wr;
        re[i + k + len / 2] = re[i + k] - tr; im[i + k + len / 2] = im[i + k] - ti;
        re[i + k] += tr; im[i + k] += ti;
      }
    }
  }
}

/** Energy by frequency over a stretch of mono samples (Hann windows of 2048, half overlapped). */
function spectrum(x) {
  const N = 2048;
  const pow = new Float64Array(N / 2);
  const w = Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  for (let s = 0; s + N <= x.length; s += N / 2) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[s + i] * w[i];
    fft(re, im);
    for (let k = 0; k < N / 2; k++) pow[k] += re[k] * re[k] + im[k] * im[k];
  }
  return pow;
}

const db = (v) => 10 * Math.log10(Math.max(v, 1e-12));
const chrome = await openChrome({ port: 9473, width: 400, height: 400 });
try {
  const page = await chrome.newPage();
  await page.evaluate(readFileSync(path.join(ROOT, 'public/grok-deck/js/sfx.js'), 'utf8'));
  const names = await page.evaluate(PAGE, { awaitPromise: true });
  await page.evaluate(`window.__b64 = (ch, s, e) => {
    const u8 = new Uint8Array(window.__out[ch].slice(s, e).buffer);
    let bin = '';
    for (let k = 0; k < u8.length; k += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(k, k + 0x8000));
    return btoa(bin);
  }`);
  const len = await page.evaluate('window.__out[0].length');
  const pull = async (ch) => {
    const outArr = new Float64Array(len);
    for (let s = 0; s < len; s += 1 << 20) {
      const buf = Buffer.from(await page.evaluate(`window.__b64(${ch}, ${s}, ${Math.min(len, s + (1 << 20))})`), 'base64');
      outArr.set(new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)), s);
    }
    return outArr;
  };
  const L = await pull(0);
  const R = await pull(1);
  const group = (n) => Object.entries(GROUPS).find(([, g]) => g.names.includes(n));
  const rows = [];
  names.forEach((name, k) => {
    const s0 = Math.floor((0.5 + k * SLOT - 0.05) * RATE), s1 = Math.floor((0.5 + (k + 1) * SLOT - 0.1) * RATE);
    const l = L.subarray(s0, s1), r = R.subarray(s0, s1);
    const kl = kweight(l), kr = kweight(r);
    const w = Math.floor(0.15 * RATE);
    let acc = 0, best = 0, peak = 0;
    for (let i = 0; i < kl.length; i++) {
      acc += kl[i] * kl[i] + kr[i] * kr[i];
      if (i >= w) acc -= kl[i - w] * kl[i - w] + kr[i - w] * kr[i - w];
      if (i >= w - 1) best = Math.max(best, acc / w);
      peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
    }
    const mono = Float64Array.from(l, (v, i) => (v + r[i]) / 2);
    const pow = spectrum(mono);
    let tot = 0, cen = 0, lo = 0, hi = 0;
    pow.forEach((p, i) => { const f = (i * RATE) / 2048; tot += p; cen += p * f; if (f < 250) lo += p; if (f > 2000) hi += p; });
    const loud = -0.691 + db(best);
    const g = group(name);
    const trim = g ? Math.pow(10, (g[1].target - loud) / 20) : 1;
    rows.push({ name, group: g ? g[0] : '-', loud: +loud.toFixed(1), peak: +(20 * Math.log10(peak || 1e-9)).toFixed(1), centre: Math.round(cen / tot), lo: Math.round((lo / tot) * 100), hi: Math.round((hi / tot) * 100), trim: +trim.toFixed(2) });
  });
  console.log('name       group   loud   peak  centre  <250  >2k  trim');
  for (const r of rows) console.log(`${r.name.padEnd(10)} ${r.group.padEnd(6)} ${String(r.loud).padStart(6)} ${String(r.peak).padStart(6)} ${String(r.centre).padStart(6)}Hz ${String(r.lo).padStart(4)}% ${String(r.hi).padStart(3)}%  ${r.trim}`);
  console.log('\nTRIM = ' + JSON.stringify(Object.fromEntries(rows.map((r) => [r.name, r.trim]))));
} finally {
  chrome.close();
}
