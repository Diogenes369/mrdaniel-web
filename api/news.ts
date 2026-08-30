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
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const data = await getNewsItems();
    res.status(200).json(data);
  } catch (err) {
    console.error('[api/news] failed to fetch news items:', err);
    res.status(500).json({ error: 'failed to fetch news' });
  }
}
