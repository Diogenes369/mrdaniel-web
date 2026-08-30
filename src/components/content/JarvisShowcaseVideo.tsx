import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Film, X } from 'lucide-react';

/**
 * JARVIS video gallery — local files only (NO YouTube / Vimeo / embeds), served from
 * `/videos/jarvis/` (`public/videos/jarvis/`, copied from `C:\Projects\123`).
 *
 * Layout: a responsive grid of 9:16 (TikTok/Reels) cover thumbnails with a Play overlay. There
 * is NO inline player — clicking any thumbnail opens a centered lightbox modal that dims and
 * blurs the whole page, plays the clip immediately, and closes on the X button, a backdrop
 * click, or ESC. The modal video is height-capped to the viewport so it never clips on mobile
 * or desktop.
 */
export interface JarvisClip {
  src: string;
}

const BASE = '/videos/jarvis/';

const DEFAULT_CLIPS: JarvisClip[] = [
  { src: `${BASE}clip-1.mp4` },
  { src: `${BASE}clip-2.mp4` },
  { src: `${BASE}clip-3.mp4` },
  { src: `${BASE}clip-4.mp4` },
];

export default function JarvisShowcaseVideo({ clips = DEFAULT_CLIPS }: { clips?: JarvisClip[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [errored, setErrored] = useState<Record<number, boolean>>({});
  const markErrored = (i: number) => setErrored((e) => ({ ...e, [i]: true }));

  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenIndex(null);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [openIndex]);

  return (
    <div className="mb-16">
      {/* Cover thumbnail grid — 9:16 tiles, no inline player */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
        {clips.map((clip, i) => {
          const bad = Boolean(errored[i]);
          return (
            <button
              key={clip.src}
              type="button"
              onClick={() => !bad && setOpenIndex(i)}
              aria-label={`נגן סרטון ${i + 1}`}
              className="group relative aspect-[9/16] overflow-hidden rounded-2xl border border-white/10 bg-black transition-colors hover:border-brand-500/50"
            >
              {bad ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Film className="w-6 h-6 text-zinc-600" />
                </div>
              ) : (
                <video
                  src={`${clip.src}#t=0.6`}
                  muted
                  playsInline
                  preload="metadata"
                  tabIndex={-1}
                  onError={() => markErrored(i)}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" aria-hidden="true" />
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/25 bg-black/45 backdrop-blur-sm transition-transform group-hover:scale-110">
                  <Play className="w-6 h-6 translate-x-0.5 text-white" />
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Centered lightbox modal */}
      <AnimatePresence>
        {openIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
            onClick={() => setOpenIndex(null)}
          >
            <div
              className="relative aspect-[9/16] max-h-[86dvh] max-w-[92vw] overflow-hidden rounded-2xl bg-black shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setOpenIndex(null)}
                aria-label="סגירת הנגן"
                className="absolute top-3 right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/70 text-white transition-colors hover:border-brand-400/60 hover:text-brand-300"
              >
                <X className="w-5 h-5" />
              </button>
              <video
                key={clips[openIndex].src}
                src={clips[openIndex].src}
                controls
                autoPlay
                playsInline
                className="h-full w-full bg-black object-contain"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
