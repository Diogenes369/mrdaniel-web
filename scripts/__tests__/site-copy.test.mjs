// Guards the homepage / About / footer marketing copy (src/data/siteCopy.ts, homeOffers.ts,
// homeServices.ts) against the regressions a copy pass tends to reintroduce:
//   - model Unicode look-alikes (U+2011 from gpt-oss) that shatter a Latin term's bidi run,
//   - rhetorical questions and the stock AI-marketing phrases the brief bans,
//   - walls of text (per-field word budgets),
//   - a placeholder that never got filled,
//   - rtl() output that is not idempotent or leaves a Latin run un-anchored.
// Run: npx tsx scripts/__tests__/site-copy.test.mjs
import { HERO_COPY, ROTATOR_TERMS, COMMUNITY_COPY, SERVICES_COPY, CONTACT_COPY, FOOTER_COPY, ABOUT_COPY } from '../../src/data/siteCopy.ts';
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

Object.entries(HERO_COPY).forEach(([k, v]) => add(`hero.${k}`, v, k === 'sub' ? 26 : 7));
ROTATOR_TERMS.forEach((v, i) => add(`rotator[${i}]`, v, 5));
['eyebrow', 'lead', 'accent', 'sub'].forEach((k) => add(`community.${k}`, COMMUNITY_COPY[k], k === 'sub' ? 22 : 5));
Object.entries(COMMUNITY_COPY.channels).forEach(([k, v]) => add(`community.channels.${k}`, v, 9));
Object.entries(SERVICES_COPY).forEach(([k, v]) => add(`services.${k}`, v, ['sub', 'closing'].includes(k) ? 22 : 5));
add('contact.headline', CONTACT_COPY.headline, 8);
add('contact.sub', CONTACT_COPY.sub, 32);
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
HOME_OFFERS.forEach((o) => {
  for (const k of ['eyebrow', 'title', 'accent', 'ctaLabel', 'secondaryLabel']) add(`${o.id}.${k}`, o[k], 6);
  add(`${o.id}.intro`, o.intro, 34);
  o.bullets.forEach((b, i) => {
    add(`${o.id}.bullets[${i}].title`, b.title, 4);
    add(`${o.id}.bullets[${i}].body`, b.body, 16);
  });
});
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
t('hub offer second CTA goes to the community grid', HOME_OFFERS[2]?.secondary === 'community', HOME_OFFERS[2]?.secondary);

// The retired cyber / enterprise offer must not creep back into the marketing copy.
const RETIRED = /סייבר|אבטחת מידע|cyber|infosec|enterprise|אנטרפרייז|ארגונ|saas|zero[- ]?trust/i;

for (const [label, text, max] of fields) {
  if (typeof text === 'string') t(`${label}: AI-only (no cyber / enterprise)`, !RETIRED.test(text), text);
  t(`${label}: filled`, typeof text === 'string' && text.trim().length > 0 && !text.includes('__'), JSON.stringify(text));
  if (typeof text !== 'string') continue;
  t(`${label}: no question mark`, !/[?؟]/.test(text), text);
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
