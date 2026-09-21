/**
 * Duplicate of src/agent/types.ts on the main site — this dashboard is a fully separate npm
 * project (its own package.json/node_modules), so it can't import across that boundary. Both
 * copies describe the same Firebase Realtime Database schema (`agent_config`, `agent_queue`);
 * keep them in sync by hand if the shape changes, same convention already used for
 * `LeadRecord`/`TrackedEvent` between the main site's tracker and this file's sibling types.ts.
 */

export type AgentMode = 'auto-pilot' | 'semi-auto' | 'standby';
export type LeadIntent = 'low' | 'medium' | 'high';
export type QueueItemStatus = 'pending_approval' | 'approved' | 'rejected' | 'handed-off';
export type Platform = 'tiktok' | 'instagram' | 'linkedin';
export type ContentFormat = 'post' | 'carousel' | 'video-script';

export interface SecurityCheckResult {
  passed: boolean;
  flags: string[];
  badge: string;
}

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

/** Article-grounded Reel/Reels script (NewsContentAgent's "תסריט לרילס" mode) — mirrors
 * src/agent/types.ts's ReelScript. Distinct from VideoScript above: synthesized on demand from a
 * selected news item's real text, and each scene carries a `mediaPrompt` for a future
 * image/video-generation call. */
export interface ReelScriptScene {
  onScreenText: string;
  voiceover: string;
  mediaPrompt: string;
}

/** Mirrors src/agent/types.ts's HookPattern / HookOption — one first-3-seconds opener: a visual
 * pattern interrupt (`visual`) plus the line itself. Carousels use `line` as the cover headline,
 * reels as the spoken + on-screen opener. */
export type HookPattern = 'number' | 'contrarian' | 'risk' | 'result' | 'question' | 'myth';

export interface HookOption {
  line: string;
  visual: string;
  pattern: HookPattern;
}

export interface ReelScript {
  hook: string;
  /** Three alternative openers, strongest first. Optional — the deterministic fallback reel has none. */
  hookOptions?: HookOption[];
  scenes: ReelScriptScene[];
  cta: string;
}

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
  body: string;
  carouselSlides?: string[];
  hashtags?: string[];
  videoScript?: VideoScript;
  mediaPreview: MediaFrameSpec[];
  /** Hyper-realistic photography prompt for a future real image-generation model — always present.
   * Never abstract 3D/digital-brain/cartoonish "AI art"; always real AI-workspace photography
   * (real server racks, workstations, SOC/NOC rooms) matched to the item's actual content, with
   * hyper-realistic photography specs baked in (35mm, Sony A7R IV, 8k, natural lighting, shallow
   * depth of field). Mirrors src/agent/types.ts — see that file for the generating function. */
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

/** Temporarily disabled per explicit request — video generation had validation/reliability issues
 * across providers, so it's hidden from the UI while all system capabilities focus on posts,
 * carousels, and real image generation instead. Flip back to `true` to restore the "צור וידאו AI"
 * buttons once the video pipeline is revisited; nothing else needs to change. */
export const VIDEO_GENERATION_ENABLED = false;

export type VideoProvider = 'veo' | 'runway' | 'heygen' | 'replicate' | 'kling';
export type VideoJobStatus = 'processing' | 'done' | 'error';

export const VIDEO_PROVIDER_LABEL: Record<VideoProvider, string> = {
  runway: 'Runway קולנועי',
  heygen: 'HeyGen אווטאר',
  replicate: 'Replicate ויזואלי',
  kling: 'KlingAI סצנה',
  veo: 'Google Veo',
};

/** Dropdown order — Runway first per the spec's stated model list order, Veo last since it's the
 * automatic-fallback default rather than a manually-picked external provider. */
export const VIDEO_PROVIDER_OPTIONS: VideoProvider[] = ['runway', 'heygen', 'replicate', 'kling', 'veo'];

/** Mirrors src/agent/types.ts's VideoJob — see that file for why this lives at `video_jobs/{id}`
 * instead of on the queue item / weekly-plan day itself. */
export interface VideoJob {
  id: string;
  provider: VideoProvider;
  status: VideoJobStatus;
  aspectRatio: '9:16' | '16:9';
  createdAt: number;
  updatedAt: number;
  videoDataUrl?: string;
  mimeType?: string;
  error?: string;
}
