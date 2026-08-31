import { Images, Loader2, AlertTriangle, Download } from 'lucide-react';
import type { CarouselImagesState } from '../lib/useCarouselImages';
import type { Platform } from '../lib/agentTypes';

// Mirrors MediaPreviewCard's per-platform aspect mapping — the rendered slide cards should match
// the same real-world aspect ratio the platform actually publishes in.
const ASPECT_BY_PLATFORM: Record<Platform, '9:16' | '1:1' | '1.91:1'> = {
  tiktok: '9:16',
  instagram: '1:1',
  linkedin: '1.91:1',
};

export function aspectRatioForPlatform(platform: Platform): '9:16' | '1:1' | '1.91:1' {
  return ASPECT_BY_PLATFORM[platform];
}

interface Props {
  state: CarouselImagesState | undefined;
  onGenerate: () => void;
}

/** "צור תמונות לקרוסלה" — renders every slide through the deterministic template engine (see
 * carouselTemplateRenderer.ts): same dark charcoal frame, same brand mark position, same page
 * counter, on every card, differing only by the slide's own text and its hook/body/CTA role. Being
 * a local canvas render with no network call, this has no external failure mode to gracefully
 * degrade from — the small error state below exists only for the practically-unreachable case of a
 * browser without canvas support. */
export default function CarouselImageButton({ state, onGenerate }: Props) {
  if (!state || state.status === 'error') {
    return (
      <div className="space-y-1.5">
        <button
          onClick={onGenerate}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-bold cursor-pointer hover:bg-cyan-500/20 transition-colors"
        >
          <Images className="w-3.5 h-3.5" />
          צור תמונות לקרוסלה
        </button>
        {state?.status === 'error' && (
          <p className="flex items-start gap-1.5 text-[11px] text-red-400 leading-relaxed max-w-sm">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            <span>{state.error || 'יצירת התמונות נכשלה'}</span>
          </p>
        )}
      </div>
    );
  }

  if (state.status === 'rendering') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-400 text-xs font-bold">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        מעצב את השקופיות...
      </div>
    );
  }

  const images = state.compositedImages ?? [];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start gap-1.5">
        {images.map((src, i) => (
          <a
            key={i}
            href={src}
            download={`slide-${i + 1}.png`}
            className="relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-white/10 group"
            title={`הורד שקופית ${i + 1}`}
          >
            <img src={src} alt={`שקופית ${i + 1}`} className="w-full h-full object-cover" />
            <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Download className="w-4 h-4 text-white" />
            </span>
          </a>
        ))}
      </div>
      <button onClick={onGenerate} className="text-[11px] text-zinc-500 hover:text-zinc-300 underline cursor-pointer">
        צור מחדש
      </button>
    </div>
  );
}
