import { useEffect, useMemo, useState } from 'react';
import { Sparkles, RefreshCw, Copy, Check, Download, AlertTriangle, ShieldCheck, Link2Off, Image as ImageIcon, MessageCircle, Zap, Radio } from 'lucide-react';
import { fetchNewsList } from '../lib/newsFeedClient';
import { researchSource } from '../lib/web3CarouselApi';
import { directDeck, renderStudioDeck, exportStudioZip } from '../lib/web3CarouselRenderer';
import { fetchGrokStatus, synthesizeGrokCarousel, refreshXFeed, type GrokResult, type GrokStatus } from '../lib/grokApi';
import { scoreXThread, xWeightedLength, hasExternalLink, X_POST_LIMIT, X_RANKING_WEIGHTS as W } from '../lib/xAlgorithm';
import { CATEGORY_LABEL, type NewsCategory, type NewsItem } from '../lib/newsAgentTypes';
import PreviewErrorBoundary from './PreviewErrorBoundary';

/**
 * Grok · X Studio — scraped AI news → Grok → an X-algorithm-optimized carousel AND thread.
 *
 * Flow: pick a story (Scout fetched it) → research the full article → Grok drafts slides + thread
 * in one call → Hermes verifies (unverified numbers, security guard, X length limits) → the thread
 * is scored against the levers the open-sourced For You ranker rewards. Every post stays editable
 * and is re-scored live, so the operator sees what an edit does to the score before posting.
 *
 * Posting is manual on purpose: the thread is copied post by post with its slide images, because
 * native image attachments are one of the levers and the X API write tier is a separate paid plan.
 */

const CATEGORIES: NewsCategory[] = ['all', 'ai_models', 'ai_agents', 'ai'];

function GradeBadge({ score, grade }: { score: number; grade: string }) {
  const tone = grade === 'A' ? 'text-brand-300 border-brand-500/40 bg-brand-500/10' : grade === 'B' ? 'text-sky-300 border-sky-500/40 bg-sky-500/10' : 'text-amber-300 border-amber-500/40 bg-amber-500/10';
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-sm font-bold ${tone}`}>
      {grade} · {score}/100
    </span>
  );
}

export default function GrokStudio() {
  const [status, setStatus] = useState<GrokStatus | null>(null);
  const [category, setCategory] = useState<NewsCategory>('all');
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selected, setSelected] = useState<NewsItem | null>(null);
  const [busy, setBusy] = useState<'' | 'research' | 'grok' | 'render'>('');
  const [result, setResult] = useState<GrokResult | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [posts, setPosts] = useState<string[]>([]);
  const [copied, setCopied] = useState<number | 'all' | null>(null);
  const [error, setError] = useState('');
  const [feedMsg, setFeedMsg] = useState('');

  useEffect(() => {
    fetchGrokStatus().then(setStatus);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingList(true);
    fetchNewsList(category, 30)
      .then((list) => !cancelled && setItems(list))
      .catch(() => !cancelled && setItems([]))
      .finally(() => !cancelled && setLoadingList(false));
    return () => {
      cancelled = true;
    };
  }, [category]);

  // Live re-score as the operator edits the thread.
  const liveReport = useMemo(() => {
    if (!result) return null;
    return scoreXThread({ posts: posts.map((text, i) => ({ text, mediaSlides: result.thread[i]?.mediaSlides ?? [] })) });
  }, [posts, result]);

  async function run() {
    if (!selected) return;
    setError('');
    setResult(null);
    setImages([]);
    try {
      setBusy('research');
      const { brief } = await researchSource({ mode: 'url', url: selected.link, topic: selected.topic }).catch(async () =>
        researchSource({ mode: 'text', rawText: `${selected.title}\n\n${selected.summary || selected.excerpt}\n\n${selected.link}`, topic: selected.topic }),
      );
      if (brief.body.length < 200 && (selected.summary || '').length > brief.body.length) {
        brief.body = `${selected.title}\n\n${selected.summary}`;
      }
      setBusy('grok');
      const r = await synthesizeGrokCarousel(brief, selected.topic);
      setResult(r);
      setPosts(r.thread.map((p) => p.text));
      setBusy('render');
      const deck = directDeck(r.deck);
      setImages(await renderStudioDeck(deck));
      setResult({ ...r, deck });
    } catch (e) {
      setError((e as Error).message || 'שגיאה ביצירה');
    } finally {
      setBusy('');
    }
  }

  async function copy(text: string, key: number | 'all') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError('ההעתקה נחסמה בדפדפן');
    }
  }

  async function onRefreshFeed() {
    setFeedMsg('מרענן…');
    const r = await refreshXFeed();
    setFeedMsg(r.ok ? `הפיד באתר עודכן: ${r.count} פוסטים (מקור: ${r.source})` : 'רענון הפיד נכשל');
  }

  const report = liveReport ?? result?.report ?? null;

  return (
    <div className="space-y-5" dir="rtl">
      <div className="dash-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Sparkles className="h-5 w-5 text-lime-300" />
          <h2 className="font-display text-lg font-black text-white">Grok · סטודיו X</h2>
          <span className="text-sm text-zinc-400">חדשות AI ← Grok ← קרוסלה + שרשור שמותאמים לאלגוריתם של X</span>
          <span className="ms-auto flex items-center gap-2 text-xs">
            {status === null ? (
              <span className="text-zinc-500">בודק חיבור ל-xAI…</span>
            ) : status.configured && status.usable ? (
              <span className="rounded-full border border-lime-500/40 bg-lime-500/10 px-2.5 py-1 font-mono text-lime-300">xAI מחובר · {status.model}</span>
            ) : status.configured ? (
              <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-sky-300" title="המפתח תקף אבל לחשבון ה-xAI אין קרדיט. הטיוטות נכתבות ב-Groq החינמי, ו-Hermes מאמת כרגיל.">
                xAI ללא קרדיט · Groq חינמי
              </span>
            ) : (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-amber-300" title="הוסיפו XAI_API_KEY ב-Vercel (Production + Preview) ופרסו מחדש">
                XAI_API_KEY חסר — מצב מקומי
              </span>
            )}
            <button type="button" onClick={onRefreshFeed} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-zinc-300 hover:border-sky-500/40">
              <Radio className="h-3.5 w-3.5" /> רענון פיד ה-X באתר
            </button>
          </span>
        </div>
        {feedMsg && <p className="mt-2 text-xs text-zinc-400">{feedMsg}</p>}
        {!status?.configured && status !== null && (
          <p className="mt-3 text-xs leading-relaxed text-zinc-400">
            מנוי X Premium לא כולל גישת API. צרו מפתח וטענו קרדיט ב-console.x.ai, והוסיפו אותו כ-<code dir="ltr">XAI_API_KEY</code>. עד אז הסטודיו בונה
            קרוסלה ושרשור מקומיים לפי אותם חוקי אלגוריתם.
          </p>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
        {/* ── Scout: pick a story ── */}
        <div className="dash-card p-4">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full border px-3 py-1 text-xs font-bold ${category === c ? 'border-lime-500 bg-lime-500 text-black' : 'border-white/10 text-zinc-300'}`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
          <ul className="max-h-[520px] space-y-1.5 overflow-y-auto pe-1">
            {loadingList && <li className="text-sm text-zinc-500">Scout סורק את הפיד…</li>}
            {!loadingList && !items.length && <li className="text-sm text-zinc-500">אין כתבות בקטגוריה.</li>}
            {items.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => setSelected(it)}
                  className={`w-full rounded-lg border p-2.5 text-right text-sm leading-snug transition-colors ${selected?.id === it.id ? 'border-lime-500/60 bg-lime-500/10 text-white' : 'border-white/5 text-zinc-300 hover:border-white/15'}`}
                >
                  {it.title}
                  <span className="mt-1 block text-[11px] text-zinc-500">{it.source}</span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={!selected || Boolean(busy)}
            onClick={run}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-lime-400 px-4 py-3 font-bold text-black disabled:opacity-40"
          >
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {busy === 'research' ? 'Scout קורא את הכתבה…' : busy === 'grok' ? 'Grok כותב…' : busy === 'render' ? 'מרנדר שקופיות…' : 'Grok: צור קרוסלה + שרשור'}
          </button>
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>

        {/* ── Output ── */}
        <div className="space-y-5">
          {!result && !busy && <div className="dash-card p-8 text-center text-sm text-zinc-500">בחרו כתבה והפעילו את Grok.</div>}

          {result && (
            <>
              {!result.synthesized && (
                <div className="dash-card flex items-start gap-2 border-amber-500/30 p-3 text-sm text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  מצב מקומי: {result.fallbackReason}
                </div>
              )}

              {/* Hermes */}
              {result.verification && (
                <div className="dash-card p-4 text-sm">
                  <div className="mb-2 flex items-center gap-2 font-bold text-amber-300">
                    <ShieldCheck className="h-4 w-4" /> Hermes · אימות
                  </div>
                  <ul className="space-y-1 text-zinc-300">
                    <li>
                      {result.verification.unverifiedNumbers.length
                        ? `⚠️ מספרים שלא מופיעים במקור: ${result.verification.unverifiedNumbers.join(', ')} (שקופיות ${result.verification.flaggedSlides.map((i) => i + 1).join(', ')}) — בדקו לפני פרסום.`
                        : '✓ כל המספרים מופיעים בכתבת המקור.'}
                    </li>
                    <li>{result.verification.securityPassed ? '✓ עבר את מסנן התוכן.' : `⚠️ דגלים: ${result.verification.securityFlags.join(', ')}`}</li>
                    {result.verification.trimmedPosts > 0 && <li>✂️ {result.verification.trimmedPosts} פוסטים קוצרו למגבלת {X_POST_LIMIT} תווים.</li>}
                  </ul>
                </div>
              )}

              {/* Slides */}
              <div className="dash-card p-4">
                <div className="mb-3 flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-lime-300" />
                  <strong className="text-white">קרוסלה · {result.deck.slides.length} שקופיות</strong>
                  <span className="text-xs text-zinc-500">מודל: {result.model}</span>
                  {images.length > 0 && (
                    <button type="button" onClick={() => exportStudioZip(result.deck, images)} className="ms-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-200">
                      <Download className="h-3.5 w-3.5" /> ZIP
                    </button>
                  )}
                </div>
                <PreviewErrorBoundary label="תצוגת שקופיות Grok">
                  <div className="flex gap-3 overflow-x-auto pb-2" style={{ touchAction: 'pan-x' }}>
                    {(images.length ? images : result.deck.slides.map(() => '')).map((src, i) => (
                      <div key={i} className={`relative w-40 shrink-0 overflow-hidden rounded-lg border ${result.verification?.flaggedSlides.includes(i) ? 'border-amber-500' : 'border-white/10'}`}>
                        {src ? <img src={src} alt={`שקופית ${i + 1}`} className="block w-full" /> : <div className="aspect-[4/5] animate-pulse bg-white/5" />}
                        <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 font-mono text-[10px] text-zinc-300">{i + 1}</span>
                      </div>
                    ))}
                  </div>
                </PreviewErrorBoundary>
              </div>

              {/* Thread */}
              <div className="dash-card p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-sky-300" />
                  <strong className="text-white">שרשור ל-X</strong>
                  {report && <GradeBadge score={report.score} grade={report.grade} />}
                  <button type="button" onClick={() => copy(posts.join('\n\n---\n\n'), 'all')} className="ms-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-200">
                    {copied === 'all' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} העתק הכל
                  </button>
                </div>
                <ol className="space-y-3">
                  {posts.map((text, i) => {
                    const len = xWeightedLength(text);
                    const media = result.thread[i]?.mediaSlides ?? [];
                    return (
                      <li key={i} className="rounded-xl border border-white/10 bg-black/30 p-3">
                        <div className="mb-1.5 flex items-center gap-2 text-xs text-zinc-500">
                          <span className="font-mono">{i + 1}/{posts.length}</span>
                          {media.length > 0 && <span className="text-lime-300">📎 הצמידו שקופיות {media.map((m) => m + 1).join(', ')}</span>}
                          {i === 0 && hasExternalLink(text) && (
                            <span className="inline-flex items-center gap-1 text-red-400">
                              <Link2Off className="h-3 w-3" /> קישור בהוק
                            </span>
                          )}
                          <span className={`ms-auto font-mono ${len > X_POST_LIMIT ? 'text-red-400' : 'text-zinc-500'}`}>{len}/{X_POST_LIMIT}</span>
                          <button type="button" onClick={() => copy(text, i)} className="text-zinc-400 hover:text-white" aria-label="העתק פוסט">
                            {copied === i ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        <textarea
                          dir="auto"
                          value={text}
                          onChange={(e) => setPosts((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
                          rows={Math.min(8, Math.max(3, Math.ceil(text.length / 60)))}
                          className="w-full resize-y rounded-lg border border-white/5 bg-transparent p-2 text-sm leading-relaxed text-zinc-100 outline-none focus:border-sky-500/40"
                        />
                      </li>
                    );
                  })}
                </ol>
              </div>

              {/* Algorithm checklist */}
              {report && (
                <div className="dash-card p-4">
                  <strong className="mb-3 block text-white">בדיקת אלגוריתם (xai-org/x-algorithm)</strong>
                  <ul className="space-y-2 text-sm">
                    {report.checks.map((c) => (
                      <li key={c.id} className="flex gap-2">
                        <span className={c.passed ? 'text-lime-300' : 'text-red-400'}>{c.passed ? '✓' : '✗'}</span>
                        <span className="flex-1">
                          <span className="text-zinc-200">{c.label}</span>
                          <span className="block text-xs text-zinc-500">{c.lever}</span>
                          {!c.passed && c.fix && <span className="block text-xs text-amber-300">{c.fix}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                    משקלים מ-param.rs: תגובה {W.reply} · ציטוט {W.quote} · לייק {W.favorite} · שליחה בהעתקת קישור {W.shareViaCopyLink} · פתיחת קישור {W.openLink} · דיווח {W.report}. המשקלים מכפילים הסתברות חזויה, לא ספירות.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
