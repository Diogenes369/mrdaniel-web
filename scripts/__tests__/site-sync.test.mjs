// The two autonomous sync agents (2026-09-23): ModelUpdateAgent's curation and SocialSyncAgent's
// Linktree parser, run over fixtures shaped like the live payloads probed on 2026-09-23, plus the
// wiring that makes them run without a human (cron, local worker, API actions, no new function).
// Run: npx tsx scripts/__tests__/site-sync.test.mjs
import fs from 'node:fs';
import { curateModels, SEED_CATALOG } from '../../src/server/agents/modelUpdateAgent.ts';
import { parseLinktree } from '../../src/server/agents/socialSyncAgent.ts';
import { SEED_FRONTIER } from '../../src/services/modelCatalogService.ts';
import { AI_AGENTS } from '../../src/data/aiAgents.ts';
import { LEARN_AI_COPY } from '../../src/data/siteCopy.ts';

let pass = 0;
let fail = 0;
const t = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  ok ? pass++ : fail++;
};
const ts = (d) => Math.floor(Date.parse(d) / 1000);

// ── ModelUpdateAgent.curateModels ───────────────────────────────────────────────────────────
const rows = [
  { id: 'openai/gpt-6-luna', name: 'OpenAI: GPT-6 Luna', created: ts('2026-09-22') },
  { id: 'openai/gpt-6-luna-pro', name: 'OpenAI: GPT-6 Luna Pro', created: ts('2026-09-22') },
  { id: 'openai/gpt-6-luna:batch', name: 'OpenAI: GPT-6 Luna (batch)', created: ts('2026-09-22') },
  { id: 'openai/gpt-6-astra', name: 'OpenAI: GPT-6 Astra', created: ts('2026-09-04') },
  { id: 'anthropic/claude-opus-5.5', name: 'Anthropic: Claude Opus 5.5', created: ts('2026-09-22') },
  { id: 'anthropic/claude-opus-4.8', name: 'Anthropic: Claude Opus 4.8', created: ts('2026-05-27') },
  { id: 'x-ai/grok-4.7', name: 'SpaceXAI: Grok 4.7', created: ts('2026-09-21') },
  { id: 'x-ai/grok-4.6', name: 'SpaceXAI: Grok 4.6', created: ts('2026-08-12') },
  { id: 'google/gemini-3.8-flash', name: 'Google: Gemini 3.8 Flash', created: ts('2026-09-02') },
  { id: 'google/gemini-3.9-pro-preview', name: 'Google: Gemini 3.9 Pro Preview', created: ts('2026-09-20') },
  { id: 'meta/muse-spark-1.3-contributor', name: 'Meta: Muse Spark 1.3 Contributor', created: ts('2026-09-02') },
  { id: 'meta/muse-spark-1.3', name: 'Meta: Muse Spark 1.3', created: ts('2026-09-02') },
  { id: 'someone/random-model', name: 'Someone: Random', created: ts('2026-09-23') },
];
const cat = curateModels(rows);
const frontier = Object.fromEntries(cat.frontier.map((m) => [m.vendor, m.name]));
t('models · newest per lab wins', frontier.OpenAI === 'GPT-6 Luna' && frontier.Anthropic === 'Claude Opus 5.5' && frontier.xAI === 'Grok 4.7', JSON.stringify(frontier));
t('models · vendor prefix stripped ("SpaceXAI: Grok 4.7" → "Grok 4.7")', cat.models.every((m) => !m.name.includes(':')));
t('models · batch / contributor / OpenAI-Pro variants dropped', !cat.models.some((m) => /batch|Contributor|Luna Pro/.test(m.name)));
t('models · previews are not "released"', frontier.Google === 'Gemini 3.8 Flash', frontier.Google);
t('models · untracked vendors ignored', !cat.models.some((m) => m.id.startsWith('someone/')));
t('models · Meta tracked but not in the frontier row', cat.models.some((m) => m.name === 'Muse Spark 1.3') && !frontier.Meta);
t('models · release date kept', cat.models.find((m) => m.id === 'x-ai/grok-4.7')?.releasedAt === '2026-09-21');
t('models · empty index → empty catalog (caller keeps the snapshot)', curateModels([]).frontier.length === 0);

// Client seed and server seed must name the same frontier models.
t('seed · client and server frontier agree', JSON.stringify(SEED_FRONTIER.map((m) => m.name)) === JSON.stringify(SEED_CATALOG.frontier.map((m) => m.name)));

// ── SocialSyncAgent.parseLinktree ───────────────────────────────────────────────────────────
const tree = (links) => `<html><script id="x" type="application/json">${JSON.stringify({ props: { pageProps: { account: { links } } } })}</script></html>`;
const live = [
  { id: 1, type: 'CLASSIC', title: 'סוכני בינה מלאכותית | MrDaniel.co.il', url: 'http://mrdaniel.co.il' },
  { id: 2, type: 'TWITTER_STATUS_LATEST', title: 'X', url: 'https://x.com/mrdaniel_ai' },
  { id: 4, type: 'CLASSIC', title: 'JARVIS', url: 'https://mrdaniel.co.il/jarvis' },
  { id: 6, type: 'CLASSIC', title: 'Linkedin', url: 'https://www.linkedin.com/in/daniel-ben-baruch' },
  { id: 9, type: 'CLASSIC', title: 'Spotify', url: 'https://open.spotify.com/user/abc' },
];
t('linktree · today\'s tree (profiles + site pages only) yields no content', parseLinktree(tree(live)).length === 0);
const withContent = parseLinktree(tree([...live,
  { id: 10, type: 'CLASSIC', title: 'המדריך החדש', url: 'https://mrdaniel.co.il/g/new-guide' },
  { id: 11, type: 'CLASSIC', title: 'הרצאה ביוטיוב', url: 'http://youtu.be/abc' },
  { id: 12, type: 'CLASSIC', title: 'bad', url: 'javascript:alert(1)' },
]));
t('linktree · a guide link on the tree is picked up', withContent.some((i) => i.url === 'https://mrdaniel.co.il/g/new-guide'));
t('linktree · external content kept and upgraded to https', withContent.some((i) => i.url === 'https://youtu.be/abc'));
t('linktree · non-http links rejected', !withContent.some((i) => i.title === 'bad'));
t('linktree · garbage HTML → []', parseLinktree('<html>nothing</html>').length === 0);

// ── Wiring: runs with no human, no new serverless function ──────────────────────────────────
const apiNews = fs.readFileSync('api/news.ts', 'utf8');
const agentGen = fs.readFileSync('api/agent-generate.ts', 'utf8');
const worker = fs.readFileSync('mcp-server/start-agent.js', 'utf8');
const server = fs.readFileSync('server.ts', 'utf8');
t('wiring · /api/news serves ?action=creator-feed and ?action=models', /creator-feed/.test(apiNews) && /action === 'models'/.test(apiNews));
t('wiring · the daily cron runs both agents', /runSocialSync/.test(agentGen) && /runModelUpdate/.test(agentGen));
t('wiring · the local 24/7 worker forces both hourly', /runSiteSync/.test(worker) && /site-sync/.test(worker));
t('wiring · local dev server mirrors both actions', /creator-feed/.test(server) && /action === 'models'/.test(server));
t('wiring · still 12 serverless functions', fs.readdirSync('api').filter((f) => /\.(ts|js)$/.test(f)).length === 12, String(fs.readdirSync('api').length));

// ── Sales copy: plain, no invented figures, no hard-coded model versions ────────────────────
for (const a of AI_AGENTS) {
  const text = [a.name, a.tagline, a.coreCapability, a.benefit, a.useCase, ...a.models.map((m) => m.role)].join(' ');
  t(`agent ${a.id} · no figures besides the price`, !/\d/.test(text), text.match(/.{0,20}\d.{0,20}/)?.[0]);
  t(`agent ${a.id} · no hard-coded model version`, !JSON.stringify(a).match(/(GPT|Claude|Gemini|Grok|Llama)[ -]?\d/));
  t(`agent ${a.id} · no jargon (RAG/LLM/API/CRM/Multi-Agent)`, !/\b(RAG|LLM|API|CRM|Multi-Agent|ROI|Vector)\b/.test(text), text);
}
for (const [k, v] of Object.entries(LEARN_AI_COPY)) {
  t(`learn.${k} · no ?/!`, !/[?!؟]/.test(v), v);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
