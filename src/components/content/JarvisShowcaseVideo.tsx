import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, X, Film } from 'lucide-react';

/**
 * Sleek media showcase for the JARVIS page. Renders a framed 16:9 poster with a play control;
 * activating it opens a full-screen modal player. Accepts an HTML5 `src` (mp4/webm), a
 * `youtubeId`, or a `vimeoId` — whichever is provided wins in that order. With no source it
 * degrades to an on-brand "demo coming soon" placeholder (no dead controls). No external deps:
 * embeds are plain iframes, created only once the modal opens so nothing third-party loads on
 * page view.
 */
export interface JarvisShowcaseVideoProps {
  src?: string;
  poster?: string;
  youtubeId?: string;
  vimeoId?: string;
  title?: string;
  caption?: string;
}

export default function JarvisShowcaseVideo({
  src,
  poster,
  youtubeId,
  vimeoId,
  title = 'JARVIS — הדגמת מערכת',
  caption = 'סיור מודרך במערכת: סוכני AI, תזמור LLM, פייפליינים בזמן אמת ובקרת גישה ארגונית.',
}: JarvisShowcaseVideoProps) {
  const [open, setOpen] = useState(false);
  const hasMedia = Boolean(src || youtubeId || vimeoId);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="mb-16">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0B0C10]">
        {/* 16:9 stage */}
        <div className="relative aspect-video w-full">
          {poster ? (
            <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" aria-hidden="true" />
          ) : (
            <>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(118,185,0,0.18),transparent_60%)]" aria-hidden="true" />
              <div
                className="absolute inset-0 opacity-[0.15]"
                style={{
                  backgroundImage:
                    'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
                  backgroundSize: '44px 44px',
                }}
                aria-hidden="true"
              />
            </>
          )}

          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-6">
            <button
              type="button"
              onClick={() => hasMedia && setOpen(true)}
              disabled={!hasMedia}
              aria-label={hasMedia ? 'הפעלת סרטון ההדגמה' : 'סרטון ההדגמה יעלה בקרוב'}
              className="group relative flex h-20 w-20 items-center justify-center rounded-full border border-brand-500/40 bg-black/50 backdrop-blur-sm transition-transform hover:scale-105 disabled:opacity-60 disabled:hover:scale-100"
            >
              <span className="absolute inset-0 rounded-full bg-brand-500/20 blur-xl transition-opacity group-hover:opacity-100 opacity-70" aria-hidden="true" />
              {hasMedia ? (
                <Play className="relative w-8 h-8 text-brand-300 translate-x-0.5" />
              ) : (
                <Film className="relative w-7 h-7 text-brand-300/80" />
              )}
            </button>
            <div>
              <p className="font-display text-lg md:text-xl font-bold text-white">{title}</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-zinc-400">
                {hasMedia ? caption : 'הדגמת הווידאו תיטען כאן — המערכת מוכנה לקבל קובץ MP4, או הטמעת YouTube / Vimeo.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {open && hasMedia && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 md:p-8"
            onClick={() => setOpen(false)}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="סגירת הנגן"
              className="absolute top-4 right-4 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white hover:border-brand-400/50 hover:text-brand-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div
              className="relative w-full max-w-5xl aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black"
              onClick={(e) => e.stopPropagation()}
            >
              {src ? (
                <video src={src} poster={poster} controls autoPlay playsInline className="h-full w-full">
                  הדפדפן שלך אינו תומך בתגית וידאו.
                </video>
              ) : youtubeId ? (
                <iframe
                  className="h-full w-full"
                  src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0`}
                  title={title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <iframe
                  className="h-full w-full"
                  src={`https://player.vimeo.com/video/${vimeoId}?autoplay=1`}
                  title={title}
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
