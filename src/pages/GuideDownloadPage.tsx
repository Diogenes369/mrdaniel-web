import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  Download, FileText, ArrowLeft, ShieldCheck, Clock, AlertTriangle,
  Loader2, MessageSquare, Check, Lock, BookOpen, Quote, FlaskConical, LogOut,
} from 'lucide-react';
import Seo from '../components/seo/Seo';
import { loadTracker } from '../lib/loadTracker';
import GuideCover from '../components/guides/GuideCover';
import { guideCoverStyle } from '../data/creatorContent';
import type { User } from '../lib/siteAuth';

// Sign-in is only needed once someone presses download on a static guide, so the modal and the
// `firebase/auth` behind it load on demand instead of riding in the bundle every visitor pays for.
const AuthModal = lazy(() => import('../components/auth/AuthModal'));
const loadAuth = () => import('../lib/siteAuth');
import {
  DEMO_GUIDE, DEMO_IDS, DEMO_STATIC_GUIDE, DEMO_STATIC_IDS, type GuideMeta, type GuideSection,
} from './guideDemoFixture';

/**
 * Public guide download landing page — `/download/:guideId`, `/download?id=…`, `/g/:guideId`.
 *
 * Two kinds of guide share it: a static PDF from the CDN registry (`/g/<slug>`, see
 * src/server/leadMagnets.ts) and a carousel published from the bridge (`/g/<32-hex guideId>`). Both
 * resolve through `/api/download/<id>?meta=1`, and `meta.kind` picks the layout.
 *
 * Structured as a full editorial article rather than a bare download card, following the reference
 * supplied for this design (financy.open-finance.ai): H2 sections with generous top margin, a
 * bolded lead-in clause opening each section, ~1.9 line-height body, inline emphasis, a spec table,
 * and a persistent bottom conversion bar adapted from that page's sticky chat pill. The reference
 * is a light text-only article with no preview imagery and no CTA block, so the visual
 * interstitials and conversion sections here are this site's own; the reading rhythm is borrowed.
 *
 * The body renders the guide's REAL slide copy, captured by the bridge at publish time. It does not
 * generate educational prose around a headline: that would mean fabricating claims about what a
 * guide teaches, on a public page. Guides published before capture shipped degrade to a shorter
 * format-led layout instead.
 *
 * Bare route (no site chrome) because the visitor tapped a link in an Instagram DM on a phone, and
 * `noindex` because every URL here is a per-recipient capability token.
 *
 * STATIC guides (the free PDFs) are gated behind a free sign-in since 2026-09-24: download opens
 * AuthModal (Google first, then email/password), and on success the modal closes and the download
 * starts by itself. Each signed-in download is recorded as a lead through `api/leads`
 * (`guide-signup`), which reads the identity from the Firebase ID token rather than trusting the
 * browser. Bridge guides (32-hex ids) stay ungated — those links are already per-recipient.
 *
 * The gate is a lead-capture step, not DRM: the PDF itself is still a public CDN file under
 * /guides/. Serving it through a function would put ~2 MB of PDFs in a Hobby function bundle for a
 * free guide; not worth it while the point is the lead, not secrecy.
 */

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; meta: GuideMeta }
  | { kind: 'missing' }
  | { kind: 'expired' }
  | { kind: 'unavailable'; detail: string }
  | { kind: 'noid' };

const GUIDE_ID_RE = /^[a-f0-9]{32}$/;
/** Static-guide slug. Mirrors GUIDE_SLUG_RE in src/server/leadMagnets.ts — keep the two identical. */
const GUIDE_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
/** Real anchor on the homepage — `#contact` does not exist, `<ContactPortal id="contact-portal">` does. */
const CONSULT_HREF = '/#contact-portal';

const apiUrl = (guideId: string, query = '') => `/api/download/${guideId}${query}`;

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

/** Reading time from the actual rendered copy — 200 Hebrew words/min, floored at 1. */
function readingMinutes(sections: GuideSection[]): number {
  const words = sections.reduce(
    (n, s) => n + `${s.headline} ${s.subhead} ${s.cards.join(' ')}`.trim().split(/\s+/).length,
    0
  );
  return Math.max(1, Math.round(words / 200));
}

/**
 * Guide badge derived from the title. The publish record carries no category field, so rather than
 * invent one this reads words already in the title and falls back to a neutral label — a
 * confidently wrong category would be worse than a generic one.
 */
function guideBadge(title: string): string {
  const t = title.toLowerCase();
  if (/אוטומצ|תהליך|workflow|automation/.test(t)) return 'מדריך אוטומציה';
  if (/ai|בינה מלאכותית|סוכן|agent|llm|gpt/.test(t)) return 'מדריך AI';
  return 'מדריך מעשי';
}

/** "12 עמודים" / "PDF" for a static guide, "5 שקופיות" for a carousel. */
function lengthLabel(meta: GuideMeta): string {
  if (meta.kind === 'static') return meta.pages ? `${meta.pages} עמודים` : 'PDF';
  return `${meta.slides} שקופיות`;
}

/** Length and format on one line, for the sticky bar. */
function summaryLine(meta: GuideMeta): string {
  if (meta.kind === 'static') return meta.pages ? `${meta.pages} עמודים · PDF` : 'PDF';
  return `${meta.slides} שקופיות · ${meta.hasPdf ? 'ZIP + PDF' : 'ZIP'}`;
}

/**
 * Campaign tags ManyChat appends to the DM link (withDmTracking in the dashboard). Bounded: they
 * come straight off the URL and land in the analytics log.
 */
function campaignFrom(search: URLSearchParams) {
  const pick = (key: string) => (search.get(key) || '').trim().slice(0, 60) || undefined;
  return { utmSource: pick('utm_source'), utmMedium: pick('utm_medium'), utmCampaign: pick('utm_campaign'), keyword: pick('kw') };
}

export default function GuideDownloadPage() {
  const params = useParams();
  const [search] = useSearchParams();
  const guideId = (params.guideId || search.get('id') || '').trim().toLowerCase();

  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (!guideId) return setState({ kind: 'noid' });

    // Demo short-circuits the API entirely so the full layout is reviewable with no live guide,
    // no bridge and no tunnel.
    if (DEMO_IDS.has(guideId)) return setState({ kind: 'ready', meta: DEMO_GUIDE });
    if (DEMO_STATIC_IDS.has(guideId)) return setState({ kind: 'ready', meta: DEMO_STATIC_GUIDE });

    // A bridge guideId or a static-guide slug; anything else cannot be a guide.
    if (!GUIDE_ID_RE.test(guideId) && !GUIDE_SLUG_RE.test(guideId)) return setState({ kind: 'missing' });

    let alive = true;
    setState({ kind: 'loading' });

    (async () => {
      try {
        const res = await fetch(apiUrl(guideId, '?meta=1'), { headers: { accept: 'application/json' } });
        if (!alive) return;
        if (res.status === 404 || res.status === 400) return setState({ kind: 'missing' });
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
        if (alive) setState({ kind: 'ready', meta: { ...meta, sections: meta.sections ?? [], topics: meta.topics ?? [] } });
      } catch {
        if (alive) setState({ kind: 'unavailable', detail: 'לא הצלחנו להתחבר לשירות ההורדות.' });
      }
    })();

    return () => {
      alive = false;
    };
  }, [guideId]);

  const meta = state.kind === 'ready' ? state.meta : null;
  const campaign = useMemo(() => campaignFrom(search), [search]);

  const isStatic = meta?.kind === 'static';
  const [visitor, setVisitor] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  const startDownload = useCallback(
    (variant?: 'pdf', user: User | null = null) => {
      // The demo has no file behind it (its banner says so), so its buttons stay inert.
      if (!meta || meta.isDemo) return;
      const isStatic = meta.kind === 'static';
      if (isStatic && user) loadAuth().then((a) => a.recordGuideLead(user, guideId));
      // Static guides open the CDN file directly — only ever a /guides/ path, whatever the API said.
      // Bridge guides use plain navigation, not fetch+blob: the API answers 302 and the bridge sends
      // Content-Disposition, so the browser saves natively and a 5MB ZIP never enters page memory.
      const target = isStatic
        ? meta.downloadUrl?.startsWith('/guides/') ? meta.downloadUrl : apiUrl(guideId, '?variant=pdf')
        : apiUrl(guideId, variant === 'pdf' ? '?variant=pdf' : '');
      loadTracker().then((t) =>
        t.trackConversion('guide_download', { guide: guideId, action: isStatic || variant === 'pdf' ? 'pdf' : 'zip', ...campaign })
      );
      // A PDF opens in place of this page, which would cut the analytics write off mid-flight; a
      // beat of delay lets it leave first. Imperceptible next to the file's own load.
      window.setTimeout(() => {
        window.location.href = target;
      }, 150);
    },
    [meta, guideId, campaign]
  );

  // Static guides only: know who is signed in, and finish a Google sign-in that had to fall back
  // from a blocked popup to a full-page redirect — the download the visitor asked for resumes here.
  useEffect(() => {
    if (!isStatic) return;
    let alive = true;
    let unsub = () => {};
    loadAuth().then(async (a) => {
      if (!alive) return;
      unsub = a.watchUser((u) => {
        if (alive) setVisitor(u);
      });
      const resumed = await a.takeRedirectResume();
      const u = a.siteAuth()?.currentUser ?? null;
      if (alive && resumed === guideId && u) startDownload(undefined, u);
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [isStatic, guideId, startDownload]);

  const download = useCallback(
    (variant?: 'pdf') => {
      // The demo opens the modal too, so the gate is reviewable at /g/demo-pdf; its download stays inert.
      if (meta?.kind === 'static' && !visitor) {
        setAuthOpen(true);
        return;
      }
      startDownload(variant, visitor);
    },
    [meta, visitor, startDownload]
  );

  const onAuthed = useCallback(
    (u: User) => {
      setVisitor(u);
      setAuthOpen(false);
      startDownload(undefined, u);
    },
    [startDownload]
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-carbon-950" dir="rtl">
      <Seo
        title="הורדת מדריך | דניאל בן ברוך"
        description="מדריך AI מעשי להורדה: סוכנים, מודלי שפה ואוטומציה."
        path="/download"
        noindex
      />
      <CarbonMesh />

      {/* ~700px measure, matching the reference's reading column. */}
      <main className="relative z-10 mx-auto w-full max-w-[46rem] px-5 pt-10 pb-32 sm:px-8 sm:pt-16">
        <BrandMark />

        {state.kind === 'loading' && <LoadingBlock />}
        {state.kind === 'ready' && (
          <GuideArticle
            meta={state.meta}
            guideId={guideId}
            onDownload={download}
            visitor={visitor}
            onSignOut={() => loadAuth().then((a) => a.signOutVisitor())}
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
          <Link to="/" className="inline-flex items-center gap-2 text-[13px] font-medium text-zinc-400 transition-colors hover:text-brand-400">
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
            mrdaniel.co.il — חדשות AI, מודלי שפה וסוכנים
          </Link>
        </footer>
      </main>

      {state.kind === 'ready' && <StickyBar meta={state.meta} onDownload={download} />}

      {authOpen && meta && (
        <Suspense fallback={null}>
          <AuthModal
            open={authOpen}
            guideSlug={guideId}
            guideTitle={meta.title || 'המדריך'}
            onClose={() => setAuthOpen(false)}
            onAuthed={onAuthed}
          />
        </Suspense>
      )}
    </div>
  );
}

// ─── article ────────────────────────────────────────────────────────────────────────────────────

function GuideArticle({
  meta, guideId, onDownload, visitor, onSignOut,
}: {
  meta: GuideMeta;
  guideId: string;
  onDownload: (variant?: 'pdf') => void;
  visitor: User | null;
  onSignOut: () => void;
}) {
  const sections = meta.sections ?? [];
  const hasBody = sections.length > 0;
  const minutes = useMemo(() => readingMinutes(sections), [sections]);
  const published = formatDate(meta.createdAt);
  const expiry = formatExpiry(meta.expiresAt);
  const isStatic = meta.kind === 'static';

  return (
    <article>
      {meta.isDemo && (
        <p className="mb-6 rounded-lg border border-amber-400/30 bg-amber-400/[0.07] px-3 py-2 text-[12px] text-amber-200">
          <FlaskConical className="mb-0.5 ml-1.5 inline h-3.5 w-3.5" />
          תצוגת דמו לבדיקת פריסה — התוכן לדוגמה בלבד ואין מאחוריו קובץ להורדה.
        </p>
      )}

      {/* HERO */}
      <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 font-tech text-[10px] tracking-[0.2em] text-brand-300 uppercase">
        <ShieldCheck className="h-3 w-3" />
        {guideBadge(meta.title)}
      </p>

      <h1 className="font-display text-[2rem] leading-[1.12] font-extrabold tracking-tight text-white sm:text-[2.75rem]">
        {meta.title || 'המדריך מוכן להורדה'}
      </h1>

      <p className="mt-4 text-[15px] leading-relaxed text-zinc-400 sm:text-base">
        {isStatic
          ? meta.subtitle || `מדריך PDF מעשי${meta.pages ? ` — ${meta.pages} עמודים` : ''}, מוכן לקריאה במובייל ולשיתוף בצוות.`
          : `מדריך מעשי בפורמט קרוסלה — ${meta.slides} שקופיות, ${meta.hasPdf ? 'ZIP ו-PDF' : 'ZIP'}, מוכן לקריאה במובייל ולשיתוף בצוות.`}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-zinc-500">
        <span className="font-semibold text-zinc-300">דניאל בן ברוך</span>
        {published && (<><span aria-hidden>·</span><span>{published}</span></>)}
        {hasBody && (<><span aria-hidden>·</span><span>{minutes} דק׳ קריאה</span></>)}
        <span aria-hidden>·</span>
        <span>{lengthLabel(meta)}</span>
        {expiry && (
          <><span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1 text-brand-400"><Clock className="h-3 w-3" />{expiry}</span></>
        )}
      </div>

      <hr className="my-8 border-white/[0.08]" />

      {/* COVER */}
      {isStatic ? (
        <StaticCover meta={meta} guideId={guideId} />
      ) : (
        <SlidePreview guideId={guideId} n={1} total={meta.slides} eager isDemo={meta.isDemo} />
      )}

      {/* EXECUTIVE SUMMARY */}
      <section className="my-10 rounded-2xl border border-brand-500/25 bg-brand-500/[0.05] p-5 sm:p-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-base font-bold text-brand-300">
          <BookOpen className="h-4 w-4" />
          מה תקבלו במדריך
        </h2>
        {hasBody ? (
          <ul className="space-y-2.5">
            {sections.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[14px] leading-relaxed text-zinc-200">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                <span>{s.headline}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] leading-relaxed text-zinc-300">
            {isStatic ? 'מדריך PDF מרוכז' : `${meta.slides} שקופיות מרוכזות, שקופית לנושא`} — תוכן מעשי
            שאפשר ליישם בעסק כבר השבוע, בפורמט שנוח לקרוא בנייד ולהעביר הלאה בצוות.
          </p>
        )}
      </section>

      {/* BODY — real guide copy. Interstitial previews every second section. */}
      {hasBody &&
        sections.map((s, i) => (
          <section key={i} className="mt-11">
            <h2 className="font-display text-xl leading-snug font-bold text-white sm:text-2xl">
              {s.headline}
            </h2>

            {s.subhead && (
              <p className="mt-3.5 text-[15px] leading-[1.9] text-zinc-300">
                {/* Lead-in clause carries the section's weight, as in the reference. */}
                <span className="font-semibold text-white">{leadClause(s.subhead)}</span>
                {restClause(s.subhead)}
              </p>
            )}

            {s.cards.length > 0 && (
              <ul className="mt-5 space-y-2.5">
                {s.cards.map((card, j) => (
                  <li
                    key={j}
                    className="flex items-start gap-3 border-r-2 border-brand-500/40 bg-white/[0.02] py-2.5 pr-4 pl-3 text-[14px] leading-relaxed text-zinc-300"
                  >
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                    <span>{card}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* Pull-quote on the opening section, so the article has one moment of emphasis. */}
            {i === 0 && s.cards[0] && (
              <blockquote className="mt-6 border-r-2 border-brand-500 bg-brand-500/[0.04] py-3 pr-5 pl-4">
                <Quote className="mb-1.5 h-4 w-4 text-brand-500/70" />
                <p className="font-display text-[15px] leading-relaxed font-semibold text-zinc-100">{s.cards[0]}</p>
              </blockquote>
            )}

            {/* Interstitial: the slide this section came from. Lazy — each is ~1MB over the tunnel. */}
            {i > 0 && i % 2 === 0 && i < meta.slides && (
              <figure className="mt-8">
                <div className="mx-auto max-w-[17rem]">
                  <SlidePreview guideId={guideId} n={i + 1} total={meta.slides} isDemo={meta.isDemo} compact />
                </div>
                <figcaption className="mt-2.5 text-center text-[11px] text-zinc-500">
                  שקופית {i + 1} מתוך {meta.slides} — מתוך המדריך המלא
                </figcaption>
              </figure>
            )}
          </section>
        ))}

      {/* SPEC TABLE */}
      <section className="mt-12">
        <h2 className="mb-4 font-display text-lg font-bold text-white">מה בדיוק בקובץ</h2>
        <dl className="overflow-hidden rounded-xl border border-white/10">
          <SpecRow label="פורמט" value={isStatic ? 'PDF' : meta.hasPdf ? 'ZIP (תמונות) + PDF' : 'ZIP (תמונות)'} />
          {isStatic ? (
            meta.pages ? <SpecRow label="עמודים" value={`${meta.pages}`} /> : null
          ) : (
            <SpecRow label="שקופיות" value={`${meta.slides}`} />
          )}
          <SpecRow label="שפה" value="עברית" />
          <SpecRow label="הרשמה" value={isStatic ? 'חינמית — Google או אימייל' : 'לא נדרשת — הורדה ישירה'} last={!expiry} />
          {expiry && <SpecRow label="זמינות הקישור" value={expiry} last />}
        </dl>
      </section>

      {/* CONVERSION */}
      <section className="mt-12 rounded-2xl border border-brand-500/25 bg-carbon-900/70 p-5 shadow-[0_0_60px_-20px_rgba(118,185,0,0.45)] backdrop-blur-xl sm:p-6">
        <span
          aria-hidden
          className="mb-5 block h-px w-full"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(0,255,102,0.55), transparent)' }}
        />
        <h2 className="mb-1.5 font-display text-lg font-extrabold text-white sm:text-xl">קחו את המדריך המלא</h2>
        <p className="mb-5 text-[13px] leading-relaxed text-zinc-400">
          {isStatic
            ? 'המדריך המלא כקובץ PDF — נפתח ישירות בנייד, מוכן לשמירה ולשיתוף.'
            : `כל ${meta.slides} השקופיות באיכות מלאה, מוכנות לשמירה ולשיתוף.`}
        </p>

        <button
          type="button"
          onClick={() => onDownload()}
          className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl bg-brand-500 px-6 py-4 text-base font-extrabold text-carbon-950 transition-all hover:bg-brand-400 hover:shadow-[0_0_28px_-4px_rgba(0,255,102,0.6)] active:scale-[0.99] sm:text-lg"
        >
          <Download className="h-5 w-5" />
          {isStatic ? 'הורד את המדריך (PDF)' : `הורד מדריך מלא (ZIP${meta.hasPdf ? ' / PDF' : ''})`}
        </button>

        <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row">
          {!isStatic && meta.hasPdf && (
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

        {!isStatic ? (
          <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
            <Lock className="h-3 w-3" />
            הורדה ישירה, בלי הרשמה ובלי השארת פרטים.
          </p>
        ) : visitor ? (
          <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-zinc-500">
            <Check className="h-3 w-3 text-brand-500" />
            <span>
              מחוברים בתור <bdi className="text-zinc-300">{visitor.displayName || visitor.email}</bdi>
            </span>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex cursor-pointer items-center gap-1 underline-offset-2 hover:text-zinc-300 hover:underline"
            >
              <LogOut className="h-3 w-3" />
              התנתקות
            </button>
          </p>
        ) : (
          <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
            <Lock className="h-3 w-3" />
            הרשמה חינמית בלחיצה אחת עם Google, או עם אימייל.
          </p>
        )}
      </section>
    </article>
  );
}

/** Splits the first sentence off a paragraph so it can carry the section's weight in bold. */
function leadClause(text: string): string {
  const m = text.match(/^[^.!?]*[.!?]/);
  return m ? m[0] : text;
}
function restClause(text: string): string {
  return text.slice(leadClause(text).length);
}

function SpecRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3 ${last ? '' : 'border-b border-white/[0.07]'}`}>
      <dt className="text-[13px] text-zinc-500">{label}</dt>
      <dd className="text-[13px] font-semibold text-zinc-200">{value}</dd>
    </div>
  );
}

/**
 * Cover for a static guide: the code-drawn 3D book (GuideCover) on a soft pool of light. It replaced
 * the shipped `.webp` cover on 2026-09-24 — the brief was explicit that covers are drawn natively,
 * not pictures. The title still reaches screen readers through the article's <h1>.
 */
function StaticCover({ meta, guideId }: { meta: GuideMeta; guideId: string }) {
  return (
    <div className="relative flex justify-center py-2">
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-25 blur-[90px]"
        style={{ background: 'radial-gradient(circle, #76B900 0%, transparent 70%)' }}
      />
      <GuideCover
        hero
        slug={guideId}
        title={meta.title}
        style={guideCoverStyle(guideId)}
        meta={`PDF${meta.pages ? ` · ${meta.pages} עמודים` : ''}`}
        className="max-w-[22rem]"
      />
    </div>
  );
}

/**
 * One carousel slide.
 *
 * Slides are 1-BASED on the bridge — n=0 is rejected. Space is reserved at the native 4:5 until the
 * image lands and then released, so a 9:16 deck is not letterboxed and the article does not jump
 * under the reader's thumb. Interstitials load lazily because each slide is ~1MB over the tunnel.
 */
function SlidePreview({
  guideId, n, total, eager = false, isDemo = false, compact = false,
}: {
  guideId: string;
  n: number;
  total: number;
  eager?: boolean;
  isDemo?: boolean;
  /** Inline figure inside the article body rather than the full-width cover. */
  compact?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // No such guide exists on the bridge in demo mode, so show the frame rather than a broken image.
  if (isDemo) {
    return (
      <div
        className={`flex aspect-[4/5] w-full items-center justify-center border border-dashed border-white/12 bg-carbon-800/40 ${
          compact ? 'rounded-xl' : 'rounded-2xl'
        }`}
      >
        <span className="font-tech text-[10px] tracking-widest text-zinc-600 uppercase">
          slide {n} / {total}
        </span>
      </div>
    );
  }
  if (failed) return null;

  return (
    <div
      className={`relative overflow-hidden border border-white/10 bg-carbon-800/50 ${
        compact ? 'rounded-xl' : 'rounded-2xl'
      } ${loaded ? '' : 'aspect-[4/5] animate-pulse'}`}
    >
      <img
        src={`/api/download/${guideId}?variant=slide&n=${n}`}
        alt={`שקופית ${n} מתוך ${total}`}
        loading={eager ? 'eager' : 'lazy'}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`block h-auto w-full transition-opacity duration-500 ${loaded ? 'opacity-100' : 'absolute inset-0 opacity-0'}`}
      />
      {loaded && !compact && (
        <span className="absolute bottom-3 left-3 rounded-md bg-black/70 px-2 py-1 font-tech text-[10px] tracking-wider text-zinc-300 backdrop-blur-sm">
          {n} / {total}
        </span>
      )}
    </div>
  );
}

/**
 * Persistent bottom conversion bar, adapted from the reference's sticky chat pill.
 *
 * The article is long enough that the CTA scrolls out of reach, and this page has exactly one job.
 * Hidden once the in-page CTA block is on screen would need an observer for little gain — it simply
 * stays, sized so it never covers more than one line of body text.
 */
function StickyBar({ meta, onDownload }: { meta: GuideMeta; onDownload: (variant?: 'pdf') => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-brand-500/20 bg-carbon-950/90 px-4 py-3 backdrop-blur-lg">
      <div className="mx-auto flex w-full max-w-[46rem] items-center gap-3">
        <div className="hidden min-w-0 flex-1 sm:block">
          <p className="truncate text-[13px] font-semibold text-zinc-200">{meta.title}</p>
          <p className="text-[11px] text-zinc-500">{summaryLine(meta)}</p>
        </div>
        <button
          type="button"
          onClick={() => onDownload()}
          className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-extrabold text-carbon-950 transition-colors hover:bg-brand-400 sm:flex-none"
        >
          <Download className="h-4 w-4" />
          הורד מדריך
        </button>
      </div>
    </div>
  );
}

// ─── chrome ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Carbon mesh backdrop — two CSS gradients plus a green bloom. No canvas, no image request. On a
 * phone opening this from a DM the first paint is the whole experience, so the background must cost
 * nothing and must never be the reason the page looks broken on a slow connection.
 */
function CarbonMesh() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0">
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
      <span className="font-tech text-[11px] tracking-[0.3em] text-zinc-400 uppercase">mrdaniel.co.il</span>
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

