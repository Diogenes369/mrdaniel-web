/**
 * Zero-noise article-body extraction from raw HTML. Server-side only.
 *
 * Why this exists: the previous extractor in contentImport.ts took the FIRST `<article>` element in
 * the document and, failing that, the union of every `<p>` on the page. On a real Israeli news
 * portal both are wrong. ice.co.il, for instance, ships 23 `<article>` elements (the body is one of
 * them; the other 22 are "related article" cards), only 13 `<p>` tags on the whole page — and puts
 * the actual article prose in `div.paragraph > div.text`, which the `<p>` scan never sees. What came
 * back was an ad/nav/related-links soup, or nothing.
 *
 * The approach here is DOM-shaped rather than regex-shaped, in three passes:
 *   1. STRIP  — delete whole noise subtrees (ads, share bars, related rails, comments, newsletter
 *               forms, nav/aside/footer, cookie panels) before any text is read, so noise can never
 *               be scored as content or leak into a sibling's text.
 *   2. SELECT — score every plausible container by the length of its *block-level* text and pick the
 *               densest one, instead of trusting document order.
 *   3. READ   — pull only block-level text nodes (p / li / h2-h4 / blockquote and the "paragraph
 *               div" pattern) from the winning container, in document order.
 *
 * JSON-LD `articleBody` is tried first when a publisher provides it: it is the publisher's own
 * definition of the body, and by construction contains no chrome at all.
 */

import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

/** Element names that are never article prose. */
const NOISE_TAGS = [
  'script', 'style', 'noscript', 'template', 'svg', 'canvas', 'form', 'button', 'input', 'select',
  'textarea', 'iframe', 'nav', 'aside', 'header', 'footer', 'video', 'audio',
];

/**
 * class / id substrings that mark a subtree as chrome. Matched case-insensitively against the
 * element's own `class` + `id`, so a hit removes the whole subtree.
 *
 * Deliberately does NOT include the bare words "content" / "article" / "post" / "text" — those are
 * how publishers name the body itself (ice.co.il uses `div.content`, WordPress `entry-content`).
 */
const NOISE_PATTERNS = [
  // advertising
  'advert', 'advertis', 'dfp-', 'div-gpt', 'google-ad', 'googlead', 'adsense', 'ad-slot', 'adslot',
  'ad-unit', 'adunit', 'ad-wrapper', 'ad-container', 'banner', 'sponsor', 'promoted', 'outbrain',
  'taboola', 'revcontent', 'mgid', 'ice-ads',
  // recirculation / "recommended for you"
  'related', 'recommend', 'readmore', 'read-more', 'morefrom', 'more-from', 'trending', 'popular',
  'mostread', 'most-read', 'youmayalso', 'you-may-also', 'nextarticle', 'next-article',
  'prevarticle', 'teaser', 'articles-list', 'article-item', 'card-list', 'widget',
  // social / sharing / follow
  'share', 'sharing', 'social', 'follow', 'gfollow', 'whatsapp-btn', 'subscribe',
  // discussion
  'comment', 'talkback', 'disqus', 'livefyre',
  // site chrome
  'sidebar', 'side-bar', 'breadcrumb', 'menu', 'navbar', 'nav-', 'masthead', 'site-header',
  'site-footer', 'skip-link', 'pagination', 'paging', 'toolbar', 'searchbox', 'search-box',
  // interstitials
  'newsletter', 'signup', 'sign-up', 'popup', 'modal', 'overlay', 'paywall', 'cookie', 'consent',
  'gdpr', 'notification', 'toast', 'lightbox', 'sticky',
  // bylines / tags / metadata rails (kept out of the body; headline + source travel separately)
  'byline', 'author-box', 'authorbox', 'tags-list', 'tag-list', 'taglist', 'meta-bar', 'statistics',
  'financial-bar',
];

/** Containers a publisher is likely to use for the article body, best-signal first. */
const BODY_SELECTORS = [
  '[itemprop="articleBody"]',
  '.articleBody',
  '.article-body',
  '.article__body',
  '.article-content',
  '.article__content',
  '.post-content',
  '.post-body',
  '.entry-content',
  '.entry__content',
  '.story-body',
  '.story-content',
  '.content-body',
  '.single-content',
  '#article-container',
  '#article-body',
  '#articleBody',
  'article',
  'main',
  '[role="main"]',
  '.content',
];

/** Broad containers: useful as a net, but never allowed to win outright over a precise hit. */
const BROAD_SELECTORS = new Set(['article', 'main', '[role="main"]', '.content']);

/** Block elements read as prose. `div.paragraph` / `div.text` cover the "paragraph div" pattern
 * used by several Israeli portals (ice.co.il among them) that never wrap prose in `<p>`. */
const BLOCK_SELECTOR = 'p, li, h2, h3, h4, blockquote, div.paragraph, div.text, div.par';

/** A block short enough and punctuation-free enough to be a link label / caption, not prose. */
function isProseBlock(text: string): boolean {
  if (text.length >= 60) return true;
  // a short line still counts if it closes a sentence and is not a bare label
  return text.length >= 25 && /[.!?…]/.test(text);
}

function normaliseWhitespace(s: string): string {
  return s.replace(/[ ​‎‏]/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

/**
 * Pass 1 — delete every noise subtree from the document, in place.
 * Runs before scoring so an ad rail can never win the density contest or bleed into a parent.
 */
function stripNoise($: cheerio.CheerioAPI): void {
  $(NOISE_TAGS.join(',')).remove();
  $('[aria-hidden="true"], [hidden], [role="navigation"], [role="banner"], [role="complementary"], [role="dialog"]').remove();
  // The headline travels separately (og:title / <title>), and leaving the <h1> in place makes any
  // wrapper div that holds both headline and lede emit the headline as its first "paragraph".
  $('h1, figcaption, .caption, .credit, .wp-caption-text').remove();

  // class/id substring sweep.
  //
  // Guarded by size: a substring match on a *wrapper* must never delete the article. WordPress
  // themes put state classes on <body> (geektime ships `... menu-open ...`), which matched the
  // "menu" pattern and removed the entire document. Structural roots are exempt outright, and any
  // element holding most of the page's text is treated as a wrapper whose class is describing page
  // state, not its own role.
  const totalTextLength = normaliseWhitespace($('body').text()).length || 1;
  $('[class],[id]').each((_i, el) => {
    const node = $(el);
    if (/^(?:html|body|main|article)$/i.test(el.tagName ?? '')) return;
    const key = `${node.attr('class') ?? ''} ${node.attr('id') ?? ''}`.toLowerCase();
    if (!key.trim()) return;
    if (!NOISE_PATTERNS.some((p) => key.includes(p))) return;
    if (normaliseWhitespace(node.text()).length > totalTextLength * 0.5) return;
    node.remove();
  });

  // HTML comment nodes (publishers wrap ad slots in them)
  $('*')
    .contents()
    .filter((_i, n: AnyNode) => n.type === 'comment')
    .remove();
}

/** Read block-level prose out of one container, in document order, de-duplicated. */
function readBlocks($: cheerio.CheerioAPI, container: cheerio.Cheerio<AnyNode>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  container.find(BLOCK_SELECTOR).each((_i, el) => {
    const node = $(el);
    // Skip a block that merely wraps other blocks — its child is read on its own turn, and reading
    // both would duplicate the whole paragraph.
    if (node.find(BLOCK_SELECTOR).length > 0) return;
    const text = normaliseWhitespace(node.text());
    if (!isProseBlock(text)) return;
    const key = text.slice(0, 80);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out;
}

/**
 * Fallback reader for a container whose prose is not wrapped in block elements at all.
 *
 * geektime.co.il is the case in point: the whole article lives as bare text and `<br>`s inside a
 * single `div#page_content`, so BLOCK_SELECTOR matches nothing and the container looks empty. Here
 * the de-noised subtree is re-serialised and converted to text with block boundaries preserved
 * (cheerio's `.text()` concatenates without separators, which would run every sentence together).
 */
function readDenseText($: cheerio.CheerioAPI, container: cheerio.Cheerio<AnyNode>): string {
  const html = $.html(container);
  if (!html) return '';
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|section|article|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(text)
    .split('\n')
    .map(normaliseWhitespace)
    .filter(isProseBlock)
    .join('\n\n');
}

/** Minimal entity decoding — the extracted text is consumed as plain text downstream. */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

/** Pass 2 + 3 — pick the densest candidate container and read its prose. */
function extractFromDom($: cheerio.CheerioAPI): { text: string; selector: string } {
  let best = { text: '', selector: '', score: 0 };

  for (const selector of BODY_SELECTORS) {
    let matches: cheerio.Cheerio<AnyNode>;
    try {
      matches = $(selector);
    } catch {
      continue; // malformed selector against an exotic document — skip, never throw
    }
    matches.each((_i, el) => {
      let text = readBlocks($, $(el)).join('\n\n');
      // A container whose prose is not wrapped in block elements reads as empty above; fall back to
      // its own block-aware text before writing it off.
      if (text.length < 400) {
        const dense = readDenseText($, $(el));
        if (dense.length > text.length) text = dense;
      }
      // Score is raw prose length: once the noise subtrees are gone, the article body is by a wide
      // margin the densest block-text container left standing.
      if (text.length > best.score) best = { text, selector, score: text.length };
    });
    // A precise selector that produced a real body wins outright — no need to let a broad container
    // (`main`, `.content`) pull in a neighbouring section afterwards.
    if (best.score >= 900 && !BROAD_SELECTORS.has(best.selector)) {
      return { text: best.text, selector: best.selector };
    }
  }

  if (best.score === 0) {
    // Nothing matched a known container shape: read the whole (already de-noised) body.
    const body = $('body');
    const blocks = readBlocks($, body).join('\n\n');
    return { text: blocks.length >= 400 ? blocks : readDenseText($, body) || blocks, selector: 'body' };
  }
  return { text: best.text, selector: best.selector };
}

/** JSON-LD `articleBody`, when the publisher ships one. Zero noise by construction. */
function extractJsonLdBody($: cheerio.CheerioAPI): string {
  const visit = (value: unknown): string => {
    if (!value) return '';
    if (Array.isArray(value)) {
      for (const v of value) {
        const found = visit(v);
        if (found) return found;
      }
      return '';
    }
    if (typeof value !== 'object') return '';
    const obj = value as Record<string, unknown>;
    if (typeof obj.articleBody === 'string' && obj.articleBody.trim().length > 200) {
      return obj.articleBody.trim();
    }
    if (obj['@graph']) return visit(obj['@graph']);
    return '';
  };

  let found = '';
  $('script[type="application/ld+json"]').each((_i, el) => {
    if (found) return;
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      found = visit(JSON.parse(raw));
    } catch {
      /* a publisher's malformed JSON-LD is not a reason to fail the import */
    }
  });
  return found;
}

export interface ExtractedArticle {
  /** Article body text, block-separated by a blank line. Empty when nothing usable was found. */
  text: string;
  /** Which strategy produced it — surfaced in logs so a regression points at the right pass. */
  strategy: 'json-ld' | 'dom' | 'none';
  /** The winning container selector, for `strategy: 'dom'`. */
  selector: string;
}

/**
 * Extract the article body from a raw HTML document, with ads, nav, sidebars, share bars,
 * "recommended for you" rails, newsletter forms and comments removed.
 *
 * Never throws: a parse failure returns an empty result so the caller's fallback chain can run.
 */
export function extractArticleFromHtml(html: string): ExtractedArticle {
  if (!html || html.length < 200) return { text: '', strategy: 'none', selector: '' };
  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(html);
  } catch {
    return { text: '', strategy: 'none', selector: '' };
  }

  // JSON-LD is read before the noise sweep, because the sweep removes every <script>.
  let jsonLd = '';
  try {
    jsonLd = extractJsonLdBody($);
  } catch {
    /* ignore */
  }

  let dom = { text: '', selector: '' };
  try {
    stripNoise($);
    dom = extractFromDom($);
  } catch {
    /* fall through to whatever JSON-LD gave us */
  }

  // Prefer whichever is more complete. Publishers frequently truncate `articleBody` to the lede, so
  // a materially longer DOM read wins; otherwise JSON-LD's guaranteed-clean text is better.
  if (jsonLd && dom.text.length < jsonLd.length * 1.2) {
    return { text: jsonLd, strategy: 'json-ld', selector: '' };
  }
  if (dom.text.length > 0) return { text: dom.text, strategy: 'dom', selector: dom.selector };
  if (jsonLd) return { text: jsonLd, strategy: 'json-ld', selector: '' };
  return { text: '', strategy: 'none', selector: '' };
}

/** Lead image from OG/Twitter metadata or the first in-body `<img>`, ignoring tracking pixels. */
export function extractLeadImage(html: string): string {
  try {
    const $ = cheerio.load(html);
    for (const sel of [
      'meta[property="og:image:secure_url"]',
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[property="twitter:image"]',
      'meta[itemprop="image"]',
    ]) {
      const c = $(sel).attr('content')?.trim();
      if (c) return c;
    }
    const img = $('article img, .article-body img, .content img, main img')
      .filter((_i, el) => {
        const src = $(el).attr('src') ?? '';
        return /^https?:\/\//i.test(src) && !/\b(?:1x1|pixel|spacer|blank|tracking)\b/i.test(src);
      })
      .first()
      .attr('src');
    return img?.trim() ?? '';
  } catch {
    return '';
  }
}
