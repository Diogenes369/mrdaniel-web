import type { Config } from '@netlify/functions';
import { getNewsItemBySlug } from '../../src/server/newsFeed';

// Reached via the explicit `/api/news/item/*` redirect in netlify.toml, which rewrites to
// `/.netlify/functions/news-item/:splat` — so the slug is read off the end of the request URL
// rather than `context.params` (params only populate when Netlify's own `config.path` matcher
// handles routing, and the netlify.toml redirect takes precedence over that here).
export default async (req: Request) => {
  const { pathname } = new URL(req.url);
  const slug = decodeURIComponent(pathname.split('/').filter(Boolean).pop() ?? '');
  const item = slug ? await getNewsItemBySlug(slug) : null;

  if (!item) {
    return Response.json({ error: 'not found' }, { status: 404 });
  }

  return Response.json({ item });
};

export const config: Config = {
  path: '/api/news/item/:slug',
};
