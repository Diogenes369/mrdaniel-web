import { useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Seo from '../components/seo/Seo';
import GlyphButton from '../components/ui/GlyphButton';
import SiteBot from '../components/bots/SiteBot';
import { useFieldQuiet } from '../components/field/fieldState';

/**
 * Catch-all for unknown paths. It used to be `<Route path="*" element={<HomePage />}>`, which
 * served the full homepage — status-wise a 200, with an `index,follow` robots tag and a canonical
 * pointing at the bogus URL itself. A typo'd link looked like it worked (so dead links never
 * surfaced), and every such URL a crawler found was a duplicate of the homepage.
 *
 * This is still a client-rendered SPA, so the HTTP status stays 200 (the Vercel rewrite serves
 * index.html for everything); `noindex` is what keeps these URLs out of the index.
 *
 * In the glyph world since 2026-10-06: one of the crew is sorry about it (tap it, it cheers up a
 * little), and the ways back are glyph buttons.
 */
const ROUTES = [
  { to: '/', label: 'עמוד הבית' },
  { to: '/news', label: 'חדשות AI' },
  { to: '/grok', label: 'סוכן GROK' },
];

export default function NotFoundPage() {
  const { pathname } = useLocation();
  const quiet = useFieldQuiet();
  return (
    <section dir="rtl" className="relative mx-auto flex min-h-[78dvh] max-w-2xl flex-col items-center justify-center px-4 py-24 text-center">
      <Seo title="העמוד לא נמצא — MR. DANIEL" description="הכתובת שביקשתם לא קיימת באתר." path={pathname} noindex />
      <SiteBot shape="circle" tone="ink" mood="sad" size={128} hop="tap" />
      <div ref={quiet} className="mt-6 flex flex-col items-center">
        <p className="font-type text-sm font-bold tracking-widest text-brand-400" dir="ltr">
          404
        </p>
        <h1 className="story-h2 mt-3">העמוד הזה לא קיים</h1>
        <p className="story-body mt-4 max-w-md">
          ייתכן שהקישור ישן או שנפלה טעות בכתובת{' '}
          <bdi dir="ltr" className="font-type text-ink-faint">
            {pathname}
          </bdi>
          .
        </p>
      </div>
      <nav aria-label="ניווט חלופי" className="mt-10 flex flex-wrap justify-center gap-4">
        {ROUTES.map(({ to, label }, i) => (
          <GlyphButton key={to} to={to} variant={i === 0 ? 'primary' : 'line'}>
            {label}
            {i === 0 && <ArrowLeft className="h-4 w-4" aria-hidden="true" />}
          </GlyphButton>
        ))}
      </nav>
    </section>
  );
}
