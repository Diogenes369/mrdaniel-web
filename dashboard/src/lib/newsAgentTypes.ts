// Shared types + constants for the news-driven Content Agent (NewsContentAgent.tsx).
import { NEWS_CTA_LINE } from './analystTone';

export type NewsTopic = 'ai' | 'ai_models' | 'ai_agents' | 'general';

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
export type NewsCategory = 'ai' | 'ai_models' | 'ai_agents' | 'all';

export const CATEGORY_LABEL: Record<NewsCategory, string> = {
  ai: 'בינה מלאכותית',
  ai_models: 'מודלי AI וחידושים',
  ai_agents: 'סוכני AI',
  all: 'הכל',
};

/** Category → which `topic` values from the feed count as a match. `all` = no filter. */
export const CATEGORY_TOPICS: Record<NewsCategory, NewsTopic[] | null> = {
  ai: ['ai'],
  ai_models: ['ai_models'],
  ai_agents: ['ai_agents'],
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

/** MANDATORY closing line on every generated post, appended verbatim — only the hashtag line
 *  follows it. Owned by analystTone.ts (NEWS_CTA_LINE) so the server's auto-publisher and the
 *  dashboard can never ship two different closers. */
export const SITE_PROMO_FOOTER = NEWS_CTA_LINE;

/** The deterministic post composer's stock engagement prompts (newsPostComposer.ts · postTail).
 *  Exported so the Growth caption composer can drop them when a lead-magnet CTA takes the closing
 *  slot — one clear ask converts better than two competing ones. */
export const GENERIC_ENGAGEMENT_LINE: Record<SocialPlatform, string> = {
  linkedin: 'מה דעתכם? האם הארגון שלכם ערוך לזה?',
  instagram: 'שתפו בתגובות מה הכי מפתיע אתכם כאן 👇',
};
export const GENERIC_ENGAGEMENT_LINES: string[] = Object.values(GENERIC_ENGAGEMENT_LINE);
