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
