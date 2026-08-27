import { useMemo, useState } from 'react';
import {
  Bot,
  Play,
  Pause,
  ShieldQuestion,
  Sparkles,
  Check,
  X,
  MessageCircle,
  Loader2,
  Linkedin,
  Instagram,
  Music2,
  Clock,
  FileStack,
  TrendingUp,
  Pencil,
  Save,
  Webhook,
  PackageOpen,
  Camera,
  Copy,
} from 'lucide-react';
import { useAgentController } from '../lib/useAgentController';
import { useVideoGeneration, type VideoGenState } from '../lib/useVideoGeneration';
import { useCarouselImages, type CarouselImagesState } from '../lib/useCarouselImages';
import { exportQueueItemBundle } from '../lib/exportBundle';
import MediaPreviewCard from './MediaPreviewCard';
import VideoGenerationButton from './VideoGenerationButton';
import CarouselImageButton, { aspectRatioForPlatform } from './CarouselImageButton';
import RateLimitBanner from './RateLimitBanner';
import {
  AGENT_MODE_LABEL,
  LEAD_INTENT_LABEL,
  QUEUE_STATUS_LABEL,
  PLATFORM_LABEL,
  CONTENT_FORMAT_LABEL,
  VIDEO_GENERATION_ENABLED,
  type AgentMode,
  type Platform,
  type ContentFormat,
  type LeadIntent,
  type QueueItem,
  type VideoProvider,
} from '../lib/agentTypes';

const WHATSAPP_NUMBER = '972506473039';
const CRON_HOUR_UTC = 8; // matches vercel.json's "0 8 * * *"

const MODE_OPTIONS: { id: AgentMode; icon: typeof Play }[] = [
  { id: 'auto-pilot', icon: Play },
  { id: 'semi-auto', icon: ShieldQuestion },
  { id: 'standby', icon: Pause },
];

const PLATFORM_ICON: Record<Platform, typeof Linkedin> = { linkedin: Linkedin, instagram: Instagram, tiktok: Music2 };

const INTENT_COLOR: Record<string, string> = {
  high: 'text-brand-400 border-brand-500/40 bg-brand-500/10',
  medium: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
  low: 'text-zinc-500 border-white/10 bg-white/5',
};

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function nextCronRun(hourUTC: number): Date {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUTC, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function TelemetryStrip({ mode, queue }: { mode: AgentMode; queue: (QueueItem & { id: string })[] }) {
  const stats = useMemo(() => {
    const contentCount = queue.filter((q) => q.kind === 'content').length;
    const engagement = queue.filter((q): q is QueueItem & { id: string; kind: 'engagement' } => q.kind === 'engagement');
    const byIntent: Record<LeadIntent, { total: number; converted: number }> = {
      high: { total: 0, converted: 0 },
      medium: { total: 0, converted: 0 },
      low: { total: 0, converted: 0 },
    };
    for (const item of engagement) {
      byIntent[item.intent].total += 1;
      if (item.status === 'approved' || item.status === 'handed-off') byIntent[item.intent].converted += 1;
    }
    return { contentCount, byIntent };
  }, [queue]);

  const nextRun = mode === 'auto-pilot' ? nextCronRun(CRON_HOUR_UTC) : null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
      <div className="dash-card p-4">
        <span className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 uppercase tracking-wide mb-1.5">
          <Bot className="w-3 h-3" /> מצב נוכחי
        </span>
        <span className="block font-display font-black text-lg text-white">{AGENT_MODE_LABEL[mode]}</span>
      </div>
      <div className="dash-card p-4">
        <span className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 uppercase tracking-wide mb-1.5">
          <Clock className="w-3 h-3" /> ריצה אוטומטית הבאה
        </span>
        <span className="block font-display font-bold text-sm text-white">{nextRun ? timeLabel(nextRun.getTime()) : 'לא פעיל (לא בטייס אוטומטי)'}</span>
      </div>
      <div className="dash-card p-4">
        <span className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 uppercase tracking-wide mb-1.5">
          <FileStack className="w-3 h-3" /> סה״כ תוכן שנוצר
        </span>
        <span className="block font-display font-black text-lg text-white">{stats.contentCount}</span>
      </div>
      <div className="dash-card p-4">
        <span className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 uppercase tracking-wide mb-1.5">
          <TrendingUp className="w-3 h-3" /> המרת כוונת ליד
        </span>
        <div className="flex items-center gap-2 text-[11px]">
          {(['high', 'medium', 'low'] as LeadIntent[]).map((intent) => (
            <span key={intent} className={INTENT_COLOR[intent].split(' ')[0]}>
              {LEAD_INTENT_LABEL[intent]}: {stats.byIntent[intent].converted}/{stats.byIntent[intent].total}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function QueueCard({
  item,
  onStatus,
  onEdit,
  videoState,
  onGenerateVideo,
  carouselImagesState,
  onGenerateCarouselImages,
}: {
  item: QueueItem & { id: string };
  onStatus: (id: string, status: QueueItem['status']) => void;
  onEdit: (id: string, body: string) => void;
  videoState?: VideoGenState;
  onGenerateVideo: (provider: VideoProvider) => void;
  carouselImagesState?: CarouselImagesState;
  onGenerateCarouselImages: () => void;
}) {
  const isEngagement = item.kind === 'engagement';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(isEngagement ? item.draftMessage : item.body);
  const [copied, setCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const finalText = isEngagement ? item.draftMessage : item.body;
  const PlatformIcon = !isEngagement ? PLATFORM_ICON[item.platform] : null;
  const hasMedia = Boolean(carouselImagesState?.compositedImages && carouselImagesState.compositedImages.length > 0);

  const handleApprovePublish = async () => {
    try {
      await navigator.clipboard.writeText(finalText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard permission denied — approval still proceeds, admin just copies manually
    }
    onStatus(item.id, 'approved');
  };

  const handleCopyImagePrompt = async () => {
    if (item.kind !== 'content') return;
    try {
      await navigator.clipboard.writeText(item.imageGenerationPrompt);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      // clipboard permission denied — nothing else to do here
    }
  };

  const openWhatsApp = () => {
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(finalText)}`, '_blank', 'noopener');
    onStatus(item.id, 'handed-off');
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportQueueItemBundle(item, { carouselImages: carouselImagesState?.compositedImages });
    } finally {
      setExporting(false);
    }
  };

  const saveEdit = () => {
    onEdit(item.id, draft);
    setEditing(false);
  };

  return (
    <div className="dash-card p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isEngagement ? (
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${INTENT_COLOR[item.intent]}`}>
              {LEAD_INTENT_LABEL[item.intent]} · {item.intentScore}
            </span>
          ) : (
            <>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full border border-white/10 bg-white/5 text-zinc-400 flex items-center gap-1">
                {PlatformIcon && <PlatformIcon className="w-3 h-3" />}
                {PLATFORM_LABEL[item.platform]}
              </span>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full border border-white/10 bg-white/5 text-zinc-400">{CONTENT_FORMAT_LABEL[item.format]}</span>
            </>
          )}
          <span className={`text-[10px] font-mono px-2 py-1 rounded-full ${item.security.flags.length === 0 ? 'text-brand-400' : 'text-amber-400'}`}>{item.security.badge}</span>
        </div>
        <span className="text-[10px] text-zinc-600 font-mono">{timeLabel(item.createdAt)}</span>
      </div>

      {!isEngagement && <MediaPreviewCard frames={item.mediaPreview} platform={item.platform} />}

      <div className="mt-3">
        {isEngagement && <p className="text-xs text-zinc-500 mb-1">שאילתת ליד: "{item.query}"</p>}
        {!isEngagement && <p className="text-xs text-zinc-500 mb-1">{item.topic}</p>}

        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            className="w-full bg-black/40 border border-brand-500/30 rounded-lg px-3 py-2 text-sm text-white leading-relaxed"
          />
        ) : (
          <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap line-clamp-6">{finalText}</p>
        )}
        {!isEngagement && !editing && item.hashtags && item.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {item.hashtags.map((tag) => (
              <span key={tag} className="text-[10px] text-brand-400 font-mono">
                {tag}
              </span>
            ))}
          </div>
        )}
        {!isEngagement && !editing && item.imageGenerationPrompt && (
          <div className="mt-2 p-2 rounded-lg bg-black/30 border border-white/5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-zinc-500 flex items-center gap-1">
                <Camera className="w-3 h-3" /> פרומפט תמונה (Image Generation)
              </span>
              <button onClick={handleCopyImagePrompt} className="flex items-center gap-1 text-[10px] font-bold text-sky-400 hover:text-sky-300 cursor-pointer">
                <Copy className="w-3 h-3" /> {promptCopied ? 'הועתק ✓' : 'העתקה'}
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed mt-1 line-clamp-3 font-mono" dir="ltr">
              {item.imageGenerationPrompt}
            </p>
          </div>
        )}
      </div>

      {item.security.flags.length > 0 && <p className="text-[11px] text-amber-400/80 mt-2">⚠ דגלים: {item.security.flags.join(', ')}</p>}

      {VIDEO_GENERATION_ENABLED && !isEngagement && item.format === 'video-script' && item.videoScript && (
        <div className="mt-3">
          <VideoGenerationButton state={videoState} onGenerate={onGenerateVideo} />
        </div>
      )}

      {!isEngagement && item.format === 'carousel' && item.carouselSlides && item.carouselSlides.length > 0 && (
        <div className="mt-3">
          <CarouselImageButton state={carouselImagesState} onGenerate={onGenerateCarouselImages} />
        </div>
      )}

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-white/5 text-zinc-400">{QUEUE_STATUS_LABEL[item.status]}</span>

        {editing ? (
          <button onClick={saveEdit} className="flex items-center gap-1 text-[11px] font-bold text-brand-400 hover:text-brand-300 cursor-pointer">
            <Save className="w-3.5 h-3.5" /> שמור
          </button>
        ) : (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-[11px] font-bold text-zinc-400 hover:text-white cursor-pointer">
            <Pencil className="w-3.5 h-3.5" /> עריכה מהירה
          </button>
        )}

        {item.status === 'pending_approval' && !editing && (
          <>
            <button onClick={handleApprovePublish} className="flex items-center gap-1 text-[11px] font-bold text-brand-400 hover:text-brand-300 cursor-pointer">
              <Check className="w-3.5 h-3.5" /> {copied ? 'הועתק ללוח ✓' : 'אישור + העתקה'}
            </button>
            <button onClick={() => onStatus(item.id, 'rejected')} className="flex items-center gap-1 text-[11px] font-bold text-red-400 hover:text-red-300 cursor-pointer">
              <X className="w-3.5 h-3.5" /> דחייה
            </button>
          </>
        )}
        {item.status === 'approved' && !editing && (
          <button onClick={openWhatsApp} className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 cursor-pointer">
            <MessageCircle className="w-3.5 h-3.5" /> העברה ל-WhatsApp
          </button>
        )}
        {!editing && (
          <button onClick={handleExport} disabled={exporting} className="flex items-center gap-1 text-[11px] font-bold text-sky-400 hover:text-sky-300 cursor-pointer disabled:opacity-50">
            <PackageOpen className="w-3.5 h-3.5" /> {exporting ? 'מייצא...' : 'ייצוא חבילה (ZIP)'}
          </button>
        )}
      </div>
      {item.status === 'approved' && (
        <p className="text-[10px] text-zinc-600 mt-1.5">
          "אישור" מעתיק את הטקסט הסופי ללוח — אין כרגע אינטגרציית פרסום חי לרשתות; הדביקו ידנית בפלטפורמה הרצויה.{' '}
          {hasMedia && 'WhatsApp תומך בטקסט מוכן מראש בלבד ולא בצירוף מדיה אוטומטי — לחצו "ייצוא חבילה" כדי להוריד ZIP עם התמונות לצירוף ידני.'}
        </p>
      )}
    </div>
  );
}

function WebhookSettings({ webhooks, onSave }: { webhooks?: { whatsapp?: string; telegram?: string }; onSave: (w: { whatsapp?: string; telegram?: string }) => void }) {
  const [whatsapp, setWhatsapp] = useState(webhooks?.whatsapp ?? '');
  const [telegram, setTelegram] = useState(webhooks?.telegram ?? '');
  const [saved, setSaved] = useState(false);

  const save = () => {
    onSave({ whatsapp: whatsapp.trim() || undefined, telegram: telegram.trim() || undefined });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="dash-card p-6">
      <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
        <Webhook className="w-3.5 h-3.5" />
        התראות Webhook — WhatsApp / Telegram
      </div>
      <p className="text-[11px] text-zinc-600 mb-4 leading-relaxed">
        כל URL מקבל POST עם JSON כשנוצר תוכן חדש בטייס אוטומטי. עבור WhatsApp — הזינו כתובת שירות relay (Make.com/Zapier וכדומה). עבור Telegram — כתובת{' '}
        <code className="text-zinc-400">sendMessage</code> של בוט שיצרתם דרך @BotFather.
      </p>
      <div className="space-y-3">
        <input
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="WhatsApp Webhook URL (אופציונלי)"
          dir="ltr"
          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600"
        />
        <input
          value={telegram}
          onChange={(e) => setTelegram(e.target.value)}
          placeholder="Telegram Bot API URL (אופציונלי)"
          dir="ltr"
          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600"
        />
      </div>
      <button onClick={save} className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-zinc-300 text-xs font-bold cursor-pointer hover:bg-white/10">
        <Save className="w-3.5 h-3.5" /> {saved ? 'נשמר ✓' : 'שמירה'}
      </button>
    </div>
  );
}

export default function AgentControlPanel() {
  const { config, queue, setMode, setWebhooks, setQueueItemStatus, updateQueueItemContent, generateContent, draftEngagement, scoreLead, isRateLimited } = useAgentController();
  const { jobs: videoJobs, generate: generateVideo } = useVideoGeneration();
  const { jobs: carouselImageJobs, generate: generateCarouselImages } = useCarouselImages();
  const [topic, setTopic] = useState('');
  const [platform, setPlatform] = useState<Platform>('linkedin');
  const [format, setFormat] = useState<ContentFormat>('post');
  const [leadQuery, setLeadQuery] = useState('');
  const [scorePreview, setScorePreview] = useState<{ intent: LeadIntent; score: number; reasons: string[] } | null>(null);
  const [busy, setBusy] = useState<'content' | 'engagement' | 'score' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<{ retryAfterSeconds: number } | null>(null);

  const handleGenerateContent = async () => {
    if (!topic.trim()) return;
    setBusy('content');
    setError(null);
    setRateLimit(null);
    try {
      const res = await generateContent(platform, topic, format);
      if (isRateLimited(res)) setRateLimit({ retryAfterSeconds: res.retryAfterSeconds });
      else if (!res.ok) setError('היצירה נכשלה — ודאו ש-GEMINI_API_KEY מוגדר בצד השרת.');
      else setTopic('');
    } catch {
      setError('שגיאת תקשורת מול השרת.');
    } finally {
      setBusy(null);
    }
  };

  const handleScorePreview = async () => {
    if (!leadQuery.trim()) return;
    setBusy('score');
    setError(null);
    try {
      const res = await scoreLead(leadQuery);
      if (res.ok) setScorePreview(res.result);
    } catch {
      setError('שגיאת תקשורת מול השרת.');
    } finally {
      setBusy(null);
    }
  };

  const handleDraftEngagement = async () => {
    if (!leadQuery.trim()) return;
    setBusy('engagement');
    setError(null);
    setRateLimit(null);
    try {
      const res = await draftEngagement(leadQuery);
      if (isRateLimited(res)) setRateLimit({ retryAfterSeconds: res.retryAfterSeconds });
      else if (!res.ok) setError('היצירה נכשלה — ודאו ש-GEMINI_API_KEY מוגדר בצד השרת.');
      else {
        setLeadQuery('');
        setScorePreview(null);
      }
    } catch {
      setError('שגיאת תקשורת מול השרת.');
    } finally {
      setBusy(null);
    }
  };

  const mode = config?.mode ?? 'standby';
  const pendingCount = queue.filter((q) => q.status === 'pending_approval').length;

  return (
    <div id="agent-queue" className="space-y-5">
      <TelemetryStrip mode={mode} queue={queue} />

      {/* Mode control */}
      <div className="dash-card p-6">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
          <Bot className="w-3.5 h-3.5" />
          סוכן AI חברתי — מצב הפעלה
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {MODE_OPTIONS.map((opt) => {
            const active = mode === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setMode(opt.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold cursor-pointer transition-colors ${
                  active ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/10'
                }`}
              >
                <opt.icon className="w-4 h-4" />
                {AGENT_MODE_LABEL[opt.id]}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-zinc-600 mt-3 leading-relaxed">
          "טייס אוטומטי" מייצר 2-3 טיוטות תוכן ביום (Cron יומי, 08:00 UTC) ללוח לבדיקת אדמין, ושולח התראת Webhook אם מוגדרת למטה — הוא{' '}
          <strong className="text-zinc-400">אינו</strong> מפרסם בפועל לרשתות חברתיות; אין כרגע אינטגרציית פרסום חי.
        </p>
      </div>

      {/* Manual triggers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="dash-card p-6">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            יצירת תוכן ידנית
          </div>
          <div className="flex items-center gap-2 mb-3">
            {(['linkedin', 'instagram', 'tiktok'] as Platform[]).map((p) => {
              const Icon = PLATFORM_ICON[p];
              return (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold cursor-pointer ${platform === p ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400'}`}
                >
                  <Icon className="w-3.5 h-3.5" /> {PLATFORM_LABEL[p]}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 mb-3">
            {(VIDEO_GENERATION_ENABLED ? (['post', 'carousel', 'video-script'] as ContentFormat[]) : (['post', 'carousel'] as ContentFormat[])).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold cursor-pointer ${format === f ? 'bg-brand-500/20 border border-brand-500/50 text-brand-300' : 'bg-white/5 border border-white/10 text-zinc-400'}`}
              >
                {CONTENT_FORMAT_LABEL[f]}
              </button>
            ))}
          </div>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="נושא הפוסט..."
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 mb-3"
          />
          <button
            onClick={handleGenerateContent}
            disabled={busy === 'content' || !topic.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-brand-500 text-black text-sm font-bold cursor-pointer disabled:opacity-50"
          >
            {busy === 'content' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            צור תוכן
          </button>
        </div>

        <div className="dash-card p-6">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
            <ShieldQuestion className="w-3.5 h-3.5" />
            ניתוח כוונת ליד + טיוטת פנייה
          </div>
          <input
            value={leadQuery}
            onChange={(e) => {
              setLeadQuery(e.target.value);
              setScorePreview(null);
            }}
            placeholder='למשל: "מתעניין באינטגרציית AI לעסק שלי, מה העלות?"'
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 mb-3"
          />
          <div className="flex items-center gap-2 mb-3">
            <button onClick={handleScorePreview} disabled={busy === 'score' || !leadQuery.trim()} className="flex-1 py-2.5 rounded-lg bg-white/5 border border-white/10 text-zinc-300 text-xs font-bold cursor-pointer disabled:opacity-50">
              בדוק כוונה
            </button>
            <button onClick={handleDraftEngagement} disabled={busy === 'engagement' || !leadQuery.trim()} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-brand-500 text-black text-xs font-bold cursor-pointer disabled:opacity-50">
              {busy === 'engagement' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              נסח פנייה
            </button>
          </div>
          {scorePreview && (
            <div className={`text-xs rounded-lg border px-3 py-2 ${INTENT_COLOR[scorePreview.intent]}`}>
              <strong>{LEAD_INTENT_LABEL[scorePreview.intent]}</strong> (ניקוד {scorePreview.score})
              {scorePreview.reasons.length > 0 && <p className="mt-1 opacity-80">{scorePreview.reasons.join(' · ')}</p>}
            </div>
          )}
        </div>
      </div>

      {rateLimit && <RateLimitBanner retryAfterSeconds={rateLimit.retryAfterSeconds} />}
      {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5">{error}</div>}

      <WebhookSettings webhooks={config?.webhooks} onSave={setWebhooks} />

      {/* Live queue */}
      <div className="dash-card p-6">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
          <Bot className="w-3.5 h-3.5" />
          תור פלט חי ({pendingCount} ממתינים לאישור)
        </div>
        {queue.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-10">התור ריק — צרו תוכן או טיוטת פנייה למעלה.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {queue.map((item) => (
              <QueueCard
                key={item.id}
                item={item}
                onStatus={setQueueItemStatus}
                onEdit={updateQueueItemContent}
                videoState={videoJobs[item.id]}
                onGenerateVideo={(provider) => {
                  if (item.kind === 'content' && item.format === 'video-script') {
                    generateVideo(item.id, item.videoScript, item.topic, '9:16', provider, item.body);
                  }
                }}
                carouselImagesState={carouselImageJobs[item.id]}
                onGenerateCarouselImages={() => {
                  if (item.kind === 'content' && item.format === 'carousel' && item.carouselSlides) {
                    generateCarouselImages(item.id, item.carouselSlides, aspectRatioForPlatform(item.platform), item.topic);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
