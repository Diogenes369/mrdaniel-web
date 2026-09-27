import { fetchFullArticle } from './repurposeApi';
import type { NewsItem } from './newsAgentTypes';

/**
 * Resolves the FULL article body behind a news item, so AI synthesis works from the article rather
 * than from the RSS teaser.
 *
 * The bug this closes: the post and reel synthesis paths took `item.summary || item.excerpt` — the
 * RSS `<description>` — as their article text. Most Israeli feeds ship a one-line teaser there, and
 * ice.co.il ships 58 characters. Post synthesis has a 60-character floor, so those items failed
 * with "טקסט הכתבה קצר מדי" and silently dropped to the deterministic base template; the ones that
 * squeaked past the floor produced a whole post written from a single sentence.
 *
 * The story renderer already deep-scraped for exactly this reason (see instagramStoryRenderer.ts);
 * this makes the same guarantee available to every synthesis path from one place. The fetch goes
 * through /api/agent-generate · action:"import-url", which runs the server's zero-noise extraction
 * chain (structured DOM read → Jina Reader → loose scrape).
 *
 * Never throws: any failure returns the teaser, so the caller's own fallback still applies.
 */

/**
 * A teaser at least this long is a real summary and worth synthesising from as-is.
 *
 * Was 900 — which is exactly the cap newsTranslate.ts puts on a translated summary, so every
 * English-sourced item skipped the article fetch and was synthesised from a machine-translated
 * digest of it. That digest is where a new model name first gets "corrected" to one the translator
 * knows, and the deck then faithfully repeated the drift. The article itself is the source of
 * truth; only a teaser long enough to be most of an article skips the fetch now.
 */
const TEASER_IS_ENOUGH = 2500;

/** Below this the fetched body is not an improvement worth preferring over the teaser. */
const MIN_USEFUL_BODY = 100;

/**
 * Hard ceiling on the scrape, so a slow origin cannot hang the operator's "generate" click.
 * 16s → 28s (2026-09-27): a WAF-blocked origin now costs a Google News resolve plus a
 * browser-rendered Jina pass (~6-12s) before the body arrives, and 16s cut that path off.
 */
const FETCH_TIMEOUT_MS = 28000;

const cache = new Map<string, FullArticle>();
/** De-duplicates concurrent resolves for the same link (post + reel + carousel fire together). */
const inFlight = new Map<string, Promise<FullArticle>>();

export interface ResolvedArticleText {
  text: string;
  /** Where the text came from — surfaced so a thin post can be explained rather than guessed at. */
  via: 'feed' | 'article';
  /** Present when the full-article fetch was attempted and did not improve on the teaser. */
  note?: string;
}

function withDeadline<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

/**
 * A link worth scraping: any real http(s) URL.
 *
 * Google News redirect links used to be refused here ("no article there"), which is why 52 of 119
 * feed items (measured 2026-09-27) could never get a body and failed with "לא ניתן היה לשלוף את
 * גוף הכתבה מהמקור". The server importer now follows the redirect to the publisher first
 * (resolveGoogleNewsUrl), so these are as scrapable as any direct link.
 */
function isScrapable(link: string): boolean {
  return /^https?:\/\//i.test(link);
}

interface FullArticle {
  body: string;
  image: string;
}

async function loadFullArticle(link: string): Promise<FullArticle> {
  const cached = cache.get(link);
  if (cached !== undefined) return cached;
  const pending = inFlight.get(link);
  if (pending) return pending;

  const empty: FullArticle = { body: '', image: '' };
  const run = withDeadline(fetchFullArticle(link), FETCH_TIMEOUT_MS, empty)
    .then((got) => {
      const result = { body: (got.body || '').trim(), image: (got.image || '').trim() };
      // Only a real result is cached — a timeout or a transient 5xx should be retried on the
      // operator's next click rather than remembered as "this article has no body".
      if (result.body || result.image) cache.set(link, result);
      return result;
    })
    .catch(() => empty)
    .finally(() => inFlight.delete(link));

  inFlight.set(link, run);
  return run;
}

/**
 * The article's own lead image when the feed item carries none. Shares the body fetch's cache and
 * in-flight slot, so a post + image generated for the same item cost one import between them.
 * '' when the page has no usable image — only THEN may a renderer consider anything else.
 */
export async function resolveArticleImage(item: NewsItem): Promise<string> {
  if (item.image) return item.image;
  const link = (item.link || '').trim();
  if (!isScrapable(link)) return '';
  return (await loadFullArticle(link)).image;
}

/**
 * The best available article text for `item`: its full body when one can be fetched, otherwise the
 * feed teaser.
 */
export async function resolveArticleText(item: NewsItem): Promise<ResolvedArticleText> {
  const teaser = (item.summary || item.excerpt || '').trim();
  if (teaser.length >= TEASER_IS_ENOUGH) return { text: teaser, via: 'feed' };

  const link = (item.link || '').trim();
  if (!isScrapable(link)) return { text: teaser, via: 'feed' };

  const full = (await loadFullArticle(link)).body;
  if (full.length >= MIN_USEFUL_BODY && full.length > teaser.length) {
    return { text: full, via: 'article' };
  }
  return {
    text: teaser,
    via: 'feed',
    note: full ? 'גוף הכתבה שחולץ לא היה מלא יותר מהתקציר' : 'לא ניתן היה לשלוף את גוף הכתבה מהמקור',
  };
}
