import { getNewsItems } from '../src/server/newsFeed.js';

// Vercel Serverless Function equivalent of netlify/functions/news.ts. Written as `.ts` (not
// `.js`) deliberately: Vercel's Node builder only bundles a function's dependency graph when the
// entry file itself is TypeScript — a plain `.js` entry is deployed as-is with no bundling, so
// Node's native ESM loader can't resolve the extensionless import into this repo's `src/server`
// TypeScript module (confirmed via a FUNCTION_INVOCATION_FAILED / ERR_MODULE_NOT_FOUND at runtime
// when this was first tried as `api/news.js`).
//
// CORS is open (`*`) so the analytics dashboard — served from its own origin — can read the feed
// directly for the news-driven content generator. The payload is public, read-only news metadata.
//
// `?strict=1` opts into a tighter AI/cyber/cloud-only view of the same aggregate (see
// `strictTopicKeep` in newsFeed.ts) — generic consumer-tech/gaming/hardware is dropped unless it
// carries an AI/cyber/cloud signal. It's a per-request filter over the shared cache, and Vercel's
// edge caches `?strict=1` under its own key, so the two variants never mix.
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Short CDN cache + stale-while-revalidate: viewers get an instant response and the edge
  // refreshes the feed in the background, so the News Content Agent streams new stories through
  // the day without every client hammering the origin. `Vercel-CDN-Cache-Control` is the
  // directive Vercel's edge actually honours (plain `s-maxage` gets stripped for functions).
  res.setHeader('Cache-Control', 'public, max-age=120');
  res.setHeader('Vercel-CDN-Cache-Control', 'max-age=600, stale-while-revalidate=1800');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const strictRaw = String((req.query?.strict ?? '')).toLowerCase();
    const strict = strictRaw === '1' || strictRaw === 'true';
    const data = await getNewsItems({ strict });
    res.status(200).json(data);
  } catch (err) {
    console.error('[api/news] failed to fetch news items:', err);
    res.status(500).json({ error: 'failed to fetch news' });
  }
}
