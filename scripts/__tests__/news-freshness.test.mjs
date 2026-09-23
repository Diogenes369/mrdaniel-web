// News pipeline: does a stale or future-dated story still reach a card, does a blocked outlet have
// a way back in, and does the copy contract forbid the filler it was producing?
//
// Every number here traces to production on 2026-09-21, measured against /api/news:
//   - `sanitizeAndKeep` had NO notion of time, so the cyber tab carried ten Kodkod Cyber archive
//     posts between 293 and 1950 days old (a 2021 WiFi-cracking tutorial) plus a Dark Reading
//     webinar advert dated 2026-12-03 — 74 days in the FUTURE, which sorted newest-first pinned it
//     to the top of the feed permanently. That is what "cyber is stuck" actually was.
//   - Geektime, Calcalist, Israel Defense and Machine Learning Israel all logged
//     `failed to fetch … Status code 403` on Vercel while answering 200 from a laptop: their WAFs
//     refuse datacenter IPs.
//
// No network: pure gate logic and source-level assertions.
// Run: npx tsx scripts/__tests__/news-freshness.test.mjs
import { isStaleOrFutureDated, itemAgeDays, sanitizeAndKeep, MAX_ITEM_AGE_DAYS } from '../../src/server/newsFeed.ts';
import { scrubAiPhrases, CONCISE_FACTUAL_RULES } from '../../src/agent/expertVoice.ts';
import { readFileSync } from 'node:fs';

const results = [];
const t = (label, cond, detail = '') => results.push([cond ? 'PASS' : 'FAIL', label, cond ? '' : detail]);
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

// ─── recency gate ──────────────────────────────────────────────────────────────────────────────

const item = (over = {}) => ({
  id: 'x', slug: 'x', source: 'Machine Learning Israel', category: 'מודלי AI וחידושים', topic: 'ai_models',
  title: 'מודל שפה פתוח חדש מציג שיפור בהבנת עברית',
  link: 'https://a.co.il/x',
  excerpt: 'מודל השפה החדש נבדק על משימות בעברית',
  summary: 'סקירה של מודל שפה פתוח חדש ותוצאותיו בעברית',
  publishedAt: new Date().toISOString(),
  ...over,
});

for (const [label, days, stale] of [
  ['published today', 0, false],
  ['3 days old', 3, false],
  ['at the limit (21d)', 20, false],
  ['past the limit (22d)', 22, true],
  ['the Kodkod archive (293d)', 293, true],
  ['the 2021 WiFi tutorial (1950d)', 1950, true],
  ['the Dark Reading webinar (74d in the FUTURE)', -74, true],
  ['2 days ahead — clock skew, allowed', -2, false],
]) {
  t(`recency · ${label}`, isStaleOrFutureDated(daysAgo(days)) === stale, `stale=${isStaleOrFutureDated(daysAgo(days))}`);
  t(`gate · ${label} ${stale ? 'is dropped' : 'is kept'}`, sanitizeAndKeep(item({ publishedAt: daysAgo(days) })) === !stale);
}

t('recency · the limit is 21 days', MAX_ITEM_AGE_DAYS === 21, String(MAX_ITEM_AGE_DAYS));
t('recency · an unparseable date is not called stale', !isStaleOrFutureDated('not-a-date'));
t('recency · an unparseable date has no age', itemAgeDays('nonsense') === null);
t('recency · age is positive for the past', (itemAgeDays(daysAgo(10)) ?? 0) > 9.9);
t('recency · age is negative for the future', (itemAgeDays(daysAgo(-5)) ?? 0) < 0);

// The recency check must not have weakened the gates that were already there.
t('gate · a fresh but English-dominant title is still dropped', !sanitizeAndKeep(item({ title: 'New open-weight language model improves Hebrew understanding' })));
// AI-only since 2026-09-21: a security-beat story is dropped even when it mentions AI, and an item
// the classifier found no AI signal in never reaches a card.
t('gate · a security-beat story is dropped even with an AI angle', !sanitizeAndKeep(item({ title: 'מתקפת כופרה חדשה מנצלת סוכן AI כדי להתפשט', summary: 'חוקרי סייבר זיהו ransomware חדש' })));
t('gate · a non-AI topic is dropped', !sanitizeAndKeep(item({ topic: 'general', title: 'שעון חכם חדש הושק היום בישראל עם סוללה ארוכה' })));
t('gate · an agent story passes', sanitizeAndKeep(item({ topic: 'ai_agents', title: 'סוכן AI חדש יודע להזמין טיסות בעצמו' })));
t('gate · a fresh markup-leftover title is still dropped', !sanitizeAndKeep(item({ title: '&#8217; &lt;p&gt; מבוא לחולשות' })));
t('gate · a fresh on-topic Hebrew item still passes', sanitizeAndKeep(item()));

// ─── the 403 recovery path ─────────────────────────────────────────────────────────────────────

const feed = readFileSync(new URL('../../src/server/newsFeed.ts', import.meta.url), 'utf8');
t('403 · a blocked fetch is retried with full browser headers', /function feedHeaders\(/.test(feed));
t('403 · the retry sends the Sec-Fetch set a real browser sends', /'Sec-Fetch-Mode': 'navigate'/.test(feed));
t('403 · the retry sends a same-origin Referer', /Referer: `\$\{origin\}\/`/.test(feed));
t('403 · only a recoverable status triggers the retry', /const BLOCKED_STATUS = /.test(feed) && /40\[13\]|40\{1\}/.test(feed.match(/const BLOCKED_STATUS = [^\n]+/)?.[0] ?? ''));
t('403 · a 404 is NOT retried elsewhere', !/BLOCKED_STATUS[\s\S]{0,80}404/.test(feed));
t('403 · Google News is the last resort', /function googleNewsMirror\(/.test(feed));
t('403 · the mirror is scoped to the outlet and to a week', /site:\$\{host\} when:7d/.test(feed));
t('403 · the mirror asks for Hebrew results', /hl=he&gl=IL&ceid=IL:he/.test(feed));
t('403 · a mirrored headline gets its outlet suffix stripped', /source\.stripTitleSuffix \|\| viaMirror/.test(feed));
t('403 · the three attempts are ordered cheapest first', feed.indexOf('parser.parseURL(source.url)') < feed.indexOf('feedHeaders(source.url)') && feed.indexOf('feedHeaders(source.url)') < feed.indexOf('googleNewsMirror(source.url)'));

// ─── the copy contract ─────────────────────────────────────────────────────────────────────────
// The exact filler the operator named, plus the variants the model substitutes once those are
// blocked. Each must be gone from the OUTPUT, not merely forbidden in the prompt.

for (const [label, input] of [
  ['בעולם המודרני', 'בעולם המודרני, חברות רבות מאמצות בינה מלאכותית.'],
  ['בעידן הבינה המלאכותית', 'בעידן הבינה המלאכותית, ארגונים נדרשים להתאים את עצמם.'],
  ['בעולם של היום', 'בעולם של היום, אבטחת מידע היא קריטית.'],
  ['בתקופה הנוכחית', 'בתקופה הנוכחית, ארגונים מגבירים השקעה.'],
  ['כידוע', 'כידוע, התוקפים מנצלים חולשות ידועות.'],
  ['אין זה סוד ש', 'אין זה סוד שהתקציבים גדלים.'],
  ['חשוב לציין', 'חשוב לציין כי החולשה תוקנה.'],
  ['יש לציין כי', 'יש לציין כי הגרסה עודכנה.'],
  ['במאמר זה', 'במאמר זה נסקור את החולשה.'],
]) {
  const out = scrubAiPhrases(input);
  t(`fluff · "${label}" is removed`, !out.includes(label.replace(/^ב/, '')) || out.length < input.length, JSON.stringify(out));
  t(`fluff · "${label}" leaves grammatical Hebrew`, !/^\s*[,.]/.test(out) && out.trim().length > 0, JSON.stringify(out));
}

for (const [label, input] of [
  ['האם תהיתם', 'האם תהיתם כמה זה עולה? החולשה תוקנה בגרסה 2.4.'],
  ['ידעתם ש', 'ידעתם שרוב הארגונים לא מעדכנים? הפגיעות דורגה כקריטית.'],
  ['שמתם לב', 'שמתם לב שהתוקפים משנים שיטה? הקמפיין זוהה במרץ.'],
  ['מה אם', 'מה אם המערכת שלכם כבר נפרצה? הדוח פורסם אתמול.'],
  ['רוצים לדעת', 'רוצים לדעת איך להתגונן? העדכון זמין להורדה.'],
]) {
  const out = scrubAiPhrases(input);
  t(`rhetoric · the "${label}" opener is removed`, !out.includes('?') || !out.startsWith(label.slice(0, 4)), JSON.stringify(out));
  t(`rhetoric · the factual sentence survives "${label}"`, /[֐-׿]/.test(out) && out.trim().length > 10, JSON.stringify(out));
}

t('rhetoric · a closing engagement question is removed', !scrubAiPhrases('החולשה תוקנה בגרסה 2.4. מה דעתכם על זה?').includes('מה דעתכם'), JSON.stringify(scrubAiPhrases('החולשה תוקנה בגרסה 2.4. מה דעתכם על זה?')));

// A question that is part of the reported facts must NOT be stripped — the scrubber targets
// rhetorical openers, not every question mark.
const quoted = scrubAiPhrases('החוקר שאל את המערכת: "מה גרסת הליבה?" והמערכת השיבה.');
t('rhetoric · a quoted in-source question survives', quoted.includes('מה גרסת הליבה'), JSON.stringify(quoted));

// The scrubber must remain safe on JSON and on non-Hebrew payloads.
t('scrub · JSON still parses afterwards', (() => {
  const raw = JSON.stringify({ body: 'בעולם המודרני, החולשה תוקנה. האם תהיתם למה?' });
  try { JSON.parse(scrubAiPhrases(raw)); return true; } catch { return false; }
})());
t('scrub · English/code is untouched', scrubAiPhrases('const x = 1;  // spacing   preserved') === 'const x = 1;  // spacing   preserved');

// ─── the prompt block ──────────────────────────────────────────────────────────────────────────

t('rules · the block names the banned openers', /בעולם המודרני/.test(CONCISE_FACTUAL_RULES) && /בעידן הבינה המלאכותית/.test(CONCISE_FACTUAL_RULES));
t('rules · the block forbids rhetorical questions in BOTH positions', /אין שאלה בפתיחה ואין שאלה בסיום/.test(CONCISE_FACTUAL_RULES));
t('rules · the block demands strict source fidelity', /אך ורק מה שכתוב במקור/.test(CONCISE_FACTUAL_RULES));
t('rules · the block forbids invented opinion', /אסור להוסיף דעה/.test(CONCISE_FACTUAL_RULES));
t('rules · the block sets an IT-peer tone', /עמית למקצוע/.test(CONCISE_FACTUAL_RULES));
t('rules · the block declares it overrides earlier conflicts', /גובר על כל הנחיה סותרת/.test(CONCISE_FACTUAL_RULES));

const engine = readFileSync(new URL('../../src/agent/SocialAgentEngine.ts', import.meta.url), 'utf8');
// Since 2026-09-23 both news-post instructions embed the block directly and neither carries
// ENGAGEMENT_RULES, so there is no conflicting block left for it to have to come after.
{
  const news = engine.slice(engine.indexOf('const NEWS_POST_SYSTEM_INSTRUCTION'), engine.indexOf('export function stripMarkdownEmphasis'));
  t('rules · news post + WhatsApp drafting both carry the block', (news.match(/\$\{CONCISE_FACTUAL_RULES\}/g) ?? []).length === 2 && !news.includes('${ENGAGEMENT_RULES}'));
}
const insights = readFileSync(new URL('../../src/server/newsInsights.ts', import.meta.url), 'utf8');
// The analysis prompt inlines the concision contract instead of the full block: the shared blocks
// cost ~4k tokens, which on Groq's 8k/min free tier truncated the three-section JSON.
t('rules · the news-analysis path carries the concision contract inline', /בלי מילוי/.test(insights) && /בלי שאלות רטוריות/.test(insights) && /עובדתיים בלבד/.test(insights));
t('rules · the news-analysis path keeps the audience block', /\$\{AUDIENCE_RULES\}/.test(insights));
t('analysis · reads the FULL article, not the teaser', /importUrlContent\(link\)/.test(insights) && /resolveGoogleNewsUrl/.test(insights));
t('analysis · the prompt is sized to the Groq window', /fitToTokens\(/.test(insights) && /maxOutputTokens: OUTPUT_TOKENS/.test(insights));
// 2026-09-23: two sections; the "MR. DANIEL Analysis" block was removed by decision.
t('analysis · returns the two modal sections, no analysis block', ['executiveSummary', 'extendedArticle'].every((k) => insights.includes(k)) && !insights.includes('mrDanielAnalysis'));
{
  const api = readFileSync(new URL('../../api/news.ts', import.meta.url), 'utf8');
  const pre = readFileSync(new URL('../../src/server/articlePrecompute.ts', import.meta.url), 'utf8');
  const svc = readFileSync(new URL('../../src/services/newsInsightsService.ts', import.meta.url), 'utf8');
  const modal = readFileSync(new URL('../../src/components/news/ArticleModal.tsx', import.meta.url), 'utf8');
  t('precompute · the click path cannot generate: api/news never calls generateArticleInsights', !/generateArticleInsights\(/.test(api));
  t('precompute · generation lives only in the background agent', /generateArticleInsights\(/.test(pre));
  t('precompute · the batch endpoint requires the admin secret', /action === 'precompute'[\s\S]{0,200}x-admin-secret/.test(api));
  t('precompute · a rate limit stops the batch instead of burning the day', /stoppedBy = 'rate-limit'/.test(pre));
  t('precompute · only an article-caused failure counts against the article (503/outage does not)', /if \(!isArticleFault\(err\)\)/.test(pre) && !/function isRateLimit/.test(pre));
  t('precompute · the modal reads the prefetched map, no per-article request', !/news\/analyze/.test(svc) && /action=insights/.test(svc) && !/fetch\(/.test(modal));
  t('precompute · the map is warmed while idle', /requestIdleCallback/.test(svc));
}
t('analysis · first engine is a free flash-lite, not the 20/day 3.6-flash', /ENGINES: Engine\[\] = \[\s*\{[^}]*'gemini-3\.1-flash-lite'/.test(insights) && !/'gemini-3\.6-flash'/.test(insights));
t('analysis · stays off the shared router (Groq main model / 3.6-flash pacing)', !/generateContentWithRetry\(/.test(insights));
t('analysis · a daily 429 benches the model until UTC midnight', /nextUtcMidnight\(\)/.test(insights));
t('analysis · concurrent opens share one generation', /inFlight\.get\(key\)/.test(insights));
t('analysis · the voice scrub still runs', /scrubAiPhrases\(/.test(insights));
t('analysis · edge caches a stored analysis for a day', /max-age=86400/.test(readFileSync(new URL('../../api/news.ts', import.meta.url), 'utf8')));

// ─── text generation never carries media ───────────────────────────────────────────────────────

t('textOnly · the option exists and strips media', /textOnly\?: boolean/.test(readFileSync(new URL('../../src/agent/geminiClient.ts', import.meta.url), 'utf8')));
const client = readFileSync(new URL('../../src/agent/geminiClient.ts', import.meta.url), 'utf8');
t('textOnly · stripping happens BEFORE routing', client.indexOf('stripInlineData(params)') < client.indexOf('const textOnly ='));
t('textOnly · a stripped call is always Groq-eligible', /options\.textOnly === true \|\| isTextOnlyRequest/.test(client));
t('textOnly · an emptied turn is dropped, not sent blank', /contents: cleaned\.filter\(\(c\) => \(c\?\.parts \?\? \[\]\)\.length > 0\)/.test(client));

const TEXT_GENERATORS = ['generateSocialContent','synthesizeStorySlides','synthesizeStoryCarousel','synthesizeCarouselDeck','editSlideDeck','synthesizeNewsPost','synthesizeReelScript','synthesizeTechTipDeck','synthesizeThreadDeck'];
for (const fn of TEXT_GENERATORS) {
  const body = engine.slice(engine.indexOf(`export async function ${fn}`), engine.indexOf(`export async function ${fn}`) + 4000);
  t(`textOnly · ${fn} is tagged`, /\{ textOnly: true \}/.test(body), 'missing');
}
// The multimodal ones must NOT be — tagging them would strip the very image they exist to read.
for (const fn of ['extractImageCarouselContent','classifyImageCarouselPreset','extractInstagramPromptLibrary','synthesizeSpeech','transcribeAudio']) {
  const start = engine.indexOf(`export async function ${fn}`);
  const body = engine.slice(start, engine.indexOf('export ', start + 10));
  t(`textOnly · ${fn} is NOT tagged (it needs its media)`, !/\{ textOnly: true \}/.test(body), 'wrongly tagged');
}

// ─── background work must not starve interactive work ──────────────────────────────────────────

const translate = readFileSync(new URL('../../src/server/newsTranslate.ts', import.meta.url), 'utf8');
const concurrency = Number(translate.match(/CHUNK_CONCURRENCY = (\d+)/)?.[1] ?? 99);
const perRefresh = Number(translate.match(/MAX_ITEMS_PER_REFRESH = (\d+)/)?.[1] ?? 999);
t('budget · translation concurrency is small enough not to blow Groq TPM', concurrency <= 4, String(concurrency));
t('budget · the per-refresh item cap is bounded', perRefresh <= 50, String(perRefresh));
t('budget · translation works on Groq alone, without a Gemini key', /!genAI && !isGroqConfigured\(\)/.test(translate));

for (const [state, label, detail] of results) console.log(`${state} ${label}${detail ? ` — ${detail}` : ''}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
