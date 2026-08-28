import { useRef, useState } from 'react';
import { Play, Film, Maximize2, AlertCircle } from 'lucide-react';

/**
 * Custom local-file video gallery for the JARVIS page. NO YouTube / Vimeo / external embeds —
 * every clip streams from a statically-served path (default `/videos/jarvis/`). Drop the source
 * files into `public/videos/jarvis/` (see the README there); locally they live at `D:\123`.
 *
 * A featured 16:9 HTML5 <video> plays the selected clip; a thumbnail strip switches between them.
 * If a file is missing the tile degrades to an on-brand "coming soon" state instead of a broken
 * player, so the section is safe to ship before the media is uploaded.
 */
export interface JarvisClip {
  src: string;
  label: string;
  poster?: string;
}

const BASE = '/videos/jarvis/';

const DEFAULT_CLIPS: JarvisClip[] = [
  { src: `${BASE}overview.mp4`, label: 'סקירת מערכת JARVIS' },
  { src: `${BASE}voice-interface.mp4`, label: 'ממשק קולי טבעי' },
  { src: `${BASE}business-automation.mp4`, label: 'אוטומציה עסקית' },
  { src: `${BASE}smart-home.mp4`, label: 'שליטה בבית ובמשרד החכם' },
];

export default function JarvisShowcaseVideo({ clips = DEFAULT_CLIPS }: { clips?: JarvisClip[] }) {
  const [active, setActive] = useState(0);
  const [errored, setErrored] = useState<Record<number, boolean>>({});
  const videoRef = useRef<HTMLVideoElement>(null);

  const current = clips[active];
  const currentErrored = Boolean(errored[active]);

  const goFullscreen = () => {
    const el = videoRef.current;
    if (el && el.requestFullscreen) el.requestFullscreen().catch(() => {});
  };

  return (
    <div className="mb-16">
      {/* Featured player */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0B0C10]">
        <div className="relative aspect-video w-full">
          {currentErrored ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(118,185,0,0.16),transparent_60%)]" aria-hidden="true" />
              <span className="relative flex h-16 w-16 items-center justify-center rounded-full border border-brand-500/40 bg-black/50">
                <Film className="w-7 h-7 text-brand-300/80" />
              </span>
              <p className="relative font-display text-lg font-bold text-white">{current.label}</p>
              <p className="relative max-w-md text-sm text-zinc-400">
                הסרטון יתווסף בקרוב. הרכיב מוכן להזרמת קובץ וידאו מקומי מהנתיב{' '}
                <code dir="ltr" className="font-mono text-brand-300">{BASE}</code>
              </p>
            </div>
          ) : (
            <video
              key={current.src}
              ref={videoRef}
              src={current.src}
              poster={current.poster}
              controls
              preload="metadata"
              playsInline
              onError={() => setErrored((e) => ({ ...e, [active]: true }))}
              className="absolute inset-0 h-full w-full bg-black"
            >
              הדפדפן שלך אינו תומך בתגית וידאו.
            </video>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
          <span className="text-sm font-bold text-white truncate">{current.label}</span>
          <button
            type="button"
            onClick={goFullscreen}
            disabled={currentErrored}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-300 hover:text-brand-300 transition-colors disabled:opacity-40"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            מסך מלא
          </button>
        </div>
      </div>

      {/* Thumbnail strip */}
      {clips.length > 1 && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {clips.map((clip, i) => {
            const on = i === active;
            const bad = Boolean(errored[i]);
            return (
              <button
                key={clip.src}
                type="button"
                onClick={() => setActive(i)}
                aria-current={on ? 'true' : undefined}
                className={`group relative flex flex-col overflow-hidden rounded-xl border text-right transition-colors ${
                  on ? 'border-brand-500/60 bg-brand-500/10' : 'border-white/10 bg-carbon-900/60 hover:border-brand-500/40'
                }`}
              >
                <div className="relative aspect-video w-full bg-black/50">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(118,185,0,0.14),transparent_65%)]" aria-hidden="true" />
                  <span className="absolute inset-0 flex items-center justify-center">
                    {bad ? (
                      <AlertCircle className="w-5 h-5 text-zinc-500" />
                    ) : (
                      <Play className={`w-5 h-5 translate-x-0.5 ${on ? 'text-brand-300' : 'text-zinc-400 group-hover:text-brand-300'}`} />
                    )}
                  </span>
                </div>
                <span className={`px-3 py-2 text-xs font-bold ${on ? 'text-brand-200' : 'text-zinc-300'}`}>
                  {clip.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
