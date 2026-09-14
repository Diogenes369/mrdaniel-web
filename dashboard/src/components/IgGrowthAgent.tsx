import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  Radar,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
  Sparkles,
  MessageSquarePlus,
  Link2,
  Instagram,
  RefreshCw,
  Flame,
  ArrowUpRight,
  Minus,
} from 'lucide-react';
import { fetchNewsList } from '../lib/newsFeedClient';
import { importUrl } from '../lib/repurposeApi';
import { copyAndOpen, INSTAGRAM_PROFILE_URL } from '../lib/socialPublish';
import { CATEGORY_LABEL, type NewsCategory } from '../lib/newsAgentTypes';
import {
  fetchTrendRadar,
  generateEngagementReplies,
  newsItemsToTrendSources,
} from '../lib/igGrowthApi';
import {
  BLUEPRINT_META,
  MOMENTUM_META,
  REPLY_META,
  type BlueprintFormat,
  type EngagementReplySet,
  type TrendMomentum,
  type TrendRadar,
} from '../lib/igGrowthTypes';

const RADAR_KEY = 'ig:radar_v1';
const REPLIES_KEY = 'ig:replies_v1';
const REPLY_INPUT_KEY = 'ig:reply_input_v1';

const SOURCE_CATEGORIES: NewsCategory[] = ['all', 'cyber', 'cloud', 'ai', 'devops'];

function loadJson<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function saveJson(key: string, value: unknown): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

function MomentumBadge({ momentum }: { momentum: TrendMomentum }) {
  const m = MOMENTUM_META[momentum];
  const Icon = momentum === 'hot' ? Flame : momentum === 'rising' ? ArrowUpRight : Minus;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${m.className}`}>
      <Icon className="w-3 h-3" /> {m.label}
    </span>
  );
}

function CopyButton({ text, id, copiedId, onCopy, label = 'העתק' }: {
  text: string;
  id: string;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  label?: string;
}) {
  const done = copiedId === id;
  return (
    <button
      onClick={() => onCopy(id, text)}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-zinc-200 text-[11px] font-bold cursor-pointer hover:bg-white/10"
    >
      {done ? <Check className="w-3 h-3 text-brand-400" /> : <Copy className="w-3 h-3" />}
      {done ? 'הועתק ✓' : label}
    </button>
  );
}

export default function IgGrowthAgent() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copy = useCallback((id: string, text: string) => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedId(id);
        window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2000);
      } catch {
        /* clipboard blocked — text is visible for manual copy */
      }
    })();
  }, []);

  // ─── Panel A: Viral Topic Radar ───────────────────────────────────────────────────────────
  const [radarCategory, setRadarCategory] = useState<NewsCategory>('all');
  const [radar, setRadar] = useState<TrendRadar | null>(() => loadJson<TrendRadar>(RADAR_KEY));
  const [radarLoading, setRadarLoading] = useState(false);
  const [radarError, setRadarError] = useState<string | null>(null);
  const [activeBlueprint, setActiveBlueprint] = useState<BlueprintFormat>('reel');

  useEffect(() => {
    if (radar) saveJson(RADAR_KEY, radar);
  }, [radar]);

  const runRadar = useCallback(async () => {
    setRadarLoading(true);
    setRadarError(null);
    try {
      const items = await fetchNewsList(radarCategory, 40);
      const sources = newsItemsToTrendSources(items);
      const result = await fetchTrendRadar(sources);
      setRadar(result);
      if (result.blueprints[0]) setActiveBlueprint(result.blueprints[0].format);
    } catch (e) {
      setRadarError(
        e instanceof Error && /news feed/i.test(e.message)
          ? 'משיכת הפיד נכשלה — בדקו חיבור ל-mrdaniel.co.il/api/news.'
          : 'ניתוח הטרנדים נכשל — נסו שוב.'
      );
    } finally {
      setRadarLoading(false);
    }
  }, [radarCategory]);

  const blueprint = useMemo(
    () => radar?.blueprints.find((b) => b.format === activeBlueprint) ?? radar?.blueprints[0] ?? null,
    [radar, activeBlueprint]
  );

  const blueprintText = blueprint
    ? [
        `פורמט: ${BLUEPRINT_META[blueprint.format].label}`,
        `Hook: ${blueprint.hook}`,
        '',
        ...blueprint.outline.map((o, i) => `${i + 1}. ${o}`),
        '',
        `CTA: ${blueprint.cta}`,
      ].join('\n')
    : '';

  // ─── Panel B: Smart Response Assistant ────────────────────────────────────────────────────
  const [postText, setPostText] = useState(() => loadJson<string>(REPLY_INPUT_KEY) ?? '');
  const [sourceUrl, setSourceUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [replySet, setReplySet] = useState<EngagementReplySet | null>(() => loadJson<EngagementReplySet>(REPLIES_KEY));
  const [replyLoading, setReplyLoading] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  useEffect(() => {
    saveJson(REPLY_INPUT_KEY, postText);
  }, [postText]);
  useEffect(() => {
    if (replySet) saveJson(REPLIES_KEY, replySet);
  }, [replySet]);

  const doImport = useCallback(async () => {
    const url = sourceUrl.trim();
    if (!url) return;
    setImporting(true);
    setReplyError(null);
    try {
      const imported = await importUrl(url);
      const merged = [imported.title, imported.body].filter(Boolean).join('\n\n').trim();
      if (merged.length > 20) setPostText(merged.slice(0, 4000));
      else setReplyError('לא הצלחנו לחלץ מספיק טקסט מהקישור — הדביקו את תוכן הפוסט ידנית.');
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : 'ייבוא הקישור נכשל — הדביקו את הטקסט ידנית.');
    } finally {
      setImporting(false);
    }
  }, [sourceUrl]);

  const runReplies = useCallback(async () => {
    if (postText.trim().length < 20) {
      setReplyError('הדביקו לפחות 20 תווים מהפוסט של האדם האחר.');
      return;
    }
    setReplyLoading(true);
    setReplyError(null);
    try {
      const result = await generateEngagementReplies({
        postText,
        sourceUrl: sourceUrl.trim() || undefined,
      });
      setReplySet(result);
    } finally {
      setReplyLoading(false);
    }
  }, [postText, sourceUrl]);

  const igOpenUrl = replySet?.sourceUrl && /^https?:\/\//i.test(replySet.sourceUrl)
    ? replySet.sourceUrl
    : INSTAGRAM_PROFILE_URL;

  return (
    <div className="space-y-5">
      <div className="dash-card p-6">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-2">
          <TrendingUp className="w-3.5 h-3.5" /> סוכן צמיחה ומעורבות לאינסטגרם
        </div>
        <p className="text-sm text-zinc-400 leading-relaxed">
          שני כלים: <span className="text-zinc-200 font-bold">ראדאר טרנדים</span> שמנתח את הפיד המקצועי (סייבר · AI · ענן · טכנולוגיה)
          ומפיק כותרות ויראליות ותבניות תוכן, ו<span className="text-zinc-200 font-bold">מחולל תגובות חכם</span> שמנסח תגובה מקצועית
          לפוסטים של מובילי דעה — הכול בקול המותג של דניאל. יש גיבוי דטרמיניסטי מלא לכל כלי גם ללא חיבור ל-AI.
        </p>
      </div>

      {/* ───────────── Panel A: Viral Topic Radar ───────────── */}
      <div className="dash-card p-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <span className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
            <Radar className="w-3.5 h-3.5" /> ראדאר טרנדים ויראלי
            {radar && (
              <span className="text-[10px] normal-case tracking-normal">
                {radar.synthesized ? (
                  <span className="text-brand-400">ניתוח AI · {radar.sourceCount} מקורות</span>
                ) : (
                  <span className="text-amber-400/80">
                    גיבוי מקומי · {radar.sourceCount} מקורות{radar.fallbackReason ? ` — ${radar.fallbackReason}` : ''}
                  </span>
                )}
              </span>
            )}
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              {SOURCE_CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setRadarCategory(c)}
                  disabled={radarLoading}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50 ${
                    radarCategory === c ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
                  }`}
                >
                  {CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
            <button
              onClick={runRadar}
              disabled={radarLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-black text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {radarLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : radar ? <RefreshCw className="w-3.5 h-3.5" /> : <Radar className="w-3.5 h-3.5" />}
              {radar ? 'רענון ניתוח' : 'נתח טרנדים מהפיד'}
            </button>
          </div>
        </div>

        {radarError && (
          <p className="text-xs text-amber-400 flex items-center gap-1.5 mb-3">
            <AlertTriangle className="w-3.5 h-3.5" /> {radarError}
          </p>
        )}

        {radarLoading && !radar ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
          </div>
        ) : radar ? (
          <div className="space-y-6">
            {/* Trends */}
            <div>
              <h3 className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider mb-2">טרנדים וכאבי קהל</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {radar.trends.map((t, i) => (
                  <div key={i} className="rounded-lg border border-white/10 bg-black/30 p-3">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="text-sm font-bold text-zinc-100 leading-snug">{t.title}</span>
                      <MomentumBadge momentum={t.momentum} />
                    </div>
                    <p className="text-[12px] text-zinc-400 leading-relaxed">{t.why}</p>
                    {t.audiencePainPoint && t.audiencePainPoint !== '—' && (
                      <p className="text-[12px] text-sky-300/90 leading-relaxed mt-1.5">
                        <span className="font-bold">כאב הקהל: </span>
                        {t.audiencePainPoint}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Viral headlines */}
            {radar.viralHeadlines.length > 0 && (
              <div>
                <h3 className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider mb-2">כותרות בסגנון hook</h3>
                <div className="space-y-2">
                  {radar.viralHeadlines.map((h, i) => (
                    <div key={i} className="rounded-lg border border-white/10 bg-black/30 p-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-zinc-100 leading-snug">{h.headline}</p>
                        <p className="text-[12px] text-zinc-500 leading-relaxed mt-1">{h.angle}</p>
                      </div>
                      <CopyButton text={h.headline} id={`hl-${i}`} copiedId={copiedId} onCopy={copy} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Blueprints */}
            {radar.blueprints.length > 0 && blueprint && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <h3 className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">תבנית תוכן מוכנה</h3>
                  <div className="flex items-center gap-1">
                    {radar.blueprints.map((b) => (
                      <button
                        key={b.format}
                        onClick={() => setActiveBlueprint(b.format)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                          blueprint.format === b.format ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
                        }`}
                      >
                        {BLUEPRINT_META[b.format].label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[12px] text-brand-400 font-bold">Hook</span>
                    <CopyButton text={blueprintText} id={`bp-${blueprint.format}`} copiedId={copiedId} onCopy={copy} label="העתק תבנית" />
                  </div>
                  <p className="text-sm text-zinc-100 font-bold leading-snug mb-3">{blueprint.hook}</p>
                  <ol className="space-y-1.5 mb-3">
                    {blueprint.outline.map((o, i) => (
                      <li key={i} className="text-[13px] text-zinc-300 leading-relaxed flex gap-2">
                        <span className="text-zinc-600 font-mono">{i + 1}.</span>
                        <span>{o}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="text-[12px] text-zinc-400 leading-relaxed">
                    <span className="text-brand-400 font-bold">CTA: </span>
                    {blueprint.cta}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-zinc-600 leading-relaxed">
            לחצו "נתח טרנדים מהפיד" — המערכת תמשוך ~40 כותרות עדכניות מ-mrdaniel.co.il/api/news, תזהה נושאים חוזרים וכאבי קהל,
            ותפיק כותרות בסגנון hook ושלוש תבניות תוכן מוכנות (ריל · סטורי · קרוסלה).
          </p>
        )}
      </div>

      {/* ───────────── Panel B: Smart Response Assistant ───────────── */}
      <div className="dash-card p-6">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
          <MessageSquarePlus className="w-3.5 h-3.5" /> מחולל תגובות חכם ומקדם מעורבות
          {replySet && (
            <span className="text-[10px] normal-case tracking-normal">
              {replySet.synthesized ? (
                <span className="text-brand-400">ניסוח AI</span>
              ) : (
                <span className="text-amber-400/80">גיבוי מקומי{replySet.fallbackReason ? ` — ${replySet.fallbackReason}` : ''}</span>
              )}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1 bg-black/40 border border-white/10 rounded-lg px-2.5">
              <Link2 className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                dir="ltr"
                placeholder="קישור לפוסט (אופציונלי) — לייבוא טקסט וגם לפתיחה מהירה"
                className="flex-1 bg-transparent py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
              />
            </div>
            <button
              onClick={doImport}
              disabled={importing || !sourceUrl.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-zinc-200 text-xs font-bold cursor-pointer disabled:opacity-50 hover:bg-white/10"
            >
              {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              ייבא מקישור
            </button>
          </div>
          <textarea
            value={postText}
            onChange={(e) => setPostText(e.target.value)}
            dir="rtl"
            rows={7}
            placeholder="הדביקו כאן את תוכן הפוסט של מוביל הדעה / החשבון שאליו רוצים להגיב…"
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-zinc-200 leading-relaxed resize-y min-h-[140px]"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={runReplies}
            disabled={replyLoading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500 text-black text-sm font-bold cursor-pointer disabled:opacity-50"
          >
            {replyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            נסח 3 תגובות
          </button>
          <span className="text-[11px] text-zinc-600">{postText.trim().length} תווים</span>
        </div>

        {replyError && (
          <p className="text-xs text-amber-400 flex items-center gap-1.5 mt-3">
            <AlertTriangle className="w-3.5 h-3.5" /> {replyError}
          </p>
        )}

        {replySet && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            {replySet.replies.map((r, i) => (
              <div key={i} className="rounded-lg border border-white/10 bg-black/30 p-3 flex flex-col">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[11px] font-bold text-brand-300">{r.label || REPLY_META[r.style]?.label}</span>
                </div>
                <p className="text-[10px] text-zinc-600 mb-2">{REPLY_META[r.style]?.hint}</p>
                <p className="text-[13px] text-zinc-200 leading-relaxed flex-1 whitespace-pre-wrap">{r.text}</p>
                <div className="flex items-center gap-2 mt-3">
                  <CopyButton text={r.text} id={`rp-${i}`} copiedId={copiedId} onCopy={copy} />
                  <button
                    onClick={() => copyAndOpen(igOpenUrl, r.text)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer text-white"
                    style={{ background: 'linear-gradient(90deg,#F58529 0%,#DD2A7B 45%,#8134AF 75%,#515BD4 100%)' }}
                  >
                    <Instagram className="w-3 h-3" /> העתק ופתח
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!replySet && (
          <p className="text-xs text-zinc-600 leading-relaxed mt-3">
            הכלי מפיק 3 תגובות מובחנות: תוספת ערך מקצועית, שאלה מעוררת דיון, ומשפט חד וזכיר — כולן בטון של דניאל (מומחה IT, סייבר ו-AI),
            בלי קישורים ובלי "עקבו אחריי". לחיצה על "העתק ופתח" מעתיקה את התגובה ופותחת את הפוסט (או את אינסטגרם) בלשונית חדשה.
          </p>
        )}
      </div>
    </div>
  );
}
