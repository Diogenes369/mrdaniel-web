import { useCallback, useEffect, useRef, useState } from 'react';
import { Newspaper, RefreshCw, Loader2, Download, ExternalLink, AlertTriangle, Film, ChevronRight, ChevronLeft } from 'lucide-react';
import { CATEGORY_LABEL, type NewsCategory, type NewsItem } from '../lib/newsAgentTypes';
import { fetchNewsList } from '../lib/newsFeedClient';
import { renderStoryForItem } from '../lib/instagramStoryRenderer';
import type { StoryPayload } from '../lib/storySlides';

const CATEGORIES: NewsCategory[] = ['cyber', 'ai', 'tech', 'all'];
const TOPIC_LABEL: Record<string, string> = { ai: 'AI', cyber: 'סייבר', cloud: 'ענן / IT', general: 'גאדג׳טים / טק' };

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function InstagramStoryCanvas() {
  const [category, setCategory] = useState<NewsCategory>('cyber');
  const [item, setItem] = useState<NewsItem | null>(null);
  const [list, setList] = useState<NewsItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingNews, setLoadingNews] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!item) {
      setImages([]);
      setPayload(null);
      return;
    }
    const s = ++seq.current;
    setRendering(true);
    setRenderError(null);
    setActive(0);
    renderStoryForItem(item)
      .then(({ payload: p, images: imgs }) => {
        if (s === seq.current) {
          setPayload(p);
          setImages(imgs);
        }
      })
      .catch(() => {
        if (s === seq.current) setRenderError('רינדור הסטורי נכשל.');
      })
      .finally(() => {
        if (s === seq.current) setRendering(false);
      });
  }, [item]);

  const downloadAll = async () => {
    if (!images.length) return;
    const slug = (item?.slug || 'story').slice(0, 40);
    for (let i = 0; i < images.length; i++) {
      const a = document.createElement('a');
      a.href = images[i];
      a.download = `mrdaniel-story-${slug}-${i + 1}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // small stagger so the browser doesn't drop rapid-fire downloads
      await new Promise((r) => setTimeout(r, 350));
    }
  };

  return (
    <div className="space-y-5">
      {/* News picker */}
      <div className="dash-card p-6">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
          <Newspaper className="w-3.5 h-3.5" /> מחולל סטורי — 9:16 · מספר שקופיות דינמי
        </div>
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

        {/* Content picker — identical to the News Content Agent: select a specific article, preview its raw text. */}
        {list.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono mb-2">
              <span>{list.length} כתבות · {CATEGORY_LABEL[category]}</span>
              <span>לחצו על כתבה כדי לבנות ממנה סטורי</span>
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
              <span className="text-brand-400 font-bold">נבחר לסטורי:</span>
              <span>{item.source}</span>
              <span>·</span>
              <span>{item.image ? 'תמונת מקור מהכתבה ✓' : 'אין תמונה בפיד — רקע גרפי'}</span>
            </div>
            <p className="text-sm text-zinc-200 font-bold leading-snug">{item.title}</p>
          </div>
        )}
      </div>

      {item && (
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
                  {i + 1}. {s.kind === 'cover' ? 'שער' : s.kind === 'cta' ? 'סיום' : s.heading || `שקופית ${i + 1}`}
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

            <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black" style={{ width: 288, height: 512 }}>
              {rendering ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
                </div>
              ) : renderError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-amber-400 text-xs p-4 text-center">
                  <AlertTriangle className="w-5 h-5" /> {renderError}
                </div>
              ) : images[active] ? (
                <img src={images[active]} alt={`שקופית ${active + 1}`} className="w-full h-full object-cover" />
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
              1080×1920 · {images.length} שקופיות · שקופית {active + 1}
            </p>
          )}
        </div>
      )}

      {!item && !loadingNews && !newsError && (
        <div className="dash-card p-10 text-center text-zinc-500 text-sm">
          בחרו קטגוריה, בחרו כתבה מהרשימה — והמערכת תפרק אותה ל-4 עד 6 שקופיות סטורי אנכיות ממותגות, לפי עומק הידיעה.
        </div>
      )}
    </div>
  );
}
