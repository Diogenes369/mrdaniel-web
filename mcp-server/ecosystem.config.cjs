// PM2 definition for the 24/7 worker. `.cjs` because package.json is `"type": "module"` and PM2
// loads ecosystem files as CommonJS (same reason as whatsapp-server/ecosystem.config.cjs).
// The MCP server itself is NOT listed: stdio servers are spawned by their client (Claude Desktop /
// Claude Code) per session, not kept running.
module.exports = {
  apps: [
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
