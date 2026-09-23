/**
 * Daniel's own published guides, for the hero's "tips & model updates" console (2026-09-23).
 *
 * These mirror STATIC_GUIDES in src/server/leadMagnets.ts (same slugs → the same live
 * /g/<slug> landing pages), but the blurbs here are written for the homepage visitor in plain
 * Hebrew — the server copy is the guide's own cover text. When a guide is added there, add it here
 * too; a slug that exists only here would link to a "guide not found" page.
 */
export interface CreatorGuide {
  slug: string;
  title: string;
  blurb: string;
  publishedAt: string;
}

export const CREATOR_GUIDES: CreatorGuide[] = [
  {
    slug: 'ai-business-automations-2026',
    title: 'המדריך לאוטומציות AI בעסק',
    blurb: 'איך בונים סוכן ראשון צעד אחר צעד, עם שני תרגולים מלאים להעתקה.',
    publishedAt: '2026-09-11',
  },
  {
    slug: 'ai-learning-guide-2026',
    title: 'בינה מלאכותית מהיסודות',
    blurb: 'המדריך המלא למי שמתחיל: מה זה, איך זה עובד ואיך מתחילים להשתמש.',
    publishedAt: '2026-09-11',
  },
];
