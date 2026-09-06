/**
 * Single source of truth for the `x-admin-secret` header sent to /api/* on the main site.
 *
 * Resolution order:
 *   1. `localStorage.adminSecret` — set at runtime, survives a secret rotation with no rebuild.
 *   2. `VITE_ADMIN_API_SECRET` — inlined at build time.
 *
 * localStorage is preferred deliberately. A `VITE_`-prefixed value is baked into the JS bundle in
 * clear text, so anyone who can load the dashboard can read the admin secret; storing it per
 * browser keeps it out of the shipped artifact. The env fallback stays only so existing builds
 * that already set it keep working.
 *
 * Every module here previously read `import.meta.env.VITE_ADMIN_API_SECRET` on its own, so when
 * that var was unset (which it was on the dashboard project) all fifteen of them silently omitted
 * the header and every call returned 401.
 */

const ENV_SECRET = (import.meta.env.VITE_ADMIN_API_SECRET as string | undefined) || '';

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
}

/** Spread into a fetch `headers` object. Empty when no secret is configured. */
export function adminHeaders(): Record<string, string> {
  const secret = getAdminSecret();
  return secret ? { 'x-admin-secret': secret } : {};
}

/** True when a secret is available from either source — for UI status. */
export function hasAdminSecret(): boolean {
  return Boolean(getAdminSecret());
}
