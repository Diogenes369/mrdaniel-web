// Prints the pacing config the current environment resolves to. Used by gemini-pacing.test.mjs,
// which must check the RPM→spacing derivation in child processes: the values are module-level
// consts read once at import, so one process can only ever observe one setting.
const m = await import('../../src/agent/geminiClient.ts');
console.log(JSON.stringify(m.geminiPacingStatus()));
