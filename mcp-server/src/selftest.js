// End-to-end check of the MCP server over a real stdio client — the same path Claude Desktop uses.
// Read-only: it never generates a draft or changes a status.  Run: npm run selftest
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const client = new Client({ name: 'selftest', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('./server.js', import.meta.url))], stderr: 'inherit' }));

const text = (r) => r.content?.map((c) => c.text).join('\n') ?? '';
const results = [];
const check = async (label, fn, expectError = false) => {
  try {
    const r = await fn();
    const pass = expectError ? Boolean(r.isError) : !r.isError;
    results.push([pass ? 'PASS' : 'FAIL', label, text(r).slice(0, 400).replace(/\s+/g, ' ')]);
  } catch (err) {
    results.push(['FAIL', label, String(err?.message ?? err)]);
  }
};

const { tools } = await client.listTools();
results.push(['INFO', 'tools', tools.map((t) => t.name).join(', ')]);
const { resources } = await client.listResources();
results.push(['INFO', 'resources', resources.map((r) => r.uri).join(', ')]);

await check('fs_list .', () => client.callTool({ name: 'fs_list', arguments: { path: '.' } }));
await check('fs_read AGENTS.md', () => client.callTool({ name: 'fs_read', arguments: { path: 'AGENTS.md' } }));
await check('fs_read .env is refused', () => client.callTool({ name: 'fs_read', arguments: { path: '.env' } }), true);
await check('fs_read ../ escape is refused', () => client.callTool({ name: 'fs_read', arguments: { path: '../outside.txt' } }), true);
await check('health_check', () => client.callTool({ name: 'health_check', arguments: {} }));
await check('business_metrics', () => client.callTool({ name: 'business_metrics', arguments: { days: 7 } }));
await check('queue_list', () => client.callTool({ name: 'queue_list', arguments: { limit: 3 } }));
await check('published_posts_list', () => client.callTool({ name: 'published_posts_list', arguments: { limit: 3 } }));

for (const [s, l, d] of results) console.log(`${s.padEnd(4)} ${l}${d ? ` — ${d}` : ''}`);
await client.close();
process.exit(results.some(([s]) => s === 'FAIL') ? 1 : 0);
