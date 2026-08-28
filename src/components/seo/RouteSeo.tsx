import { useLocation } from 'react-router-dom';
import Seo from './Seo';
import { PAGE_SEO, DEFAULT_SEO } from '../../lib/seo/pageSeo';

/**
 * Mounted once in App.tsx. Resolves the current pathname to a per-route SEO config and renders
 * <Seo>. Unknown paths (e.g. /news/:slug article pages) fall back to a sensible default here and
 * the page itself layers a richer <Seo> on top once its data is available.
 */
export default function RouteSeo() {
  const { pathname } = useLocation();
  const cfg = PAGE_SEO[pathname] ?? DEFAULT_SEO(pathname);
  return <Seo {...cfg} />;
}
