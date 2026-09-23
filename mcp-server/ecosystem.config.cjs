// PM2 definition for the 24/7 worker. `.cjs` because package.json is `"type": "module"` and PM2
// loads ecosystem files as CommonJS (same reason as whatsapp-server/ecosystem.config.cjs).
// The MCP server itself is NOT listed: stdio servers are spawned by their client (Claude Desktop /
// Claude Code) per session, not kept running.
const path = require('node:path');
const fs = require('node:fs');

// Hermes Agent's Telegram gateway (2026-09-23). Moved under PM2 for crash recovery; it used to be
// started at logon by Hermes's own scheduled task `Hermes_Gateway`, which is now DISABLED — two
// gateways polling one Telegram bot fight each other (409 Conflict). The command and environment
// below are copied from Hermes's own launcher (%LOCALAPPDATA%\hermes\gateway-service\
// Hermes_Gateway.cmd); if a Hermes update changes that launcher, mirror the change here.
// Skipped entirely on a machine without Hermes, so this file still works anywhere.
const HERMES_HOME = process.env.HERMES_HOME || path.join(process.env.LOCALAPPDATA || '', 'hermes');
const HERMES_AGENT = path.join(HERMES_HOME, 'hermes-agent');
const HERMES_PY = path.join(HERMES_AGENT, 'venv', 'Scripts', 'python.exe');
const hermesApp = fs.existsSync(HERMES_PY)
  ? [
      {
        name: 'hermes-gateway',
        script: HERMES_PY,
        args: ['-m', 'hermes_cli.main', 'gateway', 'run'],
        interpreter: 'none',
        cwd: HERMES_HOME,
        autorestart: true,
        watch: false,
        exp_backoff_restart_delay: 2000,
        min_uptime: '60s',
        max_restarts: 1_000_000,
        // Long polling reconnects cleanly; give in-flight replies a moment on stop/restart.
        kill_timeout: 10000,
        windowsHide: true,
        env: {
          HERMES_HOME,
          PYTHONIOENCODING: 'utf-8',
          HERMES_GATEWAY_DETACHED: '1',
          HERMES_SUPERVISED_CHILD: '1',
          VIRTUAL_ENV: path.join(HERMES_AGENT, 'venv'),
          PYTHONPATH: HERMES_AGENT,
        },
      },
    ]
  : [];

module.exports = {
  apps: [
    ...hermesApp,
    {
      name: 'mrdaniel-agent',
      script: 'start-agent.js',
      cwd: __dirname,
      autorestart: true,
      watch: false,
      // Crash recovery must never give up (2026-09-23). `max_restarts: 20` + a fixed 10 s delay
      // meant a 3-minute outage (network down at boot, Firebase unreachable) burned all 20
      // "unstable" restarts and PM2 stopped the worker for good — silently, until someone looked.
      // Exponential backoff instead: 2 s, 3 s, 4.5 s … capped by PM2 at 15 s, retried forever, and
      // reset once the process has stayed up for `min_uptime`.
      exp_backoff_restart_delay: 2000,
      min_uptime: '60s',
      max_restarts: 1_000_000,
      // A slow leak in a months-long process ends in a restart, not in the machine swapping.
      max_memory_restart: '400M',
      kill_timeout: 8000,
      env: { NODE_ENV: 'production' },
    },
  ],
};
