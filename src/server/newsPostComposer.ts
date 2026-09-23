import type { NewsItem, NewsTopic } from './newsFeed.js';
import { stripMetaPhrases } from './storySlides.js';
import { NEWS_CTA_LINE, contextualHashtags, enforceAnalystTone } from '../agent/analystTone.js';

/**
 * Server-side counterpart of dashboard/src/lib/newsPostComposer.ts — kept as a separate copy
 * because the two run in different build graphs (Vercel Function vs the dashboard bundle). Same
 * layout: body → source → NEWS_CTA_LINE (fixed closing line) → 3-5 article-specific hashtags.
 * The topic-level content banks were removed on 2026-09-23 (see the dashboard copy's header for
 * why); the fallback carries only what the article says.
 */

export type SocialPlatform = 'linkedin' | 'instagram';

export const SITE_PROMO_FOOTER = NEWS_CTA_LINE;

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Up to ~`maxChars`, ALWAYS ending on a full sentence. Never appends "…", never cuts mid-sentence. */
function contextParagraph(text: string, maxChars: number): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= Math.floor(maxChars * 1.35)) return clean;
  const window = clean.slice(0, Math.floor(maxChars * 1.35));
  const upToLastStop = window.match(/^[\s\S]*[.!?](?=\s|$)/);
  if (upToLastStop && upToLastStop[0].length >= maxChars * 0.4) return upToLastStop[0].trim();
  const first = clean.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return (first ? first[0] : clean).trim();
}

export interface ComposedPost {
  fullText: string;
  hashtags: string[];
  footer: string;
  /** true when the body was written by the adaptive LLM synthesis step; false = deterministic. */
  synthesized: boolean;
}

/** Publisher display-name → canonical domain for the clean text citation. Covers the outlets in
 * src/server/newsFeed.ts's SOURCES plus the publishers the Google-News fallback attributes by the
 * "Headline - Publisher" title suffix (whose `link` is then a news.google.com redirect). */
const SOURCE_DOMAINS: Record<string, string> = {
  geektime: 'geektime.co.il',
  גיקטיים: 'geektime.co.il',
  techtime: 'techtime.co.il',
  'ynet דיגיטל': 'ynet.co.il',
  ynet: 'ynet.co.il',
  'ידיעות אחרונות': 'ynet.co.il',
  גלובס: 'globes.co.il',
  globes: 'globes.co.il',
  כלכליסט: 'calcalist.co.il',
  calcalist: 'calcalist.co.il',
  ctech: 'calcalistech.com',
  themarker: 'themarker.com',
  'the marker': 'themarker.com',
  'דה מרקר': 'themarker.com',
  הארץ: 'haaretz.co.il',
  haaretz: 'haaretz.co.il',
  מעריב: 'maariv.co.il',
  maariv: 'maariv.co.il',
  'ישראל היום': 'israelhayom.co.il',
  'israel hayom': 'israelhayom.co.il',
  וואלה: 'walla.co.il',
  walla: 'walla.co.il',
  'israel defense': 'israeldefense.co.il',
  'ישראל דיפנס': 'israeldefense.co.il',
  'times of israel': 'timesofisrael.com',
  reuters: 'reuters.com',
  bloomberg: 'bloomberg.com',
  techcrunch: 'techcrunch.com',
  'the verge': 'theverge.com',
  cnbc: 'cnbc.com',
};

/** Hosts that are feed aggregators / link shorteners / redirects — never the real publisher. */
const AGGREGATOR_HOSTS =
  /(^|\.)(news\.google\.com|google\.com|feedproxy\.google\.com|feedburner\.com|feeds\.feedburner\.com|feedsportal\.com|rss\.app|bing\.com|t\.co|lnkd\.in)$/i;

/** Tracking/analytics query params to drop from an article URL — keeps functional ones such as
 * Globes' `?did=` article id. */
const TRACKING_PARAM =
  /^(utm_[a-z]+|fbclid|gclid|dclid|mc_[a-z]+|ref|ref_src|referrer|cmpid|cmp|campaign|source|medium|at_medium|at_campaign|spm|s_cid|__twitter_impression|guccounter|igshid)$/i;

/** A clean, bare domain for the source citation — never a URL. Prefers the real article host,
 * falls back to a lookup on the source display name, then to the display name itself.
 * Exported so the Story/Carousel generator can stamp the same clean attribution on its slides. */
export function citationDomain(item: NewsItem): string {
  try {
    const host = new URL(item.link).hostname.replace(/^www\./, '').toLowerCase();
    if (host && !AGGREGATOR_HOSTS.test(host)) return host;
  } catch {
    /* item.link isn't a URL — fall through to the name lookup */
  }
  const key = item.source.trim().toLowerCase();
  if (SOURCE_DOMAINS[key]) return SOURCE_DOMAINS[key];
  const hit = Object.keys(SOURCE_DOMAINS).find((name) => key.includes(name));
  return hit ? SOURCE_DOMAINS[hit] : item.source.trim();
}

/** LinkedIn only: a clean canonical article URL — protocol normalised, `www.`, tracking params
 * and `#fragment` stripped — or null when the link is a Google-News / aggregator redirect that
 * can't be resolved to the real article without a network hop (the caller then shows just the
 * bare-domain citation instead of an opaque redirect URL). */
function canonicalArticleUrl(link: string): string | null {
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '');
  if (!/^https?:$/.test(u.protocol) || AGGREGATOR_HOSTS.test(host)) return null;
  for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAM.test(k)) u.searchParams.delete(k);
  u.hash = '';
  u.hostname = host;
  u.protocol = 'https:';
  const s = u.toString();
  return u.search ? s : s.replace(/\/$/, '');
}

/** Source attribution, the fixed closing line, then the hashtag line as the very last block.
 *
 * Instagram captions can't carry clickable links, so IG gets a bare-domain text citation only
 * ("מקור: ynet.co.il · 01.09.2026"). LinkedIn gets that same citation plus the canonical article
 * URL — but only when it's a real publisher link, not a news.google.com redirect. */
function postTail(item: NewsItem, platform: SocialPlatform, hashtags: string[]): string[] {
  const isLinkedin = platform === 'linkedin';
  const dateLabel = formatDate(item.publishedAt);
  const citation = `מקור: ${[citationDomain(item), dateLabel].filter(Boolean).join(' · ')}`;

  const articleUrl = isLinkedin ? canonicalArticleUrl(item.link) : null;
  const sourceLine = articleUrl ? `${citation}\nלכתבה המלאה: ${articleUrl}` : citation;

  return [sourceLine, SITE_PROMO_FOOTER, hashtags.join(' ')].filter(Boolean);
}

/** Everything the post may draw entity tags from — the headline weighs in first. */
function tagContext(item: NewsItem, body: string): string {
  return [item.title, item.summary, item.excerpt, body].filter(Boolean).join('\n');
}

/** DETERMINISTIC FALLBACK (no API key / synthesis failed): headline + the article's own summary. */
export function composeNewsPost(item: NewsItem, platform: SocialPlatform): ComposedPost {
  const isLinkedin = platform === 'linkedin';
  const headline = item.title.trim().replace(/[.׃]+$/, '');
  const context = contextParagraph(item.summary || item.excerpt, isLinkedin ? 1400 : 900);
  const body = enforceAnalystTone(stripMetaPhrases([`${headline}.`, context].filter(Boolean).join('\n\n')));
  const hashtags = contextualHashtags([], tagContext(item, body));

  const fullText = [body, ...postTail(item, platform, hashtags)].join('\n\n');
  return { fullText, hashtags, footer: SITE_PROMO_FOOTER, synthesized: false };
}

/** Wraps an LLM-synthesised post body with the standard source line, closing line and hashtags. */
export function assembleComposedPost(
  item: NewsItem,
  platform: SocialPlatform,
  body: string,
  aiHashtags: string[]
): ComposedPost {
  const cleanBody = enforceAnalystTone(stripMetaPhrases(body.trim()));
  const hashtags = contextualHashtags(aiHashtags ?? [], tagContext(item, cleanBody));
  const fullText = [cleanBody, ...postTail(item, platform, hashtags)].join('\n\n');
  return { fullText, hashtags, footer: SITE_PROMO_FOOTER, synthesized: true };
}

/**
 * PRIMARY (dashboard, human-in-the-loop): calls the site's post-synthesis endpoint
 * (/api/agent-generate · action:"post-synthesize") for an adaptive, article-typed Hebrew post
 * body — dynamic structure per subject (cyber incident / AI launch / hardware / policy), every
 * material fact from the source woven in, organic paragraphs, **bold** key terms. Throws on any
 * failure so the caller can fall back to composeNewsPost().
 */
export async function synthesizeNewsPost(
  item: NewsItem,
  platform: SocialPlatform,
  opts: { apiBase: string; adminSecret?: string }
): Promise<ComposedPost> {
  const articleText = (item.summary || item.excerpt || '').trim();
  if (articleText.length < 60) throw new Error('article text too thin for synthesis');

  const url = `${opts.apiBase.replace(/\/$/, '')}/api/agent-generate`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.adminSecret ? { 'x-admin-secret': opts.adminSecret } : {}),
  };
  const reqBody = JSON.stringify({
    action: 'post-synthesize',
    title: item.title,
    source: item.source,
    topic: item.topic,
    platform,
    articleText,
  });

  // Retry once on a 429 (Gemini free-tier hourly cap) after a short bounded wait.
  let res = await fetch(url, { method: 'POST', headers, body: reqBody });
  if (res.status === 429) {
    let waitMs = 6000;
    try {
      const j = (await res.clone().json()) as { retryAfterSeconds?: number };
      if (typeof j.retryAfterSeconds === 'number') waitMs = Math.min(12000, Math.max(3000, j.retryAfterSeconds * 1000));
    } catch {
      /* keep default wait */
    }
    await new Promise((r) => setTimeout(r, waitMs));
    res = await fetch(url, { method: 'POST', headers, body: reqBody });
  }
  if (res.status === 429) throw new Error('post-synthesize rate-limited (429) — Gemini free-tier hourly quota');
  if (res.status === 401) throw new Error('post-synthesize unauthorized (401) — x-admin-secret missing/mismatched');
  if (!res.ok) throw new Error(`post-synthesize responded ${res.status}`);
  const data = (await res.json()) as {
    ok?: boolean;
    blocked?: boolean;
    post?: { body?: string; hashtags?: string[] };
  };
  if (
    !data.ok ||
    data.blocked ||
    !data.post ||
    typeof data.post.body !== 'string' ||
    data.post.body.trim().length < 120
  ) {
    throw new Error('post-synthesize returned no usable body');
  }
  return assembleComposedPost(item, platform, data.post.body, data.post.hashtags ?? []);
}

const TOPIC_FALLBACK_IMAGE: Record<NewsTopic, string> = {
  ai: 'https://images.pexels.com/photos/8386440/pexels-photo-8386440.jpeg?auto=compress&cs=tinysrgb&w=1080',
  // Reuses a photo already verified reachable in the dashboard's curated Pexels pool (pexelsBackground.ts).
  ai_models: 'https://images.pexels.com/photos/8108716/pexels-photo-8108716.jpeg?auto=compress&cs=tinysrgb&w=1080',
  ai_agents: 'https://images.pexels.com/photos/8386440/pexels-photo-8386440.jpeg?auto=compress&cs=tinysrgb&w=1080',
  // Reuses a photo already verified reachable in the dashboard's curated Pexels pool (pexelsBackground.ts).
  general: 'https://images.pexels.com/photos/373543/pexels-photo-373543.jpeg?auto=compress&cs=tinysrgb&w=1080',
};

/** The image URL the publish payload should carry: the item's own photo (routed through the site's
 * CORS relay so downstream tools that fetch it don't hit hotlink/CORS issues) or a topic-matched
 * stock photo. Server-side branded compositing is intentionally not part of this codebase — the
 * dashboard renders the branded canvas version for review/download. */
export function publishImageUrl(item: NewsItem, siteOrigin: string): string {
  if (item.image) return `${siteOrigin}/api/img-proxy?url=${encodeURIComponent(item.image)}`;
  return TOPIC_FALLBACK_IMAGE[item.topic];
}
