import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface Props {
  retryAfterSeconds: number;
}

function formatCountdown(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}:${s.toString().padStart(2, '0')} דקות` : `${m} דקות`;
  }
  return `${seconds} שניות`;
}

/** "Hit the free Gemini API quota" banner for text generation (manual content generation, engagement
 * drafting, the weekly planner) — see api/agent-generate.ts's/api/generate-weekly-plan.ts's
 * detectGeminiRateLimit. Ticks its own countdown down live so the admin sees real progress instead
 * of a static "try again later". Carousel slide images no longer go through any external provider
 * (see carouselTemplateRenderer.ts) so they have no rate-limit case of their own anymore. */
export default function RateLimitBanner({ retryAfterSeconds }: Props) {
  const [remaining, setRemaining] = useState(retryAfterSeconds);

  useEffect(() => {
    setRemaining(retryAfterSeconds);
    const id = window.setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => window.clearInterval(id);
  }, [retryAfterSeconds]);

  return (
    <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2.5">
      <Clock className="w-4 h-4 mt-0.5 shrink-0" />
      <span>
        ⚠️ הגעת למגבלת המכסה החינמית. {remaining > 0 ? <>היצירה תתחדש בעוד <strong>{formatCountdown(remaining)}</strong>.</> : 'אפשר לנסות שוב עכשיו.'}
      </span>
    </div>
  );
}
