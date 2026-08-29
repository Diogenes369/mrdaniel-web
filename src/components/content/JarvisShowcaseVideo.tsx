import { useRef, useState } from 'react';
import { Play, Film } from 'lucide-react';

/**
 * Custom local-file video gallery for the JARVIS page. NO YouTube / Vimeo / external embeds —
 * every clip streams from a statically-served path (default `/videos/jarvis/`). The source files
 * live in `public/videos/jarvis/` (copied from `C:\Projects\123`).
 *
 * Deliberately text-free: just the portrait 9:16 featured player (full native HTML5 controls —
 * play / pause / volume / scrub / fullscreen) and a row of clickable portrait thumbnails to
 * switch clips. No titles, captions, or overlay labels. Playback auto-advances to the next clip
 * once the viewer has started watching, so it cycles the whole set. A missing file degrades to a
 * bare icon tile.
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
  const [active, setActive] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [errored, setErrored] = useState<Record<number, boolean>>({});
  const videoRef = useRef<HTMLVideoElement>(null);

  const current = clips[active];
  const currentErrored = Boolean(errored[active]);

  const markErrored = (i: number) => setErrored((e) => ({ ...e, [i]: true }));
  const next = () => setActive((i) => (i + 1) % clips.length);

  return (
    <div className="mb-16">
      <div className="grid gap-6 md:grid-cols-[minmax(0,340px)_1fr] md:gap-8 md:items-start">
        {/* Featured portrait player */}
        <div className="relative mx-auto w-full max-w-[340px] overflow-hidden rounded-2xl border border-white/10 bg-black">
          {currentErrored ? (
            <div className="relative flex aspect-[9/16] items-center justify-center">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(118,185,0,0.16),transparent_60%)]" aria-hidden="true" />
              <span className="relative flex h-14 w-14 items-center justify-center rounded-full border border-brand-500/40 bg-black/50">
                <Film className="w-6 h-6 text-brand-300/80" />
              </span>
            </div>
          ) : (
            <video
              key={current.src}
              ref={videoRef}
              src={current.src}
              controls
              autoPlay={engaged}
              playsInline
              preload="metadata"
              onPlay={() => setEngaged(true)}
              onEnded={next}
              onError={() => markErrored(active)}
              className="block aspect-[9/16] w-full bg-black object-contain"
            />
          )}
        </div>

        {/* Thumbnail selector — no text */}
        <div className="grid grid-cols-4 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {clips.map((clip, i) => {
            const on = i === active;
            const bad = Boolean(errored[i]);
            return (
              <button
                key={clip.src}
                type="button"
                onClick={() => setActive(i)}
                aria-current={on ? 'true' : undefined}
                aria-label={`מעבר לסרטון ${i + 1}`}
                className={`group relative overflow-hidden rounded-xl border transition-colors ${
                  on ? 'border-brand-500/60 ring-2 ring-brand-500/40' : 'border-white/10 hover:border-brand-500/40'
                }`}
              >
                <div className="relative aspect-[9/16] w-full bg-black">
                  {bad ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Film className="w-5 h-5 text-zinc-600" />
                    </div>
                  ) : (
                    <video
                      src={`${clip.src}#t=0.5`}
                      muted
                      playsInline
                      preload="metadata"
                      tabIndex={-1}
                      onError={() => markErrored(i)}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                  <span
                    className={`absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity ${
                      on ? 'opacity-0' : 'opacity-100 group-hover:opacity-60'
                    }`}
                  >
                    <Play className="w-5 h-5 translate-x-0.5 text-white/90" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
