/**
 * Static lead-magnet guides — PDFs served straight from Vercel's CDN at `/g/<slug>`.
 *
 * Guides published from the carousel bridge (`/g/<32-hex guideId>`) live on one laptop behind a
 * quick tunnel, so every one of them answers 503 whenever the laptop sleeps or cloudflared
 * restarts. A guide handed out in Instagram DMs for months cannot depend on that. These cannot go
 * down that way: the PDF is committed under `public/guides/`, Vite copies it into `dist/guides/`, and
 * Vercel serves it from the CDN — no function, bridge or tunnel between the visitor and the file.
 *
 * ADDING A GUIDE
 *   1. Put the file at `public/guides/<file>.pdf` — ASCII filename, it becomes part of a URL.
 *      Optionally a cover image beside it (`.png` / `.jpg` / `.webp`; 4:5 reads best on a phone).
 *   2. Add an entry to STATIC_GUIDES below. `slug` is the public link: https://mrdaniel.co.il/g/<slug>
 *   3. Deploy, then open /g/<slug> on a phone and tap download BEFORE the post goes live.
 *
 * Server-only on purpose: imported by `api/news.ts` (`/api/download/:id`) and `api/leads.ts`, never
 * by the SPA, so the list of guides is not shipped in the public bundle for anyone to enumerate. The
 * PDFs themselves are public files — whoever holds the link has the file, the same model as a
 * bridge guideId.
 *
 * `sections` holds the guide's REAL copy (headline / lead paragraph / key points) — the same shape
 * the bridge captures from slides — and the landing page renders it as the article body. Leave it
 * out rather than paraphrase: the page falls back to a shorter format-led layout instead of
 * inventing claims about what the guide teaches.
 */

export interface StaticGuideSection {
  headline: string;
  /** Lead paragraph. Its first sentence renders in bold on the page. */
  subhead?: string;
  /** Key points, one line each. */
  cards?: string[];
}

export interface StaticGuide {
  /** The public link: https://mrdaniel.co.il/g/<slug>. Lowercase a–z, 0–9 and hyphens, 2–64 chars.
   *  Must not be 32 hex characters (that shape is a bridge guideId) or a demo id. */
  slug: string;
  title: string;
  /** One line under the title. Defaults to a generic "practical PDF guide" line. */
  subtitle?: string;
  /** The PDF, as a path under `public/`: `/guides/<file>.pdf`. */
  file: string;
  /** Page count, shown on the page when known. */
  pages?: number;
  /** Optional cover image under `/guides/` (png/jpg/webp). Without one the page draws a title card. */
  cover?: string;
  /** Publication date, ISO `YYYY-MM-DD` — the article date on the page. */
  publishedAt: string;
  /** ManyChat trigger keyword this guide is delivered for. Reference only — nothing reads it. */
  keyword?: string;
  /** The guide's real copy, rendered as the article body. See the header note. */
  sections?: StaticGuideSection[];
}

export const STATIC_GUIDES: StaticGuide[] = [
  // Example — copy, fill in, uncomment:
  // {
  //   slug: 'ai-agent-security-checklist',
  //   title: 'צ׳קליסט אבטחה לסוכני AI',
  //   file: '/guides/ai-agent-security-checklist.pdf',
  //   pages: 12,
  //   publishedAt: '2026-09-15',
  //   keyword: 'הגנה',
  //   sections: [
  //     { headline: '…', subhead: '…', cards: ['…', '…'] },
  //   ],
  // },
];

/** Slug shape. Mirrored in src/pages/GuideDownloadPage.tsx — keep the two identical. */
export const GUIDE_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const BRIDGE_ID_RE = /^[a-f0-9]{32}$/;
/** Ids the landing page answers from its built-in demo fixture without calling the API. */
const RESERVED_SLUGS = new Set(['demo', 'preview', 'sample', 'demo-pdf']);
const FILE_RE = /^\/guides\/[A-Za-z0-9._-]+\.pdf$/;
const COVER_RE = /^\/guides\/[A-Za-z0-9._-]+\.(?:png|jpe?g|webp)$/i;

/**
 * Why an entry is unusable, or null. A bad entry is refused at lookup rather than served: a slug
 * shaped like a bridge id would shadow that guide, and a `file` outside `/guides/` would turn the
 * download redirect into a pointer at anything on the site.
 */
function entryProblem(g: StaticGuide): string | null {
  if (!GUIDE_SLUG_RE.test(g.slug)) return 'slug must be lowercase a-z, 0-9 and hyphens';
  if (BRIDGE_ID_RE.test(g.slug)) return 'slug has the shape of a bridge guideId';
  if (RESERVED_SLUGS.has(g.slug)) return 'slug is reserved for the demo page';
  if (!FILE_RE.test(g.file)) return 'file must be /guides/<ascii-name>.pdf';
  if (g.cover && !COVER_RE.test(g.cover)) return 'cover must be /guides/<ascii-name>.(png|jpg|webp)';
  if (!g.title.trim()) return 'title is empty';
  return null;
}

/** The registry entry for `slug`, or null when there is none (or it is invalid — logged). */
export function findStaticGuide(slug: string): StaticGuide | null {
  const key = slug.trim().toLowerCase();
  const guide = STATIC_GUIDES.find((g) => g.slug === key);
  if (!guide) return null;
  const problem = entryProblem(guide);
  if (problem) {
    console.error(`[leadMagnets] refusing static guide "${guide.slug}": ${problem}`);
    return null;
  }
  return guide;
}

/**
 * The `/api/download/<slug>?meta=1` body: the contract a bridge guide answers, plus the static-only
 * fields the landing page needs. `expiresAt` is always null — static guides are permanent.
 */
export function staticGuideMeta(g: StaticGuide) {
  const sections = (g.sections ?? [])
    .map((s, index) => ({
      index,
      headline: s.headline.trim(),
      subhead: (s.subhead ?? '').trim(),
      cards: (s.cards ?? []).map((c) => c.trim()).filter(Boolean).slice(0, 6),
    }))
    .filter((s) => s.headline || s.subhead || s.cards.length);
  const published = Date.parse(g.publishedAt);
  return {
    ok: true,
    kind: 'static' as const,
    guideId: g.slug,
    title: g.title.trim(),
    subtitle: (g.subtitle ?? '').trim(),
    slides: 0,
    pages: g.pages ?? null,
    hasPdf: true,
    topics: sections.map((s) => s.headline).filter(Boolean).slice(0, 6),
    sections,
    createdAt: Number.isFinite(published) ? published : null,
    expiresAt: null,
    coverUrl: g.cover ?? null,
    downloadUrl: g.file,
  };
}
