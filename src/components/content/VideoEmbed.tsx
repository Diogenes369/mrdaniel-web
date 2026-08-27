import { useState } from 'react';
import { Play } from 'lucide-react';

interface VideoEmbedProps {
  youtubeId: string;
  title: string;
  channel: string;
}

/** Click-to-play facade: renders only YouTube's static thumbnail until clicked, so the page never
 * pays for YouTube's embed iframe/JS on load — only once a visitor actually wants to watch. */
export default function VideoEmbed({ youtubeId, title, channel }: VideoEmbedProps) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 aspect-video">
      {playing ? (
        <iframe
          src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1`}
          title={title}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group absolute inset-0 w-full h-full cursor-pointer"
          aria-label={`הפעלת הסרטון: ${title}`}
        >
          <img
            src={`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`}
            alt={title}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/50 group-hover:bg-black/35 transition-colors" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-brand-500/90 flex items-center justify-center shadow-[0_0_30px_rgba(0,255,102,0.4)] group-hover:scale-110 transition-transform">
              <Play className="w-6 h-6 text-black fill-black translate-x-0.5" />
            </div>
          </div>
          <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/90 to-transparent text-right">
            <p className="font-display font-bold text-white text-sm leading-snug line-clamp-2">{title}</p>
            <p className="text-zinc-400 text-xs mt-1" dir="ltr">
              {channel}
            </p>
          </div>
        </button>
      )}
    </div>
  );
}
