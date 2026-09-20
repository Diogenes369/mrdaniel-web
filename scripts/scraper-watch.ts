/**
 * scraper-watch — live regression suite for the Threads and X (Twitter) importers.
 *
 *   npx tsx scripts/scraper-watch.ts          human-readable, exit 1 on any regression
 *   npx tsx scripts/scraper-watch.ts --json
 *
 * Both platforms change their logged-out payload without notice, and the failure is silent: the
 * importer still answers `ok:true`, just with one post instead of nine, or with the post text but no
 * video. That is exactly what happened to Threads between 2026-09-12 and 2026-09-16 (the self-reply
 * chain moved into a separate deferred Relay blob), and it was only noticed by hand. Each fixture
 * pins a real public post to the shape it must come back in, so the next change shows up as a failing
 * line here instead of as a thin carousel or a subtitle button that does nothing.
 *
 * Fixtures are public posts by third parties, used only as test inputs. When one is deleted, replace
 * it with another post of the same shape — don't loosen the bounds.
 *
 * This is the LIVE suite and it hits the network. The offline parsing/formatting checks for the same
 * two pipelines are in scripts/__tests__/x-import.test.mjs, which `npm test` runs.
 */
import { importThreadContent } from '../src/server/threadsThreadFetcher.js';
import { importXPost, pickTranscriptionVariant } from '../src/server/xPostFetcher.js';

interface Fixture {
  label: string;
  url: string;
  /** Inclusive bounds on recovered posts. min guards the chain, max guards against pulling strangers. */
  minPosts: number;
  maxPosts: number;
  author: string;
  /** Substring every run must find in post 1 — proves the RIGHT post was read, not a feed. */
  firstPostIncludes: string;
}

const FIXTURES: Fixture[] = [
  {
    label: 'self-reply chain (9 posts)',
    url: 'https://www.threads.com/@iffikhans/post/DdKjD6yiBbt',
    minPosts: 9,
    maxPosts: 9,
    author: '@iffikhans',
    firstPostIncludes: 'Google Gemini',
  },
  {
    label: '/share/ short link → same chain',
    url: 'https://www.threads.com/share/BAntyLO24K/',
    minPosts: 9,
    maxPosts: 9,
    author: '@iffikhans',
    firstPostIncludes: 'Google Gemini',
  },
  {
    label: 'root post with only strangers replying',
    url: 'https://www.threads.com/@ai.tools_list/post/DVIruowlMx2',
    minPosts: 1,
    maxPosts: 1,
    author: '@ai.tools_list',
    firstPostIncludes: 'Perplexity',
  },
];

const rows = [];
for (const f of FIXTURES) {
  const started = Date.now();
  const t = await importThreadContent(f.url);
  const n = t.posts.length;
  const problems: string[] = [];
  if (!t.ok) problems.push(`ok:false (${t.note ?? 'no note'})`);
  if (n < f.minPosts || n > f.maxPosts) problems.push(`${n} posts, expected ${f.minPosts === f.maxPosts ? f.minPosts : `${f.minPosts}–${f.maxPosts}`}`);
  if (t.author.toLowerCase() !== f.author.toLowerCase()) problems.push(`author ${t.author || '(none)'}`);
  if (!String(t.posts[0] ?? '').includes(f.firstPostIncludes)) problems.push(`post 1 lacks "${f.firstPostIncludes}"`);
  rows.push({ label: f.label, ok: problems.length === 0, posts: n, via: t.via, ms: Date.now() - started, problems });
}

// ─── X (Twitter) ────────────────────────────────────────────────────────────────────────────
// The X fixtures pin the two things the importer silently loses when the syndication payload
// changes shape: the post's own prose (with the trailing t.co media link already stripped) and the
// mp4 renditions, without which the whole Hebrew-subtitle half of the tab is dead.

interface XFixture {
  label: string;
  url: string;
  author: string;
  /** Substring the recovered text must contain — proves the RIGHT post was read. */
  textIncludes: string;
  /** Minimum mp4 renditions; 0 for a post that carries no video. */
  minVariants: number;
  minImages: number;
}

const X_FIXTURES: XFixture[] = [
  {
    label: 'video post → mp4 renditions',
    url: 'https://x.com/AlexFinn/status/2087025097546809533',
    author: '@AlexFinn',
    textIncludes: 'AI tool',
    minVariants: 4,
    minImages: 0,
  },
  {
    label: 'photo post → proxied image, no video',
    url: 'https://twitter.com/TheEllenShow/status/440322224407314432',
    author: '@TheEllenShow',
    textIncludes: "Bradley's arm",
    minVariants: 0,
    minImages: 1,
  },
];

for (const f of X_FIXTURES) {
  const started = Date.now();
  const p = await importXPost(f.url);
  const problems: string[] = [];
  if (p.author.toLowerCase() !== f.author.toLowerCase()) problems.push(`author ${p.author || '(none)'}`);
  if (!p.text.includes(f.textIncludes)) problems.push(`text lacks "${f.textIncludes}"`);
  // The trailing media shortlink is the single most common thing to leak into a slide title.
  if (/t\.co\//.test(p.text)) problems.push('t.co shortlink leaked into the text');
  const variants = p.video?.variants.length ?? 0;
  if (variants < f.minVariants) problems.push(`${variants} mp4 renditions, expected ≥ ${f.minVariants}`);
  if (f.minVariants > 0 && !pickTranscriptionVariant(p.video)) problems.push('no rendition small enough to transcribe');
  if (p.images.length < f.minImages) problems.push(`${p.images.length} images, expected ≥ ${f.minImages}`);
  if (p.images.some((i) => !i.startsWith('https://mrdaniel.co.il/api/img-proxy?url='))) {
    problems.push('an image bypassed the relay and would taint the export canvas');
  }
  rows.push({
    label: `X · ${f.label}`,
    ok: problems.length === 0,
    posts: p.posts.length,
    via: p.via,
    ms: Date.now() - started,
    problems,
  });
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok: rows.every((r) => r.ok), rows }, null, 2));
} else {
  for (const r of rows) {
    console.log(`${r.ok ? '✔' : '✘'} ${r.label.padEnd(40)} ${String(r.posts).padStart(2)} posts via ${r.via} (${r.ms}ms)${r.ok ? '' : ` — ${r.problems.join('; ')}`}`);
  }
}
process.exit(rows.every((r) => r.ok) ? 0 : 1);
