import { useState } from 'react';
import { Calendar, Sparkles, Loader2, Check, Pencil, Save, Copy, ChevronDown, Linkedin, Instagram, Music2, Youtube } from 'lucide-react';
import { useWeeklyPlan } from '../lib/useWeeklyPlan';
import { useVideoGeneration, type VideoGenState } from '../lib/useVideoGeneration';
import { VIDEO_GENERATION_ENABLED, type VideoProvider } from '../lib/agentTypes';
import VideoGenerationButton from './VideoGenerationButton';
import RateLimitBanner from './RateLimitBanner';
import {
  WEEKLY_TOPIC_LABEL,
  WEEKLY_PLATFORM_LABEL,
  STATUS_LABEL,
  type DailyContentPlan,
  type ContentStatus,
  type WeeklyPlatform,
} from '../lib/weeklyPlanTypes';

const PLATFORM_ICON: Record<WeeklyPlatform, typeof Linkedin> = {
  linkedin: Linkedin,
  'instagram-reels': Instagram,
  tiktok: Music2,
  'youtube-shorts': Youtube,
};

const STATUS_COLOR: Record<ContentStatus, string> = {
  draft: 'text-zinc-400 border-white/10 bg-white/5',
  approved: 'text-brand-400 border-brand-500/40 bg-brand-500/10',
  scheduled: 'text-sky-400 border-sky-500/40 bg-sky-500/10',
};

function formatDayForCopy(day: DailyContentPlan): string {
  return [
    `📅 ${day.day} · ${WEEKLY_PLATFORM_LABEL[day.platform]} · ${WEEKLY_TOPIC_LABEL[day.topic]}`,
    '',
    '--- פוסט ---',
    day.postText,
    '',
    `האשטגים: ${day.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`,
    '',
    '--- תסריט וידאו ---',
    `Hook: ${day.videoScript.hook}`,
    `Body: ${day.videoScript.body}`,
    `CTA: ${day.videoScript.cta}`,
    'Visual cues / B-roll:',
    ...day.videoScript.visualCues.map((cue) => `  • ${cue}`),
  ].join('\n');
}

function DayCard({
  day,
  onStatus,
  onSaveText,
  videoState,
  onGenerateVideo,
}: {
  day: DailyContentPlan;
  onStatus: (status: ContentStatus) => void;
  onSaveText: (text: string) => void;
  videoState?: VideoGenState;
  onGenerateVideo: (provider: VideoProvider) => void;
}) {
  const [scriptOpen, setScriptOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(day.postText);
  const [copied, setCopied] = useState(false);
  const PlatformIcon = PLATFORM_ICON[day.platform];

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(formatDayForCopy(day));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard permission denied — silently no-op, nothing else to fall back to here
    }
  };

  const saveEdit = () => {
    onSaveText(draft);
    setEditing(false);
  };

  return (
    <div className="dash-card p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-1.5">
        <span className="font-display font-black text-base text-white">{day.day}</span>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${STATUS_COLOR[day.status]}`}>{STATUS_LABEL[day.status]}</span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border border-white/10 bg-white/5 text-zinc-400">
          <PlatformIcon className="w-3 h-3" />
          {WEEKLY_PLATFORM_LABEL[day.platform]}
        </span>
        <span className="text-[10px] font-bold px-2 py-1 rounded-full border border-brand-500/20 bg-brand-500/5 text-brand-400">{WEEKLY_TOPIC_LABEL[day.topic]}</span>
        <span className={`text-[10px] font-mono px-1.5 py-1 ${day.security.flags.length === 0 ? 'text-brand-400' : 'text-amber-400'}`}>{day.security.badge}</span>
      </div>

      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          className="w-full bg-black/40 border border-brand-500/30 rounded-lg px-3 py-2 text-sm text-white leading-relaxed mb-3"
        />
      ) : (
        <p className="text-sm text-zinc-200 leading-relaxed line-clamp-5 mb-2">{day.postText}</p>
      )}

      {!editing && day.hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {day.hashtags.map((tag) => (
            <span key={tag} className="text-[10px] text-brand-400 font-mono">
              {tag.startsWith('#') ? tag : `#${tag}`}
            </span>
          ))}
        </div>
      )}

      <button
        onClick={() => setScriptOpen((v) => !v)}
        className="flex items-center justify-between text-[11px] font-bold text-zinc-400 hover:text-white mb-2 cursor-pointer"
      >
        תסריט וידאו
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${scriptOpen ? 'rotate-180' : ''}`} />
      </button>
      {scriptOpen && (
        <div className="bg-black/30 border border-white/10 rounded-lg p-3 text-xs text-zinc-300 space-y-2 mb-3">
          <p><strong className="text-brand-400">Hook:</strong> {day.videoScript.hook}</p>
          <p><strong className="text-brand-400">Body:</strong> {day.videoScript.body}</p>
          <p><strong className="text-brand-400">CTA:</strong> {day.videoScript.cta}</p>
          {day.videoScript.visualCues.length > 0 && (
            <div>
              <strong className="text-brand-400">Visual cues:</strong>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                {day.videoScript.visualCues.map((cue, i) => (
                  <li key={i}>{cue}</li>
                ))}
              </ul>
            </div>
          )}
          {VIDEO_GENERATION_ENABLED && (
            <div className="pt-1">
              <VideoGenerationButton state={videoState} onGenerate={onGenerateVideo} />
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap mt-auto pt-2 border-t border-white/5">
        {editing ? (
          <button onClick={saveEdit} className="flex items-center gap-1 text-[11px] font-bold text-brand-400 hover:text-brand-300 cursor-pointer">
            <Save className="w-3.5 h-3.5" /> שמור
          </button>
        ) : (
          <button onClick={() => { setDraft(day.postText); setEditing(true); }} className="flex items-center gap-1 text-[11px] font-bold text-zinc-400 hover:text-white cursor-pointer">
            <Pencil className="w-3.5 h-3.5" /> עריכה
          </button>
        )}
        <button onClick={() => onStatus('approved')} className="flex items-center gap-1 text-[11px] font-bold text-brand-400 hover:text-brand-300 cursor-pointer">
          <Check className="w-3.5 h-3.5" /> אישור
        </button>
        <button onClick={handleCopyAll} className="flex items-center gap-1 text-[11px] font-bold text-sky-400 hover:text-sky-300 cursor-pointer">
          <Copy className="w-3.5 h-3.5" /> {copied ? 'הועתק ✓' : 'העתק הכל'}
        </button>
        <select
          value={day.status}
          onChange={(e) => onStatus(e.target.value as ContentStatus)}
          className="mr-auto text-[10px] bg-black/40 border border-white/10 rounded-md px-1.5 py-1 text-zinc-300 cursor-pointer"
        >
          {(Object.keys(STATUS_LABEL) as ContentStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default function WeeklyPlanCalendar() {
  const { plan, generating, error, rateLimit, generateNewPlan, setDayStatus, setDayPostText } = useWeeklyPlan();
  const { jobs: videoJobs, generate: generateVideo } = useVideoGeneration();

  return (
    <div className="space-y-5">
      <div className="dash-card p-6 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
          <Calendar className="w-3.5 h-3.5" />
          לוח תוכן שבועי {plan ? `· נוצר ${new Date(plan.generatedAt).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
        </div>
        <button
          onClick={generateNewPlan}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-brand-500 text-black text-sm font-bold cursor-pointer disabled:opacity-50"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          צור תוכנית שבועית חדשה
        </button>
      </div>

      {rateLimit && <RateLimitBanner retryAfterSeconds={rateLimit.retryAfterSeconds} />}
      {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5">{error}</div>}

      {!plan ? (
        <div className="dash-card p-10 text-center text-zinc-500 text-sm">אין עדיין תוכנית שבועית — לחצו על "צור תוכנית שבועית חדשה" למעלה.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {plan.days.map((day) => (
            <DayCard
              key={day.dayIndex}
              day={day}
              onStatus={(status) => setDayStatus(day.dayIndex, status)}
              onSaveText={(text) => setDayPostText(day.dayIndex, text)}
              videoState={videoJobs[`weekly-${day.dayIndex}`]}
              onGenerateVideo={(provider: VideoProvider) =>
                generateVideo(
                  `weekly-${day.dayIndex}`,
                  { hook: day.videoScript.hook, cta: day.videoScript.cta, body: day.videoScript.body, visualCues: day.videoScript.visualCues },
                  `${WEEKLY_TOPIC_LABEL[day.topic]} — ${WEEKLY_PLATFORM_LABEL[day.platform]}`,
                  '9:16',
                  provider,
                  day.postText
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
