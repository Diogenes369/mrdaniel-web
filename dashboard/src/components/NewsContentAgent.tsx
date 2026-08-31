import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Newspaper,
  RefreshCw,
  Loader2,
  Copy,
  Check,
  Download,
  Linkedin,
  Instagram,
  ExternalLink,
  ImageIcon,
  AlertTriangle,
} from 'lucide-react';
import {
  CATEGORY_LABEL,
  PLATFORM_LABEL,
  type ImageAspect,
  type NewsCategory,
  type NewsItem,
  type SocialPlatform,
} from '../lib/newsAgentTypes';
import { fetchLatestNewsItem } from '../lib/newsFeedClient';
import { composeNewsPost, type ComposedPost } from '../lib/newsPostComposer';
import { renderNewsImage, type BgSource } from '../lib/newsImageComposer';

const CATEGORIES: NewsCategory[] = ['cyber', 'ai', 'tech', 'all'];
const PLATFORM_ICON: Record<SocialPlatform, typeof Linkedin> = { linkedin: Linkedin, instagram: Instagram };

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function NewsContentAgent() {
  const [category, setCategory] = useState<NewsCategory>('cyber');
  const [platform, setPlatform] = useState<SocialPlatform>('linkedin');
  const [aspect, setAspect] = useState<ImageAspect>('1:1');
  const [headline, setHeadline] = useState(true);

  const [item, setItem] = useState<NewsItem | null>(null);
  const [loadingNews, setLoadingNews] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);

  const [post, setPost] = useState<ComposedPost | null>(null);
  const [copied, setCopied] = useState(false);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageSource, setImageSource] = useState<BgSource | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const renderSeq = useRef(0);

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

  // Recompose copy whenever the item or platform changes.
  useEffect(() => {
    setPost(item ? composeNewsPost(item, platform) : null);
  }, [item, platform]);

  // Re-render the branded image whenever the item / aspect / headline toggle changes.
  useEffect(() => {
    if (!item) {
      setImageUrl(null);
      setImageSource(null);
      return;
    }
    const seq = ++renderSeq.current;
    setRendering(true);
    setRenderError(null);
    renderNewsImage(item, { aspect, headline })
      .then(({ dataUrl, imageSource: src }) => {
        if (seq === renderSeq.current) {
          setImageUrl(dataUrl);
          setImageSource(src);
        }
      })
      .catch(() => {
        if (seq === renderSeq.current) setRenderError('רינדור התמונה נכשל.');
      })
      .finally(() => {
        if (seq === renderSeq.current) setRendering(false);
      });
  }, [item, aspect, headline]);

  const copyText = async () => {
    if (!post) return;
    try {
      await navigator.clipboard.writeText(post.fullText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the text is visible for manual copy */
    }
  };

  const downloadImage = () => {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    const slug = (item?.slug || 'news-post').slice(0, 40);
    a.download = `mrdaniel-${slug}-${aspect.replace(':', 'x')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="space-y-5">
      {/* Action bar — category selector + fetch */}
      <div className="dash-card p-6">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
          <Newspaper className="w-3.5 h-3.5" />
          משיכת חדשות אחרונות מהפיד החי
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
            <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-mono mb-1">
              <span className="text-brand-400">{CATEGORY_LABEL[category === 'all' ? 'all' : category]}</span>
              <span>·</span>
              <span>{item.source}</span>
              <span>·</span>
              <span>{timeLabel(item.publishedAt)}</span>
              <span>·</span>
              {imageSource === 'original' ? (
                <span className="text-brand-400">תמונת המקור מהכתבה ✓</span>
              ) : imageSource === 'stock' ? (
                <span className="text-amber-400/90">תמונת סטוק (לא נמצאה תמונת מקור)</span>
              ) : imageSource === 'none' ? (
                <span className="text-zinc-500">רקע גרפי בלבד</span>
              ) : item.image ? (
                <span className="text-brand-400/70">תמונת מקור זמינה</span>
              ) : (
                <span className="text-zinc-500">אין תמונה בפיד</span>
              )}
            </div>
            <p className="text-sm text-zinc-200 font-bold leading-snug">{item.title}</p>
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 mt-1"
            >
              <ExternalLink className="w-3 h-3" /> לכתבה המקורית
            </a>
          </div>
        )}
      </div>

      {item && (
        <>
          {/* Shared controls */}
          <div className="dash-card p-6 flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-zinc-500 uppercase">פלטפורמה</span>
              {(['linkedin', 'instagram'] as SocialPlatform[]).map((p) => {
                const Icon = PLATFORM_ICON[p];
                return (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                      platform === p ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {PLATFORM_LABEL[p]}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-zinc-500 uppercase">יחס תמונה</span>
              {(['1:1', '4:5'] as ImageAspect[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setAspect(a)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer font-mono ${
                    aspect === a ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
              <input type="checkbox" checked={headline} onChange={(e) => setHeadline(e.target.checked)} className="accent-brand-500 w-4 h-4" />
              כותרת על התמונה
            </label>
          </div>

          {/* Side-by-side workspaces */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Copy workspace */}
            <div className="dash-card p-6 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <span className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
                  <Newspaper className="w-3.5 h-3.5" /> טקסט מוכן לפרסום
                </span>
                <button
                  onClick={copyText}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-black text-xs font-bold cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'הועתק ✓' : 'העתק טקסט'}
                </button>
              </div>
              <textarea
                readOnly
                value={post?.fullText ?? ''}
                dir="rtl"
                rows={24}
                className="w-full flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-zinc-200 leading-relaxed resize-y min-h-[420px]"
              />
              {post && (
                <div className="mt-3">
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {post.hashtags.map((tag) => (
                      <span key={tag} className="text-[11px] text-brand-400 font-mono bg-brand-500/10 border border-brand-500/20 rounded px-1.5 py-0.5">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-500 bg-black/30 border border-brand-500/20 rounded-lg p-2 leading-relaxed">
                    <span className="text-brand-400 font-bold">קריאה לפעולה (קבועה): </span>
                    {post.footer}
                  </p>
                </div>
              )}
            </div>

            {/* Image workspace */}
            <div className="dash-card p-6 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <span className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
                  <ImageIcon className="w-3.5 h-3.5" /> תמונה ממותגת
                </span>
                <button
                  onClick={downloadImage}
                  disabled={!imageUrl || rendering}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-black text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" /> הורד תמונה (PNG)
                </button>
              </div>
              <div className="flex-1 flex items-center justify-center rounded-lg bg-black/40 border border-white/10 p-3 min-h-[280px]">
                {rendering ? (
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
                ) : renderError ? (
                  <p className="text-xs text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> {renderError}
                  </p>
                ) : imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="תצוגה מקדימה של התמונה הממותגת"
                    className="max-h-[520px] w-auto max-w-full rounded-md shadow-lg"
                  />
                ) : (
                  <p className="text-xs text-zinc-600">אין תצוגה</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {!item && !loadingNews && !newsError && (
        <div className="dash-card p-10 text-center text-zinc-500 text-sm">
          בחרו קטגוריה ולחצו "משוך חדשות אחרונות" — המערכת תיצור פוסט מלא (טקסט + תמונה ממותגת + חתימת אתר) מהכתבה העדכנית ביותר.
        </div>
      )}
    </div>
  );
}
