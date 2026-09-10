/**
 * The one lazy loader for the analytics module.
 *
 * The tracker pulls in the Firebase SDK (~200KB gzipped), so it is code-split behind a dynamic
 * import rather than a static one and never bloats the bundle every visitor downloads. Three
 * components each had their own identical copy of that loader, and all three shared two faults:
 *
 *   1. `loadTracker().then(...)` was called at 14 sites with no `.catch()`. A dynamic import
 *      rejects for entirely ordinary reasons — an ad-blocker matching "tracker" in the chunk name,
 *      an offline visitor, a stale index.html pointing at a chunk a new deploy replaced — and each
 *      of those became an unhandled promise rejection in a visitor's browser.
 *   2. The rejected promise was cached, so one transient failure meant every later call rejected
 *      too: tracking stayed dead for the rest of the session and each attempt raised another
 *      unhandled rejection.
 *
 * Analytics is best-effort by nature; it must never be able to surface an error to a visitor. So
 * this resolves to a no-op module on failure (callers need no `.catch()` and no null check) and
 * drops the cached promise so a later call can retry a load that failed transiently.
 */

type TrackerModule = typeof import('./tracker');

/** Every tracker export, as a no-op — returned when the real chunk cannot be loaded. */
const NOOP_TRACKER: TrackerModule = {
  initTracker: () => {},
  trackPageview: () => {},
  trackConversion: () => {},
  trackFormInteraction: () => {},
  trackChatOpen: () => {},
  trackChatQuery: () => {},
  trackLead: () => {},
} as unknown as TrackerModule;

let trackerPromise: Promise<TrackerModule> | null = null;

export function loadTracker(): Promise<TrackerModule> {
  if (!trackerPromise) {
    trackerPromise = import('./tracker').catch((err) => {
      // Not cached as a failure: clearing it lets the next call retry, which matters when the
      // cause was a dropped connection rather than a blocked request.
      trackerPromise = null;
      console.warn('[tracker] analytics chunk failed to load; continuing without it:', err);
      return NOOP_TRACKER;
    });
  }
  return trackerPromise;
}
