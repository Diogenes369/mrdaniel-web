/**
 * Client for carousel-bridge — the local orchestrator behind "Generate Designed Carousel with
 * Hermes" (see carousel-bridge/index.js for why it must run on Daniel's machine).
 *
 * Everything here degrades gracefully: if the bridge isn't running the UI shows a clear
 * "start the bridge" state rather than throwing.
 */

/**
 * Bridge URL resolution, most specific first:
 *   1. localStorage override (per-browser, set via setBridgeBase)
 *   2. VITE_CAROUSEL_BRIDGE_URL baked in at BUILD time
 *   3. localhost default
 *
 * Note (2) must be VITE_-prefixed: the dashboard is a static Vite SPA, so a plain server-side env
 * var on Vercel is never visible to it. It is also inlined at build time, so changing it requires
 * a redeploy, not just an env update.
 */
const BUILD_BASE = (import.meta.env.VITE_CAROUSEL_BRIDGE_URL || '').replace(/\/$/, '');
const DEFAULT_BASE = BUILD_BASE || 'http://127.0.0.1:8787';

/** Token for the bridge's x-bridge-token gate. Per-browser; never baked into the bundle. */
export function bridgeToken(): string {
  try {
    return localStorage.getItem('carousel-bridge-token') || '';
  } catch {
    return '';
  }
}

export function setBridgeToken(token: string) {
  try {
    localStorage.setItem('carousel-bridge-token', token.trim());
  } catch {
    /* private mode — the call will 401 until the token can be stored */
  }
}

function authHeaders(): Record<string, string> {
  const token = bridgeToken();
  return token ? { 'x-bridge-token': token } : {};
}

export function bridgeBase(): string {
  try {
    return localStorage.getItem('carousel-bridge-base') || DEFAULT_BASE;
  } catch {
    return DEFAULT_BASE;
  }
}

export function setBridgeBase(url: string) {
  try {
    localStorage.setItem('carousel-bridge-base', url.replace(/\/$/, ''));
  } catch {
    /* private mode — fall back to the default for this session */
  }
}

export interface BridgeHealth {
  ok: boolean;
  service?: string;
  siteOrigin?: string;
  /** false = ADMIN_API_SECRET missing, so the copywriting calls will 401. */
  adminSecret?: boolean;
  renderScript?: boolean;
  activeJobs?: number;
  hermesTimeoutMs?: number;
  /** true when the bridge requires x-bridge-token (always true behind a tunnel). */
  tokenRequired?: boolean;
}

export interface CarouselSlide {
  index: number;
  /** Bridge-relative path; use `slideUrl()` to get something an <img> can load. */
  url: string;
  headline: string;
  subhead: string;
  scene: string;
}

export type CarouselStatus =
  | 'queued' | 'importing' | 'art-direction' | 'copywriting' | 'rendering' | 'done' | 'error';

export interface CarouselJob {
  ok: boolean;
  id: string;
  status: CarouselStatus;
  progress: { done: number; total: number };
  concept: string;
  palette: string[];
  /** Type treatment Hermes derived, from the design reference when one was supplied. */
  typography?: string;
  /** Composition Hermes derived, from the design reference when one was supplied. */
  layout?: string;
  /** Present when a sourceUrl was parsed instead of using the pasted article text. */
  imported?: { title: string; source: string; chars: number } | null;
  usedReference?: boolean;
  slides: CarouselSlide[];
  post: { body: string; hashtags: string[]; altText?: string } | null;
  error: string | null;
}

export interface ArticleInput {
  title: string;
  source: string;
  topic: string;
  link?: string;
  articleText: string;
}

/**
 * Absolute URL for a rendered slide, with the bridge token as `?t=`.
 *
 * The token has to ride in the query string here: these URLs are consumed by `<img src>` and by
 * the ZIP bundler's plain fetch(), neither of which can set an `x-bridge-token` header. Without it
 * the bridge's auth gate 401s every image — the slider renders broken thumbnails and the ZIP
 * bundles the JSON error body under each .png name.
 */
export function slideUrl(path: string): string {
  const base = path.startsWith('http') ? path : `${bridgeBase()}${path}`;
  const token = bridgeToken();
  if (!token) return base;
  return `${base}${base.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}`;
}

export async function checkBridge(): Promise<BridgeHealth> {
  try {
    const res = await fetch(`${bridgeBase()}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false };
    return (await res.json()) as BridgeHealth;
  } catch {
    return { ok: false };
  }
}

export interface CarouselOptions {
  /** Free-text art direction from Daniel. Optional — Hermes decides on its own by default. */
  override?: string;
  /** base64 data URL of a design reference screenshot; Hermes analyses its style and framing. */
  referenceImage?: string;
  /** Article or post URL. When set, the bridge extracts its content and uses that as the source. */
  sourceUrl?: string;
}

export async function startCarousel(
  article: ArticleInput,
  slideCount = 4,
  opts: CarouselOptions = {}
): Promise<string> {
  const res = await fetch(`${bridgeBase()}/carousel/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      article,
      slideCount,
      override: opts.override || '',
      referenceImage: opts.referenceImage || '',
      sourceUrl: opts.sourceUrl || '',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `bridge responded ${res.status}`);
  return data.jobId as string;
}

export async function fetchJob(jobId: string): Promise<CarouselJob> {
  const res = await fetch(`${bridgeBase()}/carousel/job/${jobId}`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `bridge responded ${res.status}`);
  return data as CarouselJob;
}

/** Re-runs the visuals with an extra art-direction instruction, reusing the copy. */
export async function adjustCarousel(jobId: string, instruction: string): Promise<string> {
  const res = await fetch(`${bridgeBase()}/carousel/adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ jobId, instruction }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `bridge responded ${res.status}`);
  return data.jobId as string;
}

export const STATUS_LABEL: Record<CarouselStatus, string> = {
  queued: 'ממתין בתור',
  importing: 'מייבא תוכן מהקישור',
  'art-direction': 'Hermes בוחר קונספט ויזואלי',
  copywriting: 'מנסח קופי בעברית',
  rendering: 'מייצר שקופיות ומרנדר עברית',
  done: 'מוכן',
  error: 'שגיאה',
};

/** Reads a picked File into a base64 data URL for the bridge's referenceImage field. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('could not read the file'));
    reader.readAsDataURL(file);
  });
}

/** Bridge cap is 8MB decoded; base64 inflates ~33%, so reject early with a clear message. */
export const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;
export const REFERENCE_ACCEPT = 'image/png,image/jpeg,image/webp';
