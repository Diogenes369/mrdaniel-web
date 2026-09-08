/**
 * Single source of truth for the `x-admin-secret` header sent to the site's /api/* endpoints.
 *
 * Resolution order:
 *   1. `localStorage.adminSecret` — set at runtime, survives a secret rotation with no rebuild.
 *   2. `VITE_ADMIN_API_SECRET` — inlined into the bundle at build time.
 *
 * localStorage comes FIRST for a concrete reason. A `VITE_`-prefixed value is frozen into the
 * bundle when the dashboard is built, so rotating ADMIN_API_SECRET on the site silently invalidates
 * every already-deployed dashboard until someone redeploys it. That is exactly what produced a wave
 * of 401s on /api/agent-generate: the baked value was days older than the secret the API validated
 * against. A runtime override fixes that in one paste, with no redeploy and no rebuild.
 */

const ENV_SECRET = (import.meta.env.VITE_ADMIN_API_SECRET as string | undefined) || '';

/** Fired when the API rejects our credentials, so the UI can prompt instead of failing silently. */
export const ADMIN_AUTH_FAILED_EVENT = 'admin-auth-failed';
/** Fired when a fresh secret has been stored, so pending callers can retry. */
export const ADMIN_AUTH_RESOLVED_EVENT = 'admin-auth-resolved';

export function getAdminSecret(): string {
  try {
    const stored = localStorage.getItem('adminSecret');
    if (stored && stored.trim()) return stored.trim();
  } catch {
    /* private mode / storage blocked — fall through to the build-time value */
  }
  return ENV_SECRET;
}

export function setAdminSecret(secret: string) {
  try {
    localStorage.setItem('adminSecret', secret.trim());
  } catch {
    /* private mode — calls will keep 401ing until storage is available */
  }
  try {
    window.dispatchEvent(new CustomEvent(ADMIN_AUTH_RESOLVED_EVENT));
  } catch {
    /* non-browser context */
  }
}

export function clearAdminSecret() {
  try {
    localStorage.removeItem('adminSecret');
  } catch {
    /* nothing to clear */
  }
}

/** Spread into a fetch `headers` object. Empty when no secret is configured at all. */
export function adminHeaders(): Record<string, string> {
  const secret = getAdminSecret();
  return secret ? { 'x-admin-secret': secret } : {};
}

/** True when a secret is available from either source — for UI status badges. */
export function hasAdminSecret(): boolean {
  return Boolean(getAdminSecret());
}

/** True when the only secret we have is the build-time one, i.e. the value that goes stale. */
export function usingBuildSecret(): boolean {
  try {
    const stored = localStorage.getItem('adminSecret');
    if (stored && stored.trim()) return false;
  } catch {
    /* treat as build secret */
  }
  return Boolean(ENV_SECRET);
}

// ─── re-auth coordination ───────────────────────────────────────────────────────────────────

/**
 * One shared pending re-auth, not one per failed request.
 *
 * A single deck generation fans out into several API calls that all 401 together. Without this
 * funnel the operator got a stack of identical raw "401" toasts and no way to act on any of them;
 * with it they get exactly one prompt, and every waiting caller retries off the same answer.
 */
let pendingReauth: Promise<boolean> | null = null;

/** Announces an auth failure and resolves once a new secret is supplied (or the wait times out). */
export function requestReauth(source = 'api'): Promise<boolean> {
  if (pendingReauth) return pendingReauth;

  pendingReauth = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener(ADMIN_AUTH_RESOLVED_EVENT, onResolved);
      clearTimeout(timer);
      pendingReauth = null;
      resolve(ok);
    };
    const onResolved = () => finish(true);

    // Three minutes is generous enough for the operator to fetch the secret from Vercel, and short
    // enough that a walked-away-from tab does not leave requests hanging forever.
    const timer = setTimeout(() => finish(false), 180_000);

    try {
      window.addEventListener(ADMIN_AUTH_RESOLVED_EVENT, onResolved);
      window.dispatchEvent(new CustomEvent(ADMIN_AUTH_FAILED_EVENT, { detail: { source } }));
    } catch {
      finish(false); // non-browser context: nothing can answer the prompt
    }
  });

  return pendingReauth;
}

/** Fire-and-forget variant for call sites that only want to surface the prompt. */
export function reportAuthFailure(source = 'api') {
  void requestReauth(source);
}

/**
 * Fetch wrapper for the site API: attaches the header, and on 401 raises a single re-auth prompt
 * and retries once with whatever secret the operator supplies.
 */
export async function adminFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const withAuth = (): RequestInit => ({
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), ...adminHeaders() },
  });

  const res = await fetch(input, withAuth());
  if (res.status !== 401) return res;

  const source = String(typeof input === 'string' ? input : (input as URL).toString?.() ?? '');
  const before = getAdminSecret();
  const recovered = await requestReauth(source.includes('agent-generate') ? 'agent-generate' : 'api');

  // Only retry when the secret actually changed — retrying with the same rejected value just
  // produces a second 401 and a second prompt.
  if (recovered && getAdminSecret() !== before) return fetch(input, withAuth());
  return res;
}
