/**
 * News item -> Hebrew carousel -> duplicated Figma frames -> exported PNGs.
 *
 * The whole pipeline in one command, and the piece that makes it repeatable: every slide is
 * rendered into a CLONE of its master frame, never into the master. Filling the masters in place
 * (which is what figma_render_slides does) meant a second run destroyed the first run's output and
 * the pristine template was gone after one render.
 *
 * Talks to the bridge directly rather than through the MCP server, because the MCP server caches
 * its tool schemas at startup and this pipeline gained parameters after it was running.
 *
 * Usage:
 *   node scripts/render-carousel.mjs --topic cyber [--slides 5] [--template human-deluxe] [--no-export]
 *   node scripts/render-carousel.mjs --brief-file path.json
 */
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1]?.startsWith('--') || !process.argv[i + 1] ? true : process.argv[++i]);
}

const PORT = Number(process.env.FIGMA_BRIDGE_PORT || 3055);
const OUT_DIR = String(args.get('out') || 'video-projects/_figma-assets');

/** One bridge connection reused for the whole run — reconnecting per command is slow and racy. */
function connectBridge() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    const pending = new Map();
    let seq = 0;
    ws.on('open', () => ws.send(JSON.stringify({ type: 'register', role: 'controller' })));
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'registered') {
        if (!msg.pluginConnected) return reject(new Error('bridge is up but no Figma plugin is attached'));
        return resolve({
          send(command, params) {
            const id = `run-${++seq}`;
            return new Promise((res, rej) => {
              pending.set(id, { res, rej });
              ws.send(JSON.stringify({ type: 'command', id, command, params }));
            });
          },
          close: () => ws.close(),
        });
      }
      if (msg.type === 'result') {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (!p) return;
        if (msg.ok === false) p.rej(new Error(msg.error));
        else p.res(msg.data ?? msg.result ?? msg);
      }
    });
    ws.on('error', reject);
  });
}

const { synthesizeStoryCarousel } = await import('../src/agent/SocialAgentEngine.ts');
const { visibleLength } = await import('../src/agent/storyCarousel.ts');

async function pickArticle() {
  if (args.get('brief-file')) return JSON.parse(fs.readFileSync(String(args.get('brief-file')), 'utf8'));
  const topic = String(args.get('topic') || 'cyber');
  const res = await fetch('https://mrdaniel.co.il/api/news?limit=30');
  const feed = await res.json();
  const items = (feed.items || feed.articles || []).filter((x) => (!topic || x.topic === topic) && (x.summary || '').length > 180);
  if (!items.length) throw new Error(`no article with enough body text for topic "${topic}"`);
  return items[0];
}

const article = await pickArticle();
console.log(`article: ${article.title}`);

const deck = await synthesizeStoryCarousel({
  title: article.title,
  source: article.source ?? '',
  topic: article.topic ?? 'general',
  brief: [article.title, article.summary, article.excerpt].filter(Boolean).join('\n\n'),
  slideCount: Number(args.get('slides')) || 5,
  templateId: args.get('template') ? String(args.get('template')) : undefined,
});

console.log(`template=${deck.templateId} font=${deck.figmaFont.family} slides=${deck.slides.length} warnings=${deck.warnings.length || 0}`);
for (const s of deck.slides) {
  console.log(`  ${String(s.index).padStart(2, '0')} [${s.role}] ${s.title}${s.subtitle ? ' | ' + s.subtitle : ''}`);
  s.bodyLines.forEach((l) => console.log(`       (${visibleLength(l)}) ${l}`));
}

const bridge = await connectBridge();
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '');
const rendered = [];

try {
  for (const plan of deck.figmaPlan) {
    // Clone first; the master is only ever read.
    const copy = await bridge.send('duplicate_frame', {
      nodeId: plan.frameId,
      name: `${stamp} ${String(plan.index).padStart(2, '0')}-${plan.role}`,
    });

    // The plan addresses MASTER node ids; clone() reassigns every descendant, so translate.
    const entries = [];
    const unmapped = [];
    for (const e of plan.entries) {
      const mapped = copy.idMap[e.nodeId];
      if (!mapped) unmapped.push(e.nodeId);
      else entries.push({ ...e, nodeId: mapped });
    }
    if (unmapped.length) throw new Error(`slide ${plan.index}: no clone id for ${unmapped.join(', ')}`);

    const injected = await bridge.send('set_texts', { rootId: copy.frameId, font: deck.figmaFont, entries });
    if (injected.missing?.length) throw new Error(`slide ${plan.index}: missing nodes ${JSON.stringify(injected.missing)}`);

    let file = null;
    if (!args.get('no-export')) {
      const shot = await bridge.send('export_node', { nodeId: copy.frameId, format: 'PNG', scale: 2 });
      fs.mkdirSync(OUT_DIR, { recursive: true });
      file = path.join(OUT_DIR, `${stamp}-${String(plan.index).padStart(2, '0')}-${plan.role}.png`);
      fs.writeFileSync(file, Buffer.from(shot.base64, 'base64'));
    }
    rendered.push({ index: plan.index, role: plan.role, master: plan.frameId, copy: copy.frameId, applied: injected.appliedCount, file });
    console.log(`  slide ${plan.index}: master ${plan.frameId} -> copy ${copy.frameId}, ${injected.appliedCount} nodes${file ? `, ${file}` : ''}`);
  }
} finally {
  bridge.close();
}

console.log(`\ndone: ${rendered.length} slides, masters untouched`);
