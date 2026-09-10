/** True in local dev, or on any page loaded with `?debug=true` — gates both the eruda console
 * below and the Scene3D/scroll diagnostic logging in SceneObjects.tsx, so a normal visitor's
 * console (and bundle) is never touched by either. */
export function isDebugMode(): boolean {
  if (typeof window === 'undefined') return false;
  return import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');
}

/** On-screen mobile debug console (eruda) — for diagnosing the iOS-only frozen-background report
 * directly on a real iPhone, where there's no way to tether a desktop Web Inspector. Dynamically
 * imported (its own code-split chunk, ~280KB) so it never ships to a normal visitor — only loads
 * when explicitly requested via `?debug=true`, or always in local dev. */
export function initDebugConsoleIfRequested() {
  if (!isDebugMode()) return;

  import('eruda')
    .then(({ default: eruda }) => {
      eruda.init();
      console.info('[debug] eruda console initialized — open the floating button to inspect logs/network/elements.');
    })
    // A debug aid that fails to load is not worth an unhandled rejection in the page.
    .catch((err) => console.warn('[debug] eruda failed to load:', err));
}
