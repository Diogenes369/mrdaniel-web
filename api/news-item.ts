import { getNewsItemBySlug } from '../src/server/newsFeed.js';

// Vercel Serverless Function equivalent of netlify/functions/news-item.ts. `.ts` entry — see the
// comment in api/news.ts for why (a `.js` entry deployed here with the same import failed at
// runtime with ERR_MODULE_NOT_FOUND, since Vercel only bundles a `.ts` entry's dependency graph).
// The slug arrives as a query param (see the `/api/news/item/:slug` -> `/api/news-item.ts?slug=:slug`
// rewrite in vercel.json) rather than being parsed off the URL path — Vercel's `req.query` is
// already URL-decoded, unlike the Netlify version's manual `decodeURIComponent` on a raw path segment.
export default async function handler(req: any, res: any) {
  try {
    const raw = req.query.slug;
    const slug = Array.isArray(raw) ? raw[0] : raw;
    const item = slug ? await getNewsItemBySlug(slug) : null;

    if (!item) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.status(200).json({ item });
  } catch (err) {
    console.error('[api/news-item] failed to fetch news item:', err);
    res.status(500).json({ error: 'failed to fetch news item' });
  }
}
