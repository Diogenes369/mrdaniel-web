// Groq as the primary text engine: does the router send the right calls to the right provider, and
// does Hebrew survive the trip intact?
//
// The Hebrew cases are not hypothetical. Measured against Groq on 2026-09-21, the `gpt-oss` family
// returns U+2011 NON-BREAKING HYPHEN where a keyboard types "-" — "Wi‑Fi 7",
// "Retrieval‑Augmented Generation". The bidi wrapper in hebrewTextSanitizer.ts joins a Latin run
// with `[-'’ ]`, an ASCII hyphen only, so that input split into THREE runs and an RTL line orders
// the later ones to the LEFT: the slide rendered "Fi 7 ‑ Wi". That is the same class of corruption
// hebrew-bidi.test.mjs was written for, and it is why normalizeModelUnicode exists.
//
// No network and no key needed: every case is request translation, string normalisation, or a
// source-level assertion about the router.
// Run: npx tsx scripts/__tests__/groq-router.test.mjs
import {
  GROQ_TEXT_MODEL,
  isTextOnlyRequest,
  normalizeModelUnicode,
  toGroqMessages,
} from '../../src/agent/groqClient.ts';
import { sanitizeHebrewText } from '../../src/agent/hebrewTextSanitizer.ts';
import { sanitizeHebrewText as clientSanitize } from '../../dashboard/src/lib/hebrewTextSanitizer.ts';
import { readFileSync } from 'node:fs';

const results = [];
const t = (label, cond, detail = '') => results.push([cond ? 'PASS' : 'FAIL', label, cond ? '' : detail]);
const show = (s) => JSON.stringify(s).replace(/‏/g, '[RLM]').replace(/⁦/g, '[LRI]').replace(/⁩/g, '[PDI]');

const NBH = '‑'; // NON-BREAKING HYPHEN — what gpt-oss actually emits
const NBSP = ' ';
const EN = '–';
const EM = '—';

// ─── unicode normalisation ─────────────────────────────────────────────────────────────────────

t('NON-BREAKING HYPHEN becomes an ASCII hyphen', normalizeModelUnicode(`Wi${NBH}Fi 7`) === 'Wi-Fi 7', show(normalizeModelUnicode(`Wi${NBH}Fi 7`)));
t('U+2010 HYPHEN is normalised', normalizeModelUnicode('a‐b') === 'a-b');
t('FIGURE DASH is normalised', normalizeModelUnicode('a‒b') === 'a-b');
t('MINUS SIGN is normalised', normalizeModelUnicode('a−b') === 'a-b');
t('NBSP becomes a real space', normalizeModelUnicode(`a${NBSP}b`) === 'a b');
t('zero-width space is removed', normalizeModelUnicode('a​b') === 'ab');
t('BOM mid-string is removed', normalizeModelUnicode('a﻿b') === 'ab');

// The dashes this project uses as real Hebrew punctuation must survive untouched — folding them to
// "-" would damage correct copy to fix a different bug.
t('EN DASH is preserved', normalizeModelUnicode(`a${EN}b`) === `a${EN}b`);
t('EM DASH is preserved', normalizeModelUnicode(`שלום ${EM} עולם`) === `שלום ${EM} עולם`);
t('normalising is idempotent', normalizeModelUnicode(normalizeModelUnicode(`Wi${NBH}Fi`)) === 'Wi-Fi');
t('empty input is safe', normalizeModelUnicode('') === '' && normalizeModelUnicode(undefined) === '');

// ─── the corruption this prevents, end to end ─────────────────────────────────────────────────
// Each pair below is: what the model emitted, vs what a keyboard would type. After normalisation
// the sanitiser must produce the SAME bidi structure for both.

for (const [raw, clean] of [
  [`Wi${NBH}Fi 7`, 'Wi-Fi 7'],
  [`Retrieval${NBH}Augmented Generation`, 'Retrieval-Augmented Generation'],
  [`Zero${NBH}Trust`, 'Zero-Trust'],
  [`GPT${NBH}6`, 'GPT-6'],
]) {
  const fixed = sanitizeHebrewText(normalizeModelUnicode(`מודל ${raw} חדש`));
  const expected = sanitizeHebrewText(`מודל ${clean} חדש`);
  t(`"${clean}" survives the model's hyphen substitution`, fixed === expected, `${show(fixed)} !== ${show(expected)}`);
  t(`"${clean}" is ONE bidi run, not three`, (fixed.match(/‏/g) ?? []).length === 2, show(fixed));
  t(`"${clean}" carries no stray U+2011`, !fixed.includes(NBH), show(fixed));
}

// Proof the bug is real rather than the fix merely being self-consistent.
//
// It has to be asserted against the RUN MATCHER itself, because sanitizeHebrewText now normalises
// on entry and so can no longer reproduce the failure. This is the exact LATIN_RUN pattern from
// hebrewTextSanitizer.ts: fed the model's own hyphen it finds TWO runs where the ASCII form finds
// one, and two runs in an RTL line are ordered right-to-left against each other.
const LATIN_RUN = /\b[A-Za-z][A-Za-z0-9]*(?:[-'’ ][A-Za-z0-9]+|\.\d+)*\b/g;
const runsFor = (s) => s.match(LATIN_RUN) ?? [];
t('the ASCII form is one Latin run', runsFor('Wi-Fi 7').length === 1, JSON.stringify(runsFor('Wi-Fi 7')));
t(
  "the model's U+2011 form splits into two runs — the bug",
  runsFor(`Wi${NBH}Fi 7`).length === 2,
  JSON.stringify(runsFor(`Wi${NBH}Fi 7`))
);
t(
  'normalising first restores the single run',
  runsFor(normalizeModelUnicode(`Wi${NBH}Fi 7`)).length === 1,
  JSON.stringify(runsFor(normalizeModelUnicode(`Wi${NBH}Fi 7`)))
);

// The sanitiser now normalises on its own too, so a Gemini answer carrying the same character is
// covered without going through the Groq client.
t('sanitizeHebrewText normalises U+2011 itself', !sanitizeHebrewText(`Wi${NBH}Fi`).includes(NBH), show(sanitizeHebrewText(`Wi${NBH}Fi`)));
t('the dashboard mirror does too', !clientSanitize(`Wi${NBH}Fi`).includes(NBH));
t('server and dashboard agree on the normalised form', sanitizeHebrewText(`Wi${NBH}Fi 7`) === clientSanitize(`Wi${NBH}Fi 7`));

// ─── provider routing ──────────────────────────────────────────────────────────────────────────
// Structural, not by action name — the whole point, so a multimodal action added later cannot be
// silently routed to a text-only endpoint.

t('plain text goes to Groq', isTextOnlyRequest({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] }));
t('a bare string prompt goes to Groq', isTextOnlyRequest({ contents: 'hi' }));
t('multi-turn text goes to Groq', isTextOnlyRequest({ contents: [{ role: 'user', parts: [{ text: 'a' }] }, { role: 'model', parts: [{ text: 'b' }] }] }));

t(
  'an image part stays on Gemini (screenshot-to-code)',
  !isTextOnlyRequest({ contents: [{ role: 'user', parts: [{ text: 'describe' }, { inlineData: { mimeType: 'image/png', data: 'x' } }] }] })
);
t(
  'a video part stays on Gemini (x-subtitles)',
  !isTextOnlyRequest({ contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'video/mp4', data: 'x' } }, { text: 'transcribe' }] }] })
);
t(
  'an audio part stays on Gemini (whatsapp voice note)',
  !isTextOnlyRequest({ contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/ogg', data: 'x' } }] }] })
);
// TTS is the subtle one: its INPUT is a plain string, so an input-only check would hand a
// text-to-speech call to a chat endpoint and get prose where the caller needed PCM.
t(
  'TTS stays on Gemini even though its input is plain text',
  !isTextOnlyRequest({ contents: [{ role: 'user', parts: [{ text: 'שלום' }] }], config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: {} } } })
);
t(
  'a speechConfig alone is enough to keep it on Gemini',
  !isTextOnlyRequest({ contents: [{ role: 'user', parts: [{ text: 'שלום' }] }], config: { speechConfig: {} } })
);
t(
  'an explicit TEXT modality still routes to Groq',
  isTextOnlyRequest({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }], config: { responseModalities: ['TEXT'] } })
);
t('a malformed request is not routed to Groq', !isTextOnlyRequest({}));

// ─── request translation ───────────────────────────────────────────────────────────────────────

const msgs = toGroqMessages({
  contents: [
    { role: 'user', parts: [{ text: 'first' }] },
    { role: 'model', parts: [{ text: 'reply' }] },
    { role: 'user', parts: [{ text: 'second' }] },
  ],
  config: { systemInstruction: 'you are a writer' },
});
t('the system instruction leads the message list', msgs[0].role === 'system' && msgs[0].content === 'you are a writer', JSON.stringify(msgs[0]));
t("Gemini's 'model' role becomes OpenAI's 'assistant'", msgs[2].role === 'assistant', JSON.stringify(msgs[2]));
t('user turns are preserved in order', msgs[1].content === 'first' && msgs[3].content === 'second', JSON.stringify(msgs));
t('every turn is carried over', msgs.length === 4, String(msgs.length));

t(
  'a systemInstruction given as parts is flattened',
  toGroqMessages({ contents: 'x', config: { systemInstruction: { parts: [{ text: 'a' }, { text: 'b' }] } } })[0].content === 'a\nb'
);
t(
  'a thinking part never reaches the prompt',
  !toGroqMessages({ contents: [{ role: 'model', parts: [{ text: 'hidden', thought: true }, { text: 'shown' }] }] })
    .map((m) => m.content)
    .join(' ')
    .includes('hidden')
);
t('an empty turn is dropped rather than sent blank', toGroqMessages({ contents: [{ role: 'user', parts: [{ text: '  ' }] }] }).length === 0);

// ─── the router's wiring ───────────────────────────────────────────────────────────────────────

const client = readFileSync(new URL('../../src/agent/geminiClient.ts', import.meta.url), 'utf8');
t('the router asks Groq first for text', /if \(textOnly && isGroqConfigured\(\)\)[\s\S]{0,200}groqGenerate/.test(client));
t('a Groq failure falls through to Gemini', /catch \(err\)[\s\S]{0,600}falling back to gemini/.test(client));
t('a Gemini 429 falls back to Groq', /if \(textOnly && isGroqConfigured\(\)\)[\s\S]{0,400}retrying on groq/.test(client));
t('the Gemini fallback covers transient outages too', /const transient = TRANSIENT_UPSTREAM\.test/.test(client));
t('multimodal without a Gemini key reports the real reason', /required for image\/video input/.test(client));

const groq = readFileSync(new URL('../../src/agent/groqClient.ts', import.meta.url), 'utf8');
t('the retired llama model is not the default', !/llama-3\.3-70b-versatile['"]/.test(groq.split('GROQ_TEXT_MODEL =')[1]?.split('\n')[0] ?? ''));
t('the default model is the measured-best available one', GROQ_TEXT_MODEL === 'openai/gpt-oss-120b', GROQ_TEXT_MODEL);
t('the model is overridable by env', /process\.env\.GROQ_MODEL/.test(groq));
t('strict JSON mode is retried without response_format on a 400', /delete body\.response_format;[\s\S]{0,40}continue;/.test(groq));
t('a generous max_tokens default prevents mid-JSON truncation', /max_tokens = typeof params\.config\?\.maxOutputTokens/.test(groq));
t('responseMimeType json maps to response_format', /response_format = \{ type: 'json_object' \}/.test(groq));
t('output is normalised before anything downstream sees it', /normalizeModelUnicode\(choice\?\.message\?\.content/.test(groq));
t('the scrub opt-out is honoured, so generated code keeps its indentation', /options\.scrub === false \? raw : scrubAiPhrases\(raw\)/.test(groq));
t('the key check tolerates placeholders like the Gemini one', /KEY_LOOKS_REAL = RAW_GROQ_KEY\.length >= 20/.test(groq));
t('Groq has its own 429 retry policy', /RATE_WAITS_MS/.test(groq) && /retry-after/.test(groq));

// The pacing/daily-budget guards belong to Gemini's quota; the Groq path must return before them or
// a Groq call would consume a Gemini budget slot it never used.
// Scoped to the function body: `consumeDailyBudget` is also DEFINED earlier in the file, so a
// whole-file indexOf would compare against its declaration rather than against its call site.
const routerBody = client.slice(client.indexOf('export async function generateContentWithRetry'));
t(
  'the Groq path returns before the Gemini pacing guards',
  routerBody.indexOf('groqGenerate(params as GeminiLikeRequest, options)') < routerBody.indexOf('consumeDailyBudget('),
  'groq is routed after the gemini pacing gate, so it would burn a Gemini budget slot'
);

for (const [state, label, detail] of results) console.log(`${state} ${label}${detail ? ` — ${detail}` : ''}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
