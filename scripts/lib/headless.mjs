/**
 * Headless Chrome (or Edge) over the DevTools protocol, for the reel scripts: one browser, any number
 * of pages, each with `send(method, params)` and `evaluate(expression)`. No dependencies; Node's
 * own fetch and WebSocket do the talking.
 *
 * The profile goes in a short temp path: Chrome on Windows fails to start with a long
 * --user-data-dir.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function openChrome({ port = 9471, width = 1080, height = 1920 } = {}) {
  const exe = CHROMES.find((p) => existsSync(p));
  if (!exe) throw new Error('Chrome or Edge not found');
  const proc = spawn(exe, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(tmpdir(), 'grok-reel-' + port)}`,
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--mute-audio', '--no-first-run',
    '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--autoplay-policy=no-user-gesture-required', `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: 'ignore' });

  async function devtools(p, method = 'GET') {
    for (let i = 0; i < 80; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}${p}`, { method });
        if (r.ok) return r.json();
      } catch { /* not up yet */ }
      await sleep(250);
    }
    throw new Error('Chrome DevTools endpoint never came up');
  }

  const pages = [];
  async function newPage() {
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
    const evaluate = async (expression, { awaitPromise = false } = {}) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
      return r.result?.result?.value;
    };
    const page = { send, evaluate, close: () => ws.close() };
    pages.push(page);
    return page;
  }

  return {
    newPage,
    close() {
      pages.forEach((p) => { try { p.close(); } catch { /* already closed */ } });
      proc.kill();
    },
  };
}
