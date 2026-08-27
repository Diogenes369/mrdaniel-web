import { useCallback, useState } from 'react';
import { renderCarouselSlides, type SlideAspectRatio } from './carouselTemplateRenderer';

export interface CarouselImagesState {
  status: 'rendering' | 'done' | 'error';
  /** Final rendered slide images, one per slide, in order — always fully populated on 'done' since
   * rendering is a local, deterministic canvas operation with no external dependency that could
   * partially fail (see carouselTemplateRenderer.ts). */
  compositedImages?: string[];
  error?: string;
}

/**
 * Renders an entire carousel's slide images entirely client-side via the deterministic template
 * engine (carouselTemplateRenderer.ts) — no network call, no provider, no API key, no rate limit.
 * Keyed by an arbitrary caller-chosen `key` (the queue item id) so multiple carousel cards can
 * render independently. `status: 'error'` is only reachable if canvas itself is unavailable in the
 * browser, which is effectively never for this dashboard's supported environment.
 */
export function useCarouselImages() {
  const [jobs, setJobs] = useState<Record<string, CarouselImagesState>>({});

  const generate = useCallback(async (key: string, slides: string[], aspectRatio: SlideAspectRatio = '1:1', topic?: string) => {
    setJobs((prev) => ({ ...prev, [key]: { status: 'rendering' } }));
    try {
      const compositedImages = await renderCarouselSlides(slides, aspectRatio, topic);
      setJobs((prev) => ({ ...prev, [key]: { status: 'done', compositedImages } }));
    } catch (err) {
      setJobs((prev) => ({ ...prev, [key]: { status: 'error', error: err instanceof Error ? err.message : 'רינדור השקופיות נכשל' } }));
    }
  }, []);

  return { jobs, generate };
}
