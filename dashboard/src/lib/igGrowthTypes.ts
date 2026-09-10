// Shared types for the IG Growth Intelligence Agent (IgGrowthAgent.tsx) — two tools:
//  1. Trend & Top-Account Research  → TrendRadar
//  2. Smart Response & Engagement   → EngagementReplySet

export type TrendMomentum = 'rising' | 'hot' | 'steady';

export interface TrendEntry {
  /** short trend / topic name */
  title: string;
  momentum: TrendMomentum;
  /** why it's moving right now — one sentence */
  why: string;
  /** the concrete audience pain point this trend speaks to */
  audiencePainPoint: string;
}

export interface ViralHeadline {
  /** a scroll-stopping, hook-style rewrite of a real headline */
  headline: string;
  /** the content angle / framing that makes it work */
  angle: string;
}

export type BlueprintFormat = 'reel' | 'story' | 'carousel';

export interface ContentBlueprint {
  format: BlueprintFormat;
  /** the opening line — must stop the scroll in 1–2s */
  hook: string;
  /** 3–6 ordered beats: Reel scene list / Story frame list / carousel slide breakdown */
  outline: string[];
  cta: string;
}

export interface TrendRadar {
  trends: TrendEntry[];
  viralHeadlines: ViralHeadline[];
  blueprints: ContentBlueprint[];
  /** true = Gemini synthesis; false = deterministic offline fallback */
  synthesized: boolean;
  /** populated when synthesized === false */
  fallbackReason?: string;
  createdAt: number;
  /** how many source headlines fed the analysis */
  sourceCount: number;
}

export type ReplyStyle = 'expert' | 'question' | 'concise';

export interface EngagementReply {
  style: ReplyStyle;
  /** Hebrew UI label for the card */
  label: string;
  text: string;
}

export interface EngagementReplySet {
  replies: EngagementReply[];
  synthesized: boolean;
  fallbackReason?: string;
  createdAt: number;
  /** echoes the post URL the operator supplied, for the "open on Instagram" action */
  sourceUrl?: string;
}

export const REPLY_META: Record<ReplyStyle, { label: string; hint: string }> = {
  expert: { label: 'תוספת ערך מקצועית', hint: 'תובנה טכנית עמוקה שמוסיפה לדיון' },
  question: { label: 'שאלה מעוררת דיון', hint: 'שאלה שמזמינה תגובות והמשך שיחה' },
  concise: { label: 'חד וזכיר', hint: 'משפט קצר, חד ובלתי נשכח — נראות גבוהה' },
};

export const MOMENTUM_META: Record<TrendMomentum, { label: string; className: string }> = {
  rising: { label: 'במגמת עלייה', className: 'text-sky-300 bg-sky-500/10 border-sky-500/30' },
  hot: { label: 'חם עכשיו', className: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  steady: { label: 'יציב', className: 'text-zinc-300 bg-white/5 border-white/15' },
};

export const BLUEPRINT_META: Record<BlueprintFormat, { label: string }> = {
  reel: { label: 'ריל' },
  story: { label: 'סטורי' },
  carousel: { label: 'קרוסלה' },
};

// ─── 3. Organic Growth Strategy Engine (GrowthScorePanel.tsx) ────────────────────────────────
// Hook & retention · Comment-to-DM lead magnet · niche SEO. Scored locally (growthScore.ts),
// refined on demand through /api/agent-generate · action:"growth-optimize".

import type { HookOption, HookPattern } from './agentTypes';
import type { NewsTopic } from './newsAgentTypes';

export type { HookOption, HookPattern };

export type GrowthKind = 'carousel' | 'reel' | 'post';

/** Everything the Growth panel scores and refines, flattened from whichever workspace hosts it. */
export interface GrowthContent {
  kind: GrowthKind;
  /** Stable across edits (article / deck source id) — keys the persisted growth pack. */
  contentKey: string;
  topic: NewsTopic;
  title: string;
  /** The opener: the cover headline (carousel) or the spoken first line (reel). */
  hook: string;
  /** Hook alternatives synthesis already produced, if any. */
  hookOptions: HookOption[];
  /** Body units in order: content-slide paragraphs or scene voiceovers. */
  units: string[];
  /** Reels only: on-screen text per scene — Instagram reads it (OCR) for search. */
  onScreen?: string[];
  /** The caption the host would publish without the growth layer. */
  caption: string;
  /** Closing CTA copy (deck CTA slide / reel cta). */
  cta: string;
  /** Total slides or scenes, including cover and CTA. */
  unitCount: number;
}

/** The "Engagement Trigger" setting — the operator's Comment-to-DM configuration. */
export interface EngagementTrigger {
  /** Put the lead-magnet CTA into the caption. Off by default: switch it on only once a ManyChat
   *  (or native DM) flow exists for the keyword — otherwise commenters are promised nothing. */
  enabled: boolean;
  /** Trigger word override; '' lets the engine pick one. */
  keyword: string;
  /** What the DM delivers; '' lets the engine derive one from the content. */
  deliverable: string;
  /** Where the DM button points — e.g. a ManyChat guide link from Carousel Studio. */
  link: string;
}

/** Mirrors src/server/igGrowthStrategy.ts's LeadMagnet. */
export interface LeadMagnet {
  keyword: string;
  triggerVariants: string[];
  deliverable: string;
  captionCta: string;
  publicReplies: string[];
  dmMessage: string;
  dmButtonLabel: string;
}

export interface GrowthPack {
  leadMagnet: LeadMagnet;
  hashtags: string[];
  nicheHashtags: string[];
  broadHashtags: string[];
  seoKeywords: string[];
  /** true = Gemini; false = the deterministic playbook fallback. */
  synthesized: boolean;
  fallbackReason?: string;
  createdAt: number;
}

export type GrowthDimension = 'hook' | 'save' | 'comment' | 'seo';
export type GrowthLevel = 'weak' | 'ok' | 'strong';
export type GrowthAction = 'punchier-hook' | 'cheat-sheet' | 'lead-magnet' | 'seo-pack';

export interface DimensionScore {
  id: GrowthDimension;
  score: number;
  level: GrowthLevel;
  /** What already works. */
  positives: string[];
  /** What is missing — the raw material for the recommendations. */
  gaps: string[];
}

export interface GrowthRecommendation {
  id: string;
  dimension: GrowthDimension;
  text: string;
  /** The one-click refine that fixes it, when there is one. */
  action?: GrowthAction;
}

export interface GrowthReport {
  overall: number;
  level: GrowthLevel;
  dimensions: DimensionScore[];
  recommendations: GrowthRecommendation[];
}

export const DIMENSION_META: Record<GrowthDimension, { label: string; hint: string }> = {
  hook: { label: 'עוצמת ה-Hook', hint: '3 השניות הראשונות — הפרעת דפוס + משפט חד' },
  save: { label: 'פוטנציאל שמירה', hint: 'צעדים, צ׳קליסט ופרומפטים — סיבה לחזור לפוסט' },
  comment: { label: 'טריגר תגובה', hint: 'CTA מגנט לידים עם מילת טריגר ל-DM' },
  seo: { label: 'חיפוש ו-SEO', hint: 'האשטגים משולבים + מילות מפתח לחיפוש באינסטגרם' },
};

export const HOOK_PATTERN_META: Record<HookPattern, { label: string }> = {
  number: { label: 'מספר מפתיע' },
  contrarian: { label: 'נגד האינטואיציה' },
  risk: { label: 'סיכון / טעות' },
  result: { label: 'התוצאה קודם' },
  question: { label: 'שאלה חדה' },
  myth: { label: 'שבירת מיתוס' },
};

export const LEVEL_META: Record<GrowthLevel, { label: string; text: string; bar: string }> = {
  weak: { label: 'חלש', text: 'text-amber-300', bar: 'bg-amber-400' },
  ok: { label: 'סביר', text: 'text-sky-300', bar: 'bg-sky-400' },
  strong: { label: 'חזק', text: 'text-brand-300', bar: 'bg-brand-500' },
};
