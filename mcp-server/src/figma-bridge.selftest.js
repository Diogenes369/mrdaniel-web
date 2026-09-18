// Drives the bridge protocol end-to-end against a mock plugin that mirrors figma-plugin/ui.html.
// Proves the relay, not Figma itself: the real plugin's figma.* calls can only be tested in Figma.
// Run: npm run test:bridge
import { WebSocket } from 'ws';
import { startBridge, figmaPluginCommand, figmaBridgeStatus } from './figma-bridge.js';

const PORT = 3099;
const ok = [], bad = [];
const t = (label, cond, extra='') => (cond ? ok : bad).push(`${cond?'PASS':'FAIL'} ${label}${extra?` — ${extra}`:''}`);

// 1. status with no bridge running
let s = await figmaBridgeStatus({ port: PORT });
t('status: no bridge -> ok:false + hint', s.ok === false && /npm run figma:bridge/.test(s.error), s.error);

const bridge = await startBridge({ port: PORT, log: () => {} });

// Both loopback spellings must reach it. `localhost` resolves to ::1 first on Windows, and the
// plugin UI can only use the hostname (Figma's manifest rejects an IP literal), so a bridge bound
// to IPv4 alone would leave the plugin dialling a port nothing answers on.
for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
  const reached = await new Promise((resolve) => {
    const s = new WebSocket(`ws://${host}:${PORT}`);
    const done = (v) => { clearTimeout(timer); try { s.close(); } catch { /* already closing */ } resolve(v); };
    const timer = setTimeout(() => done(false), 3000);
    s.on('open', () => done(true));
    s.on('error', () => done(false));
  });
  t(`reachable via ${host}`, reached);
}

// 2. status with bridge, no plugin
s = await figmaBridgeStatus({ port: PORT });
t('status: bridge up, no plugin', s.ok === true && s.pluginConnected === false, JSON.stringify(s));

// 3. command with no plugin -> clear error
try { await figmaPluginCommand('ping', {}, { port: PORT }); t('command w/o plugin throws', false); }
catch (e) { t('command w/o plugin throws', /no Figma plugin connected/.test(e.message), e.message.slice(0,50)); }

// 4. unknown command rejected before reaching plugin
try { await figmaPluginCommand('rm_rf', {}, { port: PORT }); t('unknown command rejected', false); }
catch (e) { t('unknown command rejected', /unknown command/.test(e.message)); }

// mock plugin: mirrors figma-plugin/ui.html's socket behaviour
const plugin = new WebSocket(`ws://127.0.0.1:${PORT}`);
await new Promise((r) => plugin.on('open', r));
plugin.send(JSON.stringify({ type: 'register', role: 'plugin', name: 'mock' }));
plugin.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.type !== 'command') return;
  if (m.command === 'ping') plugin.send(JSON.stringify({ type: 'result', id: m.id, ok: true, data: { pong: true, file: 'Mock File' } }));
  if (m.command === 'set_texts') plugin.send(JSON.stringify({ type: 'result', id: m.id, ok: true, data: { applied: m.params.entries.map(e => ({ name: e.name, after: e.text })), missing: [], appliedCount: m.params.entries.length } }));
  if (m.command === 'set_text') plugin.send(JSON.stringify({ type: 'result', id: m.id, ok: false, error: 'node 1:2 is a FRAME, not TEXT' }));
  if (m.command === 'export_node') { /* never answers — exercises the timeout */ }
});
await new Promise((r) => setTimeout(r, 200));

// 5. status now sees the plugin
s = await figmaBridgeStatus({ port: PORT });
t('status: plugin connected', s.ok && s.pluginConnected === true, JSON.stringify(s));

// 6. round trip
const pong = await figmaPluginCommand('ping', {}, { port: PORT });
t('ping round trip', pong.pong === true && pong.file === 'Mock File', JSON.stringify(pong));

// 7. batch injection round trip
const injected = await figmaPluginCommand('set_texts', { rootId: '1:1', entries: [{ name: 'headline', text: 'שלום' }, { name: 'cta', text: 'link in bio' }] }, { port: PORT });
t('set_texts round trip', injected.appliedCount === 2 && injected.applied[0].after === 'שלום', JSON.stringify(injected));

// 8. plugin-side error propagates as a throw
try { await figmaPluginCommand('set_text', { nodeId: '1:2', text: 'x' }, { port: PORT }); t('plugin error propagates', false); }
catch (e) { t('plugin error propagates', /not TEXT/.test(e.message), e.message); }

// 9. timeout when the plugin never answers
try { await figmaPluginCommand('export_node', { nodeId: '1:1' }, { port: PORT, timeoutMs: 700 }); t('timeout fires', false); }
catch (e) { t('timeout fires', /timed out after 700ms/.test(e.message), e.message); }

// 10. concurrent commands are not cross-wired
const [a, b] = await Promise.all([
  figmaPluginCommand('set_texts', { entries: [{ name: 'a', text: 'AAA' }] }, { port: PORT }),
  figmaPluginCommand('set_texts', { entries: [{ name: 'b', text: 'BBB' }] }, { port: PORT }),
]);
t('concurrent commands stay separate', a.applied[0].after === 'AAA' && b.applied[0].after === 'BBB', `${a.applied[0].after}/${b.applied[0].after}`);

// 11. plugin disconnect fails in-flight work cleanly
plugin.close();
await new Promise((r) => setTimeout(r, 200));
try { await figmaPluginCommand('ping', {}, { port: PORT }); t('after disconnect -> clear error', false); }
catch (e) { t('after disconnect -> clear error', /no Figma plugin connected/.test(e.message)); }

for (const l of [...ok, ...bad]) console.log(l);
await bridge.close();
console.log(`\n${ok.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
