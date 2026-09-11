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

// Title, subtitle and section copy are verbatim from each PDF: the cover, then the part-opener pages
// (part title → headline, its intro paragraph → subhead, its chapter list → cards). The cover image is
// page 1 of the PDF, cropped to 4:5.
export const STATIC_GUIDES: StaticGuide[] = [
  {
    slug: 'ai-business-automations-2026',
    title: 'אוטומציות AI לעסקים',
    subtitle:
      'המדריך השלם לבניית סוכני AI וחיבור מערכות במודל Zero-Touch בארגון שלך — מהמושגים הראשונים ועד תפעול עצמאי שרץ בלי יד אדם.',
    file: '/guides/ai-business-automations-2026.pdf',
    pages: 88,
    cover: '/guides/ai-business-automations-2026.webp',
    publishedAt: '2026-09-11',
    sections: [
      {
        headline: 'יסודות ה-Zero-Touch',
        subhead:
          'לפני שנוגעים בכלי אחד, צריך להבין מה בעצם בונים. החלק הזה קובע את השפה שתלווה את כל החוברת: מה ההבדל בין "יש לי אוטומציה" לבין "יש לי תהליך שרץ בעצמו", איך ממפים תהליך לפני שמאוטמים אותו, ואילו שלוש שכבות טכנולוגיה — חוקים, RPA ובינה מלאכותית — בונות יחד כל מערכת Zero-Touch רצינית.',
        cards: [
          'מה זה Zero-Touch באמת',
          'אנטומיה של תהליך עסקי',
          'שלוש שכבות האוטומציה: חוקים, RPA ובינה מלאכותית',
          'אבני היסוד של סוכן AI',
        ],
      },
      {
        headline: 'בניית סוכן AI ראשון',
        subhead:
          'כאן החוברת עוברת מהסבר לבנייה. החלק הזה עובר על תכנון סוכן מהתחלה ועד הסוף — טופס תכנון, כתיבת הוראות מערכת, חיבור לכלים אמיתיים — ומסתיים בשני תרגולים מודרכים מלאים: סוכן שירות לקוחות וסוכן מכירות, שאפשר להעתיק ולהתאים ישירות לעסק שלכם.',
        cards: [
          'תכנון סוכן: קלט, לוגיקה, פלט וגבולות',
          'הפרומפט המערכתי לסוכן עסקי',
          'Function Calling בפועל',
          'תרגול מודרך: סוכן שירות לקוחות',
          'תרגול מודרך: סוכן מכירות ולידים',
        ],
      },
      {
        headline: 'Zero-Touch לפי מחלקה',
        subhead:
          'עכשיו כשיש לכם שיטה מלאה לבניית סוכן, החלק הזה עובר מחלקה למחלקה בעסק טיפוסי ומראה בדיוק איפה האוטומציה משתלמת ביותר בכל אחת מהן — עם דוגמאות קונקרטיות שאפשר לקחת ולהתאים, ועם אזהרות ספציפיות למה שעלול להשתבש בכל תחום.',
        cards: [
          'אוטומציה בשיווק ותוכן',
          'אוטומציה במכירות ו-CRM',
          'אוטומציה בשירות לקוחות ותמיכה',
          'אוטומציה בכספים, חשבוניות וגבייה',
          'אוטומציה בתפעול ושרשרת אספקה',
          'אוטומציה בגיוס וקליטת עובדים',
        ],
      },
      {
        headline: 'הפעלה, מדידה ואבטחה',
        subhead:
          'בניית סוכן היא חצי מהעבודה. החלק הזה עוסק במה שקורה אחרי ההשקה: איך מוכיחים במספרים שהאוטומציה משתלמת, איך שומרים על נתוני הלקוחות והעסק מפני ניצול לרעה, כמה זה באמת עולה בטווח הארוך, ומי אחראי כשמשהו נשבר בעוד חצי שנה.',
        cards: [
          'מדידת ROI: הנוסחה שמוכיחה שזה משתלם',
          'אבטחת מידע, פרטיות ו-Prompt Injection',
          'עלויות אמיתיות: API מול פלטפורמה מול אדם',
          'תחזוקה שוטפת ובעלות על המערכת',
        ],
      },
    ],
  },
  {
    slug: 'ai-learning-guide-2026',
    title: 'בינה מלאכותית — מהיסודות ועד בניית מערכות',
    subtitle: 'מדריך מלא ללימוד, שליטה ויישום מעשי של הבינה המלאכותית של ימינו.',
    file: '/guides/ai-learning-guide-2026.pdf',
    pages: 104,
    cover: '/guides/ai-learning-guide-2026.webp',
    publishedAt: '2026-09-11',
    sections: [
      {
        headline: 'יסודות הבינה המלאכותית',
        subhead:
          'לפני שנוגעים בכלי אחד, צריך להבין מה בעצם עומד מולנו. החלק הזה בונה את השפה: מה זו בינה מלאכותית, במה היא נבדלת מתוכנה רגילה, איך מכונה "לומדת" בכלל, ומה קורה בתוך רשת נוירונים. בלי הבסיס הזה, כל שאר החוברת תישאר רשימת מתכונים.',
        cards: [
          'מה זו בינה מלאכותית באמת',
          'קו זמן: מהמכונה החושבת ועד היום',
          'איך מכונה לומדת: למידת מכונה',
          'רשתות נוירונים ולמידה עמוקה',
        ],
      },
      {
        headline: 'הכלים בפועל: מדריך מאפס',
        subhead:
          'עד כאן הבנו איך הבינה המלאכותית עובדת מבפנים. החלק הזה נכתב עבור מי שמעולם לא פתח כלי AI, ומלווה אותו מהרגע הראשון: איך נראה המסך, מה עושים בו, איך מדברים עם הכלי כך שיבין, איך לא לשרוף כסף וזמן על שיחות מיותרות, ומה בעצם אפשר לבנות עם זה.',
        cards: [
          'הכלים על השולחן: ChatGPT, Claude, Gemini ואחרים',
          'השיחה הראשונה: איך מדברים עם הכלי',
          'לא לבזבז: טוקנים, מגבלות ועבודה חסכונית',
          'הרעיונות הגדולים: מה אפשר לבנות היום',
        ],
      },
      {
        headline: 'שליטה בשפה: הנדסת פרומפט והקשר',
        subhead:
          'כאן מתחילה העבודה בפועל. הפרקים הבאים מלמדים איך להפוך בקשה מעורפלת להוראה שמניבה תוצאה מקצועית ועקבית, ואיך לנהל את המשאב היקר ביותר של המודל — ההקשר. זהו החלק בעל ההחזר המיידי הגבוה ביותר בכל החוברת.',
        cards: [
          'הנדסת פרומפט — היסודות',
          'הנדסת פרומפט — טכניקות מתקדמות',
          'הנדסת הקשר: המשמעת של 2026',
          'עבודה מולטימודלית: תמונה, קול ווידאו',
        ],
      },
      {
        headline: 'מערכות: ידע, כלים וסוכנים',
        subhead:
          'מודל לבדו הוא מוח בצנצנת: הוא יודע הרבה, אבל אינו יודע דבר על העסק שלכם ואינו יכול לעשות דבר. החלק הזה מחבר אותו למציאות — לידע הפרטי שלכם, לכלים שמבצעים פעולות, וללולאה שהופכת מענה לביצוע. כאן נגמרת ההשתמשות ומתחילה הבנייה.',
        cards: [
          'RAG: לחבר את המודל לידע שלכם',
          'כלים, Function Calling ופרוטוקול MCP',
          'סוכנים: ממענה לביצוע',
          'ארכיטקטורות רב-סוכניות',
        ],
      },
    ],
  },
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
