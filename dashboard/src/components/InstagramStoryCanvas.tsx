import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Newspaper,
  RefreshCw,
  Loader2,
  Download,
  ExternalLink,
  AlertTriangle,
  Film,
  ChevronRight,
  ChevronLeft,
  Type,
} from 'lucide-react';
import { CATEGORY_LABEL, type NewsCategory, type NewsItem, type NewsTopic } from '../lib/newsAgentTypes';
import { fetchNewsList } from '../lib/newsFeedClient';
import { renderStoryForItem, renderSlidesForText, rerenderDeck, type SlideFormat, type RenderedDeck } from '../lib/instagramStoryRenderer';
import type { StoryPayload } from '../lib/storySlides';
import SlideEditorChat from './SlideEditorChat';
import PreviewErrorBoundary from './PreviewErrorBoundary';
import QuickPublishBar from './QuickPublishBar';
import { deckToCaption } from '../lib/socialPublish';

const CATEGORIES: NewsCategory[] = ['cyber', 'ai', 'tech', 'all'];
const TOPIC_LABEL: Record<string, string> = { ai: 'AI', cyber: 'סייבר', cloud: 'ענן / IT', general: 'גאדג׳טים / טק' };
const TOPICS: { id: NewsTopic; label: string }[] = [
  { id: 'ai', label: 'AI / בינה מלאכותית' },
  { id: 'cyber', label: 'סייבר ואבטחה' },
  { id: 'cloud', label: 'ענן ותשתיות' },
  { id: 'general', label: 'טכנולוגיה כללית' },
];

const SLIDE_FORMATS: { id: SlideFormat; label: string }[] = [
  { id: '9:16', label: '9:16 · סטורי / ריל' },
  { id: '4:5', label: '4:5 · קרוסלה' },
  { id: '1:1', label: '1:1 · ריבוע' },
];
const PREVIEW_DIMS: Record<SlideFormat, { w: number; h: number }> = {
  '9:16': { w: 288, h: 512 },
  '4:5': { w: 340, h: 425 },
  '1:1': { w: 380, h: 380 },
};

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

type SourceMode = 'news' | 'text';

export default function InstagramStoryCanvas() {
  const [mode, setMode] = useState<SourceMode>('news');
  const [format, setFormat] = useState<SlideFormat>('9:16');

  // news mode
  const [category, setCategory] = useState<NewsCategory>('cyber');
  const [item, setItem] = useState<NewsItem | null>(null);
  const [list, setList] = useState<NewsItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingNews, setLoadingNews] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);

  // free-text mode
  const [customText, setCustomText] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customTopic, setCustomTopic] = useState<NewsTopic>('ai');

  // shared output
  const [payload, setPayload] = useState<StoryPayload | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const seq = useRef(0);

  const fetchNews = useCallback(
    async (autoSelect = false) => {
      setLoadingNews(true);
      setNewsError(null);
      try {
        const items = await fetchNewsList(category);
        setList(items);
        if (items.length === 0) {
          setNewsError('לא נמצאו כתבות בקטגוריה הזו כרגע.');
          setItem(null);
        } else if (autoSelect || !items.some((i) => i.id === item?.id)) {
          setItem(items[0]);
        }
      } catch {
        setNewsError('משיכת הפיד נכשלה — בדקו חיבור ל-mrdaniel.co.il/api/news.');
        setList([]);
        setItem(null);
      } finally {
        setLoadingNews(false);
      }
    },
    [category, item?.id]
  );

  useEffect(() => {
    void fetchNews(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Real-time news stream — re-poll every 4 minutes while in news mode.
  useEffect(() => {
    if (mode !== 'news') return;
    const id = window.setInterval(() => void fetchNews(false), 4 * 60 * 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, mode]);

  const applyDeck = useCallback((s: number, deck: RenderedDeck) => {
    if (s !== seq.current) return;
    setPayload(deck.payload);
    setImages(deck.images);
  }, []);

  // AI Slide Editor chat → apply an edited deck and live re-render on the same background.
  const applyEdit = useCallback(
    async (edited: StoryPayload) => {
      const s = ++seq.current;
      setRendering(true);
      setRenderError(null);
      try {
        const deck = await rerenderDeck(edited, format);
        applyDeck(s, deck);
      } catch {
        if (s === seq.current) setRenderError('הרינדור מחדש נכשל — נסו שוב.');
      } finally {
        if (s === seq.current) setRendering(false);
      }
    },
    [format, applyDeck]
  );

  // Absolute safety net: even with every lib-level timeout, guarantee the generate promise
  // settles so the spinner (`rendering`) always resets and the UI never freezes.
  const withTimeout = useCallback(<T,>(p: Promise<T>, ms = 95000): Promise<T> => {
    return Promise.race([
      p,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
  }, []);

  // News mode: (re)render whenever the selected item or the aspect changes.
  useEffect(() => {
    if (mode !== 'news') return;
    if (!item) {
      setImages([]);
      setPayload(null);
      return;
    }
    const s = ++seq.current;
    setRendering(true);
    setRenderError(null);
    setActive(0);
    withTimeout(renderStoryForItem(item, format))
      .then((deck) => applyDeck(s, deck))
      .catch((err) => {
        if (s === seq.current) setRenderError(err?.message === 'timeout' ? 'הרינדור ארך יותר מדי — נסו שוב.' : 'רינדור השקפים נכשל.');
      })
      .finally(() => {
        if (s === seq.current) setRendering(false);
      });
  }, [mode, item, format, applyDeck, withTimeout]);

  const generateFromText = useCallback(async () => {
    const text = customText.trim();
    if (text.length < 60) {
      setRenderError('צריך לפחות 60 תווים של טקסט כדי לבנות קרוסלה.');
      return;
    }
    const s = ++seq.current;
    setRendering(true);
    setRenderError(null);
    setActive(0);
    try {
      const deck = await withTimeout(
        renderSlidesForText(text, { title: customTitle.trim() || undefined, topic: customTopic, format })
      );
      applyDeck(s, deck);
    } catch (err) {
      if (s === seq.current) {
        setRenderError(
          (err as Error)?.message === 'timeout'
            ? 'הרינדור ארך יותר מדי — נסו שוב או קצרו את הטקסט.'
            : 'רינדור השקפים נכשל — נסו שוב.'
        );
      }
    } finally {
      if (s === seq.current) setRendering(false);
    }
  }, [customText, customTitle, customTopic, format, applyDeck, withTimeout]);

  // Free-text mode: re-render on aspect change only if a deck already exists (button-driven otherwise).
  useEffect(() => {
    if (mode === 'text' && payload && !rendering) void generateFromText();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format]);

  const switchMode = (m: SourceMode) => {
    if (m === mode) return;
    seq.current++; // invalidate any in-flight render so its .finally can't touch state
    setMode(m);
    setPayload(null);
    setImages([]);
    setRenderError(null);
    setRendering(false); // never carry a stuck spinner across a mode switch
    setActive(0);
  };

  const downloadAll = async () => {
    if (!images.length) return;
    const slug = (mode === 'news' ? item?.slug : (customTitle || 'carousel').slice(0, 40)) || 'slides';
    const safe = String(slug).replace(/[^\w֐-׿-]+/g, '-').slice(0, 40);
    for (let i = 0; i < images.length; i++) {
      const a = document.createElement('a');
      a.href = images[i];
      a.download = `mrdaniel-${format.replace(':', 'x')}-${safe}-${i + 1}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      await new Promise((r) => setTimeout(r, 350));
    }
  };

  const canPreview = payload && images.length > 0;

  return (
    <div className="space-y-5">
      {/* Source + format bar */}
      <div className="dash-card p-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
            <Film className="w-3.5 h-3.5" /> מחולל שקפים / קרוסלה אחיד · 4–5 שקופיות
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {SLIDE_FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                disabled={rendering}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer font-mono disabled:opacity-50 ${
                  format === f.id ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => switchMode('news')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
              mode === 'news' ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
            }`}
          >
            <Newspaper className="w-3.5 h-3.5" /> מכתבת חדשות
          </button>
          <button
            onClick={() => switchMode('text')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
              mode === 'text' ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
            }`}
          >
            <Type className="w-3.5 h-3.5" /> טקסט חופשי / טיוטת פוסט
          </button>
        </div>

        {mode === 'news' ? (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-4 py-2 rounded-full text-sm font-bold cursor-pointer transition-colors ${
                    category === c ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/10'
                  }`}
                >
                  {CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => fetchNews(false)}
                disabled={loadingNews}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-zinc-200 text-sm font-bold cursor-pointer disabled:opacity-50 hover:bg-white/10"
              >
                {loadingNews ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                רענון רשימת הכתבות
              </button>
              <button
                onClick={() => fetchNews(true)}
                disabled={loadingNews}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 text-black text-sm font-bold cursor-pointer disabled:opacity-50"
              >
                בחר את הכתבה האחרונה
              </button>
            </div>
            {newsError && (
              <p className="mt-3 text-xs text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> {newsError}
              </p>
            )}

            {list.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono mb-2">
                  <span>{list.length} כתבות · {CATEGORY_LABEL[category]}</span>
                  <span>לחצו על כתבה כדי לבנות ממנה קרוסלה</span>
                </div>
                <div className="max-h-[320px] overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/5">
                  {list.map((n) => {
                    const selected = n.id === item?.id;
                    return (
                      <div key={n.id} className={selected ? 'bg-brand-500/10' : 'hover:bg-white/[0.03]'}>
                        <button onClick={() => setItem(n)} className="w-full text-right px-3 py-2.5 cursor-pointer flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono">
                            <span className={`px-1.5 py-0.5 rounded ${selected ? 'bg-brand-500 text-black' : 'bg-white/5 text-brand-300'}`}>
                              {TOPIC_LABEL[n.topic] ?? n.topic}
                            </span>
                            <span>{n.source}</span>
                            <span>·</span>
                            <span>{timeLabel(n.publishedAt)}</span>
                            {n.image && <span className="text-brand-400/70">· תמונה ✓</span>}
                          </div>
                          <span className={`text-[13px] font-bold leading-snug ${selected ? 'text-white' : 'text-zinc-200'}`}>{n.title}</span>
                        </button>
                        <div className="px-3 pb-2 -mt-0.5 flex items-center gap-3">
                          <button
                            onClick={() => setExpandedId(expandedId === n.id ? null : n.id)}
                            className="text-[10px] text-sky-400 hover:text-sky-300 cursor-pointer"
                          >
                            {expandedId === n.id ? 'הסתר תצוגה' : 'תצוגת טקסט גולמי'}
                          </button>
                          <a href={n.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300">
                            <ExternalLink className="w-3 h-3" /> מקור
                          </a>
                        </div>
                        {expandedId === n.id && (
                          <p className="px-3 pb-3 text-[11px] text-zinc-400 leading-relaxed whitespace-pre-wrap">
                            {n.summary || n.excerpt || '(אין טקסט מלא בפיד לכתבה זו)'}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {item && (
              <div className="mt-4 p-3 rounded-lg bg-black/30 border border-brand-500/20">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 font-mono mb-1">
                  <span className="text-brand-400 font-bold">נבחר:</span>
                  <span>{item.source}</span>
                  <span>·</span>
                  <span>{item.image ? 'תמונת מקור מהכתבה ✓' : 'אין תמונה בפיד — רקע גרפי'}</span>
                </div>
                <p className="text-sm text-zinc-200 font-bold leading-snug">{item.title}</p>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <input
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="כותרת השער (אופציונלי — תיגזר מהמשפט הראשון אם ריק)"
              dir="rtl"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200"
            />
            <textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="הדביקו כאן טקסט חופשי, טיוטת פוסט או תקציר — המנוע יפרק אותו ל-4–5 שקופיות ממותגות (שער → תוכן → CTA)."
              dir="rtl"
              rows={7}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-zinc-200 leading-relaxed resize-y min-h-[160px]"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value as NewsTopic)}
                className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200"
              >
                {TOPICS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-zinc-500 font-mono">{customText.trim().length} תווים</span>
              <button
                onClick={generateFromText}
                disabled={rendering || customText.trim().length < 60}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500 text-black text-sm font-bold cursor-pointer disabled:opacity-50"
              >
                {rendering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                {payload ? 'רענון שקפים' : 'צור שקפים / קרוסלה'}
              </button>
            </div>
          </div>
        )}
      </div>

      {(canPreview || rendering) && (
        <PreviewErrorBoundary
          label="תצוגת הסטורי"
          resetKeys={[payload?.createdAt, format, images.length]}
          onReset={() => {
            seq.current++;
            setPayload(null);
            setImages([]);
            setActive(0);
            setRenderError(null);
          }}
        >
        <div className="dash-card p-6">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {(payload?.slides ?? []).map((s, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  disabled={!images[i]}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-40 ${
                    active === i ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
                  }`}
                >
                  {i + 1}. {s?.kind === 'cover' ? 'שער' : s?.kind === 'cta' ? 'סיום' : s?.heading || `שקופית ${i + 1}`}
                </button>
              ))}
            </div>
            <button
              onClick={downloadAll}
              disabled={!images.length || rendering}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 text-black text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" /> הורד את כל השקופיות (PNG)
            </button>
          </div>

          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setActive((a) => Math.max(0, a - 1))}
              disabled={active === 0}
              className="p-2 rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <div
              className="relative rounded-2xl overflow-hidden border border-white/10 bg-black"
              style={{
                width: (PREVIEW_DIMS[format] ?? PREVIEW_DIMS['9:16']).w,
                height: (PREVIEW_DIMS[format] ?? PREVIEW_DIMS['9:16']).h,
              }}
            >
              {rendering ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
                </div>
              ) : renderError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-amber-400 text-xs p-4 text-center">
                  <AlertTriangle className="w-5 h-5" /> {renderError}
                </div>
              ) : images[Math.min(active, images.length - 1)] ? (
                <img src={images[Math.min(active, images.length - 1)]} alt={`שקופית ${active + 1}`} className="w-full h-full object-contain" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-700">
                  <Film className="w-6 h-6" />
                </div>
              )}
            </div>

            <button
              onClick={() => setActive((a) => Math.min(images.length - 1, a + 1))}
              disabled={active >= images.length - 1}
              className="p-2 rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>

          {payload && (
            <p className="text-[11px] text-zinc-600 text-center mt-3">
              {format} · {images.length} שקופיות · שקופית {active + 1} ·{' '}
              {payload.synthesized ? (
                <span className="text-brand-400">טקסט נכתב ע״י מנוע ה-AI מהמקור</span>
              ) : (
                <span className="text-amber-400/80">
                  מצב גיבוי — פירוק מקומי מהמקור (ללא AI){payload.fallbackReason ? ` · ${payload.fallbackReason}` : ''}
                </span>
              )}
            </p>
          )}

          {payload && images.length > 0 && (
            <QuickPublishBar
              text={deckToCaption(payload)}
              image={images[Math.min(active, images.length - 1)]}
              label="פרסום מהיר · קרוסלה"
              className="mt-3 justify-center"
            />
          )}

          {payload && images.length > 0 && (
            <div className="mt-4">
              <SlideEditorChat payload={payload} format={format} busy={rendering} onApply={applyEdit} />
            </div>
          )}
        </div>
        </PreviewErrorBoundary>
      )}

      {mode === 'news' && !item && !loadingNews && !newsError && (
        <div className="dash-card p-10 text-center text-zinc-500 text-sm">
          בחרו קטגוריה, בחרו כתבה מהרשימה — והמערכת תפרק אותה ל-4 עד 5 שקופיות ממותגות (שער → 2–3 תוכן → CTA) ביחס שבחרתם.
        </div>
      )}
      {mode === 'text' && !canPreview && !rendering && (
        <div className="dash-card p-10 text-center text-zinc-500 text-sm">
          הדביקו טקסט חופשי או טיוטת פוסט (60 תווים ומעלה) ולחצו "צור שקפים" — אותו מנוע קרוסלה ממותג, בכל יחס.
        </div>
      )}
    </div>
  );
}
