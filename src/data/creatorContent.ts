/**
 * Daniel's own published guides, for the hero's "tips & model updates" console (2026-09-23).
 *
 * These mirror STATIC_GUIDES in src/server/leadMagnets.ts (same slugs → the same live
 * /g/<slug> landing pages), but the blurbs here are written for the homepage visitor in plain
 * Hebrew — the server copy is the guide's own cover text. When a guide is added there, add it here
 * too; a slug that exists only here would link to a "guide not found" page.
 */
/**
 * How a guide's cover is DRAWN — the covers are code (GuideCover.tsx), not images. `motif` picks the
 * generated line art, `accent` the second light colour next to the brand green, `kicker` the label
 * chip. Only words that describe the guide's format belong in `kicker`, never a claim about results.
 */
export interface GuideCoverStyle {
  motif: 'circuit' | 'neural';
  accent: string;
  kicker: string;
}

export interface CreatorGuide {
  slug: string;
  title: string;
  blurb: string;
  publishedAt: string;
  cover: GuideCoverStyle;
}

export const CREATOR_GUIDES: CreatorGuide[] = [
  {
    slug: 'ai-business-automations-2026',
    title: 'המדריך לאוטומציות AI בעסק',
    blurb: 'איך בונים סוכן ראשון צעד אחר צעד, עם שני תרגולים מלאים להעתקה.',
    publishedAt: '2026-09-11',
    cover: { motif: 'circuit', accent: '#d4ff3a', kicker: 'מדריך מעשי' },
  },
  {
    slug: 'ai-learning-guide-2026',
    title: 'בינה מלאכותית מהיסודות',
    blurb: 'המדריך המלא למי שמתחיל: מה זה, איך זה עובד ואיך מתחילים להשתמש.',
    publishedAt: '2026-09-11',
    cover: { motif: 'neural', accent: '#2ee6c8', kicker: 'מדריך למתחילים' },
  },
];

/** Cover style for a guide slug; a slug missing from the list still gets a real cover, never a blank. */
export function guideCoverStyle(slug: string): GuideCoverStyle {
  return CREATOR_GUIDES.find((g) => g.slug === slug)?.cover ?? { motif: 'circuit', accent: '#d4ff3a', kicker: 'מדריך AI' };
}
