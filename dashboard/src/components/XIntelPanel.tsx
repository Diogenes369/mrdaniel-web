import { useEffect, useState } from 'react';
import { BarChart3, Heart, MessageCircle, Clock, Lock, ExternalLink, Image as ImageIcon, Video, Link2 } from 'lucide-react';
import { analyzeXPosts, fetchXWriteStatus, type XIntelResult } from '../lib/grokApi';

/**
 * X intelligence — paste post URLs (@mrdaniel_ai's own, or viral posts from the AI niche) and get
 * the real numbers X exposes for free (likes, replies, age → velocity), the algorithm-lever report,
 * and an AI read of why each one performed.
 *
 * Reposts / quotes / views are not shown because the keyless endpoint does not carry them; the
 * panel says so instead of guessing. Automated likes / reposts / replies are a locked scaffold
 * (src/server/xWriteClient.ts) until X Developer keys are set — the lock state is shown here.
 */
export default function XIntelPanel() {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<XIntelResult | null>(null);
  const [write, setWrite] = useState<{ enabled: boolean; missing: string[] } | null>(null);

  useEffect(() => {
    void fetchXWriteStatus().then(setWrite);
  }, []);

  async function run() {
    const urls = input.split(/[\s,]+/).map((u) => u.trim()).filter((u) => /x\.com|twitter\.com/i.test(u));
    if (!urls.length) return;
    setBusy(true);
    setResult(await analyzeXPosts(urls));
    setBusy(false);
  }

  return (
    <div className="dash-card p-4" dir="rtl">
      <div className="flex flex-wrap items-center gap-3">
        <BarChart3 className="h-5 w-5 text-sky-300" />
        <h3 className="font-display text-base font-black text-white">מודיעין X</h3>
        <span className="text-sm text-zinc-400">למה פוסט עבד: מספרים אמיתיים, מנופי האלגוריתם וניתוח AI</span>
        {write && (
          <span
            className={`ms-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${write.enabled ? 'border-lime-500/40 text-lime-300' : 'border-amber-500/40 text-amber-300'}`}
            title={write.enabled ? '' : `חסר: ${write.missing.join(', ')}`}
          >
            <Lock className="h-3.5 w-3.5" />
            {write.enabled ? 'מעורבות אוטומטית: פתוחה' : 'מעורבות אוטומטית נעולה — חסרים מפתחות X Developer'}
          </span>
        )}
      </div>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        dir="ltr"
        rows={3}
        placeholder="https://x.com/mrdaniel_ai/status/…  (עד 8 קישורים, שורה לכל אחד)"
        className="mt-3 w-full rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-sky-500/50 focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-3">
        <button type="button" onClick={run} disabled={busy || !input.trim()} className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-bold text-sky-300 disabled:opacity-50">
          {busy ? 'מנתח…' : 'נתח פוסטים'}
        </button>
        <span className="text-[11px] text-zinc-500">X חושף בחינם רק לייקים ותגובות לפוסט. ריפוסטים, ציטוטים וצפיות דורשים API בתשלום.</span>
      </div>

      {result && !result.ok && <p className="mt-3 text-sm text-amber-300">{result.error}</p>}
      {result?.ok && (
        <div className="mt-4 space-y-3">
          {result.pattern && (
            <p className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-sm leading-relaxed text-sky-100">
              <b className="text-sky-300">הדפוס: </b>
              {result.pattern}
            </p>
          )}
          {result.posts.map((p) => (
            <div key={p.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                <span className="font-bold text-zinc-200" dir="ltr">{p.author}{p.verified ? ' ✓' : ''}</span>
                <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{p.likes.toLocaleString('he-IL')}</span>
                <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{p.replies.toLocaleString('he-IL')}</span>
                <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{p.ageHours < 48 ? `${p.ageHours} ש׳` : `${Math.round(p.ageHours / 24)} ימים`}</span>
                <span className="font-mono text-lime-300">{p.likesPerHour} לייקים/שעה</span>
                {p.photos > 0 && <span className="inline-flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" />{p.photos}</span>}
                {p.hasVideo && <Video className="h-3.5 w-3.5" />}
                {p.hasLink && <Link2 className="h-3.5 w-3.5 text-amber-300" />}
                <span className="font-mono">מנופים {p.report.score}/100</span>
                <a href={p.url} target="_blank" rel="noreferrer" className="ms-auto text-sky-300 hover:underline"><ExternalLink className="h-3.5 w-3.5" /></a>
              </div>
              <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-zinc-300" dir="auto">{p.text}</p>
              {p.why.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-zinc-200">
                  {p.why.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
            </div>
          ))}
          {result.analyst === 'none' && result.posts.length > 0 && <p className="text-xs text-zinc-500">מנוע הטקסט לא זמין כרגע — מוצגים המספרים ודוח המנופים בלבד.</p>}
          {result.failed.map((f) => (
            <p key={f.url} className="text-xs text-amber-300" dir="auto">{f.url} — {f.reason}</p>
          ))}
        </div>
      )}
    </div>
  );
}
