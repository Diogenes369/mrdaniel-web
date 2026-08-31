import { useCallback, useEffect, useRef, useState } from 'react';
import { Newspaper, RefreshCw, Loader2, Download, ExternalLink, AlertTriangle, Film, ChevronRight, ChevronLeft } from 'lucide-react';
import { CATEGORY_LABEL, type NewsCategory, type NewsItem } from '../lib/newsAgentTypes';
import { fetchLatestNewsItem } from '../lib/newsFeedClient';
import { renderStoryForItem } from '../lib/instagramStoryRenderer';
import type { StoryPayload } from '../lib/storySlides';

const CATEGORIES: NewsCategory[] = ['cyber', 'ai', 'tech', 'all'];
const SLIDE_LABEL = ['שער', 'מה קרה?', 'למה זה חשוב?', 'קריאה לפעולה'];

export default function InstagramStoryCanvas() {
  const [category, setCategory] = useState<NewsCategory>('cyber');
  const [item, setItem] = useState<NewsItem | null>(null);
  const [loadingNews, setLoadingNews] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);

  const [payload, setPayload] = useState<StoryPayload | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const seq = useRef(0);

  const fetchNews = useCallback(async () => {
    setLoadingNews(true);
    setNewsError(null);
    try {
      const next = await fetchLatestNewsItem(category);
      if (!next) {
        setNewsError('לא נמצאו כתבות בקטגוריה הזו כרגע.');
        setItem(null);
      } else {
        setItem(next);
      }
    } catch {
      setNewsError('משיכת הפיד נכשלה — בדקו חיבור ל-mrdaniel.co.il/api/news.');
      setItem(null);
    } finally {
      setLoadingNews(false);
    }
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
          <Newspaper className="w-3.5 h-3.5" /> מחולל סטורי — 9:16 · 4 שקופיות
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
        <button
          onClick={fetchNews}
          disabled={loadingNews}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-500 text-black text-sm font-bold cursor-pointer disabled:opacity-50"
        >
          {loadingNews ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          משוך חדשות אחרונות
        </button>
        {newsError && (
          <p className="mt-3 text-xs text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> {newsError}
          </p>
        )}
        {item && (
          <div className="mt-4 p-3 rounded-lg bg-black/30 border border-white/10">
            <p className="text-sm text-zinc-200 font-bold leading-snug">{item.title}</p>
            <a href={item.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 mt-1">
              <ExternalLink className="w-3 h-3" /> לכתבה המקורית
            </a>
          </div>
        )}
      </div>

      {item && (
        <div className="dash-card p-6">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              {SLIDE_LABEL.map((label, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  disabled={!images[i]}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-40 ${
                    active === i ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
                  }`}
                >
                  {i + 1}. {label}
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
          בחרו קטגוריה ולחצו "משוך חדשות אחרונות" — המערכת תפרק את הכתבה ל-4 שקופיות סטורי אנכיות ממותגות.
        </div>
      )}
    </div>
  );
}
