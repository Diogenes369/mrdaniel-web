// Carousel tier (Claude Opus 5.5), anti-slop, listicle coverage and the pre-render verifier.
//
// What is being protected:
//   1. Opus is spent on designed decks ONLY. The tier is opt-in per call site, so the risk is a
//      post/news/caption generator quietly picking it up — asserted at source level below.
//   2. A "20 use cases" article becomes a deck that covers all twenty (listExtract + verifier).
//   3. The anti-slop detector catches the patterns it claims to, and does not flag plain copy.
//
// No network and no key needed. Run: npx tsx scripts/__tests__/carousel-opus.test.mjs
import { readFileSync } from 'node:fs';
import { detectListItems } from '../../src/agent/listExtract.ts';
import { detectSlop, dropCeremonySentences, repairContrastHeadline } from '../../src/agent/antiSlop.ts';
import { verifyCarouselDeck } from '../../src/server/carouselVerifier.ts';
import { enforceDesignVariance } from '../../src/server/carouselVerifier.ts';
import { isClaudeConfigured, CLAUDE_CAROUSEL_MODEL } from '../../src/agent/claudeClient.ts';

const results = [];
const t = (label, cond, detail = '') => results.push([cond ? 'PASS' : 'FAIL', label, cond ? '' : detail]);

// ─── 1 · routing: carousel generators opt in, nothing else does ────────────────────────────────

const engine = readFileSync(new URL('../../src/agent/SocialAgentEngine.ts', import.meta.url), 'utf8');
const fnBody = (fn) => {
  const start = engine.indexOf(`export async function ${fn}`);
  return engine.slice(start, engine.indexOf('\nexport ', start + 10));
};
for (const fn of ['synthesizeStorySlides', 'synthesizeStoryCarousel', 'synthesizeCarouselDeck', 'editSlideDeck', 'synthesizeTechTipDeck', 'synthesizeThreadDeck', 'synthesizeMissingListEntries']) {
  t(`tier · ${fn} runs on the carousel tier`, /tier: 'carousel'/.test(fnBody(fn)), 'missing');
}
for (const fn of ['generateSocialContent', 'synthesizeNewsPost', 'synthesizeReelScript', 'generateEngagementReplies', 'analyzeTrendRadar', 'draftEngagementMessage', 'generateVideoScript']) {
  t(`tier · ${fn} stays on the free models`, !/tier: 'carousel'/.test(fnBody(fn)), 'wrongly on Opus');
}
const otherSources = ['../../src/server/newsInsights.ts', '../../src/server/emailCopywriter.ts', '../../src/server/newsTranslate.ts', '../../api/chat.ts', '../../src/server/xIntel.ts'];
for (const f of otherSources) {
  t(`tier · ${f.split('/').pop()} never asks for the carousel tier`, !/tier: 'carousel'/.test(readFileSync(new URL(f, import.meta.url), 'utf8')));
}
const router = readFileSync(new URL('../../src/agent/geminiClient.ts', import.meta.url), 'utf8');
t('router · Claude is planned only for tier carousel + text-only + a configured key', /tier === 'carousel' && textOnly && isClaudeConfigured\(\)/.test(router));
t('router · the free waterfall follows the Claude leg', /\{ provider: 'claude', model: CLAUDE_CAROUSEL_MODEL \}, \.\.\.planLegs\(/.test(router));
t('claude · model is Opus 5.5 by default', CLAUDE_CAROUSEL_MODEL === 'claude-opus-5-5' || !!process.env.CLAUDE_CAROUSEL_MODEL, CLAUDE_CAROUSEL_MODEL);
t('claude · unset key → no Claude leg', process.env.ANTHROPIC_API_KEY ? true : isClaudeConfigured() === false);
const claude = readFileSync(new URL('../../src/agent/claudeClient.ts', import.meta.url), 'utf8');
t('claude · effort is set explicitly (Opus 5.5 defaults to medium)', /output_config: \{ effort:/.test(claude));
t('claude · no disabled thinking / budget_tokens (400 on Opus 5.5)', !/type: 'disabled'|budget_tokens/.test(claude));
t('claude · a refusal throws so the router moves on', /stop_reason === 'refusal'/.test(claude));

// ─── 2 · listicle detection ────────────────────────────────────────────────────────────────────

const USE_CASES = [
  'Model routing', 'Skill selection', 'Typed function calling', 'Ticket triage and intent routing', 'Tool-call risk gating',
  'Read-only auto-approval', 'Secret-leak guard', 'Prompt-injection screening', 'LLM input and output guardrails', 'Reranking',
  'Citation verification', 'Browser agents', 'Desktop computer use', 'Mobile agents', 'Real-time game agents',
  'Loop stagnation detection', '“Done” claim verification', 'Context compaction', 'Trace mining for memory', 'Semantic linting',
];
const article = [
  'Last week, TypeSafe AI released Jev, its first System One model.',
  'Every call sends a state plus a dictionary of typed questions. TypeSafe’s docs define 3 primitives:',
  'Choice picks one option from a list.',
  ...USE_CASES.flatMap((name, i) => [`${name}: explanation number ${i + 1} with a detail.`, i === 9 ? 'A pull quote interrupts the list here.' : '']).filter(Boolean),
  'What is Jev? Jev is TypeSafe AI’s first System One model.',
].join('\n\n');
const list = detectListItems(article, "20 Agentic Use Cases of TypeSafe AI's Jev");
t('list · all 20 items found across one interruption', list.items.length === 20, `${list.items.length}`);
t('list · the title promise is read', list.promised === 20, String(list.promised));
t('list · names are kept verbatim (Latin stays Latin)', list.items[4]?.name === 'Tool-call risk gating', list.items[4]?.name);
t('list · curly-quoted name survives', list.items[16]?.name === '“Done” claim verification', list.items[16]?.name);
t('list · FAQ question lines are not items', !list.items.some((i) => /\?/.test(i.name)));
t('list · a normal article is not a list', detectListItems('One paragraph.\n\nNote: an aside.\n\nAnother paragraph.').items.length === 0);
t('list · numbered lines are detected', detectListItems('1. First tool — does a\n2. Second tool — does b\n3. Third — c\n4. Fourth — d\n5. Fifth — e').items.length === 5);

// ─── 3 · anti-slop ─────────────────────────────────────────────────────────────────────────────

const kinds = (s, o) => detectSlop(s, o).map((h) => h.kind);
t('slop · significance inflation', kinds('זה רגע מכונן לתעשייה.').includes('significance-inflation'));
t('slop · negative parallelism (לא רק … אלא גם)', kinds('הוא לא רק מהיר אלא גם זול.').includes('negative-parallelism'));
t('slop · Hebrew headline formula (לא X, אלא Y)', kinds("לא צ'אט, אלא מנוע החלטות", { heading: true }).includes('negative-parallelism'));
t('slop · signposting', kinds('בואו נצלול לפרטים.').includes('signposting'));
t('slop · weasel attribution', kinds('מומחים אומרים שזה יעבוד.').includes('weasel'));
t('slop · an attributed estimate is not weasel', !kinds('לפי הערכות החברה, הוא מהיר פי 193.6.').includes('weasel'));
t('slop · an unattributed estimate still is', kinds('לפי הערכות, זה יחסוך חצי מהעלות.').includes('weasel'));
t('slop · generic conclusion', kinds('העתיד נראה מבטיח.').includes('generic-conclusion'));
t('slop · em-dash cluster', kinds('א — ב — ג.').includes('em-dash-cluster'));
t('slop · a single em dash is fine (house style)', !kinds('Jev — מודל החלטות.').includes('em-dash-cluster'));
t('slop · staccato run', kinds('זה עבד. בלי תבנית. בלי ניחוש. בלי רשת.').includes('staccato'));
t('slop · emoji in a headline', kinds('🚀 השקה חדשה', { heading: true }).includes('emoji-heading'));
t('slop · plain factual copy is clean', kinds('Jev מחזיר החלטות מוקלדות עם הסתברות לכל אפשרות, ב-70 עד 500 מילישניות.').length === 0);
t('slop · mid-sentence real contrast is not flagged', !kinds('המודל לא כותב טקסט, והוא מחזיר רק החלטות.').includes('negative-parallelism'));
t('slop · ceremony sentence dropped, fact kept', dropCeremonySentences('Jev עולה 0.042 דולר. העתיד נראה מבטיח.') === 'Jev עולה 0.042 דולר.');
t('slop · a slide that is only ceremony is left alone', dropCeremonySentences('העתיד נראה מבטיח.') === 'העתיד נראה מבטיח.');

t('slop · contrast headline repaired to its claim', repairContrastHeadline("לא צ'אט, אלא מנוע החלטות") === 'מנוע החלטות');
t('slop · a one-word remainder is left alone', repairContrastHeadline("לא צ'אט, אלא מנוע") ==="לא צ'אט, אלא מנוע");
t('slop · ordinary headline untouched', repairContrastHeadline('מנוע החלטות לסוכנים') === 'מנוע החלטות לסוכנים');
t('precision · the claim-size rule is in the prompt rules', /דיוק טענה/.test(readFileSync(new URL('../../src/agent/antiSlop.ts', import.meta.url), 'utf8')));

// ─── 4 · design variance ───────────────────────────────────────────────────────────────────────

const mk = (layout, role = 'value', design) => ({ role, layout, kicker: '', headline: 'h', subhead: '', body: 'b', bullets: [], bulletsLeft: [], columnLabels: null, stat: '', code: '', quote: '', readingTime: '', ...(design ? { design } : {}) });
const periodic = [mk('hero', 'hook', { align: 'right', zone: 'top', tone: 'plain', scale: 'xl' })];
for (let i = 0; i < 10; i++) periodic.push(mk('items', 'value', { align: 'right', zone: i % 2 ? 'center' : 'top', tone: i % 2 ? 'band' : 'plain', scale: 'm' }));
periodic.push(mk('cta', 'cta'));
enforceDesignVariance(periodic, 'title A');
const mid = periodic.slice(1, -1);
t('design · a two-tone alternation is broken up', new Set(mid.map((s) => s.design.tone)).size >= 3);
t('design · no tone twice in a row', mid.every((s, i) => i === 0 || s.design.tone !== mid[i - 1].design.tone));
t('design · rows never sit at the bottom', mid.every((s) => s.design.zone !== 'bottom'));
const rows = [mk('hero', 'hook')];
for (let i = 0; i < 12; i++) rows.push(mk('items', 'value', { align: 'right', zone: 'top', tone: i % 3 ? 'plain' : 'spot', scale: 'm' }));
rows.push(mk('cta', 'cta'));
for (const seed of ['s1', 's2', 's3', 's4', 's5']) {
  const r = rows.map((s) => ({ ...s, design: s.design ? { ...s.design } : undefined }));
  enforceDesignVariance(r, seed);
  t(`design · a run of row slides never lands at the bottom (${seed})`, r.every((s) => s.layout !== 'items' || s.design.zone !== 'bottom'), r.map((s) => s.design?.zone).join(','));
}
const alt = [mk('hero', 'hook', { align: 'right', zone: 'top', tone: 'plain', scale: 'xl' })];
for (let i = 0; i < 12; i++) alt.push(mk('items', 'value', { align: 'right', zone: i % 2 ? 'center' : 'top', tone: ['plain', 'band', 'plain', 'split', 'plain', 'spot'][i % 6], scale: 'm' }));
alt.push(mk('cta', 'cta'));
enforceDesignVariance(alt, 'dominant');
{
  const m = alt.slice(1, -1).map((s) => `${s.design.zone}/${s.design.tone}`);
  const top = Math.max(...Object.values(m.reduce((o, k) => ((o[k] = (o[k] ?? 0) + 1), o), {})));
  t('design · no zone+tone combination dominates the deck', top / m.length <= 0.34, m.join(' '));
}
const a = [mk('hero', 'hook'), ...Array.from({ length: 8 }, () => mk('value')), mk('cta', 'cta')];
const b = a.map((s) => ({ ...s }));
enforceDesignVariance(a, 'Article one');
enforceDesignVariance(b, 'A different article');
t('design · different articles get different rhythm', JSON.stringify(a.map((s) => s.design)) !== JSON.stringify(b.map((s) => s.design)));
t('design · quote/stat are centred', (() => { const d = [mk('quote'), mk('stat')]; enforceDesignVariance(d, 'x'); return d.every((s) => s.design.align === 'center'); })());

// ─── 5 · verifier + endpoint wiring ────────────────────────────────────────────────────────────

const api = readFileSync(new URL('../../api/agent-generate.ts', import.meta.url), 'utf8');
t('router · every answer is tagged with the leg that served it', /\.servedBy = legKey\(leg\)/.test(router));
t('endpoint · carousel-studio reports its engine', /engine: synth\.engine/.test(api));
t('endpoint · carousel-studio runs the verifier before responding', /verifyCarouselDeck\(synth/.test(api));
t('endpoint · item copy goes through sanitizeOutput', /s\.items \?\? \[\]\)\.map\(\(i\) => `\$\{i\.name\}/.test(api));
t('engine · entities must appear in the source', /lowerSource\.includes\(e\.toLowerCase\(\)\)/.test(engine));
t('engine · anti-slop rules reach every deck prompt', (engine.match(/\$\{ANTI_SLOP_RULES\}/g) ?? []).length >= 7, String((engine.match(/\$\{ANTI_SLOP_RULES\}/g) ?? []).length));

// fact-check pass wiring (the model call itself needs a key; the contract is asserted at source level)
const verifierSrc = readFileSync(new URL('../../src/server/carouselVerifier.ts', import.meta.url), 'utf8');
t('fact-check · runs after coverage and before anti-slop', verifierSrc.indexOf('await factCheckPass(') > verifierSrc.indexOf('3a · coverage') && verifierSrc.indexOf('await factCheckPass(') < verifierSrc.indexOf('// ── 4 · anti-slop'));
t('fact-check · list items are rewritten, never dropped', /required: true/.test(verifierSrc) && /else if \(!u\.required\)/.test(verifierSrc));
t('fact-check · rewrites get a confirmation pass', /const second = await factCheckCarouselClaims/.test(verifierSrc));
t('fact-check · a failed call reports warn, never pass', /fact-check failed[\s\S]{0,200}status: 'warn'/.test(verifierSrc));
t('fact-check · runs on the carousel tier', /tier: 'carousel'/.test(fnBody('factCheckCarouselClaims')));
t('fact-check · CTA copy is not sent as an article claim', /if \(s\.role === 'cta'\) return; \/\/ brand copy/.test(verifierSrc));

// verifier end-to-end on a tiny deck: contrast headline fixed, unknown name flagged, number checked
{
  const deck = [mk('hero', 'hook'), { ...mk('value'), headline: "לא צ'אט, אלא מנוע החלטות", body: 'Jev עובד עם LangGraph ומחזיר 0.99.' }, mk('value'), mk('value'), mk('value'), mk('cta', 'cta')];
  const { slides, verification } = await verifyCarouselDeck({ slides: deck, entities: [], listItems: [], promisedItems: null, engine: 'test', engineTrail: [] }, { title: 'Jev', body: 'Jev scored it 0.99 and dropped it.' });
  t('verifier · contrast headline repaired before render', slides[1].headline === 'מנוע החלטות', slides[1].headline);
  const nums = verification.checks.find((c) => c.id === 'numbers');
  t('verifier · a name the source never mentions is flagged', nums?.status === 'warn' && /LangGraph/.test(nums.detail), nums?.detail);
}

for (const [status, label, detail] of results) console.log(`${status} ${label}${detail ? ` — ${detail}` : ''}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
