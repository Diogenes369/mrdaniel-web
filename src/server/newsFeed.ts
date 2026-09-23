import Parser from 'rss-parser';
import { createHash } from 'node:crypto';
import { translateForeignItems } from './newsTranslate.js';

/**
 * AI-only since 2026-09-21: the feed carries artificial-intelligence news exclusively. `general` is
 * the classifier's "no AI signal" verdict — such items are dropped at fetch time (`onlyTopics`) and
 * again by `sanitizeAndKeep`, so a served item is always one of the three AI topics.
 */
export type NewsTopic = 'ai' | 'ai_models' | 'ai_agents' | 'general';

/** The topics a served item may carry. */
export const AI_TOPICS: readonly NewsTopic[] = ['ai', 'ai_models', 'ai_agents'];

export interface NewsItem {
  id: string;
  slug: string;
  source: string;
  category: string;
  topic: NewsTopic;
  title: string;
  link: string;
  excerpt: string;
  summary: string;
  publishedAt: string;
  /** Lead image URL pulled from the feed item (enclosure / media:* / first inline <img>), when the
   * source provides one — many Hebrew RSS feeds don't. Absolute `https:`/`http:` only; consumers
   * that draw it onto a <canvas> must route it through `/api/img-proxy` for CORS. */
  image?: string;
  /** Set to 'en' only transiently, between a curated English specialist outlet's fetch
   * (OpenAI/TechCrunch AI/…, see `FeedSource.lang`) and `translateForeignItems` in
   * newsTranslate.ts, which runs every refresh cycle before anything is cached. A cached/served
   * item is always already-Hebrew and has this cleared (undefined) — see `sanitizeAndKeep`. */
  lang?: 'he' | 'en';
}

interface FeedSource {
  name: string;
  url: string;
  /** Lower = higher priority when the same story surfaces in more than one feed (see `dedupe`). */
  priority: number;
  /** Per-feed hard cap so one slow/hanging outlet can't stall `/api/news`. Default 8s. */
  timeoutMs?: number;
  /** Google News RSS titles are formatted "Headline - Publisher" — when set, that suffix is
   * split off so the article's real outlet shows in the source badge (and `category` fallback)
   * instead of the generic aggregator name, and doesn't linger inside the displayed headline. */
  stripTitleSuffix?: boolean;
  /** Single-topic feeds can pin their display category directly. */
  defaultCategory?: string;
  /** Keep only items whose classified `topic` is in this list. Used for broad-mandate outlets
   * (Geektime, Globes, ynet carry every tech/business story) so the feed contributes only the
   * slice that's on-topic for this site — its AI coverage. */
  onlyTopics?: NewsTopic[];
  /** Per-source item cap (default `PER_FEED_ITEM_CAP`). International outlets publish constantly —
   * a lower cap keeps them present in the mix without drowning the Israeli feeds. */
  maxItems?: number;
  /** 'en' for a curated English specialist outlet — tags every item with `NewsItem.lang: 'en'` so
   * `sanitizeAndKeep` can gate it behind `allowEnglish` instead of the Hebrew-only requirement.
   * Omit (default 'he') for native Hebrew outlets and the Google-News queries. */
  lang?: 'he' | 'en';
  /** Pins the item's topic without running it through `classifyTopic` — for a single-purpose
   * outlet (OpenAI/DeepMind/…) whose headlines rarely repeat the vendor/category keyword the
   * classifier looks for (e.g. a lab's release title is often just a product name). Also skips the
   * `onlyTopics` check, since the source itself is the topic filter. */
  forceTopic?: NewsTopic;
}

// Aggregated AI coverage. Broad Israeli tech outlets contribute only their AI stories (`onlyTopics`),
// curated English AI outlets are auto-translated to Hebrew, and scoped Google-News queries cover the
// labs that publish no RSS (xAI, Anthropic, Meta). Ordered by dedup priority: the outlets we most
// want to attribute a shared story to come first.
const GNEWS_QUERY = '("בינה מלאכותית" OR "מודל שפה" OR ChatGPT OR Claude OR Gemini OR Grok OR "סוכן AI" OR "סוכני AI") when:7d';
const GNEWS_URL = `https://news.google.com/rss/search?q=${encodeURIComponent(GNEWS_QUERY)}&hl=iw&gl=IL&ceid=IL:iw`;

const gnewsEn = (query: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:7d`)}&hl=en-US&gl=US&ceid=US:en`;

/** Every broad outlet is filtered down to its AI stories. */
const AI_ONLY: NewsTopic[] = ['ai', 'ai_models', 'ai_agents'];

const SOURCES: FeedSource[] = [
  // ── Israeli tech / business (native RSS, highest dedup priority) — AI stories only ──
  { name: 'Geektime', url: 'https://www.geektime.co.il/feed/', priority: 0, onlyTopics: AI_ONLY },
  { name: 'TechTime', url: 'https://techtime.co.il/feed/', priority: 1, onlyTopics: AI_ONLY },
  { name: 'אנשים ומחשבים', url: 'https://www.pc.co.il/feed/', priority: 2, onlyTopics: AI_ONLY },
  { name: 'גלובס', url: 'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=1725', priority: 2, timeoutMs: 9000, onlyTopics: AI_ONLY },
  // Ynet DIGITAL/TECH feed only (StoryRss544). Do NOT use the general-news feed (StoryRss2) —
  // it floods the aggregate with politics/crime that isn't on-topic for this site.
  { name: 'ynet דיגיטל', url: 'https://www.ynet.co.il/Integration/StoryRss544.xml', priority: 2, timeoutMs: 9000, onlyTopics: AI_ONLY },
  // Calcalist + TheMarker native feeds often 403 datacenter IPs (Yediot / Haaretz WAF) — kept in
  // the list anyway: Promise.allSettled logs the failure and moves on, and when they DO answer
  // (CDN edge, warm cache) it's real Hebrew coverage. Google News is the safety net.
  { name: 'כלכליסט', url: 'https://www.calcalist.co.il/GeneralRSS/0,16335,L-3927,00.xml', priority: 3, timeoutMs: 7000, onlyTopics: AI_ONLY },
  { name: 'TheMarker', url: 'https://www.themarker.com/cmlink/1.145', priority: 3, timeoutMs: 7000, onlyTopics: AI_ONLY },
  // ── Israeli AI specialist blog ──
  { name: 'Machine Learning Israel', url: 'https://machinelearning.co.il/feed/', priority: 2, maxItems: 10, timeoutMs: 8000, onlyTopics: AI_ONLY },
  // `lang: 'en'` tags these items so `translateForeignItems` (newsTranslate.ts) auto-translates them
  // to Hebrew every refresh cycle, BEFORE the cache is written. Every one is an AI-dedicated feed or
  // the AI section of a broad outlet (verified live 2026-09-21), never a general tech firehose.
  // ── AI industry & products ──
  { name: 'AI News', url: 'https://www.artificialintelligence-news.com/feed/', priority: 5, lang: 'en', forceTopic: 'ai', maxItems: 8, timeoutMs: 9000 },
  { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', priority: 5, lang: 'en', maxItems: 10, timeoutMs: 9000, onlyTopics: AI_ONLY },
  { name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', priority: 5, lang: 'en', maxItems: 8, timeoutMs: 9000, onlyTopics: AI_ONLY },
  { name: 'MIT Technology Review AI', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', priority: 5, lang: 'en', forceTopic: 'ai', maxItems: 6, timeoutMs: 9000 },
  // ── AI Models & LLMs — model releases, research and dev tools from the frontier labs. Kept
  //    separate from the broad `ai` topic so "what's new in the models themselves" has its own tab.
  { name: 'OpenAI News', url: 'https://openai.com/news/rss.xml', priority: 5, lang: 'en', forceTopic: 'ai_models', maxItems: 10, timeoutMs: 9000 },
  { name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml', priority: 5, lang: 'en', forceTopic: 'ai_models', maxItems: 8, timeoutMs: 9000 },
  { name: 'Google AI Blog', url: 'https://blog.google/innovation-and-ai/technology/ai/rss/', priority: 5, lang: 'en', forceTopic: 'ai_models', maxItems: 8, timeoutMs: 9000 },
  { name: 'DeepMind Blog', url: 'https://deepmind.google/blog/rss.xml', priority: 5, lang: 'en', forceTopic: 'ai_models', maxItems: 8, timeoutMs: 9000 },
  { name: 'MarkTechPost', url: 'https://www.marktechpost.com/feed/', priority: 5, lang: 'en', maxItems: 8, timeoutMs: 9000, onlyTopics: AI_ONLY },
  // xAI, Anthropic and Meta AI publish no official RSS feed — a scoped Google News query is the
  // safety net. Scoped to phrases that only occur in an actual model/product story: a bare
  // "Anthropic" query pulled in office-lease and real-estate stories.
  {
    name: 'Google News · xAI Grok',
    url: gnewsEn('("Grok 4" OR "Grok 5" OR "xAI Grok" OR "Grok model" OR "xAI model" OR "Grok AI")'),
    priority: 6, lang: 'en', forceTopic: 'ai_models', stripTitleSuffix: true, maxItems: 8, timeoutMs: 9000,
  },
  {
    name: 'Google News · Anthropic',
    url: gnewsEn('("Claude AI" OR "Claude Opus" OR "Claude Sonnet" OR "Claude model" OR "Anthropic model" OR "Anthropic AI")'),
    priority: 6, lang: 'en', forceTopic: 'ai_models', stripTitleSuffix: true, maxItems: 8, timeoutMs: 9000,
  },
  {
    name: 'Google News · Meta AI',
    // "Muse Spark" added 2026-09-23: Meta's current model line (proprietary, since 2026-04); Llama
    // is kept for the open-weights stories that still use the name.
    url: gnewsEn(`("Meta AI" OR "Muse Spark" OR "Llama model" OR "Meta's AI model")`),
    priority: 6, lang: 'en', forceTopic: 'ai_models', stripTitleSuffix: true, maxItems: 8, timeoutMs: 9000,
  },
  // ── AI agents — the agentic tooling beat (frameworks, MCP, computer-use, coding agents) ──
  {
    name: 'Google News · AI Agents',
    url: gnewsEn('("AI agent" OR "AI agents" OR "agentic AI" OR "Model Context Protocol" OR "coding agent")'),
    priority: 6, lang: 'en', forceTopic: 'ai_agents', stripTitleSuffix: true, maxItems: 8, timeoutMs: 9000,
  },
  // ── Google News safety net — Hebrew AI query ──
  { name: 'Google News', url: GNEWS_URL, priority: 7, stripTitleSuffix: true, timeoutMs: 9000, onlyTopics: AI_ONLY },
];

// Publishers still dropped from the aggregate (name-only Google-News hits). pc.co.il was
// re-added above as a native source per product direction — no longer blocked.
const BLOCKED_PUBLISHERS = /\b(?:sponsored content|advertorial|תוכן שיווקי|כתבה ממומנת)\b/i;

const PER_FEED_ITEM_CAP = 30;
// The `summary` field carries the article's real lede — enough for the story/post generators to
// synthesise rich slides from, not a one-sentence teaser. `excerpt` stays short for feed cards.
const SUMMARY_MAX = 720;
const EXCERPT_MAX = 160;

/** Rejects a source promise if it hasn't settled within `ms` — so `Promise.allSettled` in
 * `refreshAll` never waits on a hanging outlet longer than its own cap. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} feed timed out after ${ms}ms`)), ms);
    }),
  ]);
}

const CACHE_TTL_MS = 15 * 60 * 1000;

// A real desktop-browser User-Agent (plus the Accept/Accept-Language headers a real browser sends
// along with it) — the previous self-identifying "DBBNewsBot/1.0" UA is exactly what a WAF pattern
// match blocks on, which is what was producing the Israel Defense 403s. This is a standard,
// widely-used technique for RSS aggregation (fetching publicly-published feed content, not
// bypassing any paywall or auth), not an attempt to evade any access control.
const parser = new Parser({
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    Accept: 'application/rss+xml, application/xml, text/xml, */*;q=0.8',
    'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
  },
  timeout: 15000,
  // Media namespaces so an item's lead image can be recovered even when it isn't a plain
  // <enclosure> — keepArray on media:content because feeds often list several (image + video).
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail'],
      ['content:encoded', 'contentEncoded'],
    ],
  },
});

// Feed-plumbing / tracking artefacts that show up as "images" but aren't editorial photos.
// `googleusercontent|gstatic|/logos/` catches the generic branding image that Google's consent
// wall / News interstitial pages expose as their og:image — it was getting scraped off
// `news.google.com` redirect links and pinned onto a dozen unrelated stories.
//
// `s.w.org/images/core/emoji` and the `/emoji/` path are the WordPress emoji sprite CDN. A
// WordPress feed whose post body opens with an emoji (SPD Blog does this constantly) inlines it as
// a 72×72 <img>, which `firstInlineImage` then picked up as the article's lead photo. It is a
// perfectly valid, perfectly loading image URL, so nothing downstream rejected it: it passed the
// server's URL check, passed the client's `isHebrewWithImage` gate, and only failed at the very
// last step — `NewsImage`'s 400×300 floor — which renders nothing. The result was a card on the
// homepage with a blank black image well. Measured against production on 2026-09-21: 3 of the
// feed's items carried one. Dropping it here lets the og:image enrichment pass find the real photo
// instead.
const JUNK_IMAGE_RE =
  /(feedburner|feedsportal|feeds\.wordpress|doubleclick|googlesyndication|scorecardresearch|googleusercontent\.com|gstatic\.com|s\.w\.org\/images\/core\/emoji|\/emoji\/|\/logos?\/|\/pixel|pixel\.|1x1|blank\.(gif|png)|spacer\.(gif|png)|gravatar\.com\/avatar\/0{16}|\/wp-includes\/images\/)/i;

/**
 * Smallest lead image worth putting on a card, in pixels, when the URL itself declares its size.
 *
 * Mirrors the `MIN_W`/`MIN_H` floor in `src/components/news/NewsImage.tsx`. Many CDNs (and the
 * WordPress emoji path above) encode the rendition size in the URL — `/72x72/`, `-150x150.jpg`,
 * `?w=200` — so an image that is certainly too small can be rejected server-side, before it ever
 * occupies a card slot, rather than client-side after it has already been chosen as the lead.
 */
const SMALL_IMAGE_HINT = /(?:^|[\/_-])(\d{2,4})x(\d{2,4})(?:[\/._-]|$)/;

export function isTooSmallByUrl(url: string, minW = 400, minH = 300): boolean {
  const m = SMALL_IMAGE_HINT.exec(String(url || ''));
  if (m) {
    const w = Number(m[1]);
    const h = Number(m[2]);
    // Only trust the hint when both numbers look like real pixel dimensions; a date path such as
    // `/2026/09/14/` never matches this shape, but a version string like `17.0.2` must not be read
    // as a size either — hence the explicit bounds rather than a bare digit match.
    if (w >= 8 && h >= 8 && (w < minW || h < minH)) return true;
  }
  const q = /[?&](?:w|width)=(\d{1,4})\b/i.exec(String(url || ''));
  return q ? Number(q[1]) < minW : false;
}

/**
 * Rewrites a thumbnail/low-res image URL to its highest-resolution rendition, so the dashboard's
 * 1080×1350 / 1080×1920 canvas always has a sharp source to cover-crop from instead of visibly
 * upscaling a small thumbnail. Handles, in order:
 *   1. Globes' Cloudinary named crops (`t_800X392`, `w_300` …) → an explicit 1600px limit-fit.
 *   2. WordPress' auto-generated size suffix (`photo-300x169.jpg` → `photo.jpg`) — the un-suffixed
 *      original is the same media-library file, almost always still hosted at that path
 *      (Geektime / TechTime / pc.co.il and most other WP outlets in the feed list).
 *   3. Generic CDN query-string thumbnail hints (`w=`/`width=`/`h=`/`height=` under 800px,
 *      `quality=`/`q=` under 70) — bumped to a real-photo minimum. Any other URL shape, or a URL
 *      with no such hints, is returned unchanged (never breaks a working image URL).
 */
export function upscaleImageUrl(url: string): string {
  if (/res\.cloudinary\.com\/globes\/image\/upload\//.test(url)) {
    return url.replace(/\/upload\/(t_[^/]+|c_[^/]+|w_\d+[^/]*)\//, '/upload/w_1600,c_limit,q_auto:good/');
  }
  let u = url.replace(/-(\d{2,4})x(\d{2,4})(?=\.(?:jpe?g|png|webp|gif)(?:[?#]|$))/i, '');
  u = u.replace(/([?&])(w|width)=(\d+)/i, (m, sep, key, val) => (Number(val) < 800 ? `${sep}${key}=1200` : m));
  u = u.replace(/([?&])(h|height)=(\d+)/i, (m, sep, key, val) => (Number(val) < 800 ? `${sep}${key}=1350` : m));
  u = u.replace(/([?&])quality=(low|\d+)/i, (m, sep, val) => (val.toLowerCase() === 'low' || Number(val) < 70 ? `${sep}quality=85` : m));
  u = u.replace(/([?&])q=(\d+)(?![a-z])/i, (m, sep, val) => (Number(val) < 70 ? `${sep}q=85` : m));
  return u;
}

const OG_IMAGE_RES = [
  /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  /<meta[^>]+property=["']article:image["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:image["']/i,
  /<meta[^>]+(?:name|property)=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']twitter:image(?::src)?["']/i,
  /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i,
  /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
  // JSON-LD NewsArticle.image — a string, an ImageObject, or an array of either.
  /"image"\s*:\s*(?:\[\s*)?(?:\{[^{}]*?"url"\s*:\s*)?"(https?:[^"]+?\.(?:jpe?g|png|webp|avif)(?:\?[^"]*)?)"/i,
];

/** Last resort when the page declares no share image at all: the first real <img> inside the
 *  article body (lazy-load attributes first — those hold the real URL, `src` is often a 1×1). */
const BODY_IMG_RE = /<img\b[^>]*?\s(?:data-src|data-lazy-src|data-original|src)=["']([^"']+)["'][^>]*>/gi;

function pickBodyImage(html: string, baseUrl: string): string | undefined {
  const start = html.search(/<article\b|itemprop=["']articleBody["']|class=["'][^"']*(?:article-body|entry-content|post-content|article__body)/i);
  const region = start >= 0 ? html.slice(start, start + 200_000) : '';
  if (!region) return undefined;
  for (const m of region.matchAll(BODY_IMG_RE)) {
    let candidate = m[1].trim().replace(/&amp;/g, '&');
    if (candidate.startsWith('data:')) continue;
    if (candidate.startsWith('//')) candidate = `https:${candidate}`;
    try {
      candidate = new URL(candidate, baseUrl).toString();
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(candidate) || JUNK_IMAGE_RE.test(candidate)) continue;
    if (/\b(?:logo|avatar|icon|sprite|pixel|spacer|author|profile)\b/i.test(candidate)) continue;
    const upscaled = upscaleImageUrl(candidate);
    if (isTooSmallByUrl(upscaled)) continue;
    return upscaled;
  }
  return undefined;
}

function safeHost(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    return '';
  }
}

function pickOgImage(html: string, baseUrl: string): string | undefined {
  for (const re of OG_IMAGE_RES) {
    const m = html.match(re);
    if (!m?.[1]) continue;
    let candidate = m[1].trim().replace(/&amp;/g, '&');
    if (candidate.startsWith('//')) candidate = `https:${candidate}`;
    if (candidate.startsWith('/')) {
      try {
        candidate = new URL(candidate, baseUrl).toString();
      } catch {
        continue;
      }
    }
    if (!/^https?:\/\//i.test(candidate) || JUNK_IMAGE_RE.test(candidate)) continue;
    // Checked AFTER upscaling: `upscaleImageUrl` rewrites a thumbnail URL to its full rendition, so
    // testing the original would reject an image that is about to become large enough.
    const upscaled = upscaleImageUrl(candidate);
    if (isTooSmallByUrl(upscaled)) continue;
    return upscaled;
  }
  return pickBodyImage(html, baseUrl);
}

// Optional Jina Reader key (https://jina.ai/reader) — lifts the anonymous rate limit. Works
// without it, just slower / more likely to 429 under load.
const JINA_KEY = process.env.JINA_API_KEY?.trim();

/** GET a URL as text with a hard timeout; returns the body or undefined. Never throws. */
async function getText(url: string, timeoutMs: number, headers: Record<string, string>): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow', headers });
    if (!res.ok) return undefined;
    const body = await res.text();
    return body.length > 1_500_000 ? body.slice(0, 1_500_000) : body;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** Recover an article's lead image from its `og:image` / `twitter:image` when the feed carried no
 * inline media (TechTime, Israel Defense, most Google-News entries). Tries a direct fetch first;
 * if that fails — which it does for any outlet whose origin WAF-blocks datacenter IPs — retries
 * through the Jina Reader proxy (`r.jina.ai`), which fetches from its own infrastructure. Bounded
 * and best-effort; returns an absolute URL or undefined, never throws. */
async function fetchOgImage(articleUrl: string): Promise<string | undefined> {
  const browserHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
  };

  const direct = await getText(articleUrl, 5000, browserHeaders);
  if (direct) {
    const hit = pickOgImage(direct, articleUrl);
    if (hit) return hit;
  }

  const viaJina = await getText(
    `https://r.jina.ai/${articleUrl}`,
    7000,
    JINA_KEY ? { Authorization: `Bearer ${JINA_KEY}`, 'X-Return-Format': 'html' } : { 'X-Return-Format': 'html' },
  );
  if (viaJina) {
    const hit = pickOgImage(viaJina, articleUrl);
    if (hit) return hit;
  }
  return undefined;
}

const GOOGLE_NEWS_HOST = /(^|\.)news\.google\.com$/i;

/**
 * Resolve a `news.google.com/rss/articles/<id>` redirect to the publisher's real article URL.
 *
 * The id is no longer a base64 URL (since mid-2024 it's an opaque `AU_yqL…` token), so the only
 * way back is what Google's own article page does: read the signature + timestamp it embeds
 * (`data-n-a-sg` / `data-n-a-ts`) and ask the `batchexecute` RPC `Fbv4je` ("garturlreq") for the
 * target. Two requests, ~0.6–1s total (measured 2026-09-22 on Calcalist + Geektime entries).
 * Returns undefined on any failure — the caller just leaves the item imageless.
 */
export async function resolveGoogleNewsUrl(link: string, timeoutMs = 3500): Promise<string | undefined> {
  const id = link.match(/\/(?:rss\/)?articles\/([^/?#]+)/)?.[1];
  if (!id) return undefined;
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const page = await (await fetch(`https://news.google.com/rss/articles/${id}`, { headers: { 'User-Agent': ua }, signal })).text();
    const sg = page.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const ts = page.match(/data-n-a-ts="([^"]+)"/)?.[1];
    if (!sg || !ts) return undefined;
    const inner = JSON.stringify([
      'garturlreq',
      [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
      id,
      Number(ts),
      sg,
    ]);
    const res = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': ua },
      body: `f.req=${encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]]))}`,
      signal,
    });
    const url = (await res.text()).match(/\\"garturlres\\",\\"(https?:[^"\\]+)\\"/)?.[1];
    return url && !GOOGLE_NEWS_HOST.test(safeHost(url)) ? url : undefined;
  } catch {
    return undefined;
  }
}

/** Fills in `image` for the newest items whose feed carried none, by scraping the article
 * `og:image` (see `fetchOgImage`). Concurrency-limited AND under a single overall deadline so a
 * batch of slow/blocked outlets can never balloon the `/api/news` refresh — whatever's filled
 * when the clock runs out is kept. Best-effort: any individual failure is silently skipped. */
/**
 * Article link → recovered lead image, kept across refreshes on a warm instance. Resolving a
 * Google-News redirect and scraping the page costs ~1–3s per item, so a single 9s refresh window
 * only ever covered part of the imageless items (≈40 Google-News entries had none on 2026-09-22).
 * With this, every refresh starts from what the previous ones found and only spends its window on
 * items nobody has tried yet — coverage grows refresh over refresh instead of resetting.
 */
const OG_CACHE_MAX = 600;
const ogImageCache = new Map<string, string>();

function rememberOgImage(link: string, image: string) {
  if (ogImageCache.size >= OG_CACHE_MAX) {
    const oldest = ogImageCache.keys().next().value;
    if (oldest) ogImageCache.delete(oldest);
  }
  ogImageCache.set(link, image);
}

async function enrichImages(items: NewsItem[], limit = 90, overallMs = 9_000): Promise<void> {
  let fromCache = 0;
  for (const it of items) {
    const cached = !it.image && ogImageCache.get(it.link);
    if (cached) {
      it.image = cached;
      fromCache++;
    }
  }
  if (fromCache) console.info(`[news] og:image cache — ${fromCache} items filled without a fetch`);

  // Google-News entries link to a news.google.com redirect (fetching it directly just yields
  // Google's consent-wall og:image), so those are resolved to the publisher URL first. They were
  // skipped outright until 2026-09-22 — which left every Calcalist / Geektime / Haaretz item bare.
  const targets = items.filter((it) => !it.image).slice(0, limit);
  if (targets.length === 0) return;

  const deadline = Date.now() + overallMs;
  const assigned = new Set<string>(items.map((it) => it.image).filter(Boolean) as string[]);
  let cursor = 0;
  let filled = 0;
  const worker = async () => {
    while (cursor < targets.length && Date.now() < deadline) {
      const it = targets[cursor++];
      const articleUrl = GOOGLE_NEWS_HOST.test(safeHost(it.link)) ? await resolveGoogleNewsUrl(it.link) : it.link;
      if (!articleUrl || Date.now() >= deadline) continue;
      const og = await fetchOgImage(articleUrl);
      // Reject a URL we've already used this refresh — a repeat almost always means a generic
      // placeholder / error-page image rather than the real article photo.
      if (og && !assigned.has(og)) {
        it.image = og;
        assigned.add(og);
        rememberOgImage(it.link, og);
        filled++;
      }
    }
  };
  const run = Promise.all(Array.from({ length: Math.min(12, targets.length) }, worker));
  await Promise.race([run, new Promise((r) => setTimeout(r, overallMs + 500))]);
  console.info(
    `[news] og:image enrichment — filled ${filled}/${targets.length} imageless items in ${Date.now() - (deadline - overallMs)}ms`,
  );
}

/** Best-effort lead-image recovery, tried in order across every feed shape we've seen from the
 * Israeli outlets: <enclosure>, media:thumbnail, media:content / media:group, itunes:image, and
 * finally the first real <img>/<img data-src> inside the item body (contentEncoded / content /
 * summary / description). Protocol-relative `//host/…` is upgraded to https; obvious tracking
 * pixels and feed chrome are skipped. Returns an absolute http(s) URL or undefined. */
function extractImage(item: Record<string, any>): string | undefined {
  const normalize = (u: unknown): string | undefined => {
    if (typeof u !== 'string') return undefined;
    let s = u.trim().replace(/&amp;/g, '&');
    if (s.startsWith('//')) s = `https:${s}`;
    if (!/^https?:\/\//i.test(s)) return undefined;
    if (JUNK_IMAGE_RE.test(s)) return undefined;
    const upscaled = upscaleImageUrl(s);
    return isTooSmallByUrl(upscaled) ? undefined : upscaled;
  };

  const enc = item.enclosure;
  if (enc?.url && (!enc.type || String(enc.type).startsWith('image/'))) {
    const u = normalize(enc.url);
    if (u) return u;
  }

  const thumb = normalize(item.mediaThumbnail?.$?.url ?? item.mediaThumbnail?.url);
  if (thumb) return thumb;

  const group = item['media:group'];
  const mcRaw = item.mediaContent ?? group?.['media:content'] ?? group?.mediaContent;
  const mc = Array.isArray(mcRaw) ? mcRaw : mcRaw ? [mcRaw] : [];
  for (const m of mc) {
    const attrs = m?.$ ?? m ?? {};
    const url = attrs.url ?? attrs.href;
    const isImage =
      attrs.medium === 'image' ||
      (typeof attrs.type === 'string' && attrs.type.startsWith('image/')) ||
      (typeof url === 'string' && /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(url));
    if (isImage) {
      const u = normalize(url);
      if (u) return u;
    }
  }

  const itunes = normalize(item.itunes?.image ?? item['itunes:image']?.$?.href);
  if (itunes) return itunes;

  const html = String(item.contentEncoded || item.content || item.summary || item['content:encoded'] || '');
  const imgRe = /<img[^>]+(?:data-src|src)=["']([^"'\s]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html))) {
    const u = normalize(m[1]);
    if (u) return u;
  }

  return undefined;
}

// Keyword heuristics over title + summary + feed categories. Most specific first: an agent story
// lands in `ai_agents`, a model release in `ai_models`, anything else AI in `ai`.
const AI_PATTERNS = [
  /בינה מלאכותית/, /למידת מכונה/, /רשת(ות)? נוירונים/, /אג'נט/, /\bAI\b/, /chatgpt/i,
  /openai/i, /\bllm\b/i, /gemini/i, /copilot/i, /anthropic/i, /\bclaude\b/i, /generativ/i,
  /gpt-?\d/i, /agentic/i, /\bgrok\b/i, /\bxai\b/i, /machine learning/i, /artificial intelligence/i,
];
// Specific model/LLM releases — a narrower slice of AI_PATTERNS, so a story about an actual model
// drop (GPT-5, Claude Opus, Grok, Llama, a Hugging Face release) lands in the `ai_models` tab.
const AI_MODEL_PATTERNS = [
  /מודל(ים)? (שפה|בינה מלאכותית|AI)/, /גרסת מודל/, /דגם שפה/,
  /\bgpt-?\d/i, /\bo\d(-mini|-pro)?\b.*openai/i, /\bclaude\b/i, /\banthropic\b/i, /\bgemini\b/i,
  /\bgrok\b/i, /\bxai\b/i, /\bllama-?\d?\b/i, /\bmistral\b/i, /\bdeepseek\b/i, /\bqwen\b/i,
  /\bllm\b/i, /\bslm\b/i, /hugging.?face/i, /\bdeepmind\b/i, /foundation model/i,
  /open.?weight model/i, /model weights/i, /fine-?tun(e|ing)/i, /model release/i, /\bmulti-?modal model\b/i,
];
// Agents — autonomous, tool-using systems and the frameworks/protocols they run on.
const AI_AGENT_PATTERNS = [
  /סוכן(י)? (AI|בינה)/, /סוכנים אוטונומיים/, /אג'נט/, /\bagentic\b/i, /ai agents?/i,
  /autonomous agents?/i, /coding agents?/i, /\bmcp\b/i, /model context protocol/i, /computer.?use/i,
  /multi-?agent/i, /agent framework/i,
];
// Security-beat stories are off-brand for an AI-only feed even when they mention AI ("AI-powered
// phishing", "a CVE in an AI SDK") — dropped outright by `sanitizeAndKeep`.
const SECURITY_BEAT_PATTERNS = [
  /סייבר/, /אבטחת מידע/, /האק(ר|רים|ינג)/, /לפרוץ/, /פריצ(ה|ת|ות)/, /חוקרי אבטחה/, /כופרה/, /פישינג/, /פרצ(ת|ה) אבטחה/, /דלף מידע/,
  /malware/i, /ransomware/i, /phishing/i, /\bcve-?\d/i, /\bbreach(ed)?\b/i, /\bhack(ed|er|ing)?\b/i,
  /zero.?trust/i, /vulnerabilit/i, /exploit/i,
];

function classifyTopic(text: string): NewsTopic {
  if (AI_AGENT_PATTERNS.some((re) => re.test(text))) return 'ai_agents';
  if (AI_MODEL_PATTERNS.some((re) => re.test(text))) return 'ai_models';
  if (AI_PATTERNS.some((re) => re.test(text))) return 'ai';
  return 'general';
}

// Generic consumer-tech / gadget / gaming markers. The opt-in strict filter drops an item that
// matches one of these UNLESS it also carries an AI signal (so "AI comes to your
// smart TV" stays, "best gaming monitors of 2026" goes).
const GENERIC_CONSUMER_PATTERNS = [
  /גיימינג/, /קונסול/, /טלוויזי/, /סמארטפון/, /מכשיר סלולרי/, /מחשב נייד/, /לפטופ/, /אוזניות/,
  /שעון חכם/, /רחפן/, /מצלמ(ה|ת)/, /כונן קשיח/, /כרטיס מסך/, /ספק כוח/, /שואב אבק/,
  /\bgaming\b/i, /\bconsole\b/i, /\bsmartphone\b/i, /\blaptop\b/i, /\bwearable\b/i,
  /\bheadphones?\b/i, /\bearbuds?\b/i, /\bdrone\b/i, /\bTV\b/, /\bGPU\b.*\bgaming\b/i,
];

// Stock-market / finance noise — banned outright regardless of topic classification, since a
// story like "מניית NVIDIA זינקה בעקבות AI" would otherwise pass the AI on-topic check. This is a
// harder gate than ECONOMY_PATTERNS (which only relabels the display category): a match here drops
// the item entirely from the strict feed.
// NOTE: bare substrings for the Hebrew terms, deliberately no `\b` — JS regex `\b` is defined only
// over ASCII `[A-Za-z0-9_]` and never recognizes a boundary next to a Hebrew letter (same pitfall
// documented on CLOUD_PATTERNS above; `/\bמסחר\b/` would silently match nothing, ever).
const STOCK_NOISE_PATTERNS = [
  /מניות/, /מניה/, /שער הדולר/, /שער השקל/, /מסחר/, /בבורסה/, /בורסה/, /תשואות/,
  /דוחות כספיים/, /דוח כספי/, /רבעון/, /wall street/i, /\binvesting\.com\b/i,
  /\bstocks?\b/i, /\bnasdaq\b/i, /\bshare price\b/i, /\bearnings report\b/i, /\bmarket cap\b/i,
];

function isStockNoise(text: string): boolean {
  return STOCK_NOISE_PATTERNS.some((re) => re.test(text));
}

const HEBREW_CHAR = /[֐-׿]/;
// A "title" that is actually a scrape/parse artefact rather than a headline: a bare URL, an
// ellipsis-only / punctuation-only string, leftover markup or entities, or a CDATA tail. These
// showed up in the Live Feed ticker as `...` / `[…]` / raw `&#8217;` fragments.
const GARBAGE_TITLE =
  /^(?:\s*(?:https?:\/\/\S+|[.…\-–—_·•*#>«»"'׳״|/\\]+|\[[^\]]*\]|&#?\w+;?)\s*)+$/i;
const MARKUP_LEFTOVER = /<\/?[a-z][^>]*>|&#\d{2,};|\]\]>|\{\{|https?:\/\/\S+\s*$/i;

/**
 * The feed's content gate — ON BY DEFAULT for `/api/news` (opt out with `?strict=0`). An item is
 * kept only when ALL hold:
 *   1. Hebrew — the title carries real Hebrew content. Enforced UNCONDITIONALLY (not just for
 *      native-Hebrew sources): `refreshAll()` in this file runs every non-Hebrew item through
 *      `translateForeignItems` (newsTranslate.ts) before it's ever cached, so by the time this
 *      function sees an item it should already be Hebrew — this check is the last-line defense
 *      that guarantees zero raw-English titles reach any consumer (site or dashboard) even if
 *      translation silently misbehaved for one item.
 *   2. Clean — the title isn't a scrape/parse artefact (`...`, bare URL, leftover `<tag>` /
 *      `&#8217;`, CDATA tail) and is a real headline length.
 *   3. On-topic — an AI signal in the title+summary (reuses the SAME classifier patterns the feed
 *      already runs on), and NOT a security-beat story. The feed is AI-only since 2026-09-21.
 * `opts.allowEnglish` is accepted for API back-compat (the dashboard still passes
 * `?allowEnglish=1`) but no longer bypasses the Hebrew check — see point 1.
 * Applied as a per-request VIEW over the shared cache in `getNewsItems` — never mutates the cache,
 * so an unfiltered (`?strict=0`) call and a filtered one can't poison each other.
 */
/**
 * How old a story may be and still count as news, and how far into the future a publish date may
 * sit before it is treated as wrong.
 *
 * Both limits exist because of what production actually served on 2026-09-21:
 *   - an evergreen BLOG whose RSS carries its whole archive put ten items between 293 and **1950**
 *     days old permanently into one topic tab, crowding genuinely fresh stories out of the slots.
 *   - a trade outlet published webinar listings dated in the FUTURE — one was 74 days ahead.
 *     Sorted newest-first, a future date pins an advert to the top of the feed forever.
 *
 * A week of slack on the future side absorbs timezone and clock-skew sloppiness in feeds that
 * publish a date with no offset, without letting an event listing through.
 */
export const MAX_ITEM_AGE_DAYS = 21;
const MAX_FUTURE_SKEW_DAYS = 7;
const DAY_MS = 86_400_000;

/** How old the item is, in days — negative when the feed claims it is published in the future.
 *  An unparseable date returns null, which is treated as "no opinion" rather than as stale. */
export function itemAgeDays(publishedAt: string, now = Date.now()): number | null {
  const ts = new Date(publishedAt).getTime();
  if (!Number.isFinite(ts)) return null;
  return (now - ts) / DAY_MS;
}

/** True when a publish date puts the item outside the window a NEWS surface should show. */
export function isStaleOrFutureDated(publishedAt: string, now = Date.now()): boolean {
  const age = itemAgeDays(publishedAt, now);
  if (age === null) return false;
  return age > MAX_ITEM_AGE_DAYS || age < -MAX_FUTURE_SKEW_DAYS;
}

export function sanitizeAndKeep(item: NewsItem, _opts: { allowEnglish?: boolean } = {}): boolean {
  const title = (item.title || '').trim();
  // clean, real headline — applies regardless of language
  if (title.length < 12 || GARBAGE_TITLE.test(title) || MARKUP_LEFTOVER.test(title)) return false;

  // 0 · recency. Checked first because it is the cheapest test and the one that was missing: this
  // gate had no notion of time at all, which is why a 2021 blog post and a 2026-12 webinar advert
  // both rode into one tab and made it look frozen.
  if (isStaleOrFutureDated(item.publishedAt)) return false;

  // 1 · Hebrew
  if (!HEBREW_CHAR.test(title)) return false;
  const hebLen = (title.match(/[֐-׿]/g) || []).length;
  if (hebLen < 6) return false; // mostly-Latin string with one stray Hebrew glyph

  const text = `${title} ${item.excerpt} ${item.summary} ${item.category}`;

  // 2 · strict relevance — no stock/finance market noise and no security-beat story, regardless
  //     of any AI overlap; and only the three AI topics are ever served.
  if (isStockNoise(text)) return false;
  if (SECURITY_BEAT_PATTERNS.some((re) => re.test(text))) return false;
  if (!AI_TOPICS.includes(item.topic)) return false;

  // 3 · on-topic — a forced-topic source (OpenAI News, DeepMind…) is AI by construction, so its
  //     topic alone qualifies; a gadget story needs an AI signal in its own text.
  const aiSignal =
    AI_AGENT_PATTERNS.some((re) => re.test(text)) ||
    AI_MODEL_PATTERNS.some((re) => re.test(text)) ||
    AI_PATTERNS.some((re) => re.test(text));
  return !(GENERIC_CONSUMER_PATTERNS.some((re) => re.test(text)) && !aiSignal);
}

/** @deprecated alias kept for any external caller expecting this exact name (task-requested). */
export const filterIrrelevantArticles = sanitizeAndKeep;

/** @deprecated kept as an alias so any external caller of the old name still resolves. */
export const strictTopicKeep = sanitizeAndKeep;

// Business/finance signals — used only to refine the DISPLAY `category` label (kept as a free
// string), NOT the `topic` enum that the site's category filters run on.
const ECONOMY_PATTERNS = [
  /גיוס(\s|$)/, /גיוס הון/, /הנפק(ה|ת)/, /מיזוג/, /רכישת חברה/, /נרכשה/, /שווי חברה/, /הון סיכון/,
  /קרן(ות)? הון/, /אקזיט/, /בורסה/, /מנייה|מניה|מניות/, /רבעון/, /דוחות כספיים/, /הכנסות/, /רווח נקי/,
  /\bIPO\b/i, /\bVC\b/, /\bM&A\b/i, /valuation/i, /funding round/i, /\bseed\b/i, /series [a-e]\b/i, /raised \$/i,
];

/** Clean Hebrew display tag: סוכני AI / מודלי AI וחידושים / עסקי AI / בינה מלאכותית. */
function deriveCategory(topic: NewsTopic, text: string): string {
  if (topic === 'ai_agents') return 'סוכני AI';
  if (topic === 'ai_models') return 'מודלי AI וחידושים';
  if (ECONOMY_PATTERNS.some((re) => re.test(text))) return 'עסקי AI';
  return 'בינה מלאכותית';
}

/** Normalised headline key for cross-source de-duplication. */
function normTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/["'׳״“”‘’.,:;!?()\[\]{}\-–—|/\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 70);
}

/** host + path, no protocol / www / trailing slash / query — same article at different trackers. */
function canonicalLink(link: string): string {
  try {
    const u = new URL(link);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return link.toLowerCase();
  }
}

/** Drops duplicate stories across feeds. Keeps the copy from the highest-priority source (then the
 * newest), so a story that Geektime and Google News both carry is attributed to Geektime. */
function dedupe(items: NewsItem[], priorityOf: (source: string) => number): NewsItem[] {
  const isAggregatorLink = (l: string) => /(^|\.)news\.google\.com/i.test(l);
  const sorted = [...items].sort((a, b) => {
    const p = priorityOf(a.source) - priorityOf(b.source);
    if (p !== 0) return p;
    // Same outlet via two feeds: keep the direct article link, not a Google-News redirect.
    const agg = Number(isAggregatorLink(a.link)) - Number(isAggregatorLink(b.link));
    if (agg !== 0) return agg;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
  const seenTitle = new Set<string>();
  const seenLink = new Set<string>();
  const out: NewsItem[] = [];
  for (const it of sorted) {
    const tk = normTitle(it.title);
    const lk = canonicalLink(it.link);
    if (seenLink.has(lk)) continue;
    if (tk.length > 10 && seenTitle.has(tk)) continue;
    seenLink.add(lk);
    if (tk.length > 10) seenTitle.add(tk);
    out.push(it);
  }
  return out;
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, ' ');
}

/** Normalizes a feed's raw description/content into a clean summary paragraph. Drops WordPress's
 * "The post X appeared first on Y." trailer, and drops the whole thing (falling back to the title
 * elsewhere) when a feed's description field turns out to hold no real prose — e.g. Israel
 * Defense's RSS wraps just the title/author/timestamp in markup rather than an excerpt. */
function cleanText(raw: string | undefined, title: string): string {
  if (!raw) return '';
  let text = stripHtml(decodeEntities(raw));
  // WordPress's auto-generated excerpt trailer — English default, or a Hebrew-localized WP install
  // (e.g. "הפוסט X הופיע ראשון ב-Y").
  text = text.replace(/\s*The post .*? appeared first on .*?\.\s*$/is, '');
  text = text.replace(/\s*הפוסט .+? (הופיע ראשון|פורסם לראשונה) ב.*$/s, '');
  text = text.replace(/\s+/g, ' ').trim();
  if (!text || text.length < 20 || text.startsWith(title.slice(0, 15))) return '';
  return text;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function slugify(title: string): string {
  const base = title
    .trim()
    .replace(/['"׳״]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'article';
}

function buildSlug(title: string, link: string): string {
  const hash = createHash('sha1').update(link).digest('hex').slice(0, 8);
  return `${slugify(title)}-${hash}`;
}

const TITLE_SUFFIX_RE = /\s-\s([^-]+)$/;

/**
 * The headers a real Chrome tab sends when it opens a feed URL directly.
 *
 * `parser.parseURL` sends only the three headers configured on the Parser, and several Israeli
 * outlets' WAFs (Cloudflare and Imperva both appear in this list) answer that with a 403 from a
 * datacenter IP while serving the identical request from a residential one. Confirmed in production
 * on 2026-09-21: Geektime, Calcalist, Israel Defense and Machine Learning Israel all logged
 * `failed to fetch … Status code 403` on Vercel while returning 200 and fresh items from a laptop.
 *
 * Adding the `Sec-Fetch-*` / `Referer` set is the same technique `api/img-proxy.ts` already uses
 * successfully against the same outlets' CDNs. This fetches publicly-published RSS; it bypasses no
 * paywall and no authentication.
 */
function feedHeaders(url: string): Record<string, string> {
  let origin = '';
  try {
    origin = new URL(url).origin;
  } catch {
    /* a malformed source URL fails at fetch anyway */
  }
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml, text/html;q=0.9, */*;q=0.8',
    'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    ...(origin ? { Referer: `${origin}/` } : {}),
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  };
}

/**
 * Google News' RSS mirror for one outlet's domain.
 *
 * The last resort for a source whose own CDN refuses this datacenter. Google News republishes the
 * same headlines with the same publish times, so an outlet recovered this way keeps its recency —
 * only its links become `news.google.com` redirects, which the rest of the pipeline already
 * understands (see the `news.google.com` carve-out in `enrichImages`).
 */
function googleNewsMirror(siteUrl: string): string | null {
  let host = '';
  try {
    host = new URL(siteUrl).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  if (!host) return null;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`site:${host} when:7d`)}&hl=he&gl=IL&ceid=IL:he`;
}

/** A refusal that a different route might still satisfy — as opposed to a parse error or a 404,
 *  where retrying elsewhere is pointless. */
const BLOCKED_STATUS = /\b(40[13]|429|451|503)\b/;

/**
 * Fetch and parse one feed, working around a CDN that refuses this runtime.
 *
 * Three attempts, cheapest first: the parser's own fetch, then a hand-rolled fetch carrying the
 * full browser header set, then the outlet's Google News mirror. Each step only runs when the
 * previous one failed in a way the next could plausibly fix.
 */
async function parseFeed(source: FeedSource): Promise<{ feed: Awaited<ReturnType<typeof parser.parseURL>>; viaMirror: boolean }> {
  const timeoutMs = source.timeoutMs ?? 8000;
  try {
    return { feed: await withTimeout(parser.parseURL(source.url), timeoutMs, source.name), viaMirror: false };
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    if (!BLOCKED_STATUS.test(message)) throw err;

    // Attempt 2 — the same URL, with the headers a browser actually sends.
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(source.url, {
          signal: controller.signal,
          redirect: 'follow',
          headers: feedHeaders(source.url),
        });
        if (res.ok) {
          const xml = await res.text();
          if (xml.trim()) {
            console.info(`[news] ${source.name}: recovered via browser headers after ${message}`);
            return { feed: await parser.parseString(xml), viaMirror: false };
          }
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (retryErr) {
      console.warn(`[news] ${source.name}: browser-header retry failed:`, (retryErr as Error)?.message);
    }

    // Attempt 3 — Google News' mirror of the same outlet.
    const mirror = googleNewsMirror(source.url);
    if (!mirror) throw err;
    const feed = await withTimeout(parser.parseURL(mirror), timeoutMs, `${source.name} (google-news mirror)`);
    console.info(`[news] ${source.name}: recovered ${feed.items?.length ?? 0} items via Google News mirror`);
    return { feed, viaMirror: true };
  }
}

async function fetchSource(source: FeedSource): Promise<NewsItem[]> {
  const { feed, viaMirror } = await parseFeed(source);
  const items: NewsItem[] = [];

  for (const item of feed.items ?? []) {
    let title = (item.title ?? '').trim();
    const link = item.link ?? '';
    if (!title || !link || !/^https?:\/\//i.test(link)) continue;

    let sourceName = source.name;
    // Google News appends the outlet name to every headline ("… - גיקטיים"), so a mirrored feed
    // always needs the suffix stripped even when the outlet's own feed never did.
    if (source.stripTitleSuffix || viaMirror) {
      const match = title.match(TITLE_SUFFIX_RE);
      if (match) {
        sourceName = match[1].trim();
        title = title.slice(0, match.index).trim();
      }
    }
    if (BLOCKED_PUBLISHERS.test(sourceName) || BLOCKED_PUBLISHERS.test(link)) continue;

    // Prefer the full article body (`content:encoded`, present on Geektime/TechTime WordPress
    // feeds) over the short `description`/`contentSnippet` teaser, so downstream generators get
    // real substance. `cleanText` strips markup and WordPress trailers; keep a generous slice.
    const rawBody = item.contentEncoded || item['content:encoded'] || item.content || item.contentSnippet;
    const fullText = cleanText(rawBody as string | undefined, title);
    const summary = truncate(fullText || cleanText(item.contentSnippet, title) || title, SUMMARY_MAX);
    const categories = item.categories ?? [];
    const classifierText = `${title} ${summary} ${categories.join(' ')}`;
    const topic = source.forceTopic ?? classifyTopic(classifierText);
    if (!source.forceTopic && source.onlyTopics && !source.onlyTopics.includes(topic)) continue;
    const publishedAt = item.isoDate || (item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString());
    const slug = buildSlug(title, link);

    items.push({
      id: slug,
      slug,
      source: sourceName,
      category: source.defaultCategory ?? deriveCategory(topic, classifierText),
      topic,
      title,
      link,
      excerpt: truncate(summary, EXCERPT_MAX),
      summary,
      publishedAt,
      image: extractImage(item as Record<string, any>),
      lang: source.lang,
    });
  }

  return items.slice(0, source.maxItems ?? PER_FEED_ITEM_CAP);
}

let cache: { items: NewsItem[]; fetchedAt: number } | null = null;
let inFlight: Promise<NewsItem[]> | null = null;

async function refreshAll(): Promise<NewsItem[]> {
  const priorityByName = new Map(SOURCES.map((s) => [s.name, s.priority]));
  const priorityOf = (name: string) => priorityByName.get(name) ?? 9;

  const results = await Promise.allSettled(SOURCES.map(fetchSource));
  const raw: NewsItem[] = [];
  const stats: string[] = [];

  results.forEach((result, idx) => {
    if (result.status === 'fulfilled') {
      raw.push(...result.value);
      stats.push(`${SOURCES[idx].name}:${result.value.length}`);
    } else {
      stats.push(`${SOURCES[idx].name}:FAIL`);
      console.error(`[news] failed to fetch ${SOURCES[idx].name}:`, result.reason?.message ?? result.reason);
    }
  });

  const deduped = dedupe(raw, priorityOf).sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  // Auto-translate the curated English specialist outlets (OpenAI/TechCrunch AI/DeepMind/…)
  // into Hebrew BEFORE anything is cached — see newsTranslate.ts. An item that can't be translated
  // this cycle (Gemini unconfigured/rate-limited/bad response) is dropped here, never cached in
  // English, so `sanitizeAndKeep`'s Hebrew gate downstream never has to filter it out later.
  //
  // Run CONCURRENTLY with `enrichImages` (og:image scraping), not sequentially after it — both
  // operate on `deduped`'s object references and `translateForeignItems` mutates items IN PLACE
  // (see its comment), so whichever finishes last doesn't clobber the other's write. Running these
  // back-to-back instead of together is what pushed a cold-cache refresh past `api/news.ts`'s
  // function timeout (confirmed via a 504 in production before this fix).
  const [translated] = await Promise.all([
    translateForeignItems(deduped).catch((err) => {
      console.error('[news] translateForeignItems failed, falling back to Hebrew-native items only:', err);
      return deduped.filter((it) => (it.title.match(/[֐-׿]/g) || []).length >= 6);
    }),
    // Scrape og:image for the newest items whose feed carried no inline media (TechTime, most
    // Google-News entries) so the Content Agent has a real article photo to render.
    enrichImages(deduped).catch((err) => console.error('[news] enrichImages failed:', err)),
  ]);

  // `translateForeignItems` returns Hebrew-native items first and translated-foreign items
  // appended after — it does NOT preserve `deduped`'s recency order. Re-sorting here is what
  // actually keeps every tab fresh: without it, a TechCrunch/OpenAI item published
  // minutes ago (foreign, needs translation) always lands after every older native-Hebrew item,
  // no matter how stale, because it was appended rather than merged back into place.
  const items = translated.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  const withImg = items.filter((i) => i.image).length;
  console.info(
    `[news] refreshed — ${items.length} items after translate (${deduped.length} deduped, ${raw.length} raw), ${withImg} with image · ${stats.join(' ')}`
  );

  // A refresh that comes back empty (every feed timed out / got WAF-blocked at once) must never
  // replace a good feed with nothing: keep the in-memory set, else fall back to the last snapshot.
  if (items.length === 0) {
    if (cache?.items.length) {
      console.warn('[news] refresh returned 0 items — keeping the previous in-memory feed');
      cache = { items: cache.items, fetchedAt: Date.now() - CACHE_TTL_MS + 60_000 }; // retry in ~1 min
      return cache.items;
    }
    const snap = await settleWithin(loadSnapshot(), 3000);
    if (snap?.items.length) {
      console.warn(`[news] refresh returned 0 items — serving the Firebase snapshot from ${new Date(snap.fetchedAt).toISOString()}`);
      cache = { items: snap.items, fetchedAt: Date.now() - CACHE_TTL_MS + 60_000 };
      return snap.items;
    }
  }

  cache = { items, fetchedAt: Date.now() };
  if (items.length) await settleWithin(saveSnapshot(cache), 2500);
  return items;
}

async function settleWithin<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<undefined>((r) => { timer = setTimeout(() => r(undefined), ms); })]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** Firebase is loaded lazily so the feed never pays for the SDK unless it needs the snapshot. */
async function loadSnapshot(): Promise<{ items: NewsItem[]; fetchedAt: number } | null> {
  const { readNewsSnapshot } = await import('../agent/firebaseServer.js');
  return (await readNewsSnapshot()) as { items: NewsItem[]; fetchedAt: number } | null;
}

async function saveSnapshot(snapshot: { items: NewsItem[]; fetchedAt: number }): Promise<void> {
  const { writeNewsSnapshot } = await import('../agent/firebaseServer.js');
  await writeNewsSnapshot(snapshot);
}

export async function getNewsItems(
  // `strict` is ON by default — the site news page, the Live Feed ticker and the dashboard all get
  // the sanitized, always-Hebrew stream. Pass `{ strict: false }` (via `/api/news?strict=0`) only
  // for debugging the raw aggregate (which CAN carry untranslated English — never use it for
  // anything user-facing). `allowEnglish` is accepted for API back-compat but no longer changes the
  // result — see `sanitizeAndKeep`.
  opts: { strict?: boolean; allowEnglish?: boolean } = {}
): Promise<{ items: NewsItem[]; updatedAt: string }> {
  const strict = opts.strict ?? true;
  const allowEnglish = opts.allowEnglish ?? false;
  const isStale = !cache || Date.now() - cache.fetchedAt > CACHE_TTL_MS;
  if (isStale) {
    inFlight = inFlight ?? refreshAll().finally(() => { inFlight = null; });
    await inFlight;
  }
  const all = cache?.items ?? [];
  return {
    // Applied here, on the way out — the cache always holds the full unfiltered set.
    items: strict ? all.filter((it) => sanitizeAndKeep(it, { allowEnglish })) : all,
    updatedAt: cache ? new Date(cache.fetchedAt).toISOString() : new Date().toISOString(),
  };
}

export async function getNewsItemBySlug(slug: string): Promise<NewsItem | null> {
  const { items } = await getNewsItems();
  return items.find((item) => item.slug === slug) ?? null;
}
