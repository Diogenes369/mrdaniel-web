// Prompt wiring: is the tightened post shape actually reaching the prompt that content_generate_draft
// sends, and does the banned-phrase list still cover what the tone brief named?
//
// Structural, so it needs no key and spends no quota. It exists because the rules blocks are
// composed by string interpolation: deleting a ${...} line still typechecks, still deploys, and
// silently reverts the voice — the failure mode this file is here to catch.
// Run: npx tsx scripts/__tests__/verify-prompt.mjs
import fs from 'node:fs';
import { POST_SHAPE_RULES } from '../../src/agent/SocialAgentEngine.ts';
import { AUDIENCE_RULES, EXPERT_VOICE_RULES, scrubAiPhrases } from '../../src/agent/expertVoice.ts';

const src = fs.readFileSync('src/agent/SocialAgentEngine.ts', 'utf8');
// Slice to the next declaration rather than regexing the end of a template literal that itself
// contains backticks and ${...} — the naive pattern matched nothing and reported a false FAIL
// on correctly wired code.
const start = src.indexOf('const CONTENT_SYSTEM_INSTRUCTION');
const instruction = src.slice(start, src.indexOf('ENGAGEMENT_SYSTEM_INSTRUCTION', start));

const checks = [
  ['POST_SHAPE_RULES is interpolated into CONTENT_SYSTEM_INSTRUCTION', instruction.includes('${POST_SHAPE_RULES}')],
  ['EXPERT_VOICE_RULES reaches it via HEBREW_COPY_RULES', instruction.includes('${HEBREW_COPY_RULES}')],
  ['audience rules still present', instruction.includes('${AUDIENCE_RULES}')],
  ['three beats are named and numbered', ['1. הוק', '2. הבשר', '3. סגירה'].every((b) => POST_SHAPE_RULES.includes(b))],
  ['LinkedIn ceiling is 130 words', POST_SHAPE_RULES.includes('עד 130 מילה')],
  ['Instagram ceiling is 90 words', POST_SHAPE_RULES.includes('עד 90 מילה')],
  ['TikTok ceiling is 60 words', POST_SHAPE_RULES.includes('עד 60 מילה')],
  ['no stale 200/120 word ceiling anywhere in the engine', !/עד 200 מילה|עד 120 מילה/.test(src)],
];
// The banned list writes "פורץ/ת דרך" as one inflected entry, so match that spelling.
for (const phrase of ['בעולם הדינמי', 'עידן חדש', 'פורץ/ת דרך', 'חשוב לציין', 'בעידן הדיגיטלי'])
  checks.push([`prompt bans "${phrase}"`, EXPERT_VOICE_RULES.includes(phrase)]);
// …and the scrubber must still delete the plain, uninflected form the model actually writes.
for (const phrase of ['פורץ דרך', 'פורצת דרך', 'בעולם הדינמי', 'עידן חדש'])
  checks.push([`scrubber removes "${phrase}"`, !scrubAiPhrases(`זה ${phrase} באמת.`).includes(phrase)]);

// Audience: learners, not organisations (retargeted 2026-09-20). The enterprise vocabulary is
// banned explicitly as well as the audience being named, because a CVE-heavy news feed pulls a
// model toward operator language on its own — see the AUDIENCE_RULES header.
for (const phrase of ['בינה מלאכותית, סייבר ואבטחת מידע', 'מתחילים', 'ללמוד'])
  checks.push([`audience names learners: "${phrase}"`, AUDIENCE_RULES.includes(phrase)]);
for (const phrase of ['בארגון שלכם', 'מפו את נקודות הקצה', 'בעלי עסקים', 'CISO'])
  checks.push([`audience bans enterprise framing: "${phrase}"`, AUDIENCE_RULES.includes(phrase)]);
checks.push(['voice explains terms rather than assuming them', EXPERT_VOICE_RULES.includes('מונח מקצועי מוסבר בחצי משפט')]);
checks.push(['voice drops the peer-briefing framing', !EXPERT_VOICE_RULES.includes('מדבר ישירות עם עמית')]);

// The news modal is the path that actually produced "בארגון" output before the retarget.
const insightsSrc = fs.readFileSync('src/server/newsInsights.ts', 'utf8');
checks.push(['newsInsights applies AUDIENCE_RULES', insightsSrc.includes('${AUDIENCE_RULES}')]);
checks.push(['newsInsights imports it from the light module, not the prompt corpus', /from '\.\.\/agent\/expertVoice\.js'/.test(insightsSrc) && !insightsSrc.includes("from '../agent/SocialAgentEngine.js'")]);
checks.push(['newsInsights no longer mandates operator imperatives', !/גוף שני רבים \("בדקו", "מפו"\)/.test(insightsSrc)]);
checks.push(['no topic lens frames the organisation', !/זווית אימוץ ה-AI בארגון/.test(insightsSrc)]);

// Nothing in the generator corpus may address the reader as an organisation.
const engineSrc = fs.readFileSync('src/agent/SocialAgentEngine.ts', 'utf8');
const fallbackSrc = fs.readFileSync('src/server/newsPostComposer.ts', 'utf8');
for (const [name, body] of [['engine', engineSrc], ['news fallback', fallbackSrc]]) {
  // The ban list inside AUDIENCE_RULES is allowed to name these; it lives in expertVoice.ts.
  const hits = ['בארגון שלכם', 'הארגון שלכם', 'אצלכם בעסק', 'לבעל עסק'].filter((p) => body.includes(p));
  checks.push([`${name} addresses no organisation${hits.length ? ` (found: ${hits.join(', ')})` : ''}`, hits.length === 0]);
}

for (const [label, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);

const probe = 'בעולם הדינמי, זהו עידן חדש ופורץ דרך. חשוב לציין שזה עובד.';
console.log('\nscrubber in :', probe);
console.log('scrubber out:', scrubAiPhrases(probe));
process.exit(checks.some(([, ok]) => !ok) ? 1 : 0);
