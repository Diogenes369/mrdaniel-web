// "מילון AI מהחדשות של היום" (src/data/aiTerms.ts) + the 2026-09-23 autonomy fixes it shipped with:
// the X leg switched off, and the worker's fallback topics AI-only.
// Run: npx tsx scripts/__tests__/ai-terms.test.mjs
import fs from 'node:fs';
import { AI_TERMS, termsInStories } from '../../src/data/aiTerms.ts';

let pass = 0;
let fail = 0;
const t = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  ok ? pass++ : fail++;
};
const words = (s) => s.trim().split(/\s+/).length;

// ── Copy: plain, short, no punctuation the site copy bans ───────────────────────────────────
const ids = new Set();
for (const term of AI_TERMS) {
  t(`${term.id} · unique id`, !ids.has(term.id));
  ids.add(term.id);
  t(`${term.id} · explanation ≤ 26 words`, words(term.text) <= 26, `${words(term.text)} words`);
  t(`${term.id} · no ?/!`, !/[?!؟]/.test(term.text + term.label), term.text);
  t(`${term.id} · no invented figures`, !/\d/.test(term.text), term.text);
  t(`${term.id} · has at least one pattern`, term.match.length > 0);
}

// ── Matching: real headline shapes from the Hebrew feed ─────────────────────────────────────
const find = (text) => termsInStories([{ id: 'x', text }]).map((h) => h.term.id);
t('match · Hebrew with a prefix letter ("בחלון ההקשר")', find('המודל החדש מכפיל את הזיכרון בחלון ההקשר').includes('context-window'));
t('match · Latin acronym inside Hebrew ("פרוטוקול MCP")', find('אנתרופיק מרחיבה את פרוטוקול MCP לכלים נוספים').includes('mcp'));
t('match · agents in Hebrew', find('סוכני AI נכנסים למערכות הבנקים').includes('agent'));
t('match · open weights in Hebrew', find('מטא משחררת מודל בקוד פתוח').includes('open-weights'));
t('match · prompt injection does not also count as "prompt"', (() => {
  const r = find('חוקרים חשפו הזרקת פרומפט דרך מייל תמים');
  return r.includes('prompt-injection') && !r.includes('prompt');
})());
t('no match · "RAG" is not found inside other words', !find('DRAGON ו-FRAGMENT הם שמות קוד').includes('rag'));
t('no match · unrelated news', find('הבורסה בתל אביב נסגרה בעלייה').length === 0);

const stories = [
  { id: 'a', text: 'סוכני AI חדשים עם חלון הקשר ענק' },
  { id: 'b', text: 'עוד סוכן AI לשירות לקוחות' },
  { id: 'c', text: 'Google releases a new reasoning model' },
];
const ranked = termsInStories(stories);
t('rank · most-mentioned first', ranked[0]?.term.id === 'agent' && ranked[0].count === 2, JSON.stringify(ranked.map((h) => [h.term.id, h.count])));
t('rank · links to the first story that mentioned it', ranked[0]?.firstId === 'a');
t('rank · limit respected', termsInStories(stories, 1).length === 1);

// ── Autonomy fixes shipped alongside ────────────────────────────────────────────────────────
const social = fs.readFileSync('src/server/agents/socialSyncAgent.ts', 'utf8');
t('x · the paid X leg is off unless SOCIAL_SYNC_X=1', /process\.env\.SOCIAL_SYNC_X === '1'/.test(social) && /xOn \? getXFeed\(\)/.test(social));
t('x · reported as disabled, not as an error', /'disabled'/.test(social));

const tasks = fs.readFileSync('mcp-server/src/tasks.js', 'utf8');
const rotation = tasks.slice(tasks.indexOf('const ROTATION'), tasks.indexOf('];', tasks.indexOf('const ROTATION')));
t('worker · fallback topics are AI-only', !/סייבר|גיבוי|אבטחה בחשבונות|בענן\b|דשבורד|wifi|רשת/i.test(rotation), rotation);
t('worker · one topic per weekday', (rotation.match(/^\s+'/gm) ?? []).length === 7);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
