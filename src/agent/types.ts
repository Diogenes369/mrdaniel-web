/**
 * Shared types for the Social Agent module. This file is duplicated (not imported) into
 * `dashboard/src/lib/agentTypes.ts` — the admin dashboard is a fully separate npm project (its own
 * package.json/node_modules, no shared workspace), so it can't import across the project boundary.
 * Both copies describe the same Firebase Realtime Database schema; keep them in sync by hand if
 * this shape changes, the same convention already used for `LeadRecord`/`TrackedEvent` between
 * `src/lib/tracker.ts` and `dashboard/src/lib/types.ts`.
 */

export type AgentMode = 'auto-pilot' | 'semi-auto' | 'standby';

export type LeadIntent = 'low' | 'medium' | 'high';

export type QueueItemStatus = 'pending_approval' | 'approved' | 'rejected' | 'handed-off';

export type QueueItemKind = 'content' | 'engagement';

export type Platform = 'tiktok' | 'instagram' | 'linkedin';

export type ContentFormat = 'post' | 'carousel' | 'video-script';

export interface SecurityCheckResult {
  /** False if the output was blocked outright (never surfaced to the queue). */
  passed: boolean;
  /** Human-readable flags explaining what the guard caught, e.g. "unverified-claim", "pii-leak". */
  flags: string[];
  /** The badge string to display next to a passed item, e.g. "Zero-Trust Security Verified 🛡️". */
  badge: string;
}

/** One beat of a short-form video script — on-screen text is what the media renderer turns into a
 * frame; voiceover is what the admin (or a TTS/captioning tool downstream) actually speaks/reads. */
export interface VideoScriptScene {
  onScreenText: string;
  voiceover: string;
}

export interface VideoScript {
  hook: string;
  scenes: VideoScriptScene[];
  cta: string;
  estimatedSeconds: number;
}

/** One beat of an article-grounded Reel/Reels script (dashboard "תסריט לרילס" — NewsContentAgent),
 * distinct from the topic-driven `VideoScript`/auto-pilot queue pipeline above: this one is
 * synthesized on demand from a selected news item's real text, and additionally carries a
 * `mediaPrompt` per scene for a future image/video-generation call. */
export interface ReelScriptScene {
  onScreenText: string;
  voiceover: string;
  /** Visual-generation prompt for this scene (English, photography-spec'd) — not yet consumed by
   * any image/video-generation API call, same "prompt only, no generation" boundary as
   * `GeneratedContentItem.imageGenerationPrompt`. */
  mediaPrompt: string;
}

/** The six opener shapes the hook engine writes in (see HOOK_RETENTION_RULES in SocialAgentEngine.ts). */
export type HookPattern = 'number' | 'contrarian' | 'risk' | 'result' | 'question' | 'myth';

/** One first-3-seconds opener: what the viewer SEES (a visual pattern interrupt) plus what they
 * READ/HEAR. Carousels use `line` as the cover headline; reels use it as the spoken + on-screen
 * opener. Mirrored in dashboard/src/lib/agentTypes.ts. */
export interface HookOption {
  line: string;
  visual: string;
  pattern: HookPattern;
}

export interface ReelScript {
  /** 1–2 second opening line — must stop the scroll on its own. */
  hook: string;
  /** Three alternative openers, strongest first — `hook` is normally a copy of the first. Optional:
   * a deterministic fallback reel, or a model that skipped the field, simply has none. */
  hookOptions?: HookOption[];
  scenes: ReelScriptScene[];
  cta: string;
}

/** Structural spec for one visual preview frame — NOT a rendered image/video file. The dashboard's
 * MediaPreviewCard turns this into an actual HTML/CSS card (real Heebo/Rubik Google Fonts, brand
 * colors, correct aspect ratio). There is no video/image file generation anywhere in this module —
 * see the "Media & Video Template Pipeline" note in SocialAgentEngine.ts for why that's a
 * deliberate scope boundary, same reasoning as the "no live posting" boundary from the previous
 * agent build. */
export interface MediaFrameSpec {
  headline: string;
  subtext?: string;
  frameIndex: number;
  totalFrames: number;
  accent: 'brand' | 'blue' | 'cyan';
}

export interface GeneratedContentItem {
  id: string;
  kind: 'content';
  platform: Platform;
  format: ContentFormat;
  topic: string;
  /** Post body for a single post, the slide-by-slide outline for a carousel, or a flattened
   * human-readable transcript for a video-script (kept for search/copy convenience even when
   * `videoScript` also carries the structured version). */
  body: string;
  /** Present only when `format === 'carousel'` — one entry per slide. */
  carouselSlides?: string[];
  /** Targeted hashtags the model returns on every generation (see SocialAgentEngine.ts's mandatory
   * "האשטגים:" line) — kept separate from `body` so the dashboard can render/copy them distinctly,
   * same convention already used by WeeklyPlanEngine's DailyContentPlan.hashtags. */
  hashtags?: string[];
  /** Present only when `format === 'video-script'`. */
  videoScript?: VideoScript;
  /** Visual preview frames — always present, computed by MediaTemplateRenderer.ts regardless of
   * format (1 frame for a post, one per slide for a carousel, one per scene for a video-script). */
  mediaPreview: MediaFrameSpec[];
  /** Hyper-realistic photography prompt for a future real image-generation model — always present,
   * generated by SocialAgentEngine.ts's generateImageGenerationPrompt for every item regardless of
   * platform/format. Never abstract 3D/digital-brain/cartoonish "AI art"; always enterprise
   * IT/Cyber/AI photography (real server racks, workstations, SOC/NOC rooms) matched to the item's
   * actual content, with hyper-realistic photography specs baked in (35mm, Sony A7R IV, 8k, natural
   * lighting, shallow depth of field). Not yet consumed by any image-generation API call. */
  imageGenerationPrompt: string;
  status: QueueItemStatus;
  security: SecurityCheckResult;
  createdAt: number;
}

export interface EngagementDraftItem {
  id: string;
  kind: 'engagement';
  query: string;
  intent: LeadIntent;
  intentScore: number;
  intentReasons: string[];
  draftMessage: string;
  status: QueueItemStatus;
  security: SecurityCheckResult;
  createdAt: number;
}

export type QueueItem = GeneratedContentItem | EngagementDraftItem;

export interface AgentWebhookConfig {
  whatsapp?: string;
  telegram?: string;
}

export interface AgentConfig {
  mode: AgentMode;
  updatedAt: number;
  webhooks?: AgentWebhookConfig;
  lastAutoPilotRun?: number;
  /** Rolling window of the admin's most recent freeform WhatsApp notes (newest last, capped at
   * STRATEGIC_CONTEXT_LIMIT in firebaseServer.ts) — appended to every generation system
   * instruction so "focus more on Web3 this week" said over WhatsApp actually steers the next
   * pieces of content, not just logged and ignored. */
  strategicContext?: string[];
}

export interface LeadScoreResultShape {
  intent: LeadIntent;
  score: number;
  reasons: string[];
}

export const LEAD_INTENT_LABEL: Record<LeadIntent, string> = {
  low: 'עניין נמוך',
  medium: 'עניין בינוני',
  high: 'עניין גבוה',
};

export const AGENT_MODE_LABEL: Record<AgentMode, string> = {
  'auto-pilot': 'טייס אוטומטי',
  'semi-auto': 'חצי-אוטומטי (דורש אישור)',
  standby: 'המתנה',
};

export const QUEUE_STATUS_LABEL: Record<QueueItemStatus, string> = {
  pending_approval: 'ממתין לאישור',
  approved: 'אושר',
  rejected: 'נדחה',
  'handed-off': 'הועבר',
};

export const PLATFORM_LABEL: Record<Platform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
};

export const CONTENT_FORMAT_LABEL: Record<ContentFormat, string> = {
  post: 'פוסט',
  carousel: 'קרוסלה',
  'video-script': 'תסריט וידאו',
};

export type VideoProvider = 'veo' | 'runway' | 'heygen' | 'replicate' | 'kling';
export type VideoJobStatus = 'processing' | 'done' | 'error';

/** One AI video-generation attempt for a given video script. Lives at `video_jobs/{id}` — separate
 * from `agent_queue` since a queue item's video is generated on-demand, well after the item itself
 * was created, and the job needs to survive across multiple stateless serverless invocations while
 * the provider renders (see VideoGenerationEngine.ts's start/poll split). `providerState` is opaque
 * outside that engine (e.g. a Veo long-running operation object, a Runway/Replicate/HeyGen job id)
 * and only round-trips through Firebase so the next poll can resume it. */
export interface VideoJob {
  id: string;
  provider: VideoProvider;
  status: VideoJobStatus;
  aspectRatio: '9:16' | '16:9';
  createdAt: number;
  updatedAt: number;
  providerState?: Record<string, unknown>;
  videoDataUrl?: string;
  mimeType?: string;
  error?: string;
}

// --- Tech Tips & Motion Studio ------------------------------------------------------------
/** One slide of an educational dev-tip deck (dashboard "טיפים ומדריכים"). Distinct from the
 * marketing-oriented CarouselStudio deck: these are teaching slides — concepts, real code
 * snippets, numbered steps, tool round-ups — aimed at developers/practitioners. */
export type TipSlideKind = 'cover' | 'concept' | 'code' | 'step' | 'tool' | 'takeaway' | 'cta';

export interface TechTipSlide {
  kind: TipSlideKind;
  /** short section tag for the slide's top bar */
  kicker: string;
  title: string;
  /** explanation paragraph (concept / step / takeaway) */
  body: string;
  /** list items for `tool` / `takeaway` slides */
  bullets: string[];
  /** real, runnable snippet for `code` slides — plain source, no markdown fence */
  code: string;
  /** language hint driving syntax highlighting: python | ts | js | bash | json | '' */
  codeLang: string;
  /** 1-based ordinal for `step` slides, 0 when not a step */
  stepNumber: number;
  /** English visual brief for the free image generator that paints this slide's backdrop */
  visualPrompt: string;
}

export interface TechTipDeck {
  title: string;
  slides: TechTipSlide[];
  hashtags: string[];
}
