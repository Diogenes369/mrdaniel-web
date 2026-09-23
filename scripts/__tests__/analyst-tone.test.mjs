// Analyst-register filter for article-derived posts (src/agent/analystTone.ts + its dashboard
// mirror). check:mirrors compares type shapes only, so this runs BOTH copies over the same inputs
// and fails on any difference, then pins the behaviour the 2026-09-23 brief asked for.
import fs from 'node:fs';
import * as server from '../../src/agent/analystTone.ts';
import * as dash from '../../dashboard/src/lib/analystTone.ts';

let pass = 0;
let fail = 0;
const t = (label, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  ok ? pass++ : fail++;
};

// ── The two copies are the same code ────────────────────────────────────────────────────────
const body = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n */\n').slice(1).join('\n */\n');
const serverCode = body('src/agent/analystTone.ts');
t('mirror · code below the header is byte-identical', serverCode.length > 1000 && serverCode === body('dashboard/src/lib/analystTone.ts'));

// ── CTA ─────────────────────────────────────────────────────────────────────────────────────
const CTA = '📡 להישאר צעד אחד קדימה: חדשות AI בזמן אמת וסוכנים אוטונומיים – mrdaniel.co.il';
t('cta · exact hardcoded string', server.NEWS_CTA_LINE === CTA && dash.NEWS_CTA_LINE === CTA);

// ── Body filter ─────────────────────────────────────────────────────────────────────────────
const noisy = [
  '🚀 OpenAI השיקה את GPT-5.5 עם חלון הקשר של מיליון טוקנים.',
  '',
  '• 💰 המחיר ירד ב-40% לעומת הגרסה הקודמת. במעבדה שלי זה רץ מהר יותר.',
  '• ⚙️ התמיכה ב-MCP מובנית.',
  '',
  'מודלי שפה עובדים על ידי חיזוי הטוקן הבא. ההשלכה: Anthropic ו-Google צריכות להגיב במחיר.',
  '',
  'אילו פרמטרים הייתם מוסיפים למודל?',
  'לפרטים — קישור בביו.',
].join('\n');
for (const [name, mod] of [['server', server], ['dashboard', dash]]) {
  const out = mod.enforceAnalystTone(noisy);
  t(`${name} · every emoji removed`, !/\p{Extended_Pictographic}/u.test(out));
  t(`${name} · "my lab" sentence removed, the fact beside it kept`, !out.includes('במעבדה') && out.includes('המחיר ירד ב-40%'));
  t(`${name} · how-models-work aside removed, the analysis beside it kept`, !out.includes('חיזוי הטוקן') && out.includes('Anthropic'));
  t(`${name} · reader poll and model-written CTA removed`, !out.includes('פרמטרים') && !out.includes('בביו'));
  t(`${name} · bullets and versions survive`, out.includes('• התמיכה ב-MCP') && out.includes('GPT-5.5'));
  t(`${name} · ends on analysis, not a question`, !/[?]\s*$/.test(out));
}
t('parity · enforceAnalystTone', server.enforceAnalystTone(noisy) === dash.enforceAnalystTone(noisy));

// ── Hashtags ────────────────────────────────────────────────────────────────────────────────
const ctx = 'Ethereum מעדכנת את מנגנון ה-Smart Contracts. Ethereum ו-Solana מתחרות; ה-SEC בוחנת את Ethereum.';
for (const [name, mod] of [['server', server], ['dashboard', dash]]) {
  const tags = mod.contextualHashtags(['#AI', '#Tech', '#בינה_מלאכותית', '#טכנולוגיה', '#חדשנות'], ctx);
  t(`${name} · generic tags dropped`, !tags.some((x) => /^#(AI|Tech|בינה_מלאכותית|טכנולוגיה|חדשנות)$/.test(x)));
  t(`${name} · topped up from article entities (${tags.join(' ')})`, tags.length >= 3 && tags[0] === '#Ethereum' && tags.includes('#SmartContracts'));
  const kept = mod.contextualHashtags(['#OpenAI', '#GPT-5', '#Claude', '#MCP', '#Nvidia', '#Gemini', '#AI'], '');
  t(`${name} · model's specific tags kept, sanitised, capped at 5 (${kept.join(' ')})`, kept.length === 5 && kept.includes('#GPT5') && !kept.includes('#AI'));
  t(`${name} · deduplicated case-insensitively`, mod.contextualHashtags(['#OpenAI', '#openai', '#Open_AI'], '').length === 1);
}
t('parity · contextualHashtags', JSON.stringify(server.contextualHashtags([], ctx)) === JSON.stringify(dash.contextualHashtags([], ctx)));

// ── Prompt wiring ───────────────────────────────────────────────────────────────────────────
const engine = fs.readFileSync('src/agent/SocialAgentEngine.ts', 'utf8');
const newsPrompt = engine.slice(engine.indexOf('const NEWS_POST_SYSTEM_INSTRUCTION'), engine.indexOf('/**', engine.indexOf('const WHATSAPP_POST_SYSTEM_INSTRUCTION')));
t('prompt · news + WhatsApp use the analyst voice', (newsPrompt.match(/\$\{ANALYST_VOICE_RULES\}/g) ?? []).length === 2);
t('prompt · no brand block (source of "in my lab")', !newsPrompt.includes('${BRAND_KNOWLEDGE_BASE}'));
t('prompt · no engagement block (source of the closing poll)', !newsPrompt.includes('${ENGAGEMENT_RULES}'));
t('prompt · contextual hashtag rules in both', (newsPrompt.match(/\$\{CONTEXTUAL_HASHTAG_RULES\}/g) ?? []).length === 2);
t('engine · output runs through enforceAnalystTone + contextualHashtags', /enforceAnalystTone\(stripMarkdownEmphasis/.test(engine) && /contextualHashtags\(hashtags,/.test(engine));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
