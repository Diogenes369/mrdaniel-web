#!/usr/bin/env node
// The Figma plugin bridge as its own long-lived process.  Run: npm run figma:bridge
// It must outlive individual MCP sessions, which is why it is not started inside src/server.js.
import { startBridge } from './src/figma-bridge.js';
import { config } from './src/env.js';

const log = (line) => console.log(`[figma-bridge] ${new Date().toTimeString().slice(0, 8)} ${line}`);

// The plugin cannot read this config: a Figma manifest is static and its UI is a sandboxed iframe,
// so the port is hardcoded in two files there. Changing FIGMA_BRIDGE_PORT alone produces a plugin
// that dials a port nothing answers on, with no error beyond a status dot that never turns green.
const PLUGIN_PORT = 3055;
if (config.figma.bridgePort !== PLUGIN_PORT) {
  log(`WARNING: FIGMA_BRIDGE_PORT=${config.figma.bridgePort} but the plugin is pinned to ${PLUGIN_PORT}.`);
  log(`         Edit figma-plugin/manifest.json (allowedDomains + devAllowedDomains) and figma-plugin/ui.html to match, then re-import the plugin.`);
}

try {
  await startBridge({ log });
  log('waiting for the Figma plugin — in Figma desktop: Plugins → Development → mrdaniel content bridge');
} catch (err) {
  console.error(`[figma-bridge] ${err.message}`);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log('shutting down');
    process.exit(0);
  });
}
