// The AI-phrase scrubber: what it removes, what it must NOT touch, and that a scrubbed sentence is
// still valid Hebrew and still valid JSON. Pure function, no network, no quota.
// Run: npx tsx scripts/__tests__/expert-voice.test.mjs
import { scrubAiPhrases, EXPERT_VOICE_RULES } from '../../src/agent/expertVoice.ts';
import { BANNED_PHRASES } from '../../mcp-server/src/copy-rules.js';

const results = [];
const t = (label, cond, detail = '') => results.push([cond ? 'PASS' : 'FAIL', label, cond ? '' : detail]);
const gone = (label, input, needle) => {
  const out = scrubAiPhrases(input);
  t(label, !out.includes(needle), `-> ${out}`);
  return out;
};

// The openers added in the 2026-09-20 tone pass, alongside the ones that already existed.
gone('drops "בעולם הדינמי"', 'בעולם הדינמי של היום, כל עסק חשוף לפישינג.', 'בעולם הדינמי');
gone('drops "בעולם המשתנה"', 'בעולם המשתנה שלנו, הגיבוי הוא מה שמציל אתכם.', 'בעולם המשתנה');
gone('drops the conjunction form "ובעולם הדינמי"', 'ובעולם הדינמי הזה צריך להיזהר.', 'בעולם הדינמי');
gone('drops "בעידן הדיגיטלי"', 'בעידן הדיגיטלי, הכל מחובר.', 'בעידן הדיגיטלי');
gone('drops "חשוב לציין"', 'חשוב לציין שהסיסמה חייבת להיות ייחודית.', 'חשוב לציין');

// "עידן חדש" carries a noun — it is swapped, not cut, so the preposition before it keeps a word.
t('swaps "עידן חדש" instead of deleting it', scrubAiPhrases('נכנסנו לעידן חדש של אוטומציה.') === 'נכנסנו לשלב חדש של אוטומציה.', scrubAiPhrases('נכנסנו לעידן חדש של אוטומציה.'));
t('keeps the ב prefix grammatical', scrubAiPhrases('בעידן חדש הכל שונה.') === 'בשלב חדש הכל שונה.', scrubAiPhrases('בעידן חדש הכל שונה.'));

// A dropped opener must leave a sentence that still starts with a word, not a comma or a space.
const dropped = scrubAiPhrases('בעולם הדינמי של היום, כל עסק חשוף לפישינג.');
t('leaves no leading comma or space', /^[\u0590-\u05FF]/.test(dropped), JSON.stringify(dropped));

// False positives: a legitimate sentence that merely contains the words must survive.
const kept = 'העידן הרומי הסתיים. בעולם הפיננסי יש רגולציה חדשה.';
t('does not touch unrelated "עידן"/"עולם" uses', scrubAiPhrases(kept) === kept, scrubAiPhrases(kept));
const english = 'In the dynamic world of today, note that revolutionary tools exist.';
t('no-ops on text with no Hebrew', scrubAiPhrases(english) === english, scrubAiPhrases(english));

// JSON safety: every generator that asks for responseMimeType json runs its answer through this.
const json = JSON.stringify({ headline: 'בעולם הדינמי, הסיכון גדל', points: ['נכנסנו לעידן חדש של סיכונים'] });
const scrubbedJson = scrubAiPhrases(json);
let parsed = null;
try { parsed = JSON.parse(scrubbedJson); } catch { /* reported below */ }
t('scrubbed JSON still parses', parsed !== null, scrubbedJson);
t('scrubbed JSON lost the cliché', parsed !== null && !scrubbedJson.includes('בעולם הדינמי') && !scrubbedJson.includes('עידן חדש'), scrubbedJson);

// The prompt block and the local-model ban list must name the same phrases, or a phrase is only
// blocked on one of the two paths that write Hebrew.
for (const phrase of ['בעולם הדינמי', 'בעולם המשתנה', 'עידן חדש']) {
  t(`prompt rules name "${phrase}"`, EXPERT_VOICE_RULES.includes(phrase));
  t(`local ban list names "${phrase}"`, BANNED_PHRASES.includes(phrase));
}

for (const [state, label, detail] of results) console.log(`${state} ${label}${detail ? ` — ${detail}` : ''}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
