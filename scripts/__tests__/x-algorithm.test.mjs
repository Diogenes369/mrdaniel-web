// X marketing engine: the weights match what the open-sourced ranker ships, the scorer rewards the
// levers that ranker actually rewards, the deck → thread builder obeys its own rules, and Hermes
// catches a number the source never mentioned.
// No network. Run: npx tsx scripts/__tests__/x-algorithm.test.mjs
import {
  X_RANKING_WEIGHTS as W,
  X_RANKING_ADJUSTMENTS as A,
  X_POST_LIMIT,
  xWeightedLength,
  hasExternalLink,
  scoreXThread,
  threadFromDeck,
} from '../../src/server/xAlgorithm.ts';
import { findUnverifiedNumbers, isXaiBillingFailure } from '../../src/server/agents/grokCarouselAgent.ts';
import { xWriteStatus, checkEngagement, isOnTopic, X_DAILY_CAPS } from '../../src/server/xWriteClient.ts';
import { parseGrokJson, describeXaiError, XaiNotConfiguredError, XaiHttpError } from '../../src/server/xaiClient.ts';

const results = [];
const t = (label, cond, detail = '') => results.push([cond ? 'PASS' : 'FAIL', label, cond ? '' : detail]);

// ─── weights: verbatim from xai-org/x-algorithm home-mixer/params/param.rs (2026-09-21) ──────────
t('reply is 10× a like', W.reply / W.favorite === 10);
t('quote equals reply', W.quote === W.reply);
t('copy-link share is the heaviest positive lever', Math.max(...Object.values(W)) === W.shareViaCopyLink);
t('open-link is tiny next to reply', W.openLink < W.reply / 20);
t('report is the heaviest negative', Math.min(...Object.values(W)) === W.report && W.report === -234);
t('video-quality-view is currently unweighted', W.videoQualityView === 0);
t('author diversity halves the 2nd post', A.authorDiversityDecay === 0.5 && A.authorDiversityFloor === 0.25);
t('For You drops posts after 48h', A.maxPostAgeHours === 48);

// ─── weighted length ─────────────────────────────────────────────────────────────────────────────
t('hebrew weighs 1 per char', xWeightedLength('שלום') === 4);
t('a URL always weighs 23', xWeightedLength('https://mrdaniel.co.il/news/some-very-long-slug-here') === 23);
t('bare domain counts as a link', hasExternalLink('המדריך המלא: mrdaniel.co.il'));
t('plain hebrew has no link', !hasExternalLink('סוכן AI שעונה לבד'));

// ─── scorer ──────────────────────────────────────────────────────────────────────────────────────
const good = {
  posts: [
    { text: 'Grok 4.7 כותב קוד טוב יותר מהגרסה הקודמת, אבל הפרט שכולם מפספסים הוא חלון ההקשר.', mediaSlides: [0, 1, 2, 3] },
    { text: 'חלון של 500 אלף טוקנים משנה איך בונים סוכן: פחות RAG, יותר הקשר ישיר.', mediaSlides: [4] },
    { text: 'אבל הקשר ארוך עולה כסף. מדדו טוקנים בפועל לפני שמחליפים מודל.', mediaSlides: [] },
    { text: 'שמרו את השרשור ושלחו למי שבונה סוכן השבוע.\nעוקבים = פירוק AI כל יום.\nmrdaniel.co.il\n\nאיזה מודל אתם מריצים היום?', mediaSlides: [] },
  ],
};
const goodReport = scoreXThread(good);
t('a well-built thread grades A', goodReport.grade === 'A', JSON.stringify(goodReport.checks.filter((c) => !c.passed).map((c) => c.id)));

const linkHook = { posts: [{ ...good.posts[0], text: `${good.posts[0].text} https://mrdaniel.co.il/x` }, ...good.posts.slice(1)] };
const linkReport = scoreXThread(linkHook);
t('a link in the hook fails hook-no-link', !linkReport.checks.find((c) => c.id === 'hook-no-link').passed);
t('a link in the hook costs points', linkReport.score < goodReport.score);

const noMedia = { posts: [{ ...good.posts[0], mediaSlides: [] }, ...good.posts.slice(1)] };
t('no native media on the hook fails', !scoreXThread(noMedia).checks.find((c) => c.id === 'hook-media').passed);

const noQuestion = { posts: [...good.posts.slice(0, 3), { text: 'עוקבים = פירוק AI כל יום. mrdaniel.co.il', mediaSlides: [] }] };
t('no closing question fails reply-close', !scoreXThread(noQuestion).checks.find((c) => c.id === 'reply-close').passed);

const tooLong = { posts: [...good.posts, { text: 'א'.repeat(X_POST_LIMIT + 5), mediaSlides: [] }] };
t('an over-limit post fails length', !scoreXThread(tooLong).checks.find((c) => c.id === 'length').passed);

const tagSpam = { posts: [...good.posts.slice(0, 3), { ...good.posts[3], text: `${good.posts[3].text} #AI #LLM #Grok` }] };
t('three hashtags fail', !scoreXThread(tagSpam).checks.find((c) => c.id === 'hashtags').passed);

// ─── deck → thread ───────────────────────────────────────────────────────────────────────────────
const deck = [
  { role: 'hook', headline: 'המודל החדש לא מה שחשבתם', subhead: 'שלושה דברים שההודעה לעיתונות לא אמרה', body: '', bullets: [], quote: '', stat: '' },
  ...Array.from({ length: 7 }, (_, i) => ({ role: 'value', headline: `תובנה ${i + 1}`, subhead: '', body: 'הסבר קצר על מה שהמודל עושה אחרת ולמה זה משנה למי שבונה סוכן.', bullets: [], quote: '', stat: '' })),
  { role: 'cta', headline: 'עקבו', subhead: '', body: '', bullets: [], quote: '', stat: '' },
];
const thread = threadFromDeck(deck);
t('thread hook carries 4 native slides', thread[0].mediaSlides.length === 4);
t('link appears only in the last post', thread.slice(0, -1).every((p) => !hasExternalLink(p.text)) && hasExternalLink(thread[thread.length - 1].text));
t('every post fits', thread.every((p) => xWeightedLength(p.text) <= X_POST_LIMIT));
t('deck-built thread grades A or B', ['A', 'B'].includes(scoreXThread({ posts: thread }).grade), String(scoreXThread({ posts: thread }).score));

// ─── Hermes ──────────────────────────────────────────────────────────────────────────────────────
const source = 'המודל השיג 87% במבחן, עם חלון הקשר של 500,000 טוקנים.';
t('hermes passes numbers from the source', findUnverifiedNumbers('87% ו-500,000 טוקנים', source).length === 0);
t('hermes flags an invented number', findUnverifiedNumbers('שיפור של 43% בביצועים', source).join() === '43%');
t('hermes ignores ordinals and the year', findUnverifiedNumbers('3 דברים על 2026', source).length === 0);

// ─── xAI client helpers ──────────────────────────────────────────────────────────────────────────
t('parses fenced JSON', parseGrokJson('```json\n{"a":1}\n```').a === 1);
t('parses JSON after a preamble', parseGrokJson('here you go: {"slides":[]}').slides.length === 0);
t('missing key → 503 not_configured', describeXaiError(new XaiNotConfiguredError()).status === 503);
t('402 → no_credits (Premium is not API access)', describeXaiError(new XaiHttpError(402, '')).code === 'no_credits');

// ─── zero-cost policy: billing refusals fall back to free Groq, real faults still surface ────────
t('fallback on missing key', isXaiBillingFailure(new XaiNotConfiguredError()));
t('fallback on 402 (no credits)', isXaiBillingFailure(new XaiHttpError(402, '')));
t('fallback on 403 (team without credits — what xAI actually returns)', isXaiBillingFailure(new XaiHttpError(403, '')));
t('no fallback on 429', !isXaiBillingFailure(new XaiHttpError(429, '')));
t('no fallback on a parse error', !isXaiBillingFailure(new Error('xAI answer was not JSON')));

// ─── X writes: locked without keys; every action passes the quality gate ─────────────────────────
for (const k of ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET', 'X_WRITE_ENABLED']) delete process.env[k];
t('writes are locked with no keys', !xWriteStatus().enabled && xWriteStatus().missing.length === 5);
t('AI post is on-topic', isOnTopic('Claude 5 just shipped a new agent SDK'));
t('off-topic post is refused', checkEngagement('like', 'Great game last night!', 0) !== null);
t('daily cap enforced', checkEngagement('like', 'new LLM benchmark', X_DAILY_CAPS.like) !== null);
t('low-effort reply refused', checkEngagement('reply', 'OpenAI agents launch', 0, 'great post') !== null);
t('substantive on-topic reply allowed', checkEngagement('reply', 'OpenAI agents launch', 0, 'The interesting part is the tool-call budget, not the model size.') === null);

for (const [state, label, detail] of results) if (state === 'FAIL') console.log(`${state} ${label}${detail ? ` — ${detail}` : ''}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
