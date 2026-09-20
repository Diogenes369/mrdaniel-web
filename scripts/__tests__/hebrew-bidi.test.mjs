// Bidi wrapping in sanitizeHebrewText: does mixed Hebrew/Latin/number text keep its logical order?
//
// Every case here traces to a real render. "Claude Opus 5" came back from Figma as "5 Claude Opus"
// because the standalone-number pass re-isolated a digit that was already inside a Latin run,
// splitting one bidi unit into two — and in an RTL paragraph the second is ordered to the left of
// the first. Product names ending in a version number are everywhere in this content.
// Run: npx tsx scripts/__tests__/hebrew-bidi.test.mjs
import { sanitizeHebrewText } from '../../src/agent/hebrewTextSanitizer.ts';

const RLM = '‏';
const LRI = '⁦';
const PDI = '⁩';

const results = [];
const t = (label, cond, detail = '') => results.push([cond ? 'PASS' : 'FAIL', label, cond ? '' : detail]);
const show = (s) => JSON.stringify(s).replace(/‏/g, '[RLM]').replace(/⁦/g, '[LRI]').replace(/⁩/g, '[PDI]');

// A Latin run with a trailing version number is ONE unit, with no isolate splitting it.
for (const name of ['Claude Opus 5', 'GPT-6', 'Wi-Fi 7', 'Claude 4.5']) {
  const out = sanitizeHebrewText(name);
  t(`"${name}" stays one bidi run`, out === `${RLM}${name}${RLM}`, show(out));
  t(`"${name}" has no isolate inside it`, !out.includes(LRI), show(out));
}

// Embedded in a Hebrew sentence, the same must hold.
const sentence = sanitizeHebrewText('מודל Claude Opus 5 חדש');
t('embedded product name keeps its number', sentence.includes(`${RLM}Claude Opus 5${RLM}`), show(sentence));

// A standalone number still gets isolated — that behaviour must not be lost to the fix above.
t('bare number is isolated', sanitizeHebrewText('ב-30 יום') === `ב-${LRI}30${PDI} יום`, show(sanitizeHebrewText('ב-30 יום')));
t('leading number is isolated', sanitizeHebrewText('3 חוקרים').startsWith(`${LRI}3${PDI}`), show(sanitizeHebrewText('3 חוקרים')));

// Grouped numbers stay whole, or the separator drifts off the number in an RTL line.
const money = sanitizeHebrewText('מעל 20,000 דולר');
t('thousands separator stays inside the isolate', money.includes(`${LRI}20,000${PDI}`), show(money));
const decimal = sanitizeHebrewText('גידול של 12.9 אחוז');
t('decimal point stays inside the isolate', decimal.includes(`${LRI}12.9${PDI}`), show(decimal));

// URLs keep left-to-right order and are not shattered into per-label runs.
const url = sanitizeHebrewText('הקישור mrdaniel.co.il פעיל');
t('url is isolated whole', url.includes(`${LRI}mrdaniel.co.il${PDI}`), show(url));
t('url is not split per label', !url.includes(`${RLM}co${RLM}`), show(url));

// The file's header promises idempotency; it did not hold before the protected-span fix.
const corpus = [
  'Claude Opus 5', 'GPT-6', 'ב-30 יום', 'מעל 20,000 דולר', 'הקישור mrdaniel.co.il פעיל',
  'גרסה 4 של RAG', 'מודל Claude Opus 5 חדש', '3 חוקרים מצאו 2 חולשות', 'Wi-Fi 7 בבית',
];
for (const c of corpus) {
  const once = sanitizeHebrewText(c);
  t(`idempotent: "${c}"`, sanitizeHebrewText(once) === once, `${show(once)} -> ${show(sanitizeHebrewText(once))}`);
}

// Nothing visible may be added or removed — the marks are zero-width, the words are not.
const strip = (s) => s.replace(/[‎‏؜⁦-⁩‪-‮]/g, '');
for (const c of corpus) {
  t(`no visible change: "${c}"`, strip(sanitizeHebrewText(c)) === c, `${strip(sanitizeHebrewText(c))} vs ${c}`);
}

for (const [state, label, detail] of results) console.log(`${state} ${label}${detail ? ` — ${detail}` : ''}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
