import type { ContentFormat, MediaFrameSpec, Platform, VideoScript } from './types.js';

/**
 * Media & Video Template Pipeline — deliberately produces a STRUCTURAL spec, not a rendered image
 * or video file. There is no canvas/FFmpeg/video-encoding pipeline in this codebase, and building
 * one (real video rendering, hosting, and export) is a project of its own, not something to bolt
 * on inside a content-generation endpoint. What this DOES give the admin: an accurate, real-time
 * visual PREVIEW of every frame — correct aspect ratio for the target platform, real Hebrew
 * copy, real brand colors — rendered as an actual HTML/CSS card by the dashboard's
 * MediaPreviewCard (using the Heebo/Rubik Google Fonts it already loads), which is what "clean
 * Hebrew typography" needs far more reliably than trying to rasterize Hebrew text server-side.
 */

export function getAspectRatio(platform: Platform): '9:16' | '1:1' | '1.91:1' {
  if (platform === 'tiktok') return '9:16';
  if (platform === 'instagram') return '1:1';
  return '1.91:1';
}

const ACCENT_CYCLE: MediaFrameSpec['accent'][] = ['brand', 'blue', 'cyan'];

export function buildMediaFrames(params: {
  format: ContentFormat;
  topic: string;
  body: string;
  carouselSlides?: string[];
  videoScript?: VideoScript;
}): MediaFrameSpec[] {
  const { format, topic, body, carouselSlides, videoScript } = params;

  if (format === 'carousel' && carouselSlides && carouselSlides.length > 0) {
    return carouselSlides.map((slide, idx) => ({
      headline: slide.length > 90 ? `${slide.slice(0, 87)}...` : slide,
      frameIndex: idx,
      totalFrames: carouselSlides.length,
      accent: ACCENT_CYCLE[idx % ACCENT_CYCLE.length],
    }));
  }

  if (format === 'video-script' && videoScript) {
    const frames: MediaFrameSpec[] = [
      { headline: videoScript.hook, frameIndex: 0, totalFrames: videoScript.scenes.length + 2, accent: 'brand' },
      ...videoScript.scenes.map((scene, idx) => ({
        headline: scene.onScreenText,
        frameIndex: idx + 1,
        totalFrames: videoScript.scenes.length + 2,
        accent: ACCENT_CYCLE[(idx + 1) % ACCENT_CYCLE.length],
      })),
      { headline: videoScript.cta, frameIndex: videoScript.scenes.length + 1, totalFrames: videoScript.scenes.length + 2, accent: 'cyan' },
    ];
    return frames;
  }

  // Single post — one frame, headline is the topic, subtext is a short excerpt of the body.
  const excerpt = body.length > 140 ? `${body.slice(0, 137)}...` : body;
  return [{ headline: topic, subtext: excerpt, frameIndex: 0, totalFrames: 1, accent: 'brand' }];
}
