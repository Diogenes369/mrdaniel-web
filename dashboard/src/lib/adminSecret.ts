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

// ─── header safety ──────────────────────────────────────────────────────────────────────────

/**
 * An HTTP header value is a ByteString: every code unit must be <= 0xFF. Hand `fetch()` a string
 * with anything above that and it throws a synchronous TypeError ("Cannot convert argument to a
 * ByteString...") before a request is ever made — which is not a rejected promise most call sites
 * are built to catch, so it surfaced as an uncaught error and a dead dashboard rather than a 401.
 *
 * The realistic way a bad value gets in is a paste: copying ADMIN_API_SECRET out of a Hebrew/RTL
 * admin panel or a chat message can carry invisible direction marks along with it, and pasting the
 * wrong clipboard entry entirely puts real Hebrew in there.
 */

/**
 * Invisible formatting characters that ride along on an RTL copy-paste — zero-width space/joiners,
 * LRM/RLM and their siblings, word joiner, BOM. They carry no data and cannot be part of an
 * intended secret, so they are stripped as a repair. Note U+200F and friends are above 0xFF, so
 * a single stray direction mark is enough to crash fetch() on its own.
 */
const INVISIBLE_MARKS = /[​-‏⁠﻿]/g;

/**
 * Anything that still cannot ride in a header after the repair: code points above 0xFF, and the
 * C0/DEL control characters browsers reject outright (a CR or LF would be header injection).
 *
 * Deliberately NOT rejected: 0x80-0xFF. `fetch()` accepts those, so a secret that contains one
 * works today, and refusing it here would break a working install to guard a crash that cannot
 * happen.
 */
const UNSENDABLE = /[^ -~ -ÿ]/;

/** What a stored/pasted secret is, once repaired. */
export interface SecretCheck {
  /** Safe to put straight into a header. '' when the value cannot be sent at all. */
  value: string;
  ok: boolean;
  /** True when the value is non-empty but unsendable — the case worth telling the operator about. */
  unsendable: boolean;
  /** The offending characters, as escapes, for an operator-facing message. */
  offenders: string;
}

/** Repair the invisible artifacts, then report whether what is left can go in a header. */
export function inspectSecret(raw: string): SecretCheck {
  const value = (raw || '').replace(INVISIBLE_MARKS, '').trim();
  if (!value) return { value: '', ok: false, unsendable: false, offenders: '' };

  const bad = [...value].filter((ch) => UNSENDABLE.test(ch));
  if (bad.length) {
    const offenders = [...new Set(bad)]
      .slice(0, 5)
      .map((ch) => `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`)
      .join(', ');
    return { value: '', ok: false, unsendable: true, offenders };
  }
  return { value, ok: true, unsendable: false, offenders: '' };
}

// One warning per distinct bad value, not one per API call — a single deck generation fans out
// into a dozen requests and they would all report the same thing.
let warnedFor = '';

function usableSecret(raw: string): string {
  const check = inspectSecret(raw);
  if (check.unsendable && raw !== warnedFor) {
    warnedFor = raw;
    console.warn(
      `[adminSecret] the stored secret contains characters that cannot be sent in an HTTP header (${check.offenders}); ` +
        'sending the request without it so the API answers 401 and the re-auth prompt can explain, ' +
        'instead of crashing fetch(). Re-paste ADMIN_API_SECRET to fix.'
    );
  }
  return check.value;
}

/** Fired when the API rejects our credentials, so the UI can prompt instead of failing silently. */
export const ADMIN_AUTH_FAILED_EVENT = 'admin-auth-failed';
/** Fired when a fresh secret has been stored, so pending callers can retry. */
export const ADMIN_AUTH_RESOLVED_EVENT = 'admin-auth-resolved';

export function getAdminSecret(): string {
  try {
    const stored = localStorage.getItem('adminSecret');
    if (stored && stored.trim()) {
      // A stored value that cannot go in a header yields '' here, so the request goes out
      // unauthenticated and comes back 401 — which the re-auth prompt already knows how to
      // handle. That is strictly better than letting fetch() throw where nobody catches it.
      const usable = usableSecret(stored);
      if (usable) return usable;
    }
  } catch {
    /* private mode / storage blocked — fall through to the build-time value */
  }
  return usableSecret(ENV_SECRET);
}

/**
 * Store a secret, after repairing paste artifacts. Returns false without storing anything when the
 * value cannot be sent in a header — persisting one of those poisons every later call, since the
 * stored value wins over the build-time one.
 */
export function setAdminSecret(secret: string): boolean {
  const check = inspectSecret(secret);
  if (!check.ok) return false;

  warnedFor = ''; // a new value deserves a fresh warning if it too turns out to be bad
  try {
    localStorage.setItem('adminSecret', check.value);
  } catch {
    /* private mode — calls will keep 401ing until storage is available */
  }
  try {
    window.dispatchEvent(new CustomEvent(ADMIN_AUTH_RESOLVED_EVENT));
  } catch {
    /* non-browser context */
  }
  return true;
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

/**
 * Same, for the few helpers that take a secret as an argument instead of reading it themselves.
 * Yields no header at all rather than an unsendable one, so the call 401s instead of throwing.
 */
export function adminSecretHeader(secret?: string): Record<string, string> {
  const usable = secret ? usableSecret(secret) : '';
  return usable ? { 'x-admin-secret': usable } : {};
}

/** True when a secret is available from either source — for UI status badges. */
export function hasAdminSecret(): boolean {
  return Boolean(getAdminSecret());
}

/** True when the only secret we have is the build-time one, i.e. the value that goes stale. */
export function usingBuildSecret(): boolean {
  try {
    const stored = localStorage.getItem('adminSecret');
    // An unsendable stored value is not "the secret in use" — getAdminSecret() skips past it to
    // the build-time one, and the prompt should describe whichever is actually being sent.
    if (stored && usableSecret(stored)) return false;
  } catch {
    /* treat as build secret */
  }
  return Boolean(usableSecret(ENV_SECRET));
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
