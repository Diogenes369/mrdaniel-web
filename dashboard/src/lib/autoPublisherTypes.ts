// Types + option maps for the autonomous Auto-Publisher (AutoPublisherPanel.tsx).

export type APPlatform = 'linkedin' | 'instagram' | 'all';
export type APCategory = 'ai' | 'ai_models' | 'ai_agents' | 'auto';
export type APMode = 'full-auto' | 'drafts';
export type APFrequency = 'daily' | 'twice' | 'custom';

export interface AutoPublisherConfig {
  active: boolean;
  frequency: APFrequency;
  /** UTC hours a cron tick is allowed to post at. Derived from `frequency` for daily/twice. */
  slotsUTC: number[];
  platform: APPlatform;
  category: APCategory;
  mode: APMode;
  publishWebhookUrl: string;
}

export const DEFAULT_SLOTS: Record<Exclude<APFrequency, 'custom'>, number[]> = {
  daily: [9],
  twice: [9, 15],
};

export const DEFAULT_AP_CONFIG: AutoPublisherConfig = {
  active: false,
  frequency: 'daily',
  slotsUTC: DEFAULT_SLOTS.daily,
  platform: 'linkedin',
  category: 'auto',
  mode: 'drafts',
  publishWebhookUrl: '',
};

export const FREQUENCY_LABEL: Record<APFrequency, string> = {
  daily: '1× ביום (מומלץ)',
  twice: '2× ביום',
  custom: 'שעות מותאמות',
};

export const PLATFORM_LABEL: Record<APPlatform, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  all: 'הכל',
};

export const CATEGORY_LABEL: Record<APCategory, string> = {
  ai: 'בינה מלאכותית',
  ai_models: 'מודלי AI',
  ai_agents: 'סוכני AI',
  auto: 'רוטציה אוטומטית',
};

export const MODE_LABEL: Record<APMode, string> = {
  'full-auto': 'פרסום אוטומטי מלא',
  drafts: 'תור לאישור (טיוטות)',
};

export type PublishStatus = 'success' | 'failed' | 'pending_approval';

export interface PublishedPostRecord {
  newsId: string;
  newsTitle: string;
  newsLink: string;
  category: string;
  topic: string;
  platform: string;
  imageUrl: string;
  caption: string;
  hashtags: string[];
  status: PublishStatus;
  detail?: string;
  mode: string;
  slotKey: string;
  createdAt: number;
}

export const STATUS_META: Record<PublishStatus, { label: string; className: string }> = {
  success: { label: 'פורסם', className: 'text-brand-300 border-brand-500/40 bg-brand-500/10' },
  pending_approval: { label: 'ממתין לאישור', className: 'text-amber-300 border-amber-500/40 bg-amber-500/10' },
  failed: { label: 'נכשל', className: 'text-red-300 border-red-500/40 bg-red-500/10' },
};
