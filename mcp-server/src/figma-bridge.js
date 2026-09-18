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

const HOST = '127.0.0.1';
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
  'swap_image',
  'set_variant',
  'export_node',
];

// ─── server ─────────────────────────────────────────────────────────────────────────────────

export function startBridge({ port = config.figma.bridgePort, log = () => {} } = {}) {
  const wss = new WebSocketServer({ host: HOST, port });
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

  return new Promise((resolve, reject) => {
    wss.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`port ${port} is already in use — a bridge is probably already running (that is fine; use it)`));
      } else reject(err);
    });
    wss.on('listening', () => {
      log(`bridge listening on ws://${HOST}:${port}`);
      resolve({ wss, port, close: () => new Promise((r) => wss.close(r)) });
    });
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
