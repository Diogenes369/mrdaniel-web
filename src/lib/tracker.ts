import { ref, push, set, remove, onDisconnect } from 'firebase/database';
import { getDb, firebaseConfigured } from './firebaseClient';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

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
  | 'chat_query';

/** Every event carries this shared context — assembled once per event via `baseContext()` rather
 * than requiring every call site to pass it in. */
interface EventContext {
  ts: number;
  sessionId: string;
  path: string;
  device: DeviceType;
  browser: string;
  screen: string;
  referrer: string;
  lang: string;
  timezone: string;
}

interface TrackedEvent extends EventContext {
  type: EventType;
  label?: string;
  elementId?: string;
  href?: string;
  depth?: number;
  field?: string;
  action?: string;
  fromPath?: string;
  /** Guide landing page: which guide. A bridge guideId is cut to 8 hex — see `redactGuideIds`. */
  guide?: string;
  /** Campaign tags from the landing-page URL (ManyChat appends them to the DM link). */
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  keyword?: string;
}

/** Attribution a conversion can carry. */
export type ConversionAttribution = Pick<TrackedEvent, 'guide' | 'action' | 'utmSource' | 'utmMedium' | 'utmCampaign' | 'keyword'>;

export interface LeadPayload {
  name: string;
  email: string;
  phone?: string;
  project?: string;
  sourceSection?: string;
  /** Set when the lead originated from a priced product/agent CTA (not a generic contact ask) —
   * carried through to both the Firebase record and the email body so a lead's exact commercial
   * context is never lost. */
  selectedProduct?: string;
  productCategory?: string;
  price?: number;
  userCompanySize?: string;
  notes?: string;
}

function detectDevice(): DeviceType {
  const w = window.innerWidth;
  if (w < 640) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

/** Coarse, honest UA sniffing — good enough for a "which browser" breakdown, not meant to be
 * airtight (no UA string is, post-UA-reduction). Order matters: Edge/Opera/Chrome all include
 * "Chrome" in their UA, so their own markers must be checked first. */
function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return 'Safari';
  if (/Firefox\//.test(ua)) return 'Firefox';
  return 'Other';
}

const sessionId = firebaseConfigured ? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}` : '';
let started = false;
let healthIntervalId: number | null = null;
let presenceIntervalId: number | null = null;
let lastPath = '';
const scrolledMilestones = new Set<number>();

/** Fixed for the life of the session — every presence write reuses it so "dwell time" on the
 * dashboard is stable, while `lastSeen` (written fresh each time) is what proves the session is
 * still alive. */
const presenceStartedAt = Date.now();
/** IP + edge geo, filled in once by `captureGeo()` and merged into every subsequent presence
 * write so a heartbeat re-write never drops it. */
let geoExtra: Record<string, string> = {};

/**
 * Writes THIS session's full presence record and (re-)arms its `onDisconnect` cleanup. Called on
 * init, on every route change, on a ~25s heartbeat, and when the tab regains focus — so a record
 * that Firebase's `onDisconnect` removed during a background/blip is fully restored (with a fresh
 * `onDisconnect` armed) the moment the tab is active again, and its `lastSeen` never goes stale
 * while the user is really here. A partial `set(presence/<id>/path, …)` is deliberately NOT used:
 * that would resurrect a removed node as a device-less "ghost" that inflates the dashboard count.
 */
function writePresence(): void {
  const db = getDb();
  if (!db || !sessionId) return;
  const presenceRef = ref(db, `presence/${sessionId}`);
  set(
    presenceRef,
    clean({
      device: detectDevice(),
      browser: detectBrowser(),
      path: redactGuideIds(window.location.pathname),
      screen: `${window.screen.width}x${window.screen.height}`,
      lang: navigator.language || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      referrer: redactGuideIds(document.referrer || ''),
      startedAt: presenceStartedAt,
      lastSeen: Date.now(),
      ...geoExtra,
    })
  ).catch(() => {});
  onDisconnect(presenceRef).remove();
}

function baseContext(): EventContext {
  return {
    ts: Date.now(),
    sessionId,
    path: redactGuideIds(window.location.pathname),
    device: detectDevice(),
    browser: detectBrowser(),
    screen: `${window.screen.width}x${window.screen.height}`,
    referrer: redactGuideIds(document.referrer || ''),
    lang: navigator.language || '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
  };
}

/** Strips `undefined` fields — Firebase's Realtime Database rejects `undefined` values outright
 * (the whole write fails), unlike `JSON.stringify` which just drops them. */
function clean<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Cuts every 32-hex guideId in a path or URL down to its first 8 characters. A bridge guideId IS the
 * download capability for its guide (`/g/<id>`), and `events` / `presence` are world-readable under
 * the Realtime Database rules in DOCUMENTATION.md — logging the full path would publish the key next
 * to the lock. 8 hex still tells guides apart in analytics; 32 bits cannot fetch anything.
 */
function redactGuideIds(value: string): string {
  return value.replace(/[a-f0-9]{32}/gi, (id) => `${id.slice(0, 8)}…`);
}

function logEvent(type: EventType, extra: Partial<Omit<TrackedEvent, keyof EventContext | 'type'>> = {}) {
  const db = getDb();
  if (!db) return;
  const event: TrackedEvent = clean({ type, ...baseContext(), ...extra });
  push(ref(db, 'events'), event).catch(() => {});
}

/** Coarsens an IP for storage — v4 → `a.b.c.0`, v6 → first three hextets + `::`. The dashboard
 * only ever needs a rough "who / from where", never the exact address. */
function maskIp(ip: string): string {
  const v = ip.trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) return v.replace(/\.\d{1,3}$/, '.0');
  if (v.includes(':')) return `${v.split(':').slice(0, 3).join(':')}::`;
  return v;
}

function pingHealth() {
  const db = getDb();
  if (!db) return;
  const start = performance.now();
  fetch('/api/health', { cache: 'no-store' })
    .then(() => {
      const latencyMs = Math.round(performance.now() - start);
      set(ref(db, 'health/latest'), { latencyMs, ts: Date.now() }).catch(() => {});
    })
    .catch(() => {});
}

/** One-shot: read this visitor's IP + edge geo from `/api/health` (same-origin, so the Vercel
 * `x-vercel-ip-*` headers describe THIS visitor), stash it in `geoExtra`, and re-write presence so
 * it lands on the record. IP is masked before it's written. Goes through `writePresence()` (a full
 * `set`, not a partial `update`) so it can't recreate a device-less ghost node. */
function captureGeo() {
  if (!getDb() || !sessionId) return;
  fetch('/api/health', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d) return;
      geoExtra = clean({
        ip: typeof d.ip === 'string' && d.ip ? maskIp(d.ip) : undefined,
        countryCode: typeof d.country === 'string' && d.country ? d.country : undefined,
        region: typeof d.countryRegion === 'string' && d.countryRegion ? d.countryRegion : undefined,
        city: typeof d.city === 'string' && d.city ? d.city : undefined,
      }) as Record<string, string>;
      if (started) writePresence();
    })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// Passive, site-wide interaction tracking — no per-component instrumentation
// needed for clicks/outbound-links/scroll depth. Labels are derived from
// whatever's already on the element (aria-label, visible text, title), which
// this codebase already uses pervasively for accessibility, so it doubles as
// a decent analytics label for free.
// ---------------------------------------------------------------------------

function labelFor(el: Element): string | undefined {
  const aria = el.getAttribute('aria-label');
  if (aria) return aria.trim().slice(0, 80);
  const trackLabel = el.getAttribute('data-track-label');
  if (trackLabel) return trackLabel.trim().slice(0, 80);
  const title = el.getAttribute('title');
  if (title) return title.trim().slice(0, 80);
  const text = el.textContent?.trim().replace(/\s+/g, ' ');
  if (text) return text.slice(0, 80);
  return undefined;
}

function isOutbound(href: string): boolean {
  try {
    const url = new URL(href, window.location.href);
    return url.origin !== window.location.origin && !href.startsWith('mailto:') && !href.startsWith('tel:');
  } catch {
    return false;
  }
}

function setupClickTracking() {
  document.addEventListener(
    'click',
    (e) => {
      const target = (e.target as Element | null)?.closest('a, button, [role="button"], [data-track-label]');
      if (!target) return;
      const label = labelFor(target);
      const elementId = target.id || undefined;

      if (target.tagName === 'A') {
        const href = (target as HTMLAnchorElement).href;
        if (href && isOutbound(href)) {
          logEvent('outbound_link', { label, href, elementId });
          return;
        }
      }
      logEvent('click', { label, elementId });
    },
    { capture: true }
  );
}

/** Elements opted into "interest" tracking via `data-track-interest="label"` (e.g. article/product
 * cards) — a dwell of 1s+ counts as genuine interest rather than a passing cursor sweep. Scoped to
 * opt-in elements rather than every hoverable thing site-wide, to keep the signal meaningful and
 * avoid firing on every nav link as the pointer crosses the page. */
function setupHoverTracking() {
  const HOVER_DWELL_MS = 1000;
  const timers = new WeakMap<Element, number>();

  document.addEventListener(
    'mouseover',
    (e) => {
      const target = (e.target as Element | null)?.closest('[data-track-interest]');
      if (!target || timers.has(target)) return;
      const timerId = window.setTimeout(() => {
        logEvent('hover', { label: target.getAttribute('data-track-interest') ?? labelFor(target) });
        timers.delete(target);
      }, HOVER_DWELL_MS);
      timers.set(target, timerId);
    },
    { capture: true }
  );

  document.addEventListener(
    'mouseout',
    (e) => {
      const target = (e.target as Element | null)?.closest('[data-track-interest]');
      if (!target) return;
      const timerId = timers.get(target);
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
        timers.delete(target);
      }
    },
    { capture: true }
  );
}

/** Fires once per 25/50/75/100% milestone reached, per page — the milestone set resets on every
 * route change (see `trackPageview`). rAF-throttled so the scroll handler itself stays cheap. */
function setupScrollDepthTracking() {
  let ticking = false;
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const doc = document.documentElement;
        const scrollable = doc.scrollHeight - window.innerHeight;
        if (scrollable <= 0) return;
        const pct = Math.min(100, Math.round(((window.scrollY + window.innerHeight) / doc.scrollHeight) * 100));
        for (const milestone of [25, 50, 75, 100]) {
          if (pct >= milestone && !scrolledMilestones.has(milestone)) {
            scrolledMilestones.add(milestone);
            logEvent('scroll_depth', { depth: milestone });
          }
        }
      });
    },
    { passive: true }
  );
}

/** Call once, near app startup. Registers presence (auto-removed via `onDisconnect` the moment
 * the tab closes, so the dashboard's concurrent-user count is always accurate with no polling),
 * starts a 30s health-ping loop, and wires up passive click/hover/scroll-depth tracking. */
export function initTracker() {
  const db = getDb();
  if (!db || started) return;
  started = true;

  const presenceRef = ref(db, `presence/${sessionId}`);
  writePresence();
  captureGeo();

  lastPath = window.location.pathname;
  logEvent('session_start');
  pingHealth();
  healthIntervalId = window.setInterval(pingHealth, 30_000);
  // Heartbeat: refresh `lastSeen` (and re-arm onDisconnect) well inside the dashboard's ~60s
  // freshness window, so a live session is never dropped and any stranded ghost self-expires.
  presenceIntervalId = window.setInterval(writePresence, 25_000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') writePresence();
  });

  setupClickTracking();
  setupHoverTracking();
  setupScrollDepthTracking();

  window.addEventListener('beforeunload', () => {
    if (healthIntervalId !== null) window.clearInterval(healthIntervalId);
    if (presenceIntervalId !== null) window.clearInterval(presenceIntervalId);
    remove(presenceRef).catch(() => {});
  });
}

/** Call on every client-side route change. */
export function trackPageview(path: string) {
  const db = getDb();
  if (!db) return;
  // Full re-write (not a partial `set(.../path)`): heals the record if onDisconnect removed it
  // during a background/blip, re-arms onDisconnect, and refreshes `lastSeen`.
  writePresence();
  scrolledMilestones.clear();
  logEvent('pageview', { fromPath: lastPath || undefined });
  lastPath = redactGuideIds(path);
}

/** Call for conversion-intent actions — lead form opens, purchase clicks, downloads, etc. `extra`
 * carries attribution where a conversion has it (the guide page's guide + campaign tags). */
export function trackConversion(label: string, extra: ConversionAttribution = {}) {
  logEvent('conversion', { label, ...extra, guide: extra.guide ? redactGuideIds(extra.guide) : undefined });
}

/** Call when a form field is engaged with — focus/blur/submit — to see where in a multi-field
 * form visitors hesitate or drop off. `formName` scopes `field` (e.g. "LeadForm" + "email"). */
export function trackFormInteraction(formName: string, field: string, action: 'focus' | 'blur' | 'submit') {
  logEvent('form_interaction', { label: formName, field, action });
}

/** Call when the AI assistant widget is opened. */
export function trackChatOpen() {
  logEvent('chat_open');
}

/** Call when a visitor sends a chat message — stores a short excerpt (not the full message) as
 * a content-interest signal, not a transcript. */
export function trackChatQuery(message: string) {
  logEvent('chat_query', { label: message.trim().slice(0, 80) });
}

/** Writes a captured lead to Firebase as a second, dashboard-visible record of the same lead
 * `/api/leads` already emails — independent of email deliverability, so a lead is still visible
 * in the dashboard even if SMTP has a bad day. Requires a `leads` read/write rule (see
 * dashboard/README.md) — until that's added to the Firebase console, this fails silently (same
 * fire-and-forget contract as every other write in this file) and simply won't appear anywhere. */
export function trackLead(lead: LeadPayload) {
  const db = getDb();
  if (!db) return;
  push(ref(db, 'leads'), clean({ ...lead, ts: Date.now() })).catch(() => {});
}
