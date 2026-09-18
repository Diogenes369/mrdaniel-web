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

// Local models. These need Ollama running (`ollama serve`); a failure here is a local-setup problem,
// not a production one. ollama_generate is slow only on the first call of the day — the model load.
await check('ollama_models', () => client.callTool({ name: 'ollama_models', arguments: {} }));
await check('ollama_generate', () => client.callTool({ name: 'ollama_generate', arguments: { prompt: 'Reply with exactly: ok', maxTokens: 16 } }));
await check('ollama_json', () =>
  client.callTool({
    name: 'ollama_json',
    arguments: { prompt: 'Two colours of the Israeli flag.', schema: { type: 'object', properties: { colors: { type: 'array', items: { type: 'string' } } }, required: ['colors'] } },
  })
);

// Copy rules are pure functions — they pass or fail deterministically, with or without a network.
await check('caption_check flags a long caption', () =>
  client.callTool({ name: 'caption_check', arguments: { text: 'בעידן הדיגיטלי חשוב לציין שאבטחת מידע היא נושא מורכב. יש הרבה מה ללמוד. כדאי להתעמק. ועוד משפט. וגם זה. https://example.com' } })
);
await check('caption_check passes a good caption', () => client.callTool({ name: 'caption_check', arguments: { text: 'רוב הדליפות לא מתחילות בהאקר. הן מתחילות בהרשאה שאף אחד לא ביטל. שמרו את זה לפעם הבאה שעובד עוזב.' } }));

// Figma. figma_bridge_status is a probe and answers either way. The rest depend on FIGMA_TOKEN,
// which lives in mcp-server/.env and is loaded by the server process, not by this one — so the
// server is asked what it has rather than this process guessing from its own environment.
await check('figma_bridge_status answers', () => client.callTool({ name: 'figma_bridge_status', arguments: {} }));

const tokenPresent = !(await client.callTool({ name: 'figma_whoami', arguments: {} })).isError;
results.push(['INFO', 'figma token', tokenPresent ? 'present' : 'absent — the figma_* REST tools are untested']);

if (tokenPresent) {
  await check('figma_whoami', () => client.callTool({ name: 'figma_whoami', arguments: {} }));
  await check('figma_read_file (FIGMA_FILE_KEY)', () => client.callTool({ name: 'figma_read_file', arguments: {} }));
  // A syntactically valid key that no account can see: proves a bad key fails loudly, not silently.
  await check('figma_read_file rejects an unknown file', () => client.callTool({ name: 'figma_read_file', arguments: { file: 'aaaaaaaaaaaaaaaaaaaaaa' } }), true);
} else {
  await check('figma_read_file without a token is refused', () => client.callTool({ name: 'figma_read_file', arguments: { file: 'someFileKey' } }), true);
}
await check('figma_export rejects a path outside the workspace', () => client.callTool({ name: 'figma_export', arguments: { nodeIds: ['1:2'], outDir: '../../../Windows/Temp' } }), true);

for (const [s, l, d] of results) console.log(`${s.padEnd(4)} ${l}${d ? ` — ${d}` : ''}`);
await client.close();
process.exit(results.some(([s]) => s === 'FAIL') ? 1 : 0);
