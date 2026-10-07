// Bidi wrapping in sanitizeHebrewText: does mixed Hebrew/Latin/number text keep its logical order?
//
// Every case here traces to a real render. "Claude Opus 5" came back from Figma as "5 Claude Opus"
// because the standalone-number pass re-isolated a digit that was already inside a Latin run,
// splitting one bidi unit into two — and in an RTL paragraph the second is ordered to the left of
// the first. Product names ending in a version number are everywhere in this content.
// Run: npx tsx scripts/__tests__/hebrew-bidi.test.mjs
import { sanitizeHebrewText } from '../../src/agent/hebrewTextSanitizer.ts';
import { sanitizeHebrewText as clientSanitize } from '../../dashboard/src/lib/hebrewTextSanitizer.ts';
import { rtl } from '../../src/lib/rtl.ts';

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

// Every number shape keeps the run the browser itself gives it (UAX #9 rules W4/W5), so the
// sanitized line renders exactly like the raw one. Until 2026-10-07 each digit group got its own
// isolate, and an RTL line orders consecutive isolates right to left: "09:30" rendered as "30:09",
// "7/10" as "10/7", "50%" as "%50". A number fused to a Latin unit was split from it the same way,
// "32GB" as "GB32". Every expected string below is exact, and each was checked against Chrome's
// rendering of the raw text. [RLM] / [LRI] / [PDI] stand for the invisible marks.
const marks = (s) => s.replace(/\[RLM\]/g, RLM).replace(/\[LRI\]/g, LRI).replace(/\[PDI\]/g, PDI);
const shapes = [
  // times, with seconds, as a range, and the aspect ratios the reels use
  ['time', 'היי דנה, תזכורת: מחר ב-09:30 יש לך תור', 'היי דנה, תזכורת: מחר ב-[LRI]09:30[PDI] יש לך תור'],
  ['time with seconds', 'בשעה 9:30:15 בדיוק', 'בשעה [LRI]9:30:15[PDI] בדיוק'],
  ['time range', 'זמינים בין 09:30-10:00 בבוקר', 'זמינים בין [LRI]09:30-10:00[PDI] בבוקר'],
  ['aspect ratio', 'יחס 16:9 לסרטון', 'יחס [LRI]16:9[PDI] לסרטון'],
  // a number fused to a Latin unit starts a Latin run, and takes the words after it along
  ['number + unit', 'לפחות 32GB, עדיף 64GB.', 'לפחות [RLM]32GB[RLM], עדיף [RLM]64GB[RLM].'],
  ['number + unit', 'דיסק של 1TB בבית', 'דיסק של [RLM]1TB[RLM] בבית'],
  ['number + unit', 'וידאו ב-4K היום', 'וידאו ב-[RLM]4K[RLM] היום'],
  ['number + unit', 'רשת 5G חדשה', 'רשת [RLM]5G[RLM] חדשה'],
  ['decimal + unit', 'מודל של 1.5B פרמטרים', 'מודל של [RLM]1.5B[RLM] פרמטרים'],
  ['number + unit + word', 'לפחות 32GB RAM בבית', 'לפחות [RLM]32GB RAM[RLM] בבית'],
  ['name starting with a digit', 'דרך 1Password בטוח', 'דרך [RLM]1Password[RLM] בטוח'],
  ['plain model numbers', 'כרטיס 3090 או 4090', 'כרטיס [LRI]3090[PDI] או [LRI]4090[PDI]'],
  ['model number after a name', 'כרטיס RTX 3090 בבית', 'כרטיס [RLM]RTX 3090[RLM] בבית'],
  // dates
  ['dotted date', 'השקה ב-07.10 השנה', 'השקה ב-[LRI]07.10[PDI] השנה'],
  ['slashed date', 'השקה ב-7/10 השנה', 'השקה ב-[LRI]7/10[PDI] השנה'],
  ['full date', 'עד 7/10/2026 בלבד', 'עד [LRI]7/10/2026[PDI] בלבד'],
  ['ISO date', 'עודכן ב-2026-10-07 בבוקר', 'עודכן ב-[LRI]2026-10-07[PDI] בבוקר'],
  // versions
  ['version', 'גרסה 5.5 יצאה', 'גרסה [LRI]5.5[PDI] יצאה'],
  ['named version', 'מודל Opus 5.5 יצא', 'מודל [RLM]Opus 5.5[RLM] יצא'],
  // the rest of the family: ranges, slashes, percentages, currency, degrees
  ['range', 'בין 10-20 דקות', 'בין [LRI]10-20[PDI] דקות'],
  ['around the clock', 'זמין 24/7 לכולם', 'זמין [LRI]24/7[PDI] לכולם'],
  ['percent', 'הנחה של 50% על הכול', 'הנחה של [LRI]50%[PDI] על הכול'],
  ['currency before', 'עולה $100 לחודש', 'עולה [LRI]$100[PDI] לחודש'],
  ['currency after', 'עולה 50₪ לחודש', 'עולה [LRI]50₪[PDI] לחודש'],
  ['degrees', 'חם 20° היום', 'חם [LRI]20°[PDI] היום'],
  // inside a Latin run, a number keeps its separators and its terminator
  ['time in a Latin run', 'פגישה ב-Zoom 09:30 היום', 'פגישה ב-[RLM]Zoom 09:30[RLM] היום'],
  ['percent in a Latin run', 'ציון SWE-bench 80.9% בבדיקה', 'ציון [RLM]SWE-bench 80.9%[RLM] בבדיקה'],
  // ...while sentence punctuation after a number stays outside it
  ['period after a time', 'נפגשים ב-10:00.', 'נפגשים ב-[LRI]10:00[PDI].'],
  ['colon after a number', 'שלב 1: פותחים', 'שלב [LRI]1[PDI]: פותחים'],
];
for (const [shape, input, expected] of shapes) {
  const out = sanitizeHebrewText(input);
  t(`${shape}: "${input}"`, out === marks(expected), `${show(out)} — expected ${show(marks(expected))}`);
}
// The two calls from the bug report, through rtl() itself (src/lib/rtl.ts), the site's entry point.
for (const [input, expected] of [
  ['היי דנה, תזכורת: מחר ב-09:30 יש לך תור', 'היי דנה, תזכורת: מחר ב-[LRI]09:30[PDI] יש לך תור'],
  ['לפחות 32GB, עדיף 64GB.', 'לפחות [RLM]32GB[RLM], עדיף [RLM]64GB[RLM].'],
]) {
  t(`rtl(): "${input}"`, rtl(input) === marks(expected), show(rtl(input)));
}

// URLs keep left-to-right order and are not shattered into per-label runs.
const url = sanitizeHebrewText('הקישור mrdaniel.co.il פעיל');
t('url is isolated whole', url.includes(`${LRI}mrdaniel.co.il${PDI}`), show(url));
t('url is not split per label', !url.includes(`${RLM}co${RLM}`), show(url));

// The file's header promises idempotency; it did not hold before the protected-span fix.
const corpus = [
  'Claude Opus 5', 'GPT-6', 'ב-30 יום', 'מעל 20,000 דולר', 'הקישור mrdaniel.co.il פעיל',
  'גרסה 4 של RAG', 'מודל Claude Opus 5 חדש', '3 חוקרים מצאו 2 חולשות', 'Wi-Fi 7 בבית',
  ...shapes.map(([, input]) => input),
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

// ─── the dashboard mirror ─────────────────────────────────────────────────────────────────────
// dashboard/src/lib/hebrewTextSanitizer.ts is a hand-copy (the two apps share no package), and it
// had silently fallen three fixes behind: no dotted-version Latin run, no grouped-number isolate
// and no protectedSplit idempotency guard. So the dashboard rendered "Claude 4.5" and "20,000"
// differently from the server that generated them — and, once the X importer landed, a
// hand-corrected subtitle cue produced a different SRT than the burned-in video.
// `check:mirrors` only compares TYPE declarations, so the BEHAVIOUR is compared here.
const mirrorCases = [
  'Claude Opus 5',
  'GPT-6',
  'Claude 4.5',
  'מודל Claude Opus 5 חדש',
  'ב-30 יום',
  'מעל 20,000 דולר',
  'גידול של 12.9 אחוז',
  'הקישור mrdaniel.co.il פעיל',
  'פותחים את Gemini ובוחרים Canvas',
  ...shapes.map(([, input]) => input),
];
for (const input of mirrorCases) {
  const server = sanitizeHebrewText(input);
  const client = clientSanitize(input);
  t(`mirror: "${input}" matches the dashboard copy`, server === client, `${show(server)} !== ${show(client)}`);
}
t(
  'mirror: the dashboard copy is idempotent too',
  mirrorCases.every((i) => clientSanitize(clientSanitize(i)) === clientSanitize(i)),
  mirrorCases.filter((i) => clientSanitize(clientSanitize(i)) !== clientSanitize(i)).join(' | ')
);

for (const [state, label, detail] of results) console.log(`${state} ${label}${detail ? ` — ${detail}` : ''}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
