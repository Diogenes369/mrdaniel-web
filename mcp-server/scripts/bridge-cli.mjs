/**
 * Minimal controller for the Figma bridge — send one command, print the result, exit.
 *
 * Exists because the MCP server process caches its tool schemas at startup: a new parameter (the
 * font fallback) is not visible to an already-running MCP session, and the bridge relays `params`
 * verbatim to the plugin anyway. So this talks the bridge's own protocol directly, which makes the
 * plugin the only component that has to be reloaded when the pipeline changes.
 *
 * Usage:
 *   node scripts/bridge-cli.mjs ping
 *   node scripts/bridge-cli.mjs set_texts '<json params>'
 *   node scripts/bridge-cli.mjs set_texts @path/to/params.json
 */
import fs from 'node:fs';
import WebSocket from 'ws';

const [, , command, rawParams] = process.argv;
if (!command) {
  console.error('usage: node scripts/bridge-cli.mjs <command> [json | @file]');
  process.exit(2);
}

let params = {};
if (rawParams) {
  const text = rawParams.startsWith('@') ? fs.readFileSync(rawParams.slice(1), 'utf8') : rawParams;
  params = JSON.parse(text);
}

const PORT = Number(process.env.FIGMA_BRIDGE_PORT || 3055);
const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
const id = `cli-${Date.now()}`;

const timer = setTimeout(() => {
  console.error('timed out after 60s with no result from the plugin');
  process.exit(1);
}, 60000);

ws.on('open', () => ws.send(JSON.stringify({ type: 'register', role: 'controller' })));

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === 'registered') {
    if (!msg.pluginConnected) {
      clearTimeout(timer);
      console.error('no plugin connected to the bridge');
      process.exit(1);
    }
    ws.send(JSON.stringify({ type: 'command', id, command, params }));
    return;
  }
  if (msg.type === 'result' && msg.id === id) {
    clearTimeout(timer);
    console.log(JSON.stringify(msg.ok === false ? { ok: false, error: msg.error } : (msg.result ?? msg), null, 1));
    process.exit(msg.ok === false ? 1 : 0);
  }
});

ws.on('error', (err) => {
  clearTimeout(timer);
  console.error('bridge connection failed:', err.message);
  process.exit(1);
});
