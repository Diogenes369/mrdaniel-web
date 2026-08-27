import { useState } from 'react';
import { Clapperboard, Download, Loader2, AlertTriangle } from 'lucide-react';
import type { VideoGenState } from '../lib/useVideoGeneration';
import { VIDEO_PROVIDER_LABEL, VIDEO_PROVIDER_OPTIONS, type VideoProvider } from '../lib/agentTypes';

interface Props {
  state: VideoGenState | undefined;
  onGenerate: (provider: VideoProvider) => void;
  aspectRatio?: '9:16' | '16:9';
}

/** Renders inline inside a card: a model dropdown + the "צור וידאו AI" trigger, a
 * rendering/generating status line while the chosen provider works, or — once done — an actual
 * <video> preview player plus a real "הורד וידאו (MP4)" download link. Shared between
 * AgentControlPanel's QueueCard and WeeklyPlanCalendar's DayCard so both surfaces behave
 * identically and offer the same five-provider choice. */
export default function VideoGenerationButton({ state, onGenerate, aspectRatio = '9:16' }: Props) {
  const [provider, setProvider] = useState<VideoProvider>('runway');

  if (!state || state.status === 'error') {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as VideoProvider)}
            className="text-[11px] bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-zinc-300 cursor-pointer"
          >
            {VIDEO_PROVIDER_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {VIDEO_PROVIDER_LABEL[p]}
              </option>
            ))}
          </select>
          <button
            onClick={() => onGenerate(provider)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-bold cursor-pointer hover:bg-purple-500/20 transition-colors"
          >
            <Clapperboard className="w-3.5 h-3.5" />
            צור וידאו AI
          </button>
        </div>
        {state?.status === 'error' && (
          <p className="flex items-start gap-1.5 text-[11px] text-red-400 leading-relaxed max-w-sm">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            <span>{state.error || 'יצירת הווידאו נכשלה'}</span>
          </p>
        )}
      </div>
    );
  }

  if (state.status === 'processing') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-400 text-xs font-bold">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        מרנדר... יוצר קובץ MP4 (יכול לקחת דקה-שתיים)
      </div>
    );
  }

  // done
  return (
    <div className="space-y-2">
      <video
        src={state.videoDataUrl}
        controls
        playsInline
        className={`rounded-lg border border-white/10 bg-black ${aspectRatio === '9:16' ? 'aspect-[9/16] max-w-[220px]' : 'aspect-video w-full max-w-sm'}`}
      />
      <div className="flex items-center gap-2">
        <a
          href={state.videoDataUrl}
          download="mrdaniel-ai-video.mp4"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-500/10 border border-brand-500/30 text-brand-300 text-xs font-bold cursor-pointer hover:bg-brand-500/20 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          הורד וידאו (MP4)
        </a>
        <button onClick={() => onGenerate(provider)} className="text-[11px] text-zinc-500 hover:text-zinc-300 underline cursor-pointer">
          צור מחדש
        </button>
      </div>
    </div>
  );
}
