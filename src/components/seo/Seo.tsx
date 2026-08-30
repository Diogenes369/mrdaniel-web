import { useEffect } from 'react';

/**
 * Per-route SEO head manager. This site is a pure client-rendered SPA (no SSR / prerender), so
 * there's no framework head API to hook — this component imperatively upserts `<title>`, the
 * description / robots / canonical tags, the OpenGraph + Twitter card set, and any JSON-LD blocks
 * into `<head>` on mount and whenever its props change.
 *
 * It reuses the static tags already in index.html in place (no duplicates) and only removes the
 * JSON-LD blocks IT added (`data-managed-seo`), leaving the base Organization/WebSite graph in
 * index.html untouched for crawlers that don't execute JS.
 *
 * Note the known ceiling: link-preview scrapers that don't run JS (some LinkedIn/Meta paths) will
 * still read only index.html's static OG for every route. Full per-route social cards would need a
 * prerender step / edge function — tracked separately.
 */

const SITE_URL = 'https://mrdaniel.co.il';
const SITE_NAME = 'MR. DANIEL';
const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;

type JsonLd = Record<string, unknown>;

export interface SeoProps {
  title: string;
  description: string;
  /** Route path, e.g. "/ai" or "/". Used to build the absolute canonical/OG url. */
  path: string;
  type?: 'website' | 'article' | 'profile';
  image?: string;
  jsonLd?: JsonLd | JsonLd[] | null;
  noindex?: boolean;
}

function absoluteUrl(path: string): string {
  return `${SITE_URL}${path === '/' ? '' : path}`;
}

function upsert(selector: string, create: () => HTMLElement): HTMLElement {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    el.setAttribute('data-managed-seo', '');
    document.head.appendChild(el);
  }
  return el;
}

function setMeta(kind: 'name' | 'property', key: string, content: string) {
  const el = upsert(`meta[${kind}="${key}"]`, () => {
    const m = document.createElement('meta');
    m.setAttribute(kind, key);
    return m;
  });
  el.setAttribute('content', content);
}

export default function Seo({ title, description, path, type = 'website', image = DEFAULT_IMAGE, jsonLd, noindex = false }: SeoProps) {
  useEffect(() => {
    const url = absoluteUrl(path);
    document.title = title;

    setMeta('name', 'description', description);
    setMeta('name', 'robots', noindex ? 'noindex,nofollow' : 'index,follow');

    const canonical = upsert('link[rel="canonical"]', () => {
      const l = document.createElement('link');
      l.setAttribute('rel', 'canonical');
      return l;
    }) as HTMLLinkElement;
    canonical.setAttribute('href', url);

    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:type', type);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:site_name', SITE_NAME);
    setMeta('property', 'og:locale', 'he_IL');
    setMeta('property', 'og:image', image);
    setMeta('property', 'og:image:alt', title);
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image', image);
    setMeta('name', 'twitter:image:alt', title);

    // Replace only the JSON-LD blocks this component manages; the base graph in index.html stays.
    document.head.querySelectorAll('script[data-managed-seo]').forEach((s) => s.remove());
    if (jsonLd) {
      const blocks = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
      for (const block of blocks) {
        const s = document.createElement('script');
        s.type = 'application/ld+json';
        s.setAttribute('data-managed-seo', '');
        s.textContent = JSON.stringify(block);
        document.head.appendChild(s);
      }
    }
  }, [title, description, path, type, image, noindex, JSON.stringify(jsonLd)]);

  return null;
}
