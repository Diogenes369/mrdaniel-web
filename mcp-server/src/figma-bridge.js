import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from './env.js';

/**
 * The WRITE half of the Figma integration.
 *
 * Figma's REST API cannot mutate a node — no endpoint sets `characters` on a TEXT node or swaps an
 * image fill. Only the Plugin API can, and that runs sandboxed inside the Figma desktop app with no
 * way to listen on a socket. So the plugin dials *out* to this bridge over WebSocket, and MCP tools
 * dial in as controllers. The bridge is a pairing relay and nothing more: it holds no Figma state.
 *
 *   figma-plugin (in Figma desktop)  ──ws──▶  bridge :3055  ◀──ws──  MCP tool / dashboard
 *
 * It runs as its own process (`npm run figma:bridge`) rather than inside the MCP server, because an
 * MCP server is spawned per client session while the plugin connection has to outlive all of them.
 *
 * Loopback only. Anything that can reach this port can edit the open Figma file, so it must never
 * be bound to 0.0.0.0.
 */

/**
 * Both loopback addresses, because `localhost` resolves to `::1` first on Windows while a server
 * bound only to `127.0.0.1` never hears it. Node's own client papers over that with Happy Eyeballs;
 * the plugin UI is a browser iframe and is not guaranteed to. Binding both removes the question.
 * Still loopback only — anything that reaches this port can edit the open Figma file.
 */
const HOSTS = ['127.0.0.1', '::1'];
/** What controllers and the plugin UI dial. A hostname, since Figma's manifest rejects an IP literal. */
const HOST = 'localhost';
const PROTOCOL_VERSION = 1;

/** A plugin call that never answers must not hang the MCP tool forever. */
const COMMAND_TIMEOUT_MS = 30000;

/** Commands the plugin is expected to implement. The bridge rejects anything else up front. */
export const PLUGIN_COMMANDS = [
  'ping',
  'get_document_info',
  'get_selection',
  'get_text_nodes',
  'set_text',
  'set_texts',
  'duplicate_frame',
  'set_fills',
  'get_node_fills',
  'swap_image',
  'set_variant',
  'set_layer_name',
  'export_node',
];

// ─── server ─────────────────────────────────────────────────────────────────────────────────

export function startBridge({ port = config.figma.bridgePort, log = () => {} } = {}) {
  // One protocol handler, fed by an HTTP listener per loopback address.
  const wss = new WebSocketServer({ noServer: true });
  /** The single connected Figma plugin. Last one to register wins — reloading the plugin reconnects. */
  let plugin = null;
  /** id → controller socket, so a result goes back only to whoever asked. */
  const pending = new Map();

  wss.on('connection', (socket) => {
    socket.role = 'unknown';

    socket.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return send(socket, { type: 'error', error: 'expected JSON' });
      }

      if (msg.type === 'register') {
        socket.role = msg.role === 'plugin' ? 'plugin' : 'controller';
        if (socket.role === 'plugin') {
          if (plugin && plugin !== socket && plugin.readyState === WebSocket.OPEN) {
            send(plugin, { type: 'error', error: 'replaced by a newer plugin connection' });
          }
          plugin = socket;
          log(`plugin connected (${msg.name ?? 'figma'})`);
        }
        return send(socket, { type: 'registered', role: socket.role, protocol: PROTOCOL_VERSION, pluginConnected: isLive(plugin) });
      }

      if (msg.type === 'command') {
        if (!PLUGIN_COMMANDS.includes(msg.command)) {
          return send(socket, { type: 'result', id: msg.id, ok: false, error: `unknown command "${msg.command}" — known: ${PLUGIN_COMMANDS.join(', ')}` });
        }
        if (!isLive(plugin)) {
          return send(socket, {
            type: 'result',
            id: msg.id,
            ok: false,
            error: 'no Figma plugin connected — open the file in Figma desktop and run Plugins → Development → mrdaniel content bridge',
          });
        }
        pending.set(msg.id, socket);
        return send(plugin, { type: 'command', id: msg.id, command: msg.command, params: msg.params ?? {} });
      }

      if (msg.type === 'result') {
        const controller = pending.get(msg.id);
        pending.delete(msg.id);
        if (controller && controller.readyState === WebSocket.OPEN) send(controller, msg);
        return undefined;
      }

      return send(socket, { type: 'error', error: `unknown message type "${msg.type}"` });
    });

    socket.on('close', () => {
      if (socket === plugin) {
        plugin = null;
        log('plugin disconnected');
        // Fail every in-flight call rather than let the controllers sit until their own timeout.
        for (const [id, controller] of pending) {
          if (controller.readyState === WebSocket.OPEN) send(controller, { type: 'result', id, ok: false, error: 'the Figma plugin disconnected mid-command' });
        }
        pending.clear();
      }
      for (const [id, controller] of pending) if (controller === socket) pending.delete(id);
    });

    socket.on('error', () => {
      /* a dropped socket is handled by 'close'; nothing extra to do */
    });
  });

  return listenAll(port, wss, log);
}

/**
 * Bring up one HTTP listener per loopback address and hand their upgrades to the shared handler.
 *
 * IPv4 is required; `::1` is best-effort, since a machine with IPv6 disabled has no such address and
 * that is not a reason to fail. EADDRINUSE on the first address is still fatal — it means a bridge
 * is already running, and silently becoming a second one would split the plugin's connections.
 */
function listenAll(port, wss, log) {
  const servers = [];
  const close = () =>
    Promise.all(servers.map((s) => new Promise((r) => s.close(r)))).then(() => new Promise((r) => wss.close(r)));

  return new Promise((resolve, reject) => {
    let pending = HOSTS.length;
    let bound = 0;

    for (const host of HOSTS) {
      const server = http.createServer((_req, res) => {
        res.writeHead(426, { 'Content-Type': 'text/plain' });
        res.end('this port speaks WebSocket only — see mcp-server/README.md\n');
      });
      server.on('upgrade', (req, socket, head) => wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req)));
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          servers.forEach((s) => s.close());
          return reject(new Error(`port ${port} is already in use — a bridge is probably already running (that is fine; use it)`));
        }
        // ::1 is unavailable when IPv6 is off. Note it and carry on with IPv4.
        log(`could not bind ${host}: ${err.code ?? err.message}`);
        if (--pending === 0) finish();
        return undefined;
      });
      server.listen(port, host, () => {
        servers.push(server);
        bound += 1;
        if (--pending === 0) finish();
      });
    }

    function finish() {
      if (!bound) return reject(new Error(`could not bind port ${port} on any loopback address`));
      log(`bridge listening on ws://${HOST}:${port} (${servers.length} loopback address${servers.length === 1 ? '' : 'es'})`);
      return resolve({ wss, port, servers, close });
    }
  });
}

function isLive(socket) {
  return Boolean(socket) && socket.readyState === WebSocket.OPEN;
}

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

// ─── controller ─────────────────────────────────────────────────────────────────────────────

/**
 * Run one command against the plugin and close.
 *
 * A fresh connection per command, deliberately: an MCP tool call is a one-shot, and a pooled socket
 * held across a stdio session would outlive the bridge restarts that happen every time the plugin
 * is reloaded during design work.
 */
export async function figmaPluginCommand(command, params = {}, { port = config.figma.bridgePort, timeoutMs = COMMAND_TIMEOUT_MS } = {}) {
  const url = `ws://${HOST}:${port}`;
  const socket = new WebSocket(url);
  const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`figma plugin command "${command}" timed out after ${timeoutMs}ms`)), timeoutMs);
      const done = (fn) => (value) => {
        clearTimeout(timer);
        fn(value);
      };
      const ok = done(resolve);
      const bad = done(reject);

      socket.on('open', () => {
        socket.send(JSON.stringify({ type: 'register', role: 'controller' }));
        socket.send(JSON.stringify({ type: 'command', id, command, params }));
      });
      socket.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (msg.type === 'registered') return;
        if (msg.type === 'result' && msg.id === id) {
          if (msg.ok) ok(msg.data ?? null);
          else bad(new Error(msg.error ?? 'the plugin returned an error with no message'));
        }
      });
      socket.on('error', (err) => {
        bad(
          err?.code === 'ECONNREFUSED'
            ? new Error(`no bridge at ${url} — start it with \`npm run figma:bridge\` in mcp-server/`)
            : err
        );
      });
      socket.on('close', () => bad(new Error('bridge closed the connection before answering')));
    });
  } finally {
    socket.close();
  }
}

/** Is a bridge up, and is a plugin attached to it? Never throws — this is a status probe. */
export async function figmaBridgeStatus({ port = config.figma.bridgePort } = {}) {
  const url = `ws://${HOST}:${port}`;
  return new Promise((resolve) => {
    const socket = new WebSocket(url);
    const finish = (value) => {
      clearTimeout(timer);
      socket.close();
      resolve(value);
    };
    const timer = setTimeout(() => finish({ ok: false, url, error: 'bridge did not answer within 3000ms' }), 3000);
    socket.on('open', () => socket.send(JSON.stringify({ type: 'register', role: 'controller' })));
    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'registered') finish({ ok: true, url, protocol: msg.protocol, pluginConnected: Boolean(msg.pluginConnected) });
      } catch {
        // a malformed frame here just means "not our bridge"; the timeout resolves it
      }
    });
    socket.on('error', (err) =>
      finish({
        ok: false,
        url,
        pluginConnected: false,
        error: err?.code === 'ECONNREFUSED' ? 'no bridge running — start it with `npm run figma:bridge` in mcp-server/' : String(err?.message ?? err),
      })
    );
  });
}
