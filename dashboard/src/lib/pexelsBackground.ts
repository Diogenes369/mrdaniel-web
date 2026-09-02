// Resolves ONE background photo per SLIDE (not per carousel) — every slide gets its own unique,
// contextually-relevant image, sourced two ways: the site's Pexels search proxy (api/pexels-search.ts)
// runs that slide's actual Hebrew text through a Gemini "creative photo director" pass first (see
// generateVisualSearchQuery in SocialAgentEngine.ts) to derive a specific, non-cliché English photo
// brief, then searches Pexels with it; if that's unavailable (no PEXELS_API_KEY, or the Gemini step
// itself failed/rate-limited), a curated pool of verified, brand-appropriate dark/cinematic Pexels
// photos is used instead, picked without repeats within one carousel where possible.

const PEXELS_SEARCH_BASE = import.meta.env.VITE_PEXELS_SEARCH_BASE || 'https://mrdaniel.co.il/api/pexels-search';
const ADMIN_SECRET = import.meta.env.VITE_ADMIN_API_SECRET as string | undefined;

export type PhotoOrientation = 'landscape' | 'portrait' | 'square';

/** Verified via a live CORS header check (images.pexels.com sends `Access-Control-Allow-Origin: *`)
 * and a visual review of each photo's actual content — dark, cinematic, no baked-in text, no
 * people-at-a-hacked-screen clichés, spanning the enterprise/finance, network/hardware, and
 * abstract-AI visual registers requested. `w=1600` matches this renderer's largest canvas
 * (1080x1920) with headroom for the cover-crop. */
const FALLBACK_PHOTOS = [
  'https://images.pexels.com/photos/273682/pexels-photo-273682.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/6298579/pexels-photo-6298579.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/2475266/pexels-photo-2475266.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/416985/pexels-photo-416985.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/8108716/pexels-photo-8108716.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/247676/pexels-photo-247676.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/12627677/pexels-photo-12627677.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/18337608/pexels-photo-18337608.jpeg?auto=compress&cs=tinysrgb&w=1600',
];

function authHeaders(): HeadersInit {
  return ADMIN_SECRET ? { 'x-admin-secret': ADMIN_SECRET } : {};
}

/** Maps this content's topic pillars (see SocialAgentEngine.ts's BRAND_KNOWLEDGE_BASE — the same
 * four pillars carouselTemplateRenderer.ts's badge already keys off of) to a plain Pexels search
 * query — used as the server's fallback if the per-slide Gemini creative-query step fails, and as
 * the query hint sent alongside `slideText` on every request. */
export function pexelsQueryForTopic(topic: string): string {
  if (/zero-?trust|אבטחת סייבר|סייבר|cyber/i.test(topic)) return 'cybersecurity dark technology abstract';
  if (/wi-?fi ?7|רשת ארגונית|רשתות ארגוניות/i.test(topic)) return 'data center network technology dark blue';
  if (/web3|webgl|בלוקצ/i.test(topic)) return 'blockchain abstract technology dark';
  if (/\bai\b|סוכן|בינה מלאכותית|agentic/i.test(topic)) return 'artificial intelligence technology dark abstract';
  return 'dark technology abstract finance night city';
}

async function searchPexels(slideText: string, fallbackQuery: string, orientation: PhotoOrientation): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const params = new URLSearchParams({ slideText, query: fallbackQuery, orientation });
    const res = await fetch(`${PEXELS_SEARCH_BASE}?${params.toString()}`, { headers: authHeaders(), signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json();
    return data.ok ? data.photoUrl : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Resolves one photo for exactly one slide, using that slide's own text for a contextual, creative
 * search (see the file header). `usedFallbackIndices` lets the caller avoid repeating the same
 * fallback photo across slides in one carousel — each call that falls through to the static pool
 * picks the next not-yet-used entry (wrapping if the carousel has more slides than pool photos). */
export async function resolveSlidePhotoUrl(slideText: string, topic: string, orientation: PhotoOrientation, seed: number, usedFallbackIndices: Set<number>): Promise<string> {
  const fallbackQuery = pexelsQueryForTopic(topic);
  const fromPexels = await searchPexels(slideText, fallbackQuery, orientation);
  if (fromPexels) return fromPexels;

  let index = ((seed % FALLBACK_PHOTOS.length) + FALLBACK_PHOTOS.length) % FALLBACK_PHOTOS.length;
  for (let attempt = 0; attempt < FALLBACK_PHOTOS.length && usedFallbackIndices.has(index); attempt++) {
    index = (index + 1) % FALLBACK_PHOTOS.length;
  }
  usedFallbackIndices.add(index);
  return FALLBACK_PHOTOS[index];
}

/** Loads a photo for canvas use. `crossOrigin = 'anonymous'` requests it in CORS mode — Pexels' CDN
 * sends permissive CORS headers (confirmed live), so this succeeds and keeps the canvas untainted
 * for `toDataURL()`; if it fails for any reason (network blip, a future non-CORS host), `onerror`
 * resolves null rather than throwing, and the caller draws the gradient-only background instead. */
export function loadPhoto(url: string, timeoutMs = 8000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (v: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    // A stalled connection never fires load/error — cap it so callers can't hang forever.
    const timer = setTimeout(() => finish(null), timeoutMs);
    img.crossOrigin = 'anonymous';
    img.onload = () => finish(img);
    img.onerror = () => finish(null);
    img.src = url;
  });
}

export function hashSeed(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
