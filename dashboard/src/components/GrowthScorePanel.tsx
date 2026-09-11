import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Gauge,
  Zap,
  Bookmark,
  MessageCircle,
  Hash,
  Loader2,
  Copy,
  Check,
  Sparkles,
  AlertTriangle,
  Eye,
  Bot,
  Search,
} from 'lucide-react';
import {
  DIMENSION_META,
  HOOK_PATTERN_META,
  LEVEL_META,
  type EngagementTrigger,
  type GrowthAction,
  type GrowthContent,
  type GrowthKind,
  type GrowthPack,
  type HookOption,
} from '../lib/igGrowthTypes';
import { scoreGrowth } from '../lib/growthScore';
import {
  DEFAULT_DM_LINK,
  DM_LINK_PLACEHOLDER,
  composeGrowthCaption,
  effectiveLeadMagnet,
  isValidTriggerKeyword,
  manychatSetupText,
  seoLine,
  stripBidi,
} from '../lib/growthPlaybook';
import { buildCheatSheet, fetchGrowthPack, refineHooks } from '../lib/igGrowthApi';

/**
 * "ציון צמיחה אורגנית והמלצות" — the Organic Growth panel mounted under every carousel / reel
 * preview. It scores the content locally on every change (growthScore.ts — free and instant) and
 * spends a Gemini call only when the operator presses one of the one-click refines:
 *
 *   ⚡ sharper hook       three new first-3-seconds openers; an AI result applies the strongest
 *   📌 cheat-sheet unit   a save-worthy summary slide (carousel) or recap scene (reel)
 *   💬 lead magnet        the Comment-to-DM CTA + a paste-ready ManyChat setup
 *   #  hashtags & SEO     3 Israeli-niche + 2 high-volume tags and a below-the-fold keyword line
 *
 * Hosts mount it with `key={content.contentKey}`, so a different article/deck starts clean and the
 * persisted pack (sessionStorage, keyed by contentKey) comes back only for the content it was made for.
 */

const TRIGGER_KEY = 'ig:engagement_trigger_v1'; // localStorage — an operator setting, not content
const GROWTH_KEY = 'ig:growth_packs_v1'; // sessionStorage — { [contentKey]: pack + refined hooks }
const GROWTH_KEEP = 8;

const DEFAULT_TRIGGER: EngagementTrigger = { enabled: false, keyword: '', deliverable: '', link: '' };

function loadTrigger(): EngagementTrigger {
  try {
    const raw = window.localStorage.getItem(TRIGGER_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<EngagementTrigger>) : null;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_TRIGGER;
    return {
      enabled: parsed.enabled === true,
      keyword: typeof parsed.keyword === 'string' ? parsed.keyword : '',
      deliverable: typeof parsed.deliverable === 'string' ? parsed.deliverable : '',
      link: typeof parsed.link === 'string' ? parsed.link : '',
    };
  } catch {
    return DEFAULT_TRIGGER;
  }
}

interface PersistedGrowth {
  pack: GrowthPack | null;
  hookOptions: HookOption[];
  at: number;
}

function readGrowthStore(): Record<string, PersistedGrowth> {
  try {
    const raw = window.sessionStorage.getItem(GROWTH_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, PersistedGrowth>) : {};
  } catch {
    return {};
  }
}

function loadPersisted(contentKey: string): PersistedGrowth | null {
  return readGrowthStore()[contentKey] ?? null;
}

/** One entry per piece of content, newest GROWTH_KEEP kept. The deck and reel panels are mounted
 *  side by side in the News agent — a single slot would let each overwrite the other's pack. */
function savePersisted(contentKey: string, entry: Omit<PersistedGrowth, 'at'>): void {
  try {
    const store = readGrowthStore();
    store[contentKey] = { ...entry, at: Date.now() };
    const newest = Object.entries(store)
      .sort((a, b) => (b[1]?.at ?? 0) - (a[1]?.at ?? 0))
      .slice(0, GROWTH_KEEP);
    window.sessionStorage.setItem(GROWTH_KEY, JSON.stringify(Object.fromEntries(newest)));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

const ACTION_ICON: Record<GrowthAction, typeof Zap> = {
  'punchier-hook': Zap,
  'cheat-sheet': Bookmark,
  'lead-magnet': MessageCircle,
  'seo-pack': Hash,
};

function actionLabel(action: GrowthAction, kind: GrowthKind): string {
  if (action === 'punchier-hook') return 'חדד את ה-Hook';
  if (action === 'cheat-sheet') return kind === 'reel' ? 'הוסף סצנת סיכום לשמירה' : 'הוסף שקופית צ׳יט-שיט לשמירה';
  if (action === 'lead-magnet') return 'צור CTA מגנט לידים';
  return 'חבילת האשטגים ו-SEO';
}

const sameLine = (a: string, b: string) => stripBidi(a).replace(/[^\p{L}\p{N}]/gu, '') === stripBidi(b).replace(/[^\p{L}\p{N}]/gu, '');

interface Note {
  tone: 'ai' | 'local' | 'warn';
  text: string;
}

interface Props {
  content: GrowthContent;
  /** The host is re-rendering the deck — refines are held until it settles. */
  busy?: boolean;
  /** Put a hook line on the cover / as the reel opener. */
  onApplyHook?: (line: string) => void | Promise<void>;
  /** Insert the save-worthy unit. Omit on hosts that have no slide/scene to add (plain posts). */
  onAddCheatSheet?: (slideText: string, shortLabel: string) => void | Promise<void>;
  /** False when the deck is already at its content-slide ceiling. */
  canAddCheatSheet?: boolean;
  /** Receives the growth-optimised caption ('' when the panel unmounts), for the host's publish bar. */
  onCaptionChange?: (caption: string) => void;
  className?: string;
}

export default function GrowthScorePanel({ content, busy = false, onApplyHook, onAddCheatSheet, canAddCheatSheet = true, onCaptionChange, className = '' }: Props) {
  const [trigger, setTrigger] = useState<EngagementTrigger>(loadTrigger);
  const [pack, setPack] = useState<GrowthPack | null>(() => loadPersisted(content.contentKey)?.pack ?? null);
  const [refinedHooks, setRefinedHooks] = useState<HookOption[]>(() => loadPersisted(content.contentKey)?.hookOptions ?? []);
  const [pending, setPending] = useState<GrowthAction | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(TRIGGER_KEY, JSON.stringify(trigger));
    } catch {
      /* private mode / quota — the setting just doesn't persist */
    }
  }, [trigger]);

  useEffect(() => {
    if (!pack && refinedHooks.length === 0) return; // nothing generated yet — nothing to keep
    savePersisted(content.contentKey, { pack, hookOptions: refinedHooks });
  }, [content.contentKey, pack, refinedHooks]);

  const leadMagnet = useMemo(() => effectiveLeadMagnet(pack, trigger, content.kind, content.topic), [pack, trigger, content.kind, content.topic]);
  const caption = useMemo(() => composeGrowthCaption(content.caption, pack, leadMagnet, trigger.enabled), [content.caption, pack, leadMagnet, trigger.enabled]);
  const report = useMemo(
    () => scoreGrowth(content, { pack, leadMagnet, includeLeadMagnet: trigger.enabled, caption }),
    [content, pack, leadMagnet, trigger.enabled, caption]
  );

  // Hand the optimised caption to the host's publish bar. The ref keeps an unstable callback from
  // re-emitting the same string every render; the cleanup clears it on unmount (and resets the ref,
  // so StrictMode's mount → unmount → mount still ends on the real caption, not '').
  const emitted = useRef<string | null>(null);
  useEffect(() => {
    if (emitted.current === caption) return;
    emitted.current = caption;
    onCaptionChange?.(caption);
  }, [caption, onCaptionChange]);
  useEffect(
    () => () => {
      emitted.current = null;
      onCaptionChange?.('');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const copy = useCallback((id: string, text: string) => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedId(id);
        window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2000);
      } catch {
        /* clipboard blocked — the text is on screen for a manual copy */
      }
    })();
  }, []);

  const hookOptions = refinedHooks.length ? refinedHooks : content.hookOptions;
  const recommended = new Set(report.recommendations.map((r) => r.action).filter(Boolean) as GrowthAction[]);
  const actions: GrowthAction[] = ['punchier-hook', ...(onAddCheatSheet ? (['cheat-sheet'] as GrowthAction[]) : []), 'lead-magnet', 'seo-pack'];

  const run = async (action: GrowthAction) => {
    if (pending || busy) return;
    setPending(action);
    setNote(null);
    try {
      if (action === 'punchier-hook') {
        const res = await refineHooks(content);
        if (res.hookOptions.length) setRefinedHooks(res.hookOptions);
        if (res.synthesized && res.hookOptions[0] && onApplyHook) {
          await onApplyHook(res.hookOptions[0].line);
          setNote({ tone: 'ai', text: 'ה-Hook חודד ע״י AI — החלופה החזקה הוחלה, והאחרות מחכות למטה.' });
        } else if (res.hookOptions.length) {
          // Offline options are the content's own sentences — shown for a manual pick, never auto-applied.
          setNote({ tone: 'local', text: `חלופות מתוך הטקסט עצמו (ללא AI) — בחרו ידנית. ${res.fallbackReason ?? ''}`.trim() });
        } else {
          setNote({ tone: 'warn', text: `לא נמצאו חלופות hook. ${res.fallbackReason ?? ''}`.trim() });
        }
      } else if (action === 'cheat-sheet') {
        const res = await buildCheatSheet(content);
        if (!res) {
          setNote({ tone: 'warn', text: 'אין בתוכן מספיק משפטים מעשיים לבניית צ׳יט-שיט.' });
        } else {
          await onAddCheatSheet?.(res.slideText, res.shortLabel);
          setNote(
            res.synthesized
              ? { tone: 'ai', text: `נוספה ${content.kind === 'reel' ? 'סצנת סיכום' : 'שקופית צ׳יט-שיט'} שנכתבה ע״י AI.` }
              : { tone: 'local', text: `נוספה יחידת סיכום מקומית מתוך הטקסט. ${res.fallbackReason ?? ''}`.trim() }
          );
        }
      } else {
        const res = await fetchGrowthPack(content, trigger);
        setPack(res);
        setNote(
          res.synthesized
            ? { tone: 'ai', text: 'חבילת הצמיחה נוצרה ע״י AI — CTA, האשטגים ומילות מפתח.' }
            : { tone: 'local', text: `חבילה מקומית (ללא AI). ${res.fallbackReason ?? ''}`.trim() }
        );
      }
    } finally {
      setPending(null);
    }
  };

  const level = LEVEL_META[report.level];
  const keywordInvalid = trigger.keyword.trim().length > 0 && !isValidTriggerKeyword(trigger.keyword);
  const seo = pack ? seoLine(pack.seoKeywords) : '';

  return (
    <div className={`dash-card p-5 flex flex-col gap-4 ${className}`} dir="rtl">
      {/* Header + overall score */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
          <Gauge className="w-3.5 h-3.5" /> ציון צמיחה אורגנית והמלצות
          <span className="text-[10px] normal-case tracking-normal text-zinc-600">
            · {content.kind === 'reel' ? 'ריל' : content.kind === 'post' ? 'פוסט' : 'קרוסלה'}
          </span>
        </span>
        <div className="flex items-center gap-2" title="ממוצע משוקלל: Hook 35% · שמירה 30% · תגובה 20% · חיפוש 15%">
          <span className={`text-2xl font-black tabular-nums ${level.text}`}>{report.overall}</span>
          <span className="text-[11px] text-zinc-500">/100 · {level.label}</span>
        </div>
      </div>

      {/* Dimension meters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {report.dimensions.map((d) => {
          const meta = DIMENSION_META[d.id];
          const lv = LEVEL_META[d.level];
          return (
            <div
              key={d.id}
              className="rounded-lg border border-white/10 bg-black/30 p-3 flex flex-col gap-1.5"
              title={[meta.hint, ...d.positives.map((p) => `✓ ${p}`), ...d.gaps.map((g) => `✗ ${g}`)].join('\n')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-zinc-300">{meta.label}</span>
                <span className={`text-sm font-black tabular-nums ${lv.text}`}>{d.score}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full ${lv.bar} transition-all duration-300`} style={{ width: `${d.score}%` }} />
              </div>
              {d.positives[0] && <p className="text-[10.5px] text-zinc-400 leading-snug">✓ {d.positives[0]}</p>}
              {d.gaps[0] && <p className="text-[10.5px] text-amber-400/80 leading-snug">✗ {d.gaps[0]}</p>}
            </div>
          );
        })}
      </div>

      {/* One-click refines */}
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((a) => {
          const Icon = ACTION_ICON[a];
          const isPending = pending === a;
          const blocked = a === 'cheat-sheet' && !canAddCheatSheet;
          return (
            <button
              key={a}
              onClick={() => void run(a)}
              disabled={!!pending || busy || blocked}
              title={blocked ? 'הדק כבר במקסימום שקופיות התוכן' : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-40 transition-colors ${
                recommended.has(a)
                  ? 'bg-brand-500 text-black hover:bg-brand-400'
                  : 'bg-white/5 border border-white/10 text-zinc-200 hover:bg-white/10'
              }`}
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
              {actionLabel(a, content.kind)}
            </button>
          );
        })}
        {busy && (
          <span className="text-[11px] text-zinc-500 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> מרנדר…
          </span>
        )}
      </div>

      {note && (
        <p
          className={`text-[11px] flex items-start gap-1.5 leading-relaxed ${
            note.tone === 'ai' ? 'text-brand-400' : note.tone === 'local' ? 'text-sky-300/90' : 'text-amber-400'
          }`}
        >
          {note.tone === 'warn' ? <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : note.tone === 'ai' ? <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <Bot className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
          {note.text}
        </p>
      )}

      {/* Recommendations */}
      {report.recommendations.length > 0 && (
        <ul className="space-y-1.5">
          {report.recommendations.map((r) => (
            <li key={r.id} className="flex items-start gap-2 text-[12px] text-zinc-300 leading-relaxed">
              <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-zinc-400">
                {DIMENSION_META[r.dimension].label}
              </span>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      )}

      {/* First-3-seconds hook options */}
      {hookOptions.length > 0 && (
        <div>
          <h4 className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider mb-2">חלופות ל-3 השניות הראשונות</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {hookOptions.map((h, i) => {
              const active = sameLine(h.line, content.hook);
              return (
                <div key={`${h.line}-${i}`} className={`rounded-lg border p-3 flex flex-col gap-1.5 ${active ? 'border-brand-500/50 bg-brand-500/[0.07]' : 'border-white/10 bg-black/30'}`}>
                  <span className="w-fit text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-brand-300">
                    {HOOK_PATTERN_META[h.pattern]?.label ?? h.pattern}
                  </span>
                  <p className="text-[13px] font-bold text-zinc-100 leading-snug">{h.line}</p>
                  {h.visual && (
                    <p className="text-[11px] text-zinc-500 leading-snug flex items-start gap-1">
                      <Eye className="w-3 h-3 shrink-0 mt-0.5" /> {h.visual}
                    </p>
                  )}
                  <div className="mt-auto pt-1 flex items-center gap-2">
                    {active ? (
                      <span className="text-[11px] text-brand-400 font-bold">פעיל ✓</span>
                    ) : onApplyHook ? (
                      <button
                        onClick={() => void onApplyHook(h.line)}
                        disabled={busy || !!pending}
                        className="text-[11px] font-bold px-2 py-1 rounded-md bg-brand-500 text-black cursor-pointer disabled:opacity-40"
                      >
                        החל
                      </button>
                    ) : null}
                    <button
                      onClick={() => copy(`hook-${i}`, h.line)}
                      className="text-[11px] px-2 py-1 rounded-md bg-white/5 border border-white/10 text-zinc-300 cursor-pointer hover:bg-white/10"
                    >
                      {copiedId === `hook-${i}` ? 'הועתק ✓' : 'העתק'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Engagement Trigger — Comment-to-DM */}
      <div className="rounded-lg border border-white/10 bg-black/20 p-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="flex items-center gap-1.5 text-[12px] font-bold text-zinc-200">
            <MessageCircle className="w-3.5 h-3.5 text-brand-400" /> טריגר מעורבות · Comment-to-DM
          </span>
          <button
            role="switch"
            aria-checked={trigger.enabled}
            onClick={() => setTrigger((t) => ({ ...t, enabled: !t.enabled }))}
            className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer"
          >
            <span className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${trigger.enabled ? 'bg-brand-500' : 'bg-white/15'}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${trigger.enabled ? 'right-0.5' : 'right-[18px]'}`} />
            </span>
            {trigger.enabled ? 'CTA בכיתוב' : 'כבוי'}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <label className="flex flex-col gap-1 text-[10.5px] text-zinc-500">
            מילת טריגר
            <input
              value={trigger.keyword}
              onChange={(e) => setTrigger((t) => ({ ...t, keyword: e.target.value }))}
              placeholder={leadMagnet?.keyword ?? 'סוכן'}
              dir="rtl"
              className={`bg-black/40 border rounded-md px-2 py-1.5 text-sm text-zinc-200 ${keywordInvalid ? 'border-amber-500/60' : 'border-white/10'}`}
            />
          </label>
          <label className="flex flex-col gap-1 text-[10.5px] text-zinc-500">
            מה נשלח בפרטי
            <input
              value={trigger.deliverable}
              onChange={(e) => setTrigger((t) => ({ ...t, deliverable: e.target.value }))}
              placeholder={leadMagnet?.deliverable ?? 'הצ׳קליסט המלא'}
              dir="rtl"
              className="bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-sm text-zinc-200"
            />
          </label>
          <label className="flex flex-col gap-1 text-[10.5px] text-zinc-500">
            קישור לכפתור ה-DM
            <input
              value={trigger.link}
              onChange={(e) => setTrigger((t) => ({ ...t, link: e.target.value }))}
              placeholder={DM_LINK_PLACEHOLDER}
              dir="ltr"
              className="bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-sm text-zinc-200"
            />
          </label>
        </div>
        {keywordInvalid && <p className="text-[10.5px] text-amber-400/90">מילה אחת, 2–14 תווים, לא מילה נפוצה כמו "כן" או "תודה" — אחרת המנוע יבחר מילה אחרת.</p>}

        {leadMagnet ? (
          <>
            <div className="rounded-md border border-brand-500/25 bg-brand-500/[0.06] px-3 py-2 flex items-start justify-between gap-2">
              <p className="text-[13px] text-zinc-100 leading-relaxed">{leadMagnet.captionCta}</p>
              <button onClick={() => copy('cta', leadMagnet.captionCta)} className="shrink-0 text-[11px] px-2 py-1 rounded-md bg-white/5 border border-white/10 text-zinc-300 cursor-pointer hover:bg-white/10">
                {copiedId === 'cta' ? 'הועתק ✓' : 'העתק'}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
              <span className="text-zinc-500">מילות מפתח ל-ManyChat:</span>
              {leadMagnet.triggerVariants.map((v) => (
                <span key={v} dir="auto" className="font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-zinc-300">
                  {v}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11.5px]">
              <div className="rounded-md border border-white/10 bg-black/30 p-2">
                <span className="block text-[10px] text-zinc-500 mb-1">תשובות פומביות (מתחלפות)</span>
                <ul className="space-y-0.5 text-zinc-300">
                  {leadMagnet.publicReplies.map((r) => (
                    <li key={r}>• {r}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-md border border-white/10 bg-black/30 p-2">
                <span className="block text-[10px] text-zinc-500 mb-1">הודעת DM + כפתור</span>
                <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap">{leadMagnet.dmMessage}</p>
                <p className="mt-1 text-[10.5px] text-brand-300">
                  [{leadMagnet.dmButtonLabel}] → <span dir="ltr">{trigger.link.trim() || DEFAULT_DM_LINK}</span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => copy('manychat', manychatSetupText(leadMagnet, trigger.link))}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-200 text-[11px] font-bold cursor-pointer hover:bg-white/10"
              >
                {copiedId === 'manychat' ? <Check className="w-3.5 h-3.5 text-brand-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedId === 'manychat' ? 'הועתק ✓' : 'העתק הגדרת ManyChat'}
              </button>
              <span className="text-[10.5px] text-zinc-500 leading-snug">
                {trigger.enabled
                  ? 'ה-CTA נכנס לכיתוב — ודאו שזרימת ManyChat פעילה למילה הזו לפני הפרסום.'
                  : 'מוכן אבל כבוי — הפעילו רק כשזרימת ManyChat (או DM אוטומטי) קיימת, אחרת המגיבים לא יקבלו כלום.'}
              </span>
            </div>
          </>
        ) : (
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            לחצו "צור CTA מגנט לידים" — המנוע ינסח CTA עם מילת טריגר אחת, תשובות פומביות מתחלפות והודעת DM, מוכנים להגדרה ב-ManyChat.
            בלי "תייגו חברים" ובלי הבטחות שאין מאחוריהן משאב אמיתי.
          </p>
        )}
      </div>

      {/* Hashtags + SEO */}
      {pack && (
        <div className="rounded-lg border border-white/10 bg-black/20 p-3 flex flex-col gap-2">
          <span className="flex items-center gap-1.5 text-[12px] font-bold text-zinc-200">
            <Search className="w-3.5 h-3.5 text-sky-400" /> האשטגים ומילות מפתח לחיפוש
            {!pack.synthesized && <span className="text-[10px] font-normal text-amber-400/80" title={pack.fallbackReason}>· מקומי</span>}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {pack.nicheHashtags.map((t) => (
              <span key={t} className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-brand-500/10 border border-brand-500/25 text-brand-300">
                {t}
              </span>
            ))}
            {pack.broadHashtags.map((t) => (
              <span key={t} className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/25 text-sky-300">
                {t}
              </span>
            ))}
          </div>
          {seo && (
            <p className="text-[11.5px] text-zinc-300 leading-relaxed">
              {seo}
              <span className="block text-[10px] text-zinc-600 mt-0.5">
                יושב מתחת לקיפול "…עוד" אחרי שתי שורות ריווח — גלוי לכל מי שפותח את הכיתוב ונקלט בחיפוש של אינסטגרם. בלי טקסט מוסתר.
              </span>
            </p>
          )}
        </div>
      )}

      {/* Publish-ready caption */}
      <details className="rounded-lg border border-white/10 bg-black/20 p-3">
        <summary className="text-[11px] text-zinc-400 cursor-pointer font-bold">כיתוב מותאם לפרסום ({caption.length} תווים)</summary>
        <div className="mt-2 flex flex-col gap-2">
          <textarea readOnly value={caption} dir="rtl" rows={10} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[12.5px] text-zinc-200 leading-relaxed resize-y" />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => copy('caption', caption)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-black text-[11px] font-bold cursor-pointer"
            >
              {copiedId === 'caption' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedId === 'caption' ? 'הועתק ✓' : 'העתק כיתוב מותאם'}
            </button>
            {onCaptionChange && <span className="text-[10.5px] text-zinc-500">כפתורי הפרסום המהיר משתמשים בכיתוב הזה.</span>}
          </div>
        </div>
      </details>
    </div>
  );
}
