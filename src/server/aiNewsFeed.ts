import Parser from 'rss-parser';
import { getNewsItems, type NewsItem } from './newsFeed.js';

export interface AIVideo {
  id: string;
  youtubeId: string;
  title: string;
  channel: string;
  publishedAt: string;
}

export interface AINewsData {
  videos: AIVideo[];
  articles: NewsItem[];
  updatedAt: string;
}

interface YouTubeChannel {
  name: string;
  channelId: string;
}

// Verified working without any API key via https://www.youtube.com/feeds/videos.xml?channel_id=<id>
const YOUTUBE_CHANNELS: YouTubeChannel[] = [
  { name: 'Anthropic', channelId: 'UCrDwWp7EBBv4NwvScIpBDOA' },
  { name: 'OpenAI', channelId: 'UCXZCJLdBC09xxGZ6gcdrc6A' },
  { name: 'Google DeepMind', channelId: 'UCP7jMXSY2xbc3KCAE0MHQ-A' },
];

const CACHE_TTL_MS = 45 * 60 * 1000;
const MAX_VIDEOS = 6;
const MAX_ARTICLES = 8;

const ytParser = new Parser<Record<string, unknown>, { videoId?: string }>({
  customFields: { item: [['yt:videoId', 'videoId']] },
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DBBAINewsBot/1.0)' },
  timeout: 15000,
});

async function fetchChannelVideos(channel: YouTubeChannel): Promise<AIVideo[]> {
  const feed = await ytParser.parseURL(`https://www.youtube.com/feeds/videos.xml?channel_id=${channel.channelId}`);
  const items: AIVideo[] = [];

  for (const item of feed.items ?? []) {
    const title = (item.title ?? '').trim();
    if (!item.videoId || !title) continue;

    items.push({
      id: item.videoId,
      youtubeId: item.videoId,
      title,
      channel: channel.name,
      publishedAt: item.isoDate || (item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()),
    });
  }

  return items;
}

let videoCache: { items: AIVideo[]; fetchedAt: number } | null = null;
let videoInFlight: Promise<AIVideo[]> | null = null;

async function refreshVideos(): Promise<AIVideo[]> {
  const results = await Promise.allSettled(YOUTUBE_CHANNELS.map(fetchChannelVideos));
  const items: AIVideo[] = [];

  results.forEach((result, idx) => {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else {
      console.error(`[ai-news] failed to fetch ${YOUTUBE_CHANNELS[idx].name}:`, result.reason?.message ?? result.reason);
    }
  });

  items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  videoCache = { items, fetchedAt: Date.now() };
  return items;
}

async function getVideos(): Promise<AIVideo[]> {
  const isStale = !videoCache || Date.now() - videoCache.fetchedAt > CACHE_TTL_MS;
  if (isStale) {
    videoInFlight = videoInFlight ?? refreshVideos().finally(() => { videoInFlight = null; });
    await videoInFlight;
  }
  return videoCache?.items ?? [];
}

/** Combines live YouTube RSS (AI lab channels) with the site's existing news pipeline
 * (newsFeed.ts), filtered to items already classified topic === 'ai' — reused rather than
 * re-implementing article classification here. Shared by both server.ts (local dev/Express) and
 * netlify/functions/ai-news.ts (production), same pattern as getNewsItems() itself. */
export async function getAINews(): Promise<AINewsData> {
  const [videos, news] = await Promise.all([getVideos(), getNewsItems()]);
  const articles = news.items.filter((item) => item.topic === 'ai');

  return {
    videos: videos.slice(0, MAX_VIDEOS),
    articles: articles.slice(0, MAX_ARTICLES),
    updatedAt: new Date().toISOString(),
  };
}
