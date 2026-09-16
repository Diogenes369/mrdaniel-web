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
      max_restarts: 20,
      restart_delay: 10000,
      kill_timeout: 8000,
      env: { NODE_ENV: 'production' },
    },
  ],
};
