#!/usr/bin/env node
// The Figma plugin bridge as its own long-lived process.  Run: npm run figma:bridge
// It must outlive individual MCP sessions, which is why it is not started inside src/server.js.
import { startBridge } from './src/figma-bridge.js';

const log = (line) => console.log(`[figma-bridge] ${new Date().toTimeString().slice(0, 8)} ${line}`);

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
