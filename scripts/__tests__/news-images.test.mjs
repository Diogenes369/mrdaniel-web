// News lead images: does a junk/too-small image get rejected at the source, and can a card ever
// end up with an empty image well?
//
// Every case traces to a real production observation made on 2026-09-21 against
// https://mrdaniel.co.il/api/news: 91 items, 42 with no image at all, and — the actual reported
// bug — 3 items whose "lead photo" was a WordPress emoji sprite
// (https://s.w.org/images/core/emoji/17.0.2/72x72/1f4de.png). That URL is https, loads with HTTP
// 200 and content-type image/png, so nothing rejected it: it passed the server's URL check, passed
// the client's isHebrewWithImage gate, and only failed at the last step — NewsImage's 400x300
// floor — which used to render nothing. The card came out as a black rectangle on the homepage.
//
// No network: every case is pure URL logic or pure string construction.
// Run: npx tsx scripts/__tests__/news-images.test.mjs
import { isTooSmallByUrl } from '../../src/server/newsFeed.ts';
import { isHebrewWithImage } from '../../src/lib/newsAnalysis.ts';
import { platePng } from '../../src/components/news/NewsImage.tsx';
import { readFileSync } from 'node:fs';

const results = [];
const t = (label, cond, detail = '') => results.push([cond ? 'PASS' : 'FAIL', label, cond ? '' : detail]);

// ─── the size-hint rejector ────────────────────────────────────────────────────────────────────

const TOO_SMALL = [
  ['the actual emoji sprite that caused the bug', 'https://s.w.org/images/core/emoji/17.0.2/72x72/1f4de.png'],
  ['a WordPress -150x150 thumbnail', 'https://example.co.il/wp-content/uploads/2026/09/photo-150x150.jpg'],
  ['a 320x180 rendition', 'https://cdn.example.com/img/320x180/story.jpg'],
  ['an explicit ?w= under the floor', 'https://cdn.example.com/photo.jpg?w=200&q=80'],
  ['an explicit ?width= under the floor', 'https://cdn.example.com/photo.jpg?width=320'],
];
for (const [label, url] of TOO_SMALL) t(`rejects ${label}`, isTooSmallByUrl(url), url);

const BIG_ENOUGH = [
  ['a real ynet crop (1024x683 when served)', 'https://ynet-pic1.yit.co.il/picserver6/crop_images/2026/09/10/B1FFqfxFMe/B1FFqfxFMe_0_0_2048_1365_0_x-large.jpg'],
  ['a 1200x630 og:image', 'https://example.co.il/img/1200x630/lead.jpg'],
  ['a plain url with no size hint at all', 'https://example.co.il/uploads/story-lead.jpg'],
  ['a date path that must not read as a size', 'https://example.co.il/2026/09/14/story.jpg'],
  ['a ?w= above the floor', 'https://cdn.example.com/photo.jpg?w=1600'],
  ['a cloudinary upload path', 'https://res.cloudinary.com/globes/image/upload/v1/story.jpg'],
];
for (const [label, url] of BIG_ENOUGH) t(`keeps ${label}`, !isTooSmallByUrl(url), url);

// The version string in the emoji URL ("17.0.2") sits right next to the size and must not itself be
// read as a dimension — that would make the rejector fire on arbitrary versioned CDN paths.
t('a version string is not mistaken for a size', !isTooSmallByUrl('https://cdn.example.com/lib/17.0.2/hero.jpg'));
t('empty input is not "too small"', !isTooSmallByUrl(''));

// ─── the server regex actually carries the emoji host ──────────────────────────────────────────

const feed = readFileSync(new URL('../../src/server/newsFeed.ts', import.meta.url), 'utf8');
t('JUNK_IMAGE_RE drops the WordPress emoji CDN', /s\\\.w\\\.org\\\/images\\\/core\\\/emoji/.test(feed) || /s\\.w\\.org/.test(feed), 'pattern missing');
t('the size check runs at both extraction points', (feed.match(/isTooSmallByUrl\(/g) ?? []).length >= 3, String((feed.match(/isTooSmallByUrl\(/g) ?? []).length));
t('the size check is applied AFTER upscaling', /const upscaled = upscaleImageUrl\([\s\S]{0,80}isTooSmallByUrl\(upscaled\)/.test(feed));

// ─── the homepage gate ─────────────────────────────────────────────────────────────────────────

const item = (over = {}) => ({
  id: 'x1',
  title: 'חברת סייבר ישראלית גייסה הון לפיתוח הגנה מבוססת בינה מלאכותית',
  excerpt: 'הסבב נועד להרחיב את פעילות המחקר והפיתוח בישראל ובאירופה.',
  source: 'אנשים ומחשבים',
  link: 'https://example.co.il/a',
  image: 'https://example.co.il/uploads/lead.jpg',
  topic: 'cyber',
  publishedAt: new Date().toISOString(),
  ...over,
});

t('a Hebrew item with a real image passes', isHebrewWithImage(item()));
t('an item with no image is dropped', !isHebrewWithImage(item({ image: '' })));
t(
  'an item whose lead image is the emoji sprite is dropped, not rendered blank',
  !isHebrewWithImage(item({ image: 'https://s.w.org/images/core/emoji/17.0.2/72x72/1f4de.png' }))
);
t('a foreign source is dropped', !isHebrewWithImage(item({ source: 'BleepingComputer' })));
t(
  'an English-dominant title is dropped',
  !isHebrewWithImage(item({ title: 'Israeli cyber startup raises funding round for AI defense platform', excerpt: '' }))
);

// ─── the fallback plate ────────────────────────────────────────────────────────────────────────
// This is the guarantee: whatever the feed served, the image well is never empty.

for (const topic of ['cyber', 'ai', 'ai_models', 'cloud', 'general']) {
  const uri = platePng(topic, 'item-1');
  t(`plate renders for topic "${topic}"`, uri.startsWith('data:image/svg+xml;charset=utf-8,'), uri.slice(0, 40));
  const svg = decodeURIComponent(uri.replace('data:image/svg+xml;charset=utf-8,', ''));
  t(`plate for "${topic}" is well-formed svg`, svg.startsWith('<svg') && svg.trimEnd().endsWith('</svg>'));
  t(`plate for "${topic}" carries the brand`, svg.includes('mrdaniel.co.il'));
  t(`plate for "${topic}" fetches nothing`, !/https?:\/\//.test(svg.replace(/xmlns="[^"]*"/g, '')), svg.slice(0, 120));
}

// Deterministic per item, so a card does not reshuffle its backdrop on every re-render...
t('plate is stable for the same item', platePng('ai', 'item-1') === platePng('ai', 'item-1'));
// ...but two different stories in a row do not get an identical plate.
t('plate differs between items', platePng('ai', 'item-1') !== platePng('ai', 'item-2'));
t('an unknown topic falls back to the general plate', platePng('nope', 's') === platePng('general', 's'));

// ─── no call site can render an empty well ─────────────────────────────────────────────────────

const newsImage = readFileSync(new URL('../../src/components/news/NewsImage.tsx', import.meta.url), 'utf8');
// Comments stripped first: the file's own header explains the old `return null` behaviour, and
// matching that prose would fail the check for the very documentation that justifies it.
const newsImageCode = newsImage.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
t('NewsImage never returns null any more', !/return null/.test(newsImageCode), 'a null return path is back');
t('the no-source path paints the plate', /if \(!src \|\| status === 'error'\)[\s\S]{0,200}src=\{fallback\}/.test(newsImage));
t('the 400x300 floor is still enforced', /naturalWidth < MIN_W \|\| el\.naturalHeight < MIN_H/.test(newsImage));
t('onError still routes to the plate', /onError=\{\(\) => setStatus\('error'\)\}/.test(newsImage));

for (const f of ['src/components/news/NewsCards.tsx', 'src/components/news/ArticleModal.tsx']) {
  const src = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
  const uses = (src.match(/<NewsImage /g) ?? []).length;
  const themed = (src.match(/<NewsImage [^>]*topic=\{item\.topic\}[^>]*seed=\{item\.id\}/g) ?? []).length;
  t(`${f}: every NewsImage gets a topic + seed`, uses > 0 && uses === themed, `${themed}/${uses}`);
}

// ─── the dashboard makes no unattended requests ────────────────────────────────────────────────
// The operator asked for zero background token usage; these were the two loops that ran forever on
// an open tab.

for (const f of ['dashboard/src/components/NewsContentAgent.tsx', 'dashboard/src/components/InstagramStoryCanvas.tsx']) {
  const src = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
  t(`${f}: the 4-minute news poll is gone`, !/setInterval\([^)]*fetchNews/.test(src), 'a background poll is back');
  t(`${f}: nothing fetches before the operator asks`, /if \(!loadedOnce\.current\) return;/.test(src));
  t(`${f}: the explicit load marks the tab live`, /loadedOnce\.current = true;/.test(src));
  t(`${f}: the toolbar button drives loadNews`, /onClick=\{\(\) => loadNews\(/.test(src));
}

for (const [state, label, detail] of results) console.log(`${state} ${label}${detail ? ` — ${detail}` : ''}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
