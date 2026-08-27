import type { Config, Context } from '@netlify/functions';
import { getAINews } from '../../src/server/aiNewsFeed';

// Reached via the explicit `/api/ai-news` redirect in netlify.toml (same precedence pattern as
// /api/news — see netlify.toml comments). Local dev (server.ts) serves the same route via the
// same getAINews() so both environments share one fetch/cache/classification implementation.
export default async (_req: Request, _context: Context): Promise<Response> => {
  const data = await getAINews();
  return Response.json(data);
};

export const config: Config = {
  path: '/api/ai-news',
};
