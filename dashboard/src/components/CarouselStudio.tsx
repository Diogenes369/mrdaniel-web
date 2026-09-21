import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  Link2,
  Type,
  LayoutTemplate,
  Loader2,
  Download,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Search,
  PenTool,
  Palette,
  ImageDown,
  CheckCircle2,
  XCircle,
  Circle,
  Radio,
} from 'lucide-react';
import type { NewsTopic } from '../lib/newsAgentTypes';
import type { AgentId, AccentKey, StudioSlide, StudioTheme } from '../lib/carouselStudioTypes';
import { STUDIO_PRESETS } from '../lib/carouselStudioTypes';
import { useCarouselStudio } from '../lib/useCarouselStudio';
import { exportStudioZip } from '../lib/web3CarouselRenderer';
import PreviewErrorBoundary from './PreviewErrorBoundary';
import QuickPublishBar from './QuickPublishBar';

const TOPICS: { id: NewsTopic; label: string }[] = [
  { id: 'ai', label: 'AI / בינה מלאכותית' },
  { id: 'ai_models', label: 'מודלי AI וחידושים' },
  { id: 'ai_agents', label: 'סוכני AI' },
  { id: 'general', label: 'AI כללי' },
];

const AGENT_ICON: Record<AgentId, typeof Search> = {
  scraper: Search,
  copywriter: PenTool,
  director: Palette,
  compositor: ImageDown,
};

const LAYOUT_LABEL: Record<string, string> = {
  hero: 'שער / Hook',
  value: 'פסקת ערך',
  checklist: 'צ׳ק-ליסט',
  stat: 'נתון בולט',
  comparison: 'טבלת השוואה',
  prompt: 'תיבת פרומפט',
  quote: 'ציטוט מפתח',
  cta: 'קריאה לפעולה',
};

// 4:5 preview — half the 1080×1350 native size fits the workspace column nicely.
const PREVIEW_W = 380;
const PREVIEW_H = 475;

function PhaseBadge({ phase }: { phase: string }) {
  if (phase === 'done')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-300">
        <CheckCircle2 className="w-3.5 h-3.5" /> הושלם
      </span>
    );
  if (phase === 'running')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> פועל
      </span>
    );
  if (phase === 'error')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-400">
        <XCircle className="w-3.5 h-3.5" /> שגיאה
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-600">
      <Circle className="w-3.5 h-3.5" /> ממתין
    </span>
  );
}

interface SlideDraft {
  headline: string;
  subhead: string;
  body: string;
  quote: string;
  stat: string;
  code: string;
  bullets: string;
  bulletsLeft: string;
  accent: AccentKey;
}

function draftFromSlide(s: StudioSlide): SlideDraft {
  return {
    headline: s.headline,
    subhead: s.subhead,
    body: s.body,
    quote: s.quote,
    stat: s.stat,
    code: s.code,
    bullets: s.bullets.join('\n'),
    bulletsLeft: s.bulletsLeft.join('\n'),
    accent: s.accent,
  };
}

export default function CarouselStudio() {
  const { agents, log, deck, images, busy, renderProgress, error, notice, run, updateSlide, setTheme, reset } =
    useCarouselStudio();

  const [mode, setMode] = useState<'url' | 'text' | 'preset'>('preset');
  const [url, setUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [presetId, setPresetId] = useState(STUDIO_PRESETS[0].id);
  const [topic, setTopic] = useState<NewsTopic>('ai');
  const [theme, setThemeChoice] = useState<StudioTheme>('notes');

  const [active, setActive] = useState(0);
  const [draft, setDraft] = useState<SlideDraft | null>(null);
  const [exporting, setExporting] = useState(false);

  const preset = useMemo(() => STUDIO_PRESETS.find((p) => p.id === presetId) ?? STUDIO_PRESETS[0], [presetId]);

  // keep the inline editor in sync with the active slide
  useEffect(() => {
    if (deck?.slides[active]) setDraft(draftFromSlide(deck.slides[active]));
    else setDraft(null);
  }, [deck, active]);

  useEffect(() => {
    if (deck && active >= deck.slides.length) setActive(0);
  }, [deck, active]);

  const canRun =
    !busy &&
    ((mode === 'url' && url.trim().length > 8) || (mode === 'text' && rawText.trim().length > 40) || mode === 'preset');

  const start = useCallback(() => {
    setActive(0);
    if (mode === 'preset') {
      run({ mode: 'preset', preset, topic: preset.topic, theme });
      setTopic(preset.topic);
    } else if (mode === 'url') {
      run({ mode: 'url', url: url.trim(), topic, theme });
    } else {
      run({ mode: 'text', rawText, topic, theme });
    }
  }, [mode, preset, url, rawText, topic, theme, run]);

  // toggling the theme chip after a deck exists re-renders it in place (no new AI call)
  const pickTheme = useCallback(
    (t: StudioTheme) => {
      setThemeChoice(t);
      if (deck && !busy) setTheme(t);
    },
    [deck, busy, setTheme]
  );

  const applyEdit = useCallback(() => {
    if (!draft || !deck) return;
    updateSlide(active, {
      headline: draft.headline,
      subhead: draft.subhead,
      body: draft.body,
      quote: draft.quote,
      stat: draft.stat,
      code: draft.code,
      bullets: draft.bullets.split('\n').map((l) => l.trim()).filter(Boolean),
      bulletsLeft: draft.bulletsLeft.split('\n').map((l) => l.trim()).filter(Boolean),
      accent: draft.accent,
    });
  }, [draft, deck, active, updateSlide]);

  const doExport = useCallback(async () => {
    if (!deck || !images.length) return;
    setExporting(true);
    try {
      await exportStudioZip(deck, images);
    } finally {
      setExporting(false);
    }
  }, [deck, images]);

  const activeSlide = deck?.slides[active];
  const activeImg = images[Math.min(active, images.length - 1)];

  return (
    <div className="space-y-5">
      {/* 1 · Input Control Center */}
      <div className="dash-card p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <span className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
            <LayoutTemplate className="w-3.5 h-3.5" /> מרכז שליטה · סטודיו קרוסלות WEB3
          </span>
          <span className="text-[11px] text-zinc-600 font-mono">1080×1350 · 4:5 · עברית</span>
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {([
            ['preset', 'תדריך מוכן', LayoutTemplate],
            ['url', 'קישור / כתבה', Link2],
            ['text', 'הדבקת טקסט', Type],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                mode === id ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {/* visual style — switches an existing deck in place, or sets it for the next run */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-[11px] text-zinc-500 font-mono">סגנון:</span>
          {([
            ['notes', '☀️ פנקס לימוד', 'רקע לבן · כותרות מודגשות · תת-כותרת נטויה'],
            ['web3', '🌌 WEB3 ניאון', 'אובסידיאן · ניאון · זכוכית'],
          ] as const).map(([id, label, hint]) => (
            <button
              key={id}
              onClick={() => pickTheme(id)}
              disabled={busy || !!renderProgress}
              title={hint}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50 ${
                theme === id ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'preset' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
            {STUDIO_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPresetId(p.id)}
                className={`text-right px-3 py-3 rounded-lg border text-xs cursor-pointer ${
                  presetId === p.id
                    ? 'bg-brand-500 text-black border-brand-500 font-bold'
                    : 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10'
                }`}
              >
                <span className="block font-bold mb-1">{p.label}</span>
                <span className={`block text-[10px] leading-snug ${presetId === p.id ? 'text-black/70' : 'text-zinc-500'}`}>
                  {p.title}
                </span>
              </button>
            ))}
          </div>
        )}

        {mode === 'url' && (
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…  קישור לכתבה / פוסט LinkedIn / thread"
            dir="ltr"
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 mb-4"
          />
        )}

        {mode === 'text' && (
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="הדביקו כאן טקסט מקור. שורה ראשונה = כותרת, השאר = גוף. ככל שיש יותר תוכן — הקרוסלה עשירה יותר."
            dir="rtl"
            rows={6}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-zinc-200 leading-relaxed resize-y mb-4"
          />
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={mode === 'preset' ? preset.topic : topic}
            onChange={(e) => setTopic(e.target.value as NewsTopic)}
            disabled={mode === 'preset'}
            className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 disabled:opacity-50"
          >
            {TOPICS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            onClick={start}
            disabled={!canRun}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500 text-black text-sm font-bold cursor-pointer disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            נתח וצור קרוסלה
          </button>
          {deck && !busy && (
            <button
              onClick={reset}
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-zinc-400 text-xs font-bold cursor-pointer hover:bg-white/10"
            >
              נקה / התחל מחדש
            </button>
          )}
        </div>

        {error && (
          <p className="mt-3 text-xs text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </p>
        )}
        {notice && !error && <p className="mt-3 text-[11px] text-sky-400/90">{notice}</p>}
      </div>

      {/* 2 · Multi-Agent Live Execution Feed */}
      <div className="dash-card p-6">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
          <Radio className="w-3.5 h-3.5" /> צוות הסוכנים · פיד ריצה חי
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {agents.map((a) => {
            const Icon = AGENT_ICON[a.id];
            return (
              <div
                key={a.id}
                className={`rounded-xl border p-3.5 ${
                  a.phase === 'running'
                    ? 'border-sky-500/40 bg-sky-500/[0.06]'
                    : a.phase === 'done'
                    ? 'border-brand-500/30 bg-brand-500/[0.05]'
                    : a.phase === 'error'
                    ? 'border-red-500/40 bg-red-500/[0.06]'
                    : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <Icon className={`w-4 h-4 ${a.phase === 'idle' ? 'text-zinc-600' : 'text-zinc-300'}`} />
                  <PhaseBadge phase={a.phase} />
                </div>
                <p className="text-sm font-bold text-white leading-tight">{a.label}</p>
                <p className="text-[10px] text-zinc-500 font-mono mb-1.5">{a.role}</p>
                <p className="text-[11px] text-zinc-400 leading-snug min-h-[28px]">{a.detail}</p>
              </div>
            );
          })}
        </div>

        <div className="bg-black/50 border border-white/10 rounded-lg p-3 h-40 overflow-y-auto font-mono text-[11px] leading-relaxed" dir="rtl">
          {log.length === 0 ? (
            <p className="text-zinc-600">— ממתין להפעלה —</p>
          ) : (
            log.map((l, i) => (
              <div key={i} className="text-zinc-400">
                <span className="text-zinc-600">{new Date(l.t).toLocaleTimeString('he-IL')} · </span>
                <span className="text-brand-400">[{l.agent}]</span> {l.text}
              </div>
            ))
          )}
          {renderProgress && (
            <div className="text-sky-400">
              רינדור {renderProgress.done}/{renderProgress.total} שקופיות…
            </div>
          )}
        </div>
      </div>

      {/* 3 · Slide editor + live canvas preview */}
      {deck && (
        <PreviewErrorBoundary
          label="תצוגת הקרוסלה"
          resetKeys={[deck.createdAt, images.length, active]}
          onReset={() => setActive(0)}
        >
          <div className="dash-card p-6">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <span className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
                <LayoutTemplate className="w-3.5 h-3.5" /> {deck.slides.length} שקופיות ·{' '}
                <span className={deck.synthesized ? 'text-brand-400 normal-case' : 'text-amber-400/80 normal-case'}>
                  {deck.synthesized ? 'טקסט AI' : `גיבוי מקומי${deck.fallbackReason ? ` — ${deck.fallbackReason}` : ''}`}
                </span>
              </span>
              <button
                onClick={doExport}
                disabled={exporting || !images.length || busy}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500 text-black text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                ייצא הכל (ZIP · 01→{String(deck.slides.length).padStart(2, '0')})
              </button>
            </div>

            {/* thumbnail rail */}
            <div className="flex items-center gap-1.5 flex-wrap mb-4">
              {deck.slides.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => setActive(i)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                    active === i ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
                  }`}
                  title={LAYOUT_LABEL[s.layout] ?? s.layout}
                >
                  {i + 1}. {LAYOUT_LABEL[s.layout] ?? s.layout}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
              {/* canvas preview + nav */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActive((a) => Math.max(0, a - 1))}
                  disabled={active === 0}
                  className="p-2 rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <div
                  className="relative rounded-2xl overflow-hidden border border-white/10 bg-black shrink-0"
                  style={{ width: PREVIEW_W, height: PREVIEW_H }}
                >
                  {activeImg ? (
                    <img src={activeImg} alt={`שקופית ${active + 1}`} className="w-full h-full object-contain" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-zinc-700">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setActive((a) => Math.min(deck.slides.length - 1, a + 1))}
                  disabled={active >= deck.slides.length - 1}
                  className="p-2 rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>

              {/* inline editor for the active slide */}
              {activeSlide && draft && (
                <div className="space-y-2.5 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-brand-400 font-mono font-bold uppercase tracking-wider">
                      עריכת שקופית {active + 1} · {LAYOUT_LABEL[activeSlide.layout] ?? activeSlide.layout}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-zinc-500 font-mono">גוון:</span>
                      {(['green', 'cyan'] as AccentKey[]).map((c) => (
                        <button
                          key={c}
                          onClick={() => setDraft({ ...draft, accent: c })}
                          className={`px-2 py-1 rounded text-[10px] font-bold font-mono cursor-pointer ${
                            draft.accent === c ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
                          }`}
                        >
                          {c === 'green' ? 'ירוק' : 'ציאן'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {activeSlide.layout !== 'quote' && (
                    <input
                      value={draft.headline}
                      onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
                      placeholder="כותרת"
                      dir="rtl"
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 font-bold"
                    />
                  )}

                  {activeSlide.layout === 'hero' && (
                    <input
                      value={draft.subhead}
                      onChange={(e) => setDraft({ ...draft, subhead: e.target.value })}
                      placeholder="כותרת משנה / פער סקרנות"
                      dir="rtl"
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200"
                    />
                  )}

                  {activeSlide.layout === 'stat' && (
                    <input
                      value={draft.stat}
                      onChange={(e) => setDraft({ ...draft, stat: e.target.value })}
                      placeholder="המספר הבולט (למשל 83% / פי 4)"
                      dir="rtl"
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 font-bold"
                    />
                  )}

                  {activeSlide.layout === 'quote' && (
                    <textarea
                      value={draft.quote}
                      onChange={(e) => setDraft({ ...draft, quote: e.target.value })}
                      placeholder="ציטוט המפתח"
                      dir="rtl"
                      rows={3}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 leading-relaxed resize-y"
                    />
                  )}

                  {activeSlide.layout === 'prompt' && (
                    <textarea
                      value={draft.code}
                      onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                      placeholder="תוכן תיבת הפרומפט / הקוד"
                      dir="ltr"
                      rows={5}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 leading-relaxed resize-y font-mono"
                    />
                  )}

                  {(activeSlide.layout === 'checklist' || activeSlide.layout === 'comparison') && (
                    <textarea
                      value={draft.bullets}
                      onChange={(e) => setDraft({ ...draft, bullets: e.target.value })}
                      placeholder={activeSlide.layout === 'comparison' ? 'עמודה שמאלית — פריט בכל שורה' : 'פריט בכל שורה (3–5)'}
                      dir="rtl"
                      rows={4}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 leading-relaxed resize-y"
                    />
                  )}

                  {activeSlide.layout === 'comparison' && (
                    <textarea
                      value={draft.bulletsLeft}
                      onChange={(e) => setDraft({ ...draft, bulletsLeft: e.target.value })}
                      placeholder="עמודה ימנית — פריט בכל שורה"
                      dir="rtl"
                      rows={4}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 leading-relaxed resize-y"
                    />
                  )}

                  {['value', 'stat', 'cta', 'quote'].includes(activeSlide.layout) && (
                    <textarea
                      value={draft.body}
                      onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                      placeholder="פסקת גוף / הסבר"
                      dir="rtl"
                      rows={4}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-zinc-200 leading-relaxed resize-y"
                    />
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={applyEdit}
                      disabled={!!renderProgress}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-black text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      {renderProgress ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PenTool className="w-3.5 h-3.5" />}
                      עדכן ורנדר מחדש
                    </button>
                    <button
                      onClick={() => setDraft(draftFromSlide(activeSlide))}
                      className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-400 text-xs font-bold cursor-pointer hover:bg-white/10"
                    >
                      בטל שינויים
                    </button>
                  </div>
                </div>
              )}
            </div>

            <QuickPublishBar
              text={deck.caption}
              image={activeImg}
              label="פרסום מהיר · קרוסלת WEB3"
              className="mt-5 justify-center"
            />

            <details className="mt-4">
              <summary className="text-[11px] text-zinc-500 cursor-pointer font-mono">כיתוב + האשטגים לקרוסלה</summary>
              <div className="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-3">
                <pre
                  className="text-[11px] text-zinc-300 bg-black/40 border border-white/10 rounded-lg p-3 whitespace-pre-wrap leading-relaxed"
                  dir="rtl"
                >
                  {deck.caption}
                </pre>
                <div className="flex flex-wrap gap-1.5 content-start">
                  {deck.hashtags.map((t) => (
                    <span
                      key={t}
                      className="text-[11px] text-brand-400 font-mono bg-brand-500/10 border border-brand-500/20 rounded px-1.5 py-0.5 h-fit"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </details>
          </div>
        </PreviewErrorBoundary>
      )}

      {!deck && !busy && (
        <div className="dash-card p-10 text-center text-zinc-500 text-sm leading-relaxed">
          בחרו תדריך מוכן, הדביקו קישור, או הזינו טקסט — וצוות ארבעת הסוכנים (סורק → קופירייטר → קריאייטיב → קומפוזיטור)
          יפיק קרוסלת אינסטגרם של 10–14 שקופיות בעברית, בסגנון "פנקס לימוד" בהיר או "WEB3 ניאון" — ניתן להחליף סגנון גם אחרי היצירה — מוכנה לייצוא כ-ZIP.
        </div>
      )}
    </div>
  );
}
