import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Home, Newspaper, Bot } from 'lucide-react';
import Seo from '../components/seo/Seo';

/**
 * Catch-all for unknown paths. It used to be `<Route path="*" element={<HomePage />}>`, which
 * served the full homepage — status-wise a 200, with an `index,follow` robots tag and a canonical
 * pointing at the bogus URL itself. A typo'd link looked like it worked (so dead links never
 * surfaced), and every such URL a crawler found was a duplicate of the homepage.
 *
 * This is still a client-rendered SPA, so the HTTP status stays 200 (the Vercel rewrite serves
 * index.html for everything); `noindex` is what keeps these URLs out of the index.
 */
const ROUTES = [
  { to: '/', label: 'עמוד הבית', icon: Home },
  { to: '/news', label: 'חדשות AI', icon: Newspaper },
  { to: '/ai', label: 'סוכני AI', icon: Bot },
];

export default function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <section dir="rtl" className="relative mx-auto flex min-h-[70dvh] max-w-2xl flex-col items-center justify-center px-4 py-24 text-center">
      <Seo title="העמוד לא נמצא — MR. DANIEL" description="הכתובת שביקשתם לא קיימת באתר." path={pathname} noindex />
      <p className="font-mono text-sm font-bold tracking-widest text-brand-400" dir="ltr">
        404
      </p>
      <h1 className="mt-3 font-display text-3xl font-black text-white md:text-5xl">העמוד הזה לא קיים</h1>
      <p className="mt-4 max-w-md text-zinc-400">
        ייתכן שהקישור ישן או שנפלה טעות בכתובת{' '}
        <bdi dir="ltr" className="font-mono text-zinc-500">
          {pathname}
        </bdi>
        .
      </p>
      <nav aria-label="ניווט חלופי" className="mt-10 flex flex-wrap justify-center gap-3">
        {ROUTES.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="group inline-flex items-center gap-2 rounded-full border border-white/15 bg-carbon-800/60 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:border-brand-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
          >
            <Icon className="h-4 w-4 text-brand-400" aria-hidden="true" />
            {label}
            <ArrowLeft className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
          </Link>
        ))}
      </nav>
    </section>
  );
}
