/**
 * schema.org JSON-LD builders. Kept dependency-free and returning plain objects so callers (page
 * SEO configs, NewsArticlePage) can compose them into a single `jsonLd` array passed to <Seo>.
 */

const SITE_URL = 'https://mrdaniel.co.il';
const ORG_NAME = 'MR. DANIEL';

// Public profiles from the Linktree (linktr.ee/mrdaniel.ai). Kept literal rather than imported
// from SocialLinks.tsx so this module stays dependency-free (pageSeo and NewsArticlePage both import it).
const SAME_AS = [
  'https://www.instagram.com/mrdaniel.ai/',
  'https://www.threads.com/@mrdaniel.ai',
  'https://www.tiktok.com/@mrdaniel.ai',
  'https://x.com/mrdaniel_ai',
  'https://www.linkedin.com/in/daniel-ben-baruch',
  'https://open.spotify.com/user/312rrywayqttviksa5i5gxdtryhm',
  'https://linktr.ee/mrdaniel.ai',
];

const publisher = {
  '@type': 'Organization',
  name: ORG_NAME,
  url: SITE_URL,
  logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` },
};

export function organizationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: ORG_NAME,
    alternateName: 'דניאל בן ברוך',
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    image: `${SITE_URL}/og-image.png`,
    email: 'daniel@mrdaniel.co.il',
    sameAs: SAME_AS,
    description:
      'ההאב לחדשות AI בעברית: פירוק מודלי השפה החדשים, בניית סוכני AI אוטונומיים ומדריכים מעשיים ליישום AI.',
    areaServed: { '@type': 'Country', name: 'Israel' },
    knowsLanguage: ['he', 'en'],
  };
}

export function websiteLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: ORG_NAME,
    url: SITE_URL,
    inLanguage: 'he-IL',
  };
}

export function serviceLd(opts: { name: string; description: string; serviceType?: string; path: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: opts.name,
    description: opts.description,
    serviceType: opts.serviceType ?? opts.name,
    areaServed: { '@type': 'Country', name: 'Israel' },
    provider: publisher,
    url: `${SITE_URL}${opts.path}`,
  };
}

export function techArticleLd(a: {
  title: string;
  description: string;
  path: string;
  datePublished: string;
  image?: string;
  sourceName?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: a.title,
    description: a.description,
    url: `${SITE_URL}${a.path}`,
    datePublished: a.datePublished,
    inLanguage: 'he-IL',
    ...(a.image ? { image: a.image } : {}),
    author: { '@type': 'Organization', name: a.sourceName || ORG_NAME },
    publisher,
  };
}

export function breadcrumbLd(trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: `${SITE_URL}${t.path === '/' ? '' : t.path}`,
    })),
  };
}
