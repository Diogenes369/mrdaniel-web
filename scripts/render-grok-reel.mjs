#!/usr/bin/env node
/**
 * Renders the Grok Bot deck (public/grok-deck) into a 1080×1920 Instagram Reel.
 *
 * The deck plays itself in `?reel` mode (fixed vertical frame, text kept out of the Reels UI, each
 * slide held for its choreography plus reading time). This script runs it in headless Chrome on a
 * virtual clock: every frame advances time by exactly 1/30 s — timers, requestAnimationFrame,
 * performance.now, GSAP and CSS animations alike — so the video is smooth however slowly the
 * machine renders, and the frames go straight into ffmpeg.
 *
 * While it records, the deck logs the moment each slide comes in and each time the bot lands. Those
 * become the cue sheet (<name>.cues.json, exact to the frame), and scripts/reel-audio.mjs scores the
 * video from it, so the sound follows the picture without any hand timing.
 *
 *   node scripts/render-grok-reel.mjs [out.mp4] [--seconds N]
 *
 * Default output: reels/out/grok-bot-reel.mp4 (+ grok-bot-reel-cover.jpg, grok-bot-reel.cues.json).
 * Needs Chrome or Edge and ffmpeg on PATH; fonts load from Google Fonts, so it needs a network
 * connection.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cuePath, scoreVideo } from './reel-audio.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const secIdx = args.indexOf('--seconds');
const LIMIT = secIdx >= 0 ? Number(args[secIdx + 1]) : 0;
const OUT = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--seconds') || path.join(ROOT, 'reels/out/grok-bot-reel.mp4'));
const COVER = OUT.replace(/\.mp4$/i, '') + '-cover.jpg';
const SILENT = path.join(tmpdir(), `grok-reel-picture-${process.pid}.mp4`);
const FPS = 30;
const W = 1080;
const H = 1920;
const PORT = 9471;
const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
];
const CHROME = CHROMES.find((p) => existsSync(p));
if (!CHROME) throw new Error('Chrome or Edge not found');
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

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(tmpdir(), 'grok-reel-' + PORT)}`,
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--mute-audio', '--no-first-run',
  '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  `--window-size=${W},${H}`, 'about:blank',
], { stdio: 'ignore' });

async function devtools(p, method = 'GET') {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method });
      if (r.ok) return r.json();
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('Chrome DevTools endpoint never came up');
}

let ff = null;
try {
  const target = await devtools('/json/new?about:blank', 'PUT');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    else if (d.method === 'Runtime.exceptionThrown') console.error('page exception:', d.params.exceptionDetails.text, d.params.exceptionDetails.exception?.description || '');
  };
  await new Promise((r) => { ws.onopen = r; });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: VIRTUAL_CLOCK });
  await send('Page.navigate', { url: pathToFileURL(path.join(ROOT, 'public/grok-deck/index.html')).href + '?reel' });

  // Fonts arrive on the real clock; the deck starts once they have (or after its own timeout).
  let started = false;
  for (let i = 0; i < 60 && !started; i++) {
    await sleep(500);
    started = await evaluate('!!(window.Deck && window.Deck.state.i === 0)');
    if (!started && i === 20) await evaluate('window.__vt && window.__vt.advance(1700)');
  }
  if (!started) throw new Error('deck never started (fonts or scripts failed to load)');

  ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-profile:v', 'high', '-r', String(FPS), '-movflags', '+faststart', SILENT],
  { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = new Promise((res, rej) => { ff.on('exit', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))); });

  const t0 = Date.now();
  const v0 = await evaluate('window.__vt.now');
  let frame = 0;
  for (;;) {
    await evaluate(`window.__vt.advance(${1000 / FPS})`);
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 94 });
    const buf = Buffer.from(shot.result.data, 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    frame++;
    if (frame === Math.round(FPS * 6.2)) writeFileSync(COVER, buf); // the cover slide at rest, before it hands over
    if (frame % FPS === 0) {
      const st = await evaluate('JSON.stringify({ i: Deck.state.i, done: !!(window.__reel && window.__reel.done) })');
      const { i, done } = JSON.parse(st);
      const secs = frame / FPS;
      process.stdout.write(`\r${secs}s rendered · slide ${i + 1}/16 · ${(frame / ((Date.now() - t0) / 1000)).toFixed(1)} fps   `);
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
  ws.close();
  const sheet = { fps: FPS, duration, slideCount, cues };
  writeFileSync(cuePath(OUT), JSON.stringify(sheet, null, 2));
  const sound = scoreVideo(SILENT, sheet, OUT);
  rmSync(SILENT, { force: true });
  console.log(`\nwrote ${OUT} (${(frame / FPS).toFixed(1)}s, ${frame} frames) and ${COVER}`);
  console.log('per slide:', log);
  console.log(`sound: ${cues.length} cues, ${sound.loudness} LUFS, true peak ${sound.peak} dBTP`);
} catch (err) {
  if (ff) ff.stdin.end();
  console.error(err);
  process.exitCode = 1;
} finally {
  chrome.kill();
}
