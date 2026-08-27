import { generateVisualSearchQuery, detectGeminiRateLimit } from '../src/agent/SocialAgentEngine.js';

/**
 * Thin server-side proxy for Pexels' search API — the actual PEXELS_API_KEY never reaches the
 * browser (unlike the search endpoint, Pexels' CDN image URLs themselves are freely hotlinkable
 * with permissive CORS, confirmed via a live header check, so the dashboard fetches the resolved
 * photo URL directly from images.pexels.com afterward; this endpoint only does the keyed search
 * step). If PEXELS_API_KEY isn't configured, this returns an honest 503 and the dashboard's
 * carouselTemplateRenderer.ts falls back to its curated static photo pool — the feature works
 * either way, per explicit instruction.
 *
 * `slideText` (preferred) runs that ONE slide's actual Hebrew content through
 * generateVisualSearchQuery() first — a creative-director-style Gemini call that turns it into a
 * specific, non-cliché English photo brief (see that function's system instruction for the exact
 * "no hackers, no green Matrix code" rules) — so every slide in a carousel gets its own distinct,
 * contextual search rather than one repeated topic-level query. `query` is used directly instead
 * when provided alone, and also serves as the fallback if the Gemini step fails (rate-limited,
 * empty response, etc.) — the photo search still runs, just with a plainer query.
 */

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
}

function isAdminAuthorized(req: any): boolean {
  const configured = process.env.ADMIN_API_SECRET;
  if (!configured) return true;
  return req.headers?.['x-admin-secret'] === configured;
}

const VALID_ORIENTATIONS = ['landscape', 'portrait', 'square'];

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  if (!isAdminAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const slideText = req.query?.slideText as string | undefined;
  const fallbackQuery = req.query?.query as string | undefined;
  const orientationParam = req.query?.orientation as string | undefined;
  const orientation = VALID_ORIENTATIONS.includes(orientationParam || '') ? orientationParam : 'square';

  let effectiveQuery: string | undefined;
  let creativeQueryFailed = false;
  if (slideText && slideText.trim()) {
    try {
      effectiveQuery = await generateVisualSearchQuery(slideText);
    } catch (err) {
      creativeQueryFailed = true;
      const rateLimit = detectGeminiRateLimit(err);
      console.error(rateLimit ? '[agent/pexels] visual query generation rate-limited, falling back to plain query:' : '[agent/pexels] visual query generation failed, falling back to plain query:', err);
    }
  }
  if (!effectiveQuery) effectiveQuery = fallbackQuery;
  if (!effectiveQuery || !effectiveQuery.trim()) {
    res.status(400).json({ ok: false, error: 'missing slideText or query' });
    return;
  }

  const pexelsKey = process.env.PEXELS_API_KEY;
  if (!pexelsKey) {
    console.error('[agent/pexels] PEXELS_API_KEY not configured — the dashboard will use its curated fallback photo pool instead.');
    res.status(503).json({ ok: false, error: 'PEXELS_API_KEY not configured' });
    return;
  }

  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(effectiveQuery)}&per_page=3&orientation=${orientation}`;
    const pexelsRes = await fetch(url, { headers: { Authorization: pexelsKey } });
    const data = await pexelsRes.json();
    const photo = data?.photos?.[0];
    if (!pexelsRes.ok || !photo) {
      res.status(502).json({ ok: false, error: data?.error || `Pexels search failed (${pexelsRes.status})` });
      return;
    }
    res.status(200).json({
      ok: true,
      photoUrl: photo.src?.large2x || photo.src?.large || photo.src?.original,
      photographer: photo.photographer,
      usedQuery: effectiveQuery,
      creativeQueryFailed,
    });
  } catch (err) {
    console.error('[api/pexels-search] error:', err);
    res.status(500).json({ ok: false, error: 'pexels search failed' });
  }
}
