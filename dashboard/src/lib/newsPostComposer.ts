import { SITE_PROMO_FOOTER, type NewsItem, type NewsTopic, type SocialPlatform } from './newsAgentTypes';

/**
 * Turns a news item into a ready-to-publish social post, entirely client-side (deterministic, no
 * API key, no rate limit). Output = platform-tailored copy + strategic hashtags + the MANDATORY
 * site-promo footer, always in that order.
 */

const TOPIC_HASHTAGS: Record<NewsTopic, string[]> = {
  cyber: ['#סייבר', '#אבטחת_מידע', '#CyberSecurity', '#InfoSec', '#ZeroTrust'],
  ai: ['#בינה_מלאכותית', '#AI', '#סוכני_AI', '#GenAI', '#Automation'],
  cloud: ['#ענן', '#Cloud', '#DevOps', '#תשתיות_IT'],
  general: ['#טכנולוגיה', '#Tech', '#חדשנות', '#Innovation'],
};

const COMMON_HASHTAGS = ['#הייטק', '#TechIL', '#ישראל'];

const TOPIC_TAKE: Record<NewsTopic, string> = {
  cyber:
    'בעולם שבו איומי הסייבר משתכללים מדי יום, ארכיטקטורת אבטחה נכונה (Zero-Trust, הקשחה, ניטור) היא כבר לא מותרות אלא תנאי להמשכיות עסקית.',
  ai: 'סוכני AI מותאמים אישית כבר מבצעים משימות שלמות מקצה לקצה — השאלה היא לא "האם" אלא "מתי" משלבים אותם בתהליכי העבודה.',
  cloud: 'תשתית ענן וארכיטקטורה נכונה הן הבסיס לכל מוצר דיגיטלי מהיר, יציב ובר-הרחבה.',
  general: 'טכנולוגיה איכותית נמדדת בערך העסקי שהיא מייצרת — לא בכמות הרעש סביבה.',
};

const HOOK: Record<NewsTopic, string> = { cyber: '🛡️', ai: '🤖', cloud: '☁️', general: '⚡' };

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Trims a summary to ~2 sentences / a hard char cap so the post body stays scannable. */
function condenseSummary(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const sentences = clean.split(/(?<=[.!?…])\s+/).slice(0, 2).join(' ');
  const picked = sentences || clean;
  return picked.length > maxChars ? `${picked.slice(0, maxChars - 1).trimEnd()}…` : picked;
}

export interface ComposedPost {
  /** The full text block, copy → hashtags → footer, ready to paste. */
  fullText: string;
  hashtags: string[];
  /** Just the footer, exposed so the UI can show it as a locked/highlighted block. */
  footer: string;
}

export function composeNewsPost(item: NewsItem, platform: SocialPlatform): ComposedPost {
  const topic = item.topic;
  const hook = HOOK[topic];
  const dateLabel = formatDate(item.publishedAt);
  const context = [item.source, dateLabel].filter(Boolean).join(' · ');

  const hashtagCount = platform === 'instagram' ? 8 : 5;
  const hashtags = [...TOPIC_HASHTAGS[topic], ...COMMON_HASHTAGS].slice(0, hashtagCount);

  let copy: string;
  if (platform === 'linkedin') {
    const summary = condenseSummary(item.summary || item.excerpt, 420);
    copy = [
      `${hook} ${item.title}`,
      '',
      summary,
      '',
      TOPIC_TAKE[topic],
      '',
      context ? `מקור: ${context}` : '',
      'מה דעתכם? 👇',
    ]
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } else {
    const summary = condenseSummary(item.summary || item.excerpt, 240);
    copy = [
      `${hook} ${item.title}`,
      '',
      summary,
      '',
      `📌 ${TOPIC_TAKE[topic]}`,
      '',
      context ? `📰 ${context}` : '',
    ]
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const fullText = `${copy}\n\n${hashtags.join(' ')}\n\n${SITE_PROMO_FOOTER}`;

  return { fullText, hashtags, footer: SITE_PROMO_FOOTER };
}
