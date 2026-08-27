import { getAINews } from '../src/server/aiNewsFeed.js';

// Vercel Serverless Function equivalent of netlify/functions/ai-news.ts. `.ts` entry — see the
// comment in api/news.ts for why.
export default async function handler(req: any, res: any) {
  try {
    const data = await getAINews();
    res.status(200).json(data);
  } catch (err) {
    console.error('[api/ai-news] failed to fetch AI news:', err);
    res.status(500).json({ error: 'failed to fetch AI news' });
  }
}
