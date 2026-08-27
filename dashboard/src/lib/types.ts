export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface PresenceRecord {
  device: DeviceType;
  path: string;
  startedAt: number;
  browser?: string;
  screen?: string;
  lang?: string;
  timezone?: string;
  referrer?: string;
}

export type EventType =
  | 'session_start'
  | 'pageview'
  | 'conversion'
  | 'click'
  | 'outbound_link'
  | 'scroll_depth'
  | 'hover'
  | 'form_interaction'
  | 'chat_open'
  | 'chat_query'
  // Kept for backward compatibility with any already-stored events from before this event set
  // was expanded — never emitted by the current tracker.
  | 'route_change';

export interface TrackedEvent {
  type: EventType;
  device: DeviceType;
  path: string;
  ts: number;
  sessionId?: string;
  browser?: string;
  screen?: string;
  referrer?: string;
  lang?: string;
  timezone?: string;
  label?: string;
  elementId?: string;
  href?: string;
  depth?: number;
  field?: string;
  action?: string;
  fromPath?: string;
}

export interface HealthRecord {
  latencyMs: number;
  ts: number;
}

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'won' | 'lost';

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'חדש',
  contacted: 'נוצר קשר',
  qualified: 'מתעניין רציני',
  won: 'נסגר בהצלחה',
  lost: 'לא רלוונטי',
};

export interface LeadRecord {
  name: string;
  email: string;
  phone?: string;
  project?: string;
  sourceSection?: string;
  ts: number;
  /** Absent on any lead written before this pipeline feature existed — every read site must
   * treat a missing status as 'new', not crash or silently drop the row. */
  status?: LeadStatus;
}

export interface NewsletterSignupRecord {
  email: string;
  source: string;
  ts: number;
}
