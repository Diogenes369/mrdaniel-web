/**
 * scraper-watch — live regression suite for the Threads importer.
 *
 *   npx tsx scripts/scraper-watch.ts          human-readable, exit 1 on any regression
 *   npx tsx scripts/scraper-watch.ts --json
 *
 * Threads changes its logged-out payload without notice, and the failure is silent: the importer
 * still answers `ok:true`, just with one post instead of nine. That is exactly what happened between
 * 2026-09-12 and 2026-09-16 (the self-reply chain moved into a separate deferred Relay blob), and it
 * was only noticed by hand. Each fixture pins a real public post to the shape it must come back in,
 * so the next change shows up as a failing line here instead of as a thin carousel.
 *
 * Fixtures are public posts by third parties, used only as test inputs. When one is deleted, replace
 * it with another post of the same shape — don't loosen the bounds.
 */
import { importThreadContent } from '../src/server/threadsThreadFetcher.js';

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

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok: rows.every((r) => r.ok), rows }, null, 2));
} else {
  for (const r of rows) {
    console.log(`${r.ok ? '✔' : '✘'} ${r.label.padEnd(40)} ${String(r.posts).padStart(2)} posts via ${r.via} (${r.ms}ms)${r.ok ? '' : ` — ${r.problems.join('; ')}`}`);
  }
}
process.exit(rows.every((r) => r.ok) ? 0 : 1);
