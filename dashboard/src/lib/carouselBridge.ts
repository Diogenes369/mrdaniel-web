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
  /** True when INSTAGRAM_OEMBED_TOKEN is configured, so public IG captions can be read. */
  instagramOEmbed?: boolean;
}

export interface CarouselSlide {
  index: number;
  /** Bridge-relative path; use `slideUrl()` to get something an <img> can load. */
  url: string;
  headline: string;
  subhead: string;
  cards?: string[];
  scene: string;
  /** Scene context used to retrieve the backdrop photo. */
  visualQuery?: string;
  photoCredit?: string;
  /** Vision QA verdict for this slide. */
  qa?: { pass: boolean; overlap?: boolean; overflow?: boolean; brokenGlyphs?: boolean; lowContrast?: boolean; note?: string; skipped?: boolean };
}

export type CarouselStatus =
  | 'queued' | 'importing' | 'rebranding' | 'art-direction' | 'copywriting' | 'rendering'
  | 'done' | 'error';

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
  /** Copy the engine produced, so the editor can seed itself from a first pass. */
  deck?: Array<{ headline?: string; subhead?: string; body?: string; bullets?: string[] }>;
  qaRetries?: number;
  style?: string;
  preset?: string;
  /** LinkedIn-ready PDF of the whole set, once compiled. */
  pdfUrl?: string | null;
  /** Rebrander audit: what branding was stripped and how much source text was available. */
  rebrand?: { removed: string[]; sourceChars: number; title: string } | null;
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

/** Brand palettes the compositor understands (scripts/compose_slide.py PALETTES). */
export const PALETTES = [
  { id: 'brand', label: 'מותג האתר', swatch: ['#0B0F17', '#76B900', '#9FE870'] },
  { id: 'sketchnote', label: 'סקצ׳נוט חם', swatch: ['#1A1A1A', '#E85A2A', '#2E9E8F'] },
  { id: 'carbon', label: 'קרבון כהה', swatch: ['#F4F4F5', '#00FF66', '#22D3EE'] },
] as const;

/** Open Sans is the default and carries full Hebrew (verified 27/27). */
export const FONTS = [
  { id: 'opensans', label: 'Open Sans Hebrew' },
  { id: 'heebo', label: 'Heebo' },
  { id: 'assistant', label: 'Assistant' },
  { id: 'rubik', label: 'Rubik' },
] as const;

/** Visual styles. `photo` styles pull a contextually matched stock image as the backdrop. */
export const STYLES = [
  { id: 'sketchnote', label: 'סקצ׳נוט מצויר', hint: 'איור דיו על נייר קרם', source: 'hermes' },
  { id: 'photoreal', label: 'צילום קונטקסטואלי', hint: 'תצלום אמיתי תואם נושא', source: 'photo' },
  { id: 'dark-minimal', label: 'טק מינימליסטי כהה', hint: 'רקע כהה, ניגודיות גבוהה', source: 'photo' },
  { id: 'concept-art', label: 'אמנות קונספט', hint: 'איור מושגי', source: 'hermes' },
  { id: 'enterprise', label: 'ארגוני בהיר', hint: 'נקי, עסקי, ניגודיות חדה', source: 'photo' },
] as const;

/** Output presets — exact pixel dimensions per platform. */
export const OUTPUT_PRESETS = [
  { id: 'portrait', label: '4:5 קרוסלה', hint: '1080x1350 · אינסטגרם ולינקדאין' },
  { id: 'story', label: '9:16 סטורי', hint: '1080x1920 · סטוריז וטיקטוק' },
  { id: 'square', label: '1:1 ריבוע', hint: '1080x1080' },
] as const;

/** Layout presets — how many content cards the compositor lays out. */
export const TEMPLATES = [
  { id: 1, label: 'כרטיס יחיד', hint: 'הצהרה או נתון בודד' },
  { id: 2, label: 'השוואה', hint: 'לפני / אחרי, שני מדדים' },
  { id: 3, label: '3 שלבים', hint: 'רצף ממוספר' },
  { id: 4, label: '4 שלבים', hint: 'רשת של ארבעה' },
] as const;

/** Per-slide copy as edited in the dashboard before rendering. */
export interface SlideCopy {
  headline: string;
  cards: string[];
  footer: string;
}

export interface CarouselOptions {
  /** Free-text art direction from Daniel. Optional — Hermes decides on its own by default. */
  override?: string;
  /** base64 data URL of a design reference screenshot; Hermes analyses its style and framing. */
  referenceImage?: string;
  /** Article or post URL. When set, the bridge extracts its content and uses that as the source. */
  sourceUrl?: string;
  /** Reviewed/edited copy per slide. Overrides whatever the copy engine produced. */
  slideCopy?: SlideCopy[];
  font?: string;
  palette?: string;
  /** Skips the vision QA pass — faster, but no overlap/overflow check. */
  skipQa?: boolean;
  /** 'rebrand' = 1:1 unbranded Hebrew translation of a source post; 'article' = synthesis. */
  mode?: 'article' | 'rebrand';
  /** Visual style id (see STYLES). Photo styles fetch a contextual backdrop. */
  style?: string;
  /** Output preset id (see OUTPUT_PRESETS). */
  preset?: string;
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
      slideCopy: opts.slideCopy || null,
      font: opts.font || 'opensans',
      palette: opts.palette || 'brand',
      skipQa: Boolean(opts.skipQa),
      mode: opts.mode || 'article',
      style: opts.style || 'sketchnote',
      preset: opts.preset || 'portrait',
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
  rebranding: 'מתרגם ומסיר מיתוג זר',
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

/**
 * Re-render an existing job in a different visual style.
 *
 * The approved copy is never regenerated — the bridge reads it back from the job's own slide
 * records — so a redesign can only change the backdrop and composition. Omit `slideIndex` to
 * redesign the whole carousel.
 */
export async function redesignCarousel(
  jobId: string,
  opts: { style?: string; preset?: string; font?: string; palette?: string; slideIndex?: number }
): Promise<number[]> {
  const res = await fetch(`${bridgeBase()}/carousel/redesign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ jobId, ...opts }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `bridge responded ${res.status}`);
  return (data.redesigning as number[]) || [];
}
