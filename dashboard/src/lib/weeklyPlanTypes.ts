/**
 * Duplicate of src/agent/WeeklyPlanEngine.ts's types on the main site — this dashboard is a fully
 * separate npm project, so it can't import across that boundary. Same convention as
 * dashboard/src/lib/agentTypes.ts. Keep in sync by hand if the shape changes.
 */

export type WeeklyTopic = 'ai-agents' | 'wifi7-networking' | 'cybersecurity' | 'automation';
export type WeeklyPlatform = 'instagram-reels' | 'tiktok' | 'linkedin' | 'youtube-shorts';
export type ContentStatus = 'draft' | 'approved' | 'scheduled';

export const WEEKLY_TOPIC_LABEL: Record<WeeklyTopic, string> = {
  'ai-agents': 'סוכני AI',
  'wifi7-networking': 'רשתות ארגוניות / Wi-Fi 7',
  cybersecurity: 'אבטחת סייבר',
  automation: 'אוטומציה',
};

export const WEEKLY_PLATFORM_LABEL: Record<WeeklyPlatform, string> = {
  'instagram-reels': 'Instagram Reels',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  'youtube-shorts': 'YouTube Shorts',
};

export const STATUS_LABEL: Record<ContentStatus, string> = {
  draft: 'טיוטה',
  approved: 'אושר',
  scheduled: 'מתוזמן',
};

export interface SecurityCheckResult {
  passed: boolean;
  flags: string[];
  badge: string;
}

export interface DailyVideoScript {
  hook: string;
  body: string;
  cta: string;
  visualCues: string[];
}

export interface DailyContentPlan {
  dayIndex: number;
  day: string;
  topic: WeeklyTopic;
  platform: WeeklyPlatform;
  postText: string;
  hashtags: string[];
  videoScript: DailyVideoScript;
  status: ContentStatus;
  security: SecurityCheckResult;
}

export interface WeeklyPlan {
  id: string;
  generatedAt: number;
  days: DailyContentPlan[];
}
