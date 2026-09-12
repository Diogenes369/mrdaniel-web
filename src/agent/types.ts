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

/**
 * Subject family a deck belongs to, assigned by the Threads agent from the source thread's own
 * words (`src/server/agents/threadsThreadAgent.ts`). It drives the accent colour, the topic badge
 * and the CTA guide — so a Gemini thread and a ransomware thread do not render identically.
 */
export type ThreadTheme = 'ai' | 'automation' | 'security' | 'code' | 'data' | 'web3' | 'general';

/**
 * A tool the slide actually talks about, detected from the source thread's own words.
 *
 * Drives the vector logo mark drawn on the slide and the backdrop's glow colour, so a Gemini deck
 * reads purple/cyan and a ChatGPT deck reads emerald without any per-deck configuration. The marks
 * are drawn as canvas paths (see TOOL_MARKS in dashboard/src/lib/techTipRenderer.ts) — no external
 * SVG fetch, which would taint the export canvas.
 */
export type ToolBrand =
  | 'gemini'
  | 'chatgpt'
  | 'claude'
  | 'canva'
  | 'notebooklm'
  | 'make'
  | 'n8n'
  | 'perplexity'
  | 'copilot'
  | 'workspace'
  | 'veo'
  | 'midjourney'
  | 'glm';

/** Hand-drawn accent painted over the slide — the creator-deck signature. */
export type ScribbleKind = 'underline' | 'circle' | 'arrow' | 'none';

/**
 * A service a workflow node stands for. Deliberately a closed set: each one has a vector mark and a
 * brand colour in the renderer's NODE_STYLE table, so a diagram is drawn entirely from paths and
 * never fetches a logo — an external image would taint the export canvas.
 */
export type NodeIcon =
  | 'webhook'
  | 'openai'
  | 'gmail'
  | 'calendar'
  | 'apify'
  | 'crm'
  | 'make'
  | 'n8n'
  | 'filter'
  | 'router'
  | 'scheduler'
  | 'chat'
  | 'phone'
  | 'globe'
  | 'doc'
  | 'sheet'
  | 'db';

/**
 * One node in a workflow diagram.
 *
 * `label` is the step in Hebrew and is drawn RTL. `sublabel` is the SERVICE — "OpenAI Realtime",
 * "Email (Gmail)" — and is drawn LTR and never translated: it names a product the reader has to
 * find in their own automation tool.
 */
export interface WorkflowNode {
  label: string;
  sublabel?: string;
  icon: NodeIcon;
  /**
   * Which row the node sits in. 0 (or absent) is the trunk, running left to right. 1 and up are
   * fan-out branches that all start after the LAST trunk node — which is the shape a real
   * automation diagram has: a trigger and an agent, then several parallel outcomes.
   */
  lane?: number;
}

/** The dark "HOW TO INSTALL" container at the foot of a cream-preset slide. */
export interface InstallBlock {
  /** The path the file is saved to, e.g. `.claude/commands/tdd.md`. Drawn LTR, verbatim. */
  saveAs?: string;
  /** The command that runs it, e.g. `/tdd`. Drawn LTR, verbatim. */
  run?: string;
}

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

  // --- Threads agent extensions -------------------------------------------------------------
  // All optional, all additive: a deck from any other producer (Tech Tips, the local fallbacks)
  // simply leaves them undefined and every renderer falls back to its existing behaviour.

  /** Subject family, for the accent colour and typography accents. Defaults to 'general'. */
  theme?: ThreadTheme;
  /** Short topic chip drawn in the top bar, e.g. "Gemini AI" — Latin brand names stay Latin. */
  badge?: string;
  /** Sub-post progress, pre-formatted as `"2 / 7"`. Drawn in place of the deck-wide slide index. */
  stepLabel?: string;
  /**
   * A prompt lifted verbatim out of the source thread, shown in its own dark copyable container.
   * Kept apart from `code`: a prompt is prose to paste into a model, not source to run, and it is
   * highlighted and framed differently.
   */
  promptBox?: string;
  /** An image from the original Thread post, already same-origin-proxied. Painted as the backdrop
   *  in place of a generated one. */
  sourceImage?: string;
  /** Absolute link the CTA slide promotes, e.g. `https://mrdaniel.co.il/g/<slug>`. */
  ctaUrl?: string;

  // --- creator design engine ----------------------------------------------------------------

  /** The tool this slide is about. Paints its vector mark and tints the backdrop glow. */
  tool?: ToolBrand;
  /**
   * The exact UI path the thread told the reader to walk, already split: `['Tools','Canvas']`.
   * Drawn as an LTR breadcrumb of chips — product menu labels are never translated, so a reader
   * can follow them against the real interface.
   */
  workflowPath?: string[];
  /** Hand-drawn accent for this slide. Assigned in code from the slide's role, not by the model. */
  scribble?: ScribbleKind;
  /**
   * Forbids a searched/generated photo on this slide — the backdrop stays the procedural dark
   * gradient. Set on every technical slide (prompt, code, workflow, tool), because a stock photo
   * behind a prompt box is the single strongest tell that a deck was assembled rather than made.
   * An image the thread itself published is NOT a stock photo and still renders.
   */
  noPhoto?: boolean;

  // --- cream & terracotta preset --------------------------------------------------------------
  // Also optional and additive: a deck that sets none of them renders exactly as before, and the
  // dark presets ignore them entirely.

  /**
   * The slash command, CLI invocation or file the slide teaches — `/tdd`, `npm run build`.
   *
   * Kept OUT of `title` on purpose. It is drawn as its own oversized LTR headline in a mono face,
   * and a Hebrew title string carrying a Latin command in the middle gets bidi-reordered on the
   * canvas, which is exactly how "/tdd" ends up rendering as "tdd/".
   */
  slashCommand?: string;
  /** One short Hebrew line between the headline and the body, drawn in the accent colour. */
  subtitle?: string;
  /** The dark install container. Rendered only when at least one of its fields is set. */
  install?: InstallBlock;
  /** The node flowchart this slide is about. Drives the `workflow-nodes` preset. */
  workflow?: WorkflowNode[];
}

export interface TechTipDeck {
  title: string;
  slides: TechTipSlide[];
  hashtags: string[];
}
