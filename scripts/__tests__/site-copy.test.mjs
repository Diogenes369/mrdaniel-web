// Guards the homepage / About / footer marketing copy (src/data/siteCopy.ts, homeOffers.ts,
// homeServices.ts) against the regressions a copy pass tends to reintroduce:
//   - model Unicode look-alikes (U+2011 from gpt-oss) that shatter a Latin term's bidi run,
//   - rhetorical questions and the stock AI-marketing phrases the brief bans,
//   - walls of text (per-field word budgets),
//   - a placeholder that never got filled,
//   - rtl() output that is not idempotent or leaves a Latin run un-anchored.
// Run: npx tsx scripts/__tests__/site-copy.test.mjs
import { HERO_COPY, STORY_COPY, PROCESS_COPY, ROTATOR_TERMS, SERVICES_COPY, CONTACT_COPY, CONTACT_FORM_COPY, FOOTER_COPY, ABOUT_COPY, GROK_COPY } from '../../src/data/siteCopy.ts';
import { AI_GUIDE_HERO, AI_GUIDE_WHAT, AI_GUIDE_PREP, AI_GUIDE_PROCESS, AI_GUIDE_CTA } from '../../src/data/aiAgentGuide.ts';
import { GROK_GUIDE } from '../../src/data/grokGuide.ts';
import { HOME_OFFERS } from '../../src/data/homeOffers.ts';
import { SERVICES } from '../../src/data/homeServices.ts';
import { rtl } from '../../src/lib/rtl.ts';

// Built from code points: the characters themselves are invisible and get silently normalized by
// editors, which is exactly how a literal-character class once degraded into matching plain spaces.
const cp = (...codes) => String.fromCodePoint(...codes);
const RLM = cp(0x200f);
const LOOKALIKE = new RegExp(`[${cp(0x2010)}-${cp(0x2012)}${cp(0x2212)}${cp(0xa0)}${cp(0x200b)}-${cp(0x200d)}${cp(0xfeff)}]`);
const HEBREW_START = new RegExp(`^[${cp(0x590)}-${cp(0x5ff)}]`);
const HEBREW_END = new RegExp(`[${cp(0x590)}-${cp(0x5ff)}]$`);
const WRAPPED = new RegExp(`${cp(0x200f)}[^${cp(0x200f)}]*${cp(0x200f)}|${cp(0x2066)}[^${cp(0x2069)}]*${cp(0x2069)}`, 'g');
const results = [];
const t = (label, cond, detail = '') => results.push([cond ? 'PASS' : 'FAIL', label, cond ? '' : detail]);
const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;

/** [label, text, maxWords] for every user-facing string in scope. */
const fields = [];
const add = (label, text, max) => fields.push([label, text, max]);

const HERO_BUDGET = { h1Lead: 12, sub: 26 };
Object.entries(HERO_COPY).forEach(([k, v]) => add(`hero.${k}`, v, HERO_BUDGET[k] ?? 7));
ROTATOR_TERMS.forEach((v, i) => add(`rotator[${i}]`, v, 5));
Object.entries(SERVICES_COPY).forEach(([k, v]) => add(`services.${k}`, v, ['sub', 'closing'].includes(k) ? 22 : 5));
add('contact.headline', CONTACT_COPY.headline, 8);
add('contact.sub', CONTACT_COPY.sub, 32);
// The inline contact form (2026-10-03). `messageLabel` is the one field prompt that asks the visitor
// a direct question — the operator's own wording, and a form prompt, not a rhetorical question — so
// it gets every check except the question-mark ban (see the loop below).
Object.entries(CONTACT_FORM_COPY).forEach(([k, v]) => add(`contactForm.${k}`, v, k === 'messagePlaceholder' ? 14 : 10));
add('footer.tagline', FOOTER_COPY.tagline, 16);
add('footer.status', FOOTER_COPY.status, 6);
add('about.title', ABOUT_COPY.title, 8);
add('about.subtitle', ABOUT_COPY.subtitle, 16);
add('about.lede', ABOUT_COPY.lede, 24);
ABOUT_COPY.paras.forEach((v, i) => add(`about.paras[${i}]`, v, 50));
ABOUT_COPY.pillars.forEach((p, i) => {
  add(`about.pillars[${i}].title`, p.title, 6);
  add(`about.pillars[${i}].description`, p.description, 22);
});
add('about.quote', ABOUT_COPY.quote, 18);
add('about.ctaTitle', ABOUT_COPY.ctaTitle, 7);
add('about.ctaDescription', ABOUT_COPY.ctaDescription, 20);
// סוכן GROK (2026-10-06): the frame around the Grok Bot deck on the homepage and on /grok.
const GROK_BUDGET = { sub: 48, homeSub: 26, lead: 10, sources: 22, howTo: 8, frameTitle: 8 };
Object.entries(GROK_COPY).forEach(([k, v]) => add(`grok.${k}`, v, GROK_BUDGET[k] ?? 4));
// The written guide under the deck on /grok (2026-10-06). Every Hebrew string, budgeted by the key
// it sits under. Plan, model and file names are Latin-only and rendered as their own LTR elements,
// so they skip the prose checks.
const GUIDE_BUDGET = {
  kicker: 4, nav: 4, label: 4, tag: 5, tocLabel: 3, role: 3, guideCta: 4, backCta: 4, official: 6,
  title: 8, note: 6, term: 3, plain: 14, tests: 14, steps: 6, rules: 16, tips: 26, closing: 16,
  takeaway: 24, why: 24, tail: 24, quota: 26, status: 16, beginners: 24, tip: 34, update: 40,
  text: 50, body: 60,
};
const LATIN_ONLY = new Set(['plans', 'name', 'file']);
const walkGuide = (node, label, key) => {
  if (typeof node === 'string') {
    if (!LATIN_ONLY.has(key)) add(`grokGuide.${label}`, node, GUIDE_BUDGET[key] ?? 30);
  } else if (Array.isArray(node)) node.forEach((v, i) => walkGuide(v, `${label}[${i}]`, key));
  else for (const [k, v] of Object.entries(node)) walkGuide(v, label ? `${label}.${k}` : k, k);
};
walkGuide(GROK_GUIDE, '', '');
t('grokGuide hand note: no figures', !/\d/.test(GROK_GUIDE.first.note), GROK_GUIDE.first.note);
t('grokGuide: order is never numbered', !JSON.stringify(GROK_GUIDE).match(/\b0[1-9]\b/), '01/02/03 kicker found');
HOME_OFFERS.forEach((o) => {
  for (const k of ['eyebrow', 'title', 'accent', 'ctaLabel', 'secondaryLabel']) add(`${o.id}.${k}`, o[k], 6);
  add(`${o.id}.intro`, o.intro, 34);
  o.bullets.forEach((b, i) => {
    add(`${o.id}.bullets[${i}].title`, b.title, 4);
    add(`${o.id}.bullets[${i}].body`, b.body, 16);
  });
});
// The homepage scroll story (2026-10-01, learners first) + process strip + the /ai client guide.
for (const [beat, block] of Object.entries(STORY_COPY)) {
  for (const [k, v] of Object.entries(block)) {
    if (typeof v === 'string') add(`story.${beat}.${k}`, v, k === 'body' ? 30 : k === 'note' ? 6 : 10);
  }
}
// The model board's capability tags (2026-10-03): short labels on a narrow card.
Object.entries(STORY_COPY.noise.caps).forEach(([k, v]) => add(`story.noise.caps.${k}`, v, 3));
STORY_COPY.order.pairs.forEach((p, i) => {
  add(`story.order.pairs[${i}].term`, p.term, 4);
  add(`story.order.pairs[${i}].plain`, p.plain, 10);
});
STORY_COPY.path.steps.forEach((s, i) => {
  add(`story.path.steps[${i}].title`, s.title, 5);
  add(`story.path.steps[${i}].body`, s.body, 16);
});
// The brief bans sequential section numbering (01 / 02 / 03) anywhere in the copy.
t('process steps carry no 01/02/03 kickers', PROCESS_COPY.steps.every((s) => !('kicker' in s)), JSON.stringify(PROCESS_COPY.steps.map((s) => s.kicker)));
// The handwritten notes comment; they never carry a figure.
for (const note of [HERO_COPY.note, STORY_COPY.path.note]) t(`note "${note}": no figures`, !/\d/.test(note), note);
add('process.sub', PROCESS_COPY.sub, 14);
PROCESS_COPY.steps.forEach((s, i) => {
  add(`process.steps[${i}].title`, s.title, 5);
  add(`process.steps[${i}].body`, s.body, 24);
});
add('aiGuide.hero.title', AI_GUIDE_HERO.title, 8);
add('aiGuide.hero.subtitle', AI_GUIDE_HERO.subtitle, 16);
for (const [name, block] of [['what', AI_GUIDE_WHAT], ['prep', AI_GUIDE_PREP], ['process', AI_GUIDE_PROCESS]]) {
  add(`aiGuide.${name}.title`, block.title, 6);
  add(`aiGuide.${name}.intro`, block.intro, 40);
  for (const card of block.examples ?? block.items ?? block.steps) {
    add(`aiGuide.${name}:${card.title}.title`, card.title, 5);
    add(`aiGuide.${name}:${card.title}.body`, card.body, 22);
  }
}
add('aiGuide.what.difference', AI_GUIDE_WHAT.difference, 26);
add('aiGuide.cta.body', AI_GUIDE_CTA.body, 20);
// The client guide promises no numbers: a digit in it is almost certainly an invented figure.
for (const [label, text] of fields.filter(([l]) => l.startsWith('aiGuide'))) {
  t(`${label}: no figures`, !/\d/.test(text), text);
}
SERVICES.forEach((s) => {
  add(`service:${s.id}.title`, s.title, 6);
  add(`service:${s.id}.blurb`, s.blurb, 32);
  (s.points ?? []).forEach((p, i) => add(`service:${s.id}.points[${i}]`, p, 11));
});

// The brief's banned register. Matched as substrings on the raw copy.
const BANNED = [
  'בעולם של היום',
  'בעידן',
  'מהפכה',
  'המהפכה',
  'חסר תקדים',
  'בלתי הוגן',
  'לשלב הבא',
  'חסרת פשרות',
  'פורץ דרך',
  'חדשני',
];

// The three pillars, in order. AI-only since 2026-09-21.
t('offer order: AI agents, LLM lab, AI news hub', HOME_OFFERS.map((o) => o.id).join() === 'offer-ai-agents,offer-llm-lab,offer-ai-hub', HOME_OFFERS.map((o) => o.id).join());
t('hub offer links to the news hub', HOME_OFFERS[2]?.route === '/news', HOME_OFFERS[2]?.route);
t('hub offer second CTA opens every channel (Linktree)', HOME_OFFERS[2]?.secondary === 'linktree', HOME_OFFERS[2]?.secondary);
// The hero has exactly one CTA (into the scroll story since 2026-10-01); the news button is gone.
t('hero has a single CTA', !('ctaSecondary' in HERO_COPY), Object.keys(HERO_COPY).join());

// The retired cyber / enterprise offer must not creep back into the marketing copy.
const RETIRED = /סייבר|אבטחת מידע|cyber|infosec|enterprise|אנטרפרייז|ארגונ|saas|zero[- ]?trust/i;

for (const [label, text, max] of fields) {
  if (typeof text === 'string') t(`${label}: AI-only (no cyber / enterprise)`, !RETIRED.test(text), text);
  t(`${label}: filled`, typeof text === 'string' && text.trim().length > 0 && !text.includes('__'), JSON.stringify(text));
  if (typeof text !== 'string') continue;
  if (label !== 'contactForm.messageLabel') t(`${label}: no question mark`, !/[?؟]/.test(text), text);
  t(`${label}: no exclamation mark`, !text.includes('!'), text);
  t(`${label}: no model look-alike hyphens / NBSP / zero-width`, !LOOKALIKE.test(text), JSON.stringify(text));
  const hit = BANNED.find((b) => text.includes(b));
  t(`${label}: no banned phrase`, !hit, hit);
  t(`${label}: ≤ ${max} words`, words(text) <= max, `${words(text)} words: ${text}`);
  const out = rtl(text);
  t(`${label}: rtl() idempotent`, rtl(out) === out, JSON.stringify(out));
  // Every Latin letter must end up inside an RLM-anchored run or an LTR isolate.
  const bare = out.replace(WRAPPED, '');
  t(`${label}: every Latin run anchored`, !/[A-Za-z]/.test(bare), JSON.stringify(out));
}

// The typing rotator renders raw strings (bidi marks would type as invisible keystrokes), so a
// phrase must not start or end on a Latin term or digit, where the browser's bidi pass has no
// Hebrew neighbour to anchor it.
for (const term of ROTATOR_TERMS) {
  t(`rotator "${term}": starts and ends on Hebrew`, HEBREW_START.test(term) && HEBREW_END.test(term), term);
}
t('rtl() anchors a Latin term', rtl('סוכני AI לעסקים') === `סוכני ${RLM}AI${RLM} לעסקים`, JSON.stringify(rtl('סוכני AI לעסקים')));

for (const [state, label, detail] of results) if (state === 'FAIL') console.log(`${state} ${label}${detail ? ` — ${detail}` : ''}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
