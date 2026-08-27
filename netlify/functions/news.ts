import type { Config, Context } from '@netlify/functions';
import { getNewsItems } from '../../src/server/newsFeed';

// v2 fetch-style handler (default export, WHATWG Request/Response) — reached in production via
// the explicit `/api/*` redirect in netlify.toml, which resolves to `/.netlify/functions/news`
// (this file's name) and takes precedence over both `config.path` below and the SPA catch-all.
export default async (_req: Request, _context: Context): Promise<Response> => {
  const data = await getNewsItems();
  return Response.json(data);
};

export const config: Config = {
  path: '/api/news',
};
