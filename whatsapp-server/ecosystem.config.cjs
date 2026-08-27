// PM2 process definition for 24/7 operation. Named `.cjs` (not `.js`) deliberately — package.json
// sets `"type": "module"`, and PM2 ecosystem files are loaded as CommonJS, so a plain `.js` here
// would fail to parse `module.exports` under Node's ESM rules.
module.exports = {
  apps: [
    {
      name: 'whatsapp-bridge',
      script: 'index.js',
      cwd: __dirname,
      autorestart: true,
      watch: false,
      max_restarts: 15,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
