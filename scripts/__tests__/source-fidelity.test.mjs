// Model-name fidelity (src/agent/sourceFidelity.ts): a source that says "Claude Opus 5.5" must not
// come back as "Claude 3.5 Opus" — the 2026-09-27 drift the generators' training prior produced.
// Run: npx tsx scripts/__tests__/source-fidelity.test.mjs
import {
  findModelMentions,
  buildSourceLock,
  repairModelMentions,
  requestSourceText,
  withLockInstruction,
  repairResponseInPlace,
} from '../../src/agent/sourceFidelity.ts';

let pass = 0;
let fail = 0;
const t = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  ok ? pass++ : fail++;
};
const eq = (label, got, want) => t(label, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── Detection ───────────────────────────────────────────────────────────────────────────────
const names = (s) => findModelMentions(s).map((m) => m.text);
eq('detect · Claude Opus 5.5 inside Hebrew', names('אנתרופיק השיקה את Claude Opus 5.5 היום').join('|'), 'Claude Opus 5.5');
eq('detect · GPT-6 Luna + Gemini 3.8 Flash', names('GPT-6 Luna מול Gemini 3.8 Flash').join('|'), 'GPT-6 Luna|Gemini 3.8 Flash');
eq('detect · tier-led "Opus 4"', names('גרסת Opus 4 הקודמת').join('|'), 'Opus 4');
eq('detect · Hebrew prefix "בClaude 5"', names('שיפור בClaude 5 לעומת').join('|'), 'Claude 5');
eq('detect · Hebrew transliteration', names('קלוד אופוס 5.5 זמין').join('|'), 'קלוד אופוס 5.5');
eq('detect · size token kept, Llama 3.3 70B', names('Llama 3.3 70B רץ מקומית').join('|'), 'Llama 3.3 70B');
eq('detect · bare family ignored', names('Claude ו-Gemini מתחרים').length, 0);
eq('detect · not inside a word ("Claudette 5")', names('Claudette 5').length, 0);
eq('detect · sentence period not a version', names('עבדנו עם Grok 4. אחר כך').join('|'), 'Grok 4');
eq('detect · bidi-wrapped version', names('‏Claude Opus ⁦5.5⁩‏').length, 1);

// ── Repair ──────────────────────────────────────────────────────────────────────────────────
const src = 'Anthropic released Claude Opus 5.5 today. It beats GPT-6 Luna on SWE-bench.';
const lock = buildSourceLock(src);
t('lock · names collected', lock?.names.join('|') === 'Claude Opus 5.5|GPT-6 Luna', lock?.names.join('|'));
eq('repair · the reported bug', repairModelMentions('המודל Claude 3.5 Opus מוביל', lock).text, 'המודל Claude Opus 5.5 מוביל');
eq('repair · stale version, tier-first', repairModelMentions('Claude Opus 4 חזק', lock).text, 'Claude Opus 5.5 חזק');
eq('repair · tier-led drift "Opus 3"', repairModelMentions('ה-Opus 3 החדש', lock).text, 'ה-Claude Opus 5.5 החדש');
eq('repair · correct name untouched', repairModelMentions('Claude Opus 5.5 מול GPT-6 Luna', lock).text, 'Claude Opus 5.5 מול GPT-6 Luna');
eq('repair · reordered tier with right version untouched', repairModelMentions('Claude 5.5 Opus', lock).text, 'Claude 5.5 Opus');
eq('repair · GPT-4o → GPT-6 Luna', repairModelMentions('GPT-4o נשאר מאחור', lock).text, 'GPT-6 Luna נשאר מאחור');
eq('repair · family absent from source untouched', repairModelMentions('Gemini 2.5 Flash', lock).text, 'Gemini 2.5 Flash');
eq('repair · Hebrew transliteration → Latin source name', repairModelMentions('קלוד 3.5 מוביל', lock).text, 'Claude Opus 5.5 מוביל');
eq('repair · JSON stays valid', JSON.parse(repairModelMentions('{"t":"Claude 3.5 Opus"}', lock).text).t, 'Claude Opus 5.5');

const two = buildSourceLock('Claude Opus 5.5 and Claude Fable 5.1 shipped.');
eq('repair · ambiguous family → bare family', repairModelMentions('Claude 3.5 זמין', two).text, 'Claude זמין');
eq('repair · tier disambiguates', repairModelMentions('Claude 3 Opus', two).text, 'Claude Opus 5.5');
eq('repair · no lock → no-op', repairModelMentions('Claude 3.5 Opus', null).text, 'Claude 3.5 Opus');
eq('lock · Hebrew source → Latin name', buildSourceLock('השקת קלוד אופוס 5.5')?.names[0], 'Claude Opus 5.5');
eq('lock · none when source has no versioned name', buildSourceLock('Claude ו-Gemini'), null);

// ── Request / response plumbing ─────────────────────────────────────────────────────────────
eq(
  'request · only user turns are source',
  requestSourceText([{ role: 'user', parts: [{ text: 'Claude Opus 5.5' }] }, { role: 'model', parts: [{ text: 'Claude 3' }] }]),
  'Claude Opus 5.5'
);
eq('request · string contents', requestSourceText('GPT-6'), 'GPT-6');
t('system · string appended', String(withLockInstruction('SYS', lock)).startsWith('SYS\n\n') && String(withLockInstruction('SYS', lock)).includes('Claude Opus 5.5'));
t('system · parts appended', withLockInstruction({ parts: [{ text: 'SYS' }] }, lock).parts.length === 2);
t('system · undefined becomes the rule', String(withLockInstruction(undefined, lock)).includes('GPT-6 Luna'));

const groqLike = { text: 'Claude 3.5 Opus', candidates: [{ content: { parts: [{ text: 'Claude 3.5 Opus' }] } }] };
repairResponseInPlace(groqLike, lock, 'test');
eq('response · Groq own text property repaired', groqLike.text, 'Claude Opus 5.5');
eq('response · parts repaired', groqLike.candidates[0].content.parts[0].text, 'Claude Opus 5.5');
class GeminiLike {
  constructor() { this.candidates = [{ content: { parts: [{ text: 'GPT-4 ' }, { text: 'thought GPT-3', thought: true }] } }]; }
  get text() { return this.candidates[0].content.parts.filter((p) => !p.thought).map((p) => p.text).join(''); }
}
const g = repairResponseInPlace(new GeminiLike(), lock, 'test');
eq('response · Gemini getter reflects repaired parts', g.text, 'GPT-6 Luna ');
eq('response · thought parts untouched', g.candidates[0].content.parts[1].text, 'thought GPT-3');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
