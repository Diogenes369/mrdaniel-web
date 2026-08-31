// Vercel Serverless Function — health/latency probe AND per-visitor geo reflector. Pinged by
// src/lib/tracker.ts (same-origin, so the headers below describe the VISITOR) and by the analytics
// dashboard (cross-origin, for a reachability + latency check). Mirrors `app.get('/api/health')` in
// server.ts for local-dev parity.
//
// Geo comes from Vercel's edge headers (`x-vercel-ip-*`) — no third-party IP-geolocation service,
// no extra Serverless Function (Hobby caps a deployment at 12). The client IP is masked before it
// leaves this function is NOT done here — the tracker masks it before writing to RTDB.
export default function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const h = (req && req.headers) || {};
  const first = (v: unknown) => String(Array.isArray(v) ? v[0] : (v ?? '')).split(',')[0].trim();
  const ip = first(h['x-real-ip']) || first(h['x-forwarded-for']) || null;
  const city = h['x-vercel-ip-city'] ? decodeURIComponent(first(h['x-vercel-ip-city'])) : null;

  res.status(200).json({
    ok: true,
    ts: Date.now(),
    region: process.env.VERCEL_REGION ?? null,
    ip: ip || null,
    country: first(h['x-vercel-ip-country']) || null,
    countryRegion: first(h['x-vercel-ip-country-region']) || null,
    city: city || null,
  });
}
