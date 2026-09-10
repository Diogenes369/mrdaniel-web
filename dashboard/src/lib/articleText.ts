import { fetchFullArticleBody } from './repurposeApi';
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

/** A teaser at least this long is a real summary and worth synthesising from as-is. */
const TEASER_IS_ENOUGH = 900;

/** Below this the fetched body is not an improvement worth preferring over the teaser. */
const MIN_USEFUL_BODY = 200;

/** Hard ceiling on the scrape, so a slow origin cannot hang the operator's "generate" click. */
const FETCH_TIMEOUT_MS = 16000;

const cache = new Map<string, string>();
/** De-duplicates concurrent resolves for the same link (post + reel + carousel fire together). */
const inFlight = new Map<string, Promise<string>>();

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

/** A link worth scraping: real http(s), and not a Google News redirect stub (no article there). */
function isScrapable(link: string): boolean {
  return /^https?:\/\//i.test(link) && !/(^|\.)news\.google\.com/i.test(link);
}

async function loadFullBody(link: string): Promise<string> {
  const cached = cache.get(link);
  if (cached !== undefined) return cached;
  const pending = inFlight.get(link);
  if (pending) return pending;

  const run = withDeadline(fetchFullArticleBody(link), FETCH_TIMEOUT_MS, '')
    .then((body) => {
      const text = (body || '').trim();
      // Only a real result is cached — a timeout or a transient 5xx should be retried on the
      // operator's next click rather than remembered as "this article has no body".
      if (text) cache.set(link, text);
      return text;
    })
    .catch(() => '')
    .finally(() => inFlight.delete(link));

  inFlight.set(link, run);
  return run;
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

  const full = await loadFullBody(link);
  if (full.length >= MIN_USEFUL_BODY && full.length > teaser.length) {
    return { text: full, via: 'article' };
  }
  return {
    text: teaser,
    via: 'feed',
    note: full ? 'גוף הכתבה שחולץ לא היה מלא יותר מהתקציר' : 'לא ניתן היה לשלוף את גוף הכתבה מהמקור',
  };
}
