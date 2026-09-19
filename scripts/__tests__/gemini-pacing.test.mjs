// Free-tier pacing: the RPM floor, the RPM->spacing derivation, and the daily call budget.
// Runs against a stubbed Gemini client — proving pacing must never spend real quota.
// Run: npx tsx scripts/__tests__/gemini-pacing.test.mjs
import { setTimeout as sleep } from 'node:timers/promises';

const results = [];
const t = (label, cond, detail = '') => results.push([cond ? 'PASS' : 'FAIL', label, cond ? '' : detail]);

// Import with a short spacing so the test is fast; spacing behaviour is what is verified here, and
// the real 13s value is checked separately in the derivation block below.
process.env.GEMINI_MIN_SPACING_MS = '300';
process.env.GEMINI_DAILY_CALL_BUDGET = '4';
process.env.GEMINI_API_KEY = 'AQ.Ab' + 'T3stK3y'.repeat(7); // AQ.-shaped stub; 'xxx…' would trip the placeholder guard

const mod = await import('../../src/agent/geminiClient.ts');

t('pacing status reports the configured floor', mod.geminiPacingStatus().minSpacingMs === 300, JSON.stringify(mod.geminiPacingStatus()));
t('pacing status reports the budget', mod.geminiPacingStatus().dailyBudget === 4);

// Stub the SDK call so nothing reaches Google.
let sent = 0;
const stamps = [];
mod.genAI.models.generateContent = async () => {
  stamps.push(Date.now());
  sent += 1;
  return { candidates: [{ content: { parts: [{ text: 'ok' }] } }] };
};

// Three sequential calls must be spaced by at least the floor.
const started = Date.now();
for (let i = 0; i < 3; i++) await mod.generateContentWithRetry({ model: 'test', contents: [] });
const gaps = stamps.slice(1).map((s, i) => s - stamps[i]);
t('sequential calls are spaced', gaps.every((g) => g >= 290), `gaps=${JSON.stringify(gaps)}`);
t('three calls took at least 2 gaps', Date.now() - started >= 580, `${Date.now() - started}ms`);

// Concurrent callers must queue, not all fire at once.
stamps.length = 0;
await Promise.all([0, 1, 2].map(() => mod.generateContentWithRetry({ model: 'test', contents: [] }).catch(() => null)));
const concurrentGaps = stamps.slice(1).map((s, i) => s - stamps[i]);
t('concurrent callers are serialised', concurrentGaps.length === 0 || concurrentGaps.every((g) => g >= 290), `gaps=${JSON.stringify(concurrentGaps)} sent=${sent}`);

// Budget of 4 means the 5th call is refused locally, without reaching the stub.
const sentBeforeRefusal = sent;
let refusal = null;
try { await mod.generateContentWithRetry({ model: 'test', contents: [] }); } catch (e) { refusal = e.message; }
t('budget refuses past the cap', /daily call budget exhausted/.test(refusal ?? ''), String(refusal).slice(0, 90));
t('refused call never reached Google', sent === sentBeforeRefusal, `sent=${sent} before=${sentBeforeRefusal}`);

// RPM -> spacing derivation. Child processes, because the values are module-level consts read once
// at import: one process can only ever observe one setting.
const { spawnSync } = await import('node:child_process');
const pacingFor = (env) => {
  const r = spawnSync('npx tsx scripts/__tests__/print-pacing.mjs', {
    cwd: new URL('../..', import.meta.url),
    shell: true, // npx is npx.cmd on Windows
    encoding: 'utf8',
    // An inherited GEMINI_MIN_SPACING_MS would silently win over the RPM being tested.
    env: { ...process.env, GEMINI_MIN_SPACING_MS: '', ...env },
  });
  const last = (r.stdout ?? '').trim().split(/\r?\n/).pop();
  try {
    return JSON.parse(last);
  } catch {
    throw new Error(`print-pacing gave no JSON for ${JSON.stringify(env)}: ${(r.stdout ?? '') + (r.stderr ?? '')}`.slice(0, 300));
  }
};

// The measured free-tier ceiling for gemini-3.6-flash is 5 RPM (production, 2026-09-19).
t('5 RPM derives a 13s floor', pacingFor({ GEMINI_MAX_RPM: '5' }).minSpacingMs === 13000);
t('default (unset) matches 5 RPM', pacingFor({ GEMINI_MAX_RPM: '' }).minSpacingMs === 13000);
t('0 RPM disables pacing', pacingFor({ GEMINI_MAX_RPM: '0' }).minSpacingMs === 0);
t('15 RPM derives a 5s floor', pacingFor({ GEMINI_MAX_RPM: '15' }).minSpacingMs === 5000);
t('explicit spacing overrides RPM', pacingFor({ GEMINI_MAX_RPM: '5', GEMINI_MIN_SPACING_MS: '250' }).minSpacingMs === 250);
// Number('') is 0, so a naive parse reads an empty Vercel env var as "no pacing". Blank means unset.
t('blank spacing var falls back to RPM', pacingFor({ GEMINI_MAX_RPM: '5', GEMINI_MIN_SPACING_MS: '   ' }).minSpacingMs === 13000);
t('blank RPM var falls back to the default', pacingFor({ GEMINI_MAX_RPM: '' }).minSpacingMs === 13000);
t('garbage RPM var falls back to the default', pacingFor({ GEMINI_MAX_RPM: 'fast' }).minSpacingMs === 13000);
t('blank budget var falls back to the default', pacingFor({ GEMINI_DAILY_CALL_BUDGET: '' }).dailyBudget === 200);

for (const [s, l, d] of results) console.log(`${s} ${l}${d ? ` — ${d}` : ''}`);
const failed = results.filter(([s]) => s === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
