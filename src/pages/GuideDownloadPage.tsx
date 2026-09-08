import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  Download, FileText, ArrowLeft, ShieldCheck, Clock, Layers,
  AlertTriangle, Loader2, MessageSquare, Check, Sparkles, Lock, Zap,
} from 'lucide-react';
import Seo from '../components/seo/Seo';

/**
 * Public guide download landing page — `/download/:guideId`, `/download?id=…`, `/g/:guideId`.
 *
 * Structure follows the editorial article skeleton of the reference page supplied for this design
 * (financy.open-finance.ai): eyebrow badge → dominant title → muted subtitle → metadata row →
 * hairline rule → body, all in one narrow centred column with generous vertical rhythm and no
 * decorative card chrome. That reference is a light text-only article with no preview image and no
 * conversion block, so the visual centrepiece, value grid and CTA pair below come from this site's
 * own brief; only the hero proportions and reading rhythm are borrowed.
 *
 * The audience is someone who tapped a link in an Instagram DM on a phone, so this assumes a cold
 * visitor with no context. It is also deliberately `noindex`: every URL here is a per-recipient
 * capability token, and indexing one would publish a link handed to one person.
 *
 * Everything is read through the site's own `/api/download/*` router, never the bridge, so the
 * ephemeral tunnel hostname never reaches the browser. See PROJECT_STATE.md §5.
 */

interface GuideMeta {
  ok: boolean;
  guideId: string;
  title: string;
  slides: number;
  hasPdf: boolean;
  /** Slide headlines captured at publish time. Empty for guides published before that shipped. */
  topics: string[];
  createdAt: number | null;
  expiresAt: number | null;
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; meta: GuideMeta }
  | { kind: 'missing' }
  | { kind: 'expired' }
  | { kind: 'unavailable'; detail: string }
  | { kind: 'noid' };

const GUIDE_ID_RE = /^[a-f0-9]{32}$/;
/** Real anchor on the homepage — `#contact` does not exist, `<ContactPortal id="contact-portal">` does. */
const CONSULT_HREF = '/#contact-portal';

function apiUrl(guideId: string, query = ''): string {
  return `/api/download/${guideId}${query}`;
}

function formatDate(ts: number | null): string {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatExpiry(ts: number | null): string {
  if (!ts) return '';
  const days = Math.ceil((ts - Date.now()) / 86_400_000);
  if (days <= 0) return 'פג תוקף';
  if (days === 1) return 'זמין עד מחר';
  return `זמין עוד ${days} ימים`;
}

/**
 * Guide badge derived from the title.
 *
 * The publish record carries no category field, so rather than invent one the badge is inferred
 * from words already in the title and falls back to a neutral label. A wrong-but-confident category
 * would be worse than a generic one.
 */
function guideBadge(title: string): string {
  const t = title.toLowerCase();
  if (/סייבר|אבטח|פריצ|תקיפ|פגיעו|cyber|security/.test(t)) return 'מדריך סייבר';
  if (/אוטומצ|תהליך|workflow|automation/.test(t)) return 'מדריך אוטומציה';
  if (/ai|בינה מלאכותית|סוכן|agent|llm|gpt/.test(t)) return 'מדריך AI';
  return 'מדריך מעשי';
}

export default function GuideDownloadPage() {
  const params = useParams();
  const [search] = useSearchParams();
  // Three accepted shapes so a link survives being pasted from anywhere: /download/<id>, /g/<id>,
  // and /download?id=<id>.
  const guideId = (params.guideId || search.get('id') || '').trim().toLowerCase();

  const [state, setState] = useState<State>({ kind: 'loading' });
  const [coverFailed, setCoverFailed] = useState(false);
  const [coverLoaded, setCoverLoaded] = useState(false);

  useEffect(() => {
    if (!guideId) return setState({ kind: 'noid' });
    // Validated client-side too, so a malformed id renders the branded state instantly rather than
    // after a pointless round trip.
    if (!GUIDE_ID_RE.test(guideId)) return setState({ kind: 'missing' });

    let alive = true;
    setState({ kind: 'loading' });

    (async () => {
      try {
        const res = await fetch(apiUrl(guideId, '?meta=1'), { headers: { accept: 'application/json' } });
        if (!alive) return;
        if (res.status === 404) return setState({ kind: 'missing' });
        if (res.status === 410) return setState({ kind: 'expired' });
        if (!res.ok) {
          // 503 means the download service is down, not that the guide is gone — "not found" here
          // would send someone hunting for a link that is actually fine.
          return setState({
            kind: 'unavailable',
            detail: res.status === 503 ? 'שירות ההורדות אינו זמין כרגע.' : `השרת החזיר שגיאה ${res.status}.`,
          });
        }
        const meta = (await res.json()) as GuideMeta;
        if (alive) setState({ kind: 'ready', meta });
      } catch {
        if (alive) setState({ kind: 'unavailable', detail: 'לא הצלחנו להתחבר לשירות ההורדות.' });
      }
    })();

    return () => {
      alive = false;
    };
  }, [guideId]);

  const download = useCallback(
    (variant?: 'pdf') => {
      // Plain navigation rather than fetch+blob: the API answers 302 and the bridge sends
      // Content-Disposition, so the browser saves natively and a 5MB ZIP never enters page memory.
      window.location.href = apiUrl(guideId, variant === 'pdf' ? '?variant=pdf' : '');
    },
    [guideId]
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-carbon-950" dir="rtl">
      <Seo
        title="הורדת מדריך | דניאל בן ברוך"
        description="הורדת מדריך מקצועי בנושאי AI, סייבר ואוטומציה לעסקים."
        path="/download"
        noindex
      />
      <CarbonMesh />

      {/* Narrow single column, matching the reference's ~700px reading measure. */}
      <main className="relative z-10 mx-auto w-full max-w-[46rem] px-5 py-10 sm:px-8 sm:py-16">
        <BrandMark />

        {state.kind === 'loading' && <LoadingBlock />}
        {state.kind === 'ready' && (
          <GuideView
            meta={state.meta}
            guideId={guideId}
            coverFailed={coverFailed}
            coverLoaded={coverLoaded}
            onCoverError={() => setCoverFailed(true)}
            onCoverLoad={() => setCoverLoaded(true)}
            onDownload={download}
          />
        )}
        {state.kind === 'missing' && (
          <ProblemBlock title="הקישור לא נמצא" body="הקישור שגוי או שהמדריך הוסר. אם קיבלתם אותו בהודעה, בקשו קישור מעודכן." />
        )}
        {state.kind === 'expired' && (
          <ProblemBlock title="תוקף הקישור פג" body="הקישור הזה היה זמין לזמן מוגבל וכבר אינו פעיל. בקשו קישור חדש ונשלח מדריך מעודכן." />
        )}
        {state.kind === 'unavailable' && (
          <ProblemBlock title="השירות אינו זמין כרגע" body={`${state.detail} נסו שוב בעוד מספר דקות — הקישור עצמו עדיין תקף.`} />
        )}
        {state.kind === 'noid' && (
          <ProblemBlock title="לא צוין מדריך" body="הכתובת הזו מיועדת לקישור הורדה אישי. השתמשו בקישור המלא שקיבלתם." />
        )}

        <footer className="mt-14 border-t border-white/[0.07] pt-6 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-zinc-400 transition-colors hover:text-brand-400"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
            mrdaniel.co.il — סוכני AI, סייבר ואוטומציה לעסקים
          </Link>
        </footer>
      </main>
    </div>
  );
}

// ─── hero + body ────────────────────────────────────────────────────────────────────────────────

function GuideView({
  meta, guideId, coverFailed, coverLoaded, onCoverError, onCoverLoad, onDownload,
}: {
  meta: GuideMeta;
  guideId: string;
  coverFailed: boolean;
  coverLoaded: boolean;
  onCoverError: () => void;
  onCoverLoad: () => void;
  onDownload: (variant?: 'pdf') => void;
}) {
  const published = formatDate(meta.createdAt);
  const expiry = formatExpiry(meta.expiresAt);

  return (
    <article>
      {/* HERO — eyebrow, dominant title, subtitle, metadata row, rule. */}
      <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 font-cyber text-[10px] tracking-[0.2em] text-brand-300 uppercase">
        <ShieldCheck className="h-3 w-3" />
        {guideBadge(meta.title)}
      </p>

      <h1 className="font-display text-[2rem] leading-[1.12] font-extrabold tracking-tight text-white sm:text-[2.75rem]">
        {meta.title || 'המדריך מוכן להורדה'}
      </h1>

      <p className="mt-4 text-[15px] leading-relaxed text-zinc-400 sm:text-base">
        מדריך מעשי להורדה — {meta.slides} שקופיות, בפורמט {meta.hasPdf ? 'ZIP ו-PDF' : 'ZIP'}, מוכן
        לקריאה במובייל ולשיתוף בצוות.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-zinc-500">
        <span className="font-semibold text-zinc-300">דניאל בן ברוך</span>
        {published && (
          <>
            <span aria-hidden>·</span>
            <span>{published}</span>
          </>
        )}
        <span aria-hidden>·</span>
        <span>{meta.slides} שקופיות</span>
        {expiry && (
          <>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1 text-brand-400">
              <Clock className="h-3 w-3" />
              {expiry}
            </span>
          </>
        )}
      </div>

      <hr className="my-8 border-white/[0.08]" />

      {/* VISUAL CENTREPIECE */}
      {!coverFailed && (
        <div
          className={`relative mb-10 overflow-hidden rounded-2xl border border-white/10 bg-carbon-800/50 ${
            coverLoaded ? '' : 'aspect-[4/5] animate-pulse'
          }`}
        >
          {/* Space reserved at the slides' native 4:5 until the image lands, then released so a
              9:16 or 1:1 deck is not letterboxed. A full slide is ~1MB over the tunnel; without the
              reservation the page visibly jumps under the reader's thumb as it arrives. */}
          <img
            src={`/api/download/${guideId}?variant=slide&n=1`}
            alt={`עמוד השער של ${meta.title || 'המדריך'}`}
            loading="eager"
            onError={onCoverError}
            onLoad={onCoverLoad}
            className={`block h-auto w-full transition-opacity duration-500 ${
              coverLoaded ? 'opacity-100' : 'absolute inset-0 opacity-0'
            }`}
          />
          {coverLoaded && (
            <span className="absolute bottom-3 left-3 rounded-md bg-black/70 px-2 py-1 font-cyber text-[10px] tracking-wider text-zinc-300 backdrop-blur-sm">
              1 / {meta.slides}
            </span>
          )}
        </div>
      )}

      {/* VALUE PROPOSITION */}
      <section className="mb-10">
        <h2 className="mb-5 font-display text-lg font-bold text-white sm:text-xl">מה תמצאו במדריך</h2>

        {meta.topics.length > 0 ? (
          // Real per-guide topics: the slide headlines captured when the guide was published.
          <ul className="space-y-2.5">
            {meta.topics.map((topic, i) => (
              <li
                key={i}
                className="flex items-start gap-3 border-r-2 border-brand-500/40 bg-white/[0.02] py-2.5 pr-4 pl-3 text-[14px] leading-relaxed text-zinc-300"
              >
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                <span>{topic}</span>
              </li>
            ))}
          </ul>
        ) : (
          // Fallback for guides published before headline capture shipped. Describes the format,
          // which is always true, rather than inventing subject matter this page cannot know.
          <div className="grid gap-3 sm:grid-cols-3">
            <ValueCard icon={<Layers className="h-4 w-4" />} title={`${meta.slides} שקופיות`} body="תוכן מרוכז, שקופית לנושא, בלי מילוי." />
            <ValueCard icon={<Zap className="h-4 w-4" />} title="מעשי ליישום" body="צעדים ברורים שאפשר להריץ בעסק כבר השבוע." />
            <ValueCard icon={<Sparkles className="h-4 w-4" />} title={meta.hasPdf ? 'ZIP + PDF' : 'ZIP'} body="תמונות לשיתוף ומסמך אחד לקריאה רציפה." />
          </div>
        )}
      </section>

      {/* CTA BLOCK */}
      <section className="rounded-2xl border border-brand-500/25 bg-carbon-900/70 p-5 shadow-[0_0_60px_-20px_rgba(118,185,0,0.45)] backdrop-blur-xl sm:p-6">
        <span
          aria-hidden
          className="mb-5 block h-px w-full"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(0,255,102,0.55), transparent)' }}
        />
        <button
          type="button"
          onClick={() => onDownload()}
          className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl bg-brand-500 px-6 py-4 text-base font-extrabold text-carbon-950 transition-all hover:bg-brand-400 hover:shadow-[0_0_28px_-4px_rgba(0,255,102,0.6)] active:scale-[0.99] sm:text-lg"
        >
          <Download className="h-5 w-5" />
          הורד מדריך מלא (ZIP{meta.hasPdf ? ' / PDF' : ''})
        </button>

        <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row">
          {meta.hasPdf && (
            <button
              type="button"
              onClick={() => onDownload('pdf')}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-brand-500/30 px-5 py-3 text-sm font-bold text-brand-300 transition-colors hover:bg-brand-500/10"
            >
              <FileText className="h-4 w-4" />
              PDF בלבד
            </button>
          )}
          <a
            href={CONSULT_HREF}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/12 px-5 py-3 text-sm font-bold text-zinc-200 transition-colors hover:bg-white/5"
          >
            <MessageSquare className="h-4 w-4" />
            שיחה אישית עם דניאל
          </a>
        </div>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
          <Lock className="h-3 w-3" />
          הורדה ישירה, בלי הרשמה ובלי השארת פרטים.
        </p>
      </section>
    </article>
  );
}

function ValueCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/12 text-brand-400">
        {icon}
      </span>
      <p className="mb-1 text-[13px] font-bold text-white">{title}</p>
      <p className="text-[12px] leading-relaxed text-zinc-400">{body}</p>
    </div>
  );
}

// ─── chrome ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Carbon mesh backdrop — two CSS gradients plus a green bloom. No canvas, no image request.
 * On a phone opening this from a DM the first paint is the whole experience, so the background must
 * cost nothing and must never be the reason the page looks broken on a slow connection.
 */
function CarbonMesh() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-carbon-950" />
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(118,185,0,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(118,185,0,0.07) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(ellipse 80% 55% at 50% 0%, #000 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 55% at 50% 0%, #000 40%, transparent 100%)',
        }}
      />
      <div
        className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full opacity-25 blur-[120px]"
        style={{ background: 'radial-gradient(circle, #76B900 0%, transparent 70%)' }}
      />
    </div>
  );
}

function BrandMark() {
  return (
    <div className="mb-8 flex items-center gap-2.5">
      <span className="h-2 w-2 rounded-full bg-brand-500 shadow-[0_0_12px_#76B900]" />
      <span className="font-cyber text-[11px] tracking-[0.3em] text-zinc-400 uppercase">mrdaniel.co.il</span>
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <Loader2 className="h-7 w-7 animate-spin text-brand-500" />
      <p className="text-sm text-zinc-400">מאמת את הקישור…</p>
    </div>
  );
}

function ProblemBlock({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-2xl border border-amber-400/25 bg-carbon-900/70 p-6 text-center shadow-[0_0_60px_-20px_rgba(251,191,36,0.35)] backdrop-blur-xl sm:p-8">
      <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10">
        <AlertTriangle className="h-6 w-6 text-amber-300" />
      </span>
      <h1 className="mb-2 font-display text-xl font-extrabold text-white sm:text-2xl">{title}</h1>
      <p className="mx-auto mb-6 max-w-sm text-sm leading-relaxed text-zinc-400">{body}</p>
      <Link
        to="/"
        className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-brand-500 px-8 py-3.5 text-sm font-extrabold text-carbon-950 transition-colors hover:bg-brand-400"
      >
        חזרה ל-mrdaniel.co.il
      </Link>
    </section>
  );
}
