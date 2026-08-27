import type { MediaFrameSpec, Platform } from '../lib/agentTypes';

// Real HTML/CSS rendering of the structural frame spec MediaTemplateRenderer.ts computes — not a
// rasterized image or video file (there is no video-encoding pipeline in this codebase; see that
// file's header comment for why). This IS a genuine, live visual preview though: real Hebrew copy,
// the dashboard's actual loaded Heebo/Rubik Google Fonts, real brand colors, and the correct
// aspect ratio per platform, all rendered directly by the browser.

const ASPECT_CLASS: Record<Platform, string> = {
  tiktok: 'aspect-[9/16]',
  instagram: 'aspect-square',
  linkedin: 'aspect-[1.91/1]',
};

const ACCENT_GRADIENT: Record<MediaFrameSpec['accent'], string> = {
  brand: 'from-brand-600 via-brand-500 to-brand-400',
  blue: 'from-sky-700 via-sky-500 to-cyan-400',
  cyan: 'from-cyan-700 via-cyan-500 to-brand-400',
};

function FrameTile({ frame }: { frame: MediaFrameSpec }) {
  return (
    <div className={`relative w-24 shrink-0 rounded-lg overflow-hidden bg-gradient-to-br ${ACCENT_GRADIENT[frame.accent]} ${ASPECT_CLASS.instagram} flex flex-col justify-between p-2`}>
      <span className="text-[8px] font-mono font-bold text-black/50">
        {frame.frameIndex + 1}/{frame.totalFrames}
      </span>
      <span className="font-display text-[10px] font-bold text-black leading-tight line-clamp-4" dir="rtl">
        {frame.headline}
      </span>
    </div>
  );
}

export default function MediaPreviewCard({ frames, platform }: { frames: MediaFrameSpec[]; platform: Platform }) {
  const hero = frames[0];
  if (!hero) return null;

  return (
    <div className="space-y-2">
      <div className={`relative w-full max-w-[220px] mx-auto rounded-xl overflow-hidden bg-gradient-to-br ${ACCENT_GRADIENT[hero.accent]} ${ASPECT_CLASS[platform]} flex flex-col justify-between p-4`}>
        <span className="text-[10px] font-mono font-bold text-black/50 uppercase tracking-wide">{platform}</span>
        <div>
          <p className="font-display font-black text-black text-base leading-snug mb-1" dir="rtl">
            {hero.headline}
          </p>
          {hero.subtext && (
            <p className="font-sans text-black/70 text-xs leading-snug line-clamp-3" dir="rtl">
              {hero.subtext}
            </p>
          )}
        </div>
      </div>

      {frames.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-[220px] mx-auto">
          {frames.map((f) => (
            <FrameTile key={f.frameIndex} frame={f} />
          ))}
        </div>
      )}
    </div>
  );
}
