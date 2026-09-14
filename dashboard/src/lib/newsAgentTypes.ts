// Shared types + constants for the news-driven Content Agent (NewsContentAgent.tsx).

export type NewsTopic = 'ai' | 'cyber' | 'cloud' | 'devops' | 'general';

/** Mirrors the site's `NewsItem` shape (src/services/newsService.ts) — the fields the generator uses. */
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
  image?: string;
  lang?: 'he' | 'en';
}

/** The category buttons in the "Fetch Latest News" action bar. */
export type NewsCategory = 'cyber' | 'cloud' | 'ai' | 'devops' | 'all';

export const CATEGORY_LABEL: Record<NewsCategory, string> = {
  cyber: 'סייבר ואבטחת מידע',
  cloud: 'ענן ותשתיות',
  ai: 'בינה מלאכותית',
  devops: 'ניהול מערכות ו-DevOps',
  all: 'הכל',
};

/** Category → which `topic` values from the feed count as a match. `all` = no filter. */
export const CATEGORY_TOPICS: Record<NewsCategory, NewsTopic[] | null> = {
  cyber: ['cyber'],
  cloud: ['cloud'],
  ai: ['ai'],
  devops: ['devops'],
  all: null,
};

export type SocialPlatform = 'linkedin' | 'instagram';

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
};

export type ImageAspect = '1:1' | '4:5';

export const ASPECT_SIZE: Record<ImageAspect, { w: number; h: number }> = {
  '1:1': { w: 1080, h: 1080 },
  '4:5': { w: 1080, h: 1350 },
};

export const SITE_DOMAIN = 'mrdaniel.co.il';

/** MANDATORY on every generated post — appended verbatim as the final block. */
export const SITE_PROMO_FOOTER =
  '💡 אהבתם את התוכן? לעוד עדכונים, חדשות בזמן אמת ופתרונות סוכני AI מתקדמים – היכנסו עכשיו לאתר: mrdaniel.co.il';

/** The deterministic post composer's stock engagement prompts (newsPostComposer.ts · postTail).
 *  Exported so the Growth caption composer can drop them when a lead-magnet CTA takes the closing
 *  slot — one clear ask converts better than two competing ones. */
export const GENERIC_ENGAGEMENT_LINE: Record<SocialPlatform, string> = {
  linkedin: 'מה דעתכם? האם הארגון שלכם ערוך לזה?',
  instagram: 'שתפו בתגובות מה הכי מפתיע אתכם כאן 👇',
};
export const GENERIC_ENGAGEMENT_LINES: string[] = Object.values(GENERIC_ENGAGEMENT_LINE);
