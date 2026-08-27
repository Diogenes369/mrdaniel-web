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
}

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
let lastPath = '';
const scrolledMilestones = new Set<number>();

function baseContext(): EventContext {
  return {
    ts: Date.now(),
    sessionId,
    path: window.location.pathname,
    device: detectDevice(),
    browser: detectBrowser(),
    screen: `${window.screen.width}x${window.screen.height}`,
    referrer: document.referrer || '',
    lang: navigator.language || '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
  };
}

/** Strips `undefined` fields — Firebase's Realtime Database rejects `undefined` values outright
 * (the whole write fails), unlike `JSON.stringify` which just drops them. */
function clean<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function logEvent(type: EventType, extra: Partial<Omit<TrackedEvent, keyof EventContext | 'type'>> = {}) {
  const db = getDb();
  if (!db) return;
  const event: TrackedEvent = clean({ type, ...baseContext(), ...extra });
  push(ref(db, 'events'), event).catch(() => {});
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

  const ctx = baseContext();
  const presenceRef = ref(db, `presence/${sessionId}`);
  set(presenceRef, {
    device: ctx.device,
    browser: ctx.browser,
    path: ctx.path,
    screen: ctx.screen,
    lang: ctx.lang,
    timezone: ctx.timezone,
    referrer: ctx.referrer,
    startedAt: ctx.ts,
  }).catch(() => {});
  onDisconnect(presenceRef).remove();

  lastPath = ctx.path;
  logEvent('session_start');
  pingHealth();
  healthIntervalId = window.setInterval(pingHealth, 30_000);

  setupClickTracking();
  setupHoverTracking();
  setupScrollDepthTracking();

  window.addEventListener('beforeunload', () => {
    if (healthIntervalId !== null) window.clearInterval(healthIntervalId);
    remove(presenceRef).catch(() => {});
  });
}

/** Call on every client-side route change. */
export function trackPageview(path: string) {
  const db = getDb();
  if (!db) return;
  set(ref(db, `presence/${sessionId}/path`), path).catch(() => {});
  scrolledMilestones.clear();
  logEvent('pageview', { fromPath: lastPath || undefined });
  lastPath = path;
}

/** Call for conversion-intent actions — lead form opens, purchase clicks, downloads, etc. */
export function trackConversion(label: string) {
  logEvent('conversion', { label });
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
