import { useState, type ReactNode } from 'react';
import {
  Bot,
  Power,
  Clock,
  Linkedin,
  Layers,
  ShieldQuestion,
  Rocket,
  Save,
  Play,
  Loader2,
  Check,
  X,
  AlertTriangle,
  ExternalLink,
  History,
} from 'lucide-react';
import { useAutoPublisher, type AutoPublisherRun } from '../lib/useAutoPublisher';
import {
  CATEGORY_LABEL,
  FREQUENCY_LABEL,
  MODE_LABEL,
  PLATFORM_LABEL,
  STATUS_META,
  type APCategory,
  type APFrequency,
  type APMode,
  type APPlatform,
} from '../lib/autoPublisherTypes';

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-colors ${
        active ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/10'
      }`}
    >
      {children}
    </button>
  );
}

function timeLabel(ts: number): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function RunRow({ run, onApprove }: { run: AutoPublisherRun; onApprove: (r: AutoPublisherRun) => Promise<{ ok: boolean; message: string }> }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const meta = STATUS_META[run.status];

  const approve = async () => {
    setBusy(true);
    const res = await onApprove(run);
    setMsg(res.message);
    setBusy(false);
  };

  return (
    <div className="dash-card p-4">
      <div className="flex items-start gap-3">
        {run.imageUrl && (
          <img src={run.imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover border border-white/10 shrink-0" loading="lazy" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.className}`}>{meta.label}</span>
            <span className="text-[10px] font-mono text-zinc-500">{CATEGORY_LABEL[run.category as APCategory] ?? run.category}</span>
            <span className="text-[10px] font-mono text-zinc-600">· {run.platform}</span>
            <span className="text-[10px] font-mono text-zinc-600">· {timeLabel(run.createdAt)}</span>
          </div>
          <p className="text-sm text-zinc-200 font-bold leading-snug line-clamp-2">{run.newsTitle}</p>
          {run.detail && <p className="text-[11px] text-zinc-500 mt-0.5">{run.detail}</p>}

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <button onClick={() => setExpanded((v) => !v)} className="text-[11px] font-bold text-sky-400 hover:text-sky-300 cursor-pointer">
              {expanded ? 'הסתר טקסט' : 'הצג טקסט מלא'}
            </button>
            {run.newsLink && (
              <a href={run.newsLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white">
                <ExternalLink className="w-3 h-3" /> כתבה
              </a>
            )}
            {run.status === 'pending_approval' && (
              <button
                onClick={approve}
                disabled={busy}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-400 hover:text-brand-300 cursor-pointer disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} אשר ופרסם
              </button>
            )}
            {msg && <span className="text-[11px] text-zinc-400">{msg}</span>}
          </div>

          {expanded && (
            <pre dir="rtl" className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-300 bg-black/30 border border-white/10 rounded-lg p-3 max-h-72 overflow-y-auto">
              {run.caption}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AutoPublisherPanel() {
  const { config, runs, loaded, saveConfig, runNow, approveAndPublish } = useAutoPublisher();
  const [webhookDraft, setWebhookDraft] = useState<string | null>(null);
  const [webhookSaved, setWebhookSaved] = useState(false);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [customHours, setCustomHours] = useState<Set<number>>(new Set(config.slotsUTC));

  const webhookValue = webhookDraft ?? config.publishWebhookUrl;

  const saveWebhook = () => {
    saveConfig({ publishWebhookUrl: (webhookDraft ?? config.publishWebhookUrl).trim() });
    setWebhookSaved(true);
    window.setTimeout(() => setWebhookSaved(false), 2000);
  };

  const setFrequency = (f: APFrequency) => {
    if (f === 'custom') {
      const hours = customHours.size ? [...customHours].sort((a, b) => a - b) : [9];
      setCustomHours(new Set(hours));
      saveConfig({ frequency: 'custom', slotsUTC: hours });
    } else {
      saveConfig({ frequency: f });
    }
  };

  const toggleCustomHour = (h: number) => {
    const next = new Set(customHours);
    next.has(h) ? next.delete(h) : next.add(h);
    setCustomHours(next);
    saveConfig({ frequency: 'custom', slotsUTC: [...next].sort((a, b) => a - b) });
  };

  const doRunNow = async () => {
    setRunning(true);
    setRunMsg(null);
    const res = await runNow();
    setRunMsg(res.message);
    setRunning(false);
  };

  if (!loaded) {
    return <div className="dash-card p-10 text-center text-zinc-500 text-sm">טוען הגדרות…</div>;
  }

  return (
    <div className="space-y-5">
      {/* Master switch */}
      <div className="dash-card p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${config.active ? 'bg-brand-500/15 text-brand-300' : 'bg-white/5 text-zinc-500'}`}>
              <Bot className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-display font-black text-lg text-white">מנוע פרסום אוטונומי</h3>
              <p className="text-xs text-zinc-500">מושך חדשות, מנסח פוסט מלא ותמונה, ומפרסם לפי לוח זמנים.</p>
            </div>
          </div>
          <button
            onClick={() => saveConfig({ active: !config.active })}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold cursor-pointer transition-colors ${
              config.active ? 'bg-brand-500 text-black' : 'bg-white/10 text-zinc-300 border border-white/15'
            }`}
          >
            <Power className="w-4 h-4" />
            {config.active ? 'פעיל' : 'מושהה'}
          </button>
        </div>
      </div>

      {/* Settings grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="dash-card p-6">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
            <Clock className="w-3.5 h-3.5" /> תדירות
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {(Object.keys(FREQUENCY_LABEL) as APFrequency[]).map((f) => (
              <Pill key={f} active={config.frequency === f} onClick={() => setFrequency(f)}>
                {FREQUENCY_LABEL[f]}
              </Pill>
            ))}
          </div>
          {config.frequency === 'custom' ? (
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 24 }, (_, h) => (
                <button
                  key={h}
                  onClick={() => toggleCustomHour(h)}
                  className={`w-9 h-8 rounded-md text-[11px] font-mono cursor-pointer ${
                    customHours.has(h) ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-500 border border-white/10'
                  }`}
                >
                  {String(h).padStart(2, '0')}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-zinc-500 font-mono" dir="ltr">
              slots (UTC): {config.slotsUTC.map((h) => `${String(h).padStart(2, '0')}:00`).join(' · ')}
            </p>
          )}
          <p className="text-[10px] text-zinc-600 mt-2 leading-relaxed">
            שעות ב-UTC. ה-Cron של Vercel רץ מדי שעה 06:00–22:00 UTC ומפרסם רק בשעות המסומנות (מחוץ לטווח — הפעילו ידנית).
          </p>
        </div>

        <div className="dash-card p-6 space-y-4">
          <div>
            <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-2">
              <Linkedin className="w-3.5 h-3.5" /> פלטפורמה
            </div>
            <div className="flex flex-wrap gap-2">
              {(['linkedin', 'instagram', 'all'] as APPlatform[]).map((p) => (
                <Pill key={p} active={config.platform === p} onClick={() => saveConfig({ platform: p })}>
                  {PLATFORM_LABEL[p]}
                </Pill>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-2">
              <Layers className="w-3.5 h-3.5" /> קטגוריות יעד
            </div>
            <div className="flex flex-wrap gap-2">
              {(['cyber', 'ai', 'tech', 'auto'] as APCategory[]).map((c) => (
                <Pill key={c} active={config.category === c} onClick={() => saveConfig({ category: c })}>
                  {CATEGORY_LABEL[c]}
                </Pill>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-2">
              <ShieldQuestion className="w-3.5 h-3.5" /> מצב הפעלה
            </div>
            <div className="flex flex-wrap gap-2">
              {(['full-auto', 'drafts'] as APMode[]).map((m) => (
                <Pill key={m} active={config.mode === m} onClick={() => saveConfig({ mode: m })}>
                  {m === 'full-auto' ? <Rocket className="inline w-3 h-3 -mt-0.5" /> : <ShieldQuestion className="inline w-3 h-3 -mt-0.5" />} {MODE_LABEL[m]}
                </Pill>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Webhook + manual run */}
      <div className="dash-card p-6">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-3">
          <ExternalLink className="w-3.5 h-3.5" /> Webhook פרסום (Make.com / n8n / Buffer / Zapier)
        </div>
        <p className="text-[11px] text-zinc-600 mb-3 leading-relaxed">
          כתובת שמקבלת POST עם JSON: <code className="text-zinc-400">{'{ platform, caption, hashtags, imageUrl, newsTitle, newsLink, category }'}</code>. ה-Webhook אחראי על הפרסום בפועל בחשבונות.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={webhookValue}
            onChange={(e) => setWebhookDraft(e.target.value)}
            placeholder="https://hook.eu2.make.com/..."
            dir="ltr"
            className="flex-1 min-w-[240px] bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600"
          />
          <button onClick={saveWebhook} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-zinc-300 text-xs font-bold cursor-pointer hover:bg-white/10">
            <Save className="w-3.5 h-3.5" /> {webhookSaved ? 'נשמר ✓' : 'שמירה'}
          </button>
          <button
            onClick={doRunNow}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 text-black text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} הפעל מחזור עכשיו (בדיקה)
          </button>
        </div>
        {runMsg && <p className="text-[11px] text-zinc-400 mt-2 flex items-center gap-1.5"><AlertTriangle className="w-3 h-3" /> {runMsg}</p>}
        {config.mode === 'full-auto' && !config.publishWebhookUrl && (
          <p className="text-[11px] text-amber-400 mt-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3" /> מצב "פרסום אוטומטי מלא" פעיל אך לא הוגדר Webhook — ריצות יירשמו כ"נכשל".
          </p>
        )}
      </div>

      {/* Execution history */}
      <div className="dash-card p-6">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
          <History className="w-3.5 h-3.5" /> היסטוריית ריצות ({runs.length})
        </div>
        {runs.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-10 flex flex-col items-center gap-2">
            <X className="w-5 h-5 text-zinc-700" />
            אין ריצות עדיין — הפעילו את המנוע או לחצו "הפעל מחזור עכשיו".
          </p>
        ) : (
          <div className="space-y-3">
            {runs.map((run) => (
              <RunRow key={run.id} run={run} onApprove={approveAndPublish} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
