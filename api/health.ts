// Vercel Serverless Function — lightweight health/latency probe. Pinged by src/lib/tracker.ts and
// by the analytics dashboard (dashboard/src/lib/useDashboardRefresh.ts) to derive a real
// client-measured round-trip latency to the mrdaniel.co.il domain. Mirrors `app.get('/api/health')`
// in server.ts for local-dev parity.
export default function handler(_req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ ok: true, ts: Date.now(), region: process.env.VERCEL_REGION ?? null });
}
