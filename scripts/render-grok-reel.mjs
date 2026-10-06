#!/usr/bin/env node
/**
 * Renders the Grok Bot deck (public/grok-deck) into a 1080×1920 Instagram Reel, with its sound.
 *
 * The deck plays itself in `?reel` mode (fixed vertical frame, text kept out of the Reels UI, each
 * slide held for its choreography plus reading time). This script runs it in headless Chrome on a
 * virtual clock: every frame advances time by exactly 1/30 s — timers, requestAnimationFrame,
 * performance.now, GSAP and CSS animations alike — so the video is smooth however slowly the
 * machine renders, and the frames go straight into ffmpeg.
 *
 * While it records, every sound the deck would make on the website (a click, a hop, a stamp, a
 * slide change; public/grok-deck/js/sfx.js) is logged as a cue instead, with the moment each slide
 * came in. Those become the cue sheet (<name>.cues.json, exact to the frame), and
 * scripts/reel-audio.mjs scores the video from it: the same sounds at the same frames, under music
 * that keeps time with the slides.
 *
 *   node scripts/render-grok-reel.mjs [out.mp4] [--seconds N] [--from <slide key>]
 *
 * --seconds stops early and --from starts at a later slide: both are for checking one part of the
 * reel quickly; a real render uses neither.
 *
 * Default output: reels/out/grok-bot-reel.mp4 (+ grok-bot-reel-cover.jpg, grok-bot-reel.cues.json).
 * Needs Chrome or Edge and ffmpeg on PATH; fonts load from Google Fonts, so it needs a network
 * connection.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openChrome } from './lib/headless.mjs';
import { cuePath, scoreVideo } from './reel-audio.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const LIMIT = Number(opt('--seconds') || 0);
const FROM = opt('--from');
const OUT = path.resolve(args.find((a, i) => !a.startsWith('--') && !['--seconds', '--from'].includes(args[i - 1])) || path.join(ROOT, 'reels/out/grok-bot-reel.mp4'));
const COVER = OUT.replace(/\.mp4$/i, '') + '-cover.jpg';
const SILENT = path.join(tmpdir(), `grok-reel-picture-${process.pid}.mp4`);
const FPS = 30;
const W = 1080;
const H = 1920;
mkdirSync(path.dirname(OUT), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Installed before any page script, so GSAP and the deck only ever see virtual time.
const VIRTUAL_CLOCK = `(() => {
  let now = 0;
  const t0 = Date.now();
  performance.now = () => now;
  Date.now = () => t0 + now;
  let raf = [], rafId = 0, tid = 0;
  const timers = new Map();
  window.requestAnimationFrame = (cb) => { raf.push([++rafId, cb]); return rafId; };
  window.cancelAnimationFrame = (id) => { raf = raf.filter((r) => r[0] !== id); };
  window.setTimeout = (fn, ms, ...a) => { timers.set(++tid, { at: now + Math.max(0, +ms || 0), fn, a, iv: 0 }); return tid; };
  window.setInterval = (fn, ms, ...a) => { const iv = Math.max(1, +ms || 0); timers.set(++tid, { at: now + iv, fn, a, iv }); return tid; };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  const call = (f, a) => { try { typeof f === 'function' ? f(...a) : (0, eval)(String(f)); } catch (e) { console.error(e); } };
  window.__vt = {
    get now() { return now; },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let id = 0, t = null;
        for (const [k, v] of timers) if (v.at <= end && (!t || v.at < t.at)) { id = k; t = v; }
        if (!t) break;
        now = Math.max(now, t.at);
        if (t.iv) t.at += t.iv; else timers.delete(id);
        call(t.fn, t.a);
      }
      now = end;
      const q = raf; raf = [];
      for (const [, cb] of q) call(cb, [now]);
      for (const an of document.getAnimations()) {
        if (an.__v0 === undefined) { an.__v0 = now - (an.currentTime || 0); an.pause(); }
        an.currentTime = now - an.__v0;
      }
      return now;
    },
  };
})();`;

const chrome = await openChrome({ port: 9471, width: W, height: H });
let ff = null;
try {
  const { send, evaluate } = await chrome.newPage();
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: VIRTUAL_CLOCK });
  await send('Page.navigate', { url: pathToFileURL(path.join(ROOT, 'public/grok-deck/index.html')).href + '?reel' + (FROM ? '&from=' + encodeURIComponent(FROM) : '') });

  // Fonts arrive on the real clock; the deck starts once they have (or after its own timeout).
  let started = false;
  for (let i = 0; i < 60 && !started; i++) {
    await sleep(500);
    started = await evaluate('!!(window.Deck && window.Deck.state.i >= 0)');
    if (!started && i === 20) await evaluate('window.__vt && window.__vt.advance(1700)');
  }
  if (!started) throw new Error('deck never started (fonts or scripts failed to load)');

  ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-profile:v', 'high', '-r', String(FPS), '-movflags', '+faststart', SILENT],
  { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = new Promise((res, rej) => { ff.on('exit', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))); });

  const t0 = Date.now();
  const v0 = await evaluate('window.__vt.now');
  const keyCount = await evaluate('document.querySelectorAll(".slide").length');
  let frame = 0;
  for (;;) {
    await evaluate(`window.__vt.advance(${1000 / FPS})`);
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 94 });
    const buf = Buffer.from(shot.result.data, 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    frame++;
    if (!FROM && frame === Math.round(FPS * 4.4)) writeFileSync(COVER, buf); // the cover slide at rest, before it hands over
    if (frame % FPS === 0) {
      const st = await evaluate('JSON.stringify({ i: Deck.state.i, done: !!(window.__reel && window.__reel.done) })');
      const { i, done } = JSON.parse(st);
      const secs = frame / FPS;
      process.stdout.write(`\r${secs}s rendered · slide ${i + 1}/${keyCount} ·${(frame / ((Date.now() - t0) / 1000)).toFixed(1)} fps   `);
      if (done || (LIMIT && secs >= LIMIT) || secs > 290) break;
    }
  }
  const log = await evaluate('JSON.stringify(window.__reel.log)');
  const slideCount = await evaluate('document.querySelectorAll(".slide").length');
  // Virtual ms → video seconds. Frame k (from 1) is captured once the clock reaches v0 + k/FPS and
  // shows at (k - 1)/FPS, so an event lands on the first frame captured at or after it.
  const duration = frame / FPS;
  const cues = JSON.parse(await evaluate('JSON.stringify(window.__reel.cues)'))
    .map((c) => ({ ...c, t: (Math.max(1, Math.ceil((c.t - v0) / (1000 / FPS) - 1e-6)) - 1) / FPS }))
    .filter((c) => c.t < duration);
  ff.stdin.end();
  await ffDone;
  const bpm = await evaluate('window.__reel.bpm');
  const sheet = { fps: FPS, duration, slideCount, bpm, cues };
  writeFileSync(cuePath(OUT), JSON.stringify(sheet, null, 1));
  const sound = await scoreVideo(SILENT, sheet, OUT, { chrome });
  rmSync(SILENT, { force: true });
  console.log(`\nwrote ${OUT} (${duration.toFixed(1)}s, ${frame} frames) and ${COVER}`);
  console.log('per slide:', log);
  console.log(`sound: ${cues.length} cues, ${sound.loudness} LUFS, true peak ${sound.peak} dBTP`);
} catch (err) {
  if (ff) ff.stdin.end();
  console.error(err);
  process.exitCode = 1;
} finally {
  chrome.close();
}
