// Proves pacing refuses a long wait instead of sleeping through it (the 504 regression).
// Spacing is huge and the budget tiny, so the second call cannot possibly be allowed to wait.
process.env.GEMINI_MIN_SPACING_MS = '60000';
process.env.GEMINI_MAX_PACING_WAIT_MS = '500';
process.env.GEMINI_API_KEY = 'AQ.Ab' + 'T3stK3y'.repeat(7);

const m = await import('../../src/agent/geminiClient.ts');
let sent = 0;
m.genAI.models.generateContent = async () => { sent += 1; return { candidates: [{ content: { parts: [{ text: 'ok' }] } }] }; };

await m.generateContentWithRetry({ model: 'test', contents: [] }); // takes the slot
const started = Date.now();
let err = null;
try { await m.generateContentWithRetry({ model: 'test', contents: [] }); } catch (e) { err = e; }
const elapsed = Date.now() - started;

console.log(JSON.stringify({
  refused: err?.name === 'GeminiPacedOutError',
  message: err?.message ?? null,
  retryAfterSeconds: err?.retryAfterSeconds ?? null,
  elapsedMs: elapsed,
  failedFast: elapsed < 2000,
  sent,
}));
