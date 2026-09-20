// Gemini pacing: the RPM floor, the RPM->spacing derivation, and the daily call budget.
// Defaults are OFF (paid tier, 2026-09-20); the cases below still pin the derivation so the
// mechanism can be switched back on by env var without rediscovering the arithmetic.
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
    // This file sets both vars at the top for its own timing tests. Inheriting them would let the
    // harness' values silently stand in for the defaults these cases are meant to check.
    env: { ...process.env, GEMINI_MIN_SPACING_MS: '', GEMINI_DAILY_CALL_BUDGET: '', ...env },
  });
  const last = (r.stdout ?? '').trim().split(/\r?\n/).pop();
  try {
    return JSON.parse(last);
  } catch {
    throw new Error(`print-pacing gave no JSON for ${JSON.stringify(env)}: ${(r.stdout ?? '') + (r.stderr ?? '')}`.slice(0, 300));
  }
};

// Paid tier: pacing is off unless a ceiling is named. This is the case that regresses first if
// someone "restores" a free-tier default, so it is pinned explicitly rather than left implicit.
t('default (unset) is unpaced', pacingFor({ GEMINI_MAX_RPM: '' }).minSpacingMs === 0);
t('0 RPM disables pacing', pacingFor({ GEMINI_MAX_RPM: '0' }).minSpacingMs === 0);
// The derivation itself is unchanged, so re-arming for a free key is one env var.
// 5 RPM was the measured free-tier ceiling for gemini-3.6-flash (production, 2026-09-19).
t('5 RPM still derives a 13s floor', pacingFor({ GEMINI_MAX_RPM: '5' }).minSpacingMs === 13000);
t('15 RPM derives a 5s floor', pacingFor({ GEMINI_MAX_RPM: '15' }).minSpacingMs === 5000);
t('explicit spacing overrides RPM', pacingFor({ GEMINI_MAX_RPM: '5', GEMINI_MIN_SPACING_MS: '250' }).minSpacingMs === 250);
// Number('') is 0, so a naive parse reads an empty Vercel env var as "no pacing". Blank means unset.
// That distinction still matters with the default at 0: a blank var must not disable a *configured*
// ceiling on the other side of the pair.
t('blank spacing var falls back to RPM', pacingFor({ GEMINI_MAX_RPM: '5', GEMINI_MIN_SPACING_MS: '   ' }).minSpacingMs === 13000);
t('garbage RPM var falls back to the default', pacingFor({ GEMINI_MAX_RPM: 'fast' }).minSpacingMs === 0);
// No daily cap on pay-as-you-go: spend is bounded by Google's budget alerts, not by breaking the
// product at call 19. A positive value re-arms the fuse.
t('blank budget var falls back to the default', pacingFor({ GEMINI_DAILY_CALL_BUDGET: '' }).dailyBudget === 0);
t('default budget is disabled', pacingFor({}).dailyBudget === 0);
t('budget can be re-armed by env', pacingFor({ GEMINI_DAILY_CALL_BUDGET: '18' }).dailyBudget === 18);

// Pacing must refuse rather than sleep past what the caller can afford. A 13s wait inside a 45s
// function turned a fast 429 into a 504 in production; failing fast is strictly better. Run in a
// child process so the huge spacing it needs cannot leak into the timings measured above.
const pacedOut = JSON.parse(
  spawnSync('npx tsx scripts/__tests__/paced-out.mjs', { cwd: new URL('../..', import.meta.url), shell: true, encoding: 'utf8' })
    .stdout.trim()
    .split(/\r?\n/)
    .pop()
);
t('a long wait is refused, not slept through', pacedOut.refused === true, JSON.stringify(pacedOut));
t('refusal is immediate', pacedOut.failedFast === true, `${pacedOut.elapsedMs}ms`);
t('refusal carries a retry hint', pacedOut.retryAfterSeconds === 60);
t('refused call never reached Google (paced out)', pacedOut.sent === 1, `sent=${pacedOut.sent}`);

for (const [s, l, d] of results) console.log(`${s} ${l}${d ? ` — ${d}` : ''}`);
const failed = results.filter(([s]) => s === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
