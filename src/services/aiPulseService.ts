import { useQuery } from '@tanstack/react-query';

/**
 * Real-time "AI Pulse" — live external AI-tech news, aggregated client-side from a few reliable
 * RSS sources via the CORS-friendly rss2json bridge. Every source is best-effort
 * (Promise.allSettled) and if the whole thing fails we return a curated, evergreen fallback so
 * the section is NEVER empty or broken. Cached ~30 min via react-query.
 */
export interface PulseItem {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  excerpt: string;
}

const RSS2JSON = 'https://api.rss2json.com/v1/api.json?rss_url=';

const FEEDS: { url: string; source: string }[] = [
  { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', source: 'TechCrunch' },
  { url: 'https://venturebeat.com/category/ai/feed/', source: 'VentureBeat' },
  { url: 'https://hnrss.org/newest?q=%22AI%22+OR+%22LLM%22+OR+%22agent%22&count=20', source: 'Hacker News' },
];

/** Automated fallback — high-value, current AI tooling. Kept intentionally evergreen. */
export const AI_PULSE_FALLBACK: PulseItem[] = [
  {
    id: 'fb-claude-code',
    title: 'Claude Code — סוכן קידוד אגנטי הרץ מהטרמינל',
    link: 'https://claude.com/claude-code',
    source: 'Anthropic',
    publishedAt: new Date().toISOString(),
    excerpt: 'מבצע משימות פיתוח מורכבות מקצה לקצה — חיפוש קוד, עריכה, בדיקות וקומיטים — עם תמיכת MCP מובנית.',
  },
  {
    id: 'fb-mcp',
    title: 'Model Context Protocol (MCP) — הסטנדרט לחיבור כלים לסוכני AI',
    link: 'https://modelcontextprotocol.io',
    source: 'Open standard',
    publishedAt: new Date().toISOString(),
    excerpt: 'פרוטוקול פתוח שמחבר מודלים למקורות מידע וכלים חיצוניים בצורה אחידה ומאובטחת.',
  },
  {
    id: 'fb-devin',
    title: 'Devin — מהנדס תוכנה אוטונומי',
    link: 'https://www.cognition.ai/blog/introducing-devin',
    source: 'Cognition',
    publishedAt: new Date().toISOString(),
    excerpt: 'סוכן שמתכנן, כותב ומריץ קוד באופן עצמאי — מייצג את הדור הבא של סוכני פיתוח.',
  },
  {
    id: 'fb-langgraph',
    title: 'LangGraph / CrewAI / AutoGen — פריימוורקים לבניית סוכנים',
    link: 'https://langchain-ai.github.io/langgraph/',
    source: 'Agentic frameworks',
    publishedAt: new Date().toISOString(),
    excerpt: 'תשתיות לבניית מערכות רב-סוכניות עם מצב, בקרה, כלים ואישורים אנושיים.',
  },
  {
    id: 'fb-openai',
    title: 'OpenAI — עדכוני מודלים, סוכנים ו-API',
    link: 'https://openai.com/news/',
    source: 'OpenAI',
    publishedAt: new Date().toISOString(),
    excerpt: 'מרכז העדכונים הרשמי — מודלים חדשים, יכולות סוכנים ושינויי פלטפורמה.',
  },
  {
    id: 'fb-deepmind',
    title: 'Google DeepMind — Gemini ומחקר סוכנים',
    link: 'https://deepmind.google/discover/blog/',
    source: 'DeepMind',
    publishedAt: new Date().toISOString(),
    excerpt: 'בלוג המחקר הרשמי — Gemini, סוכנים, מולטימודליות ובטיחות AI.',
  },
];

function stripHtml(html: string): string {
  if (typeof window === 'undefined') return html.replace(/<[^>]*>/g, ' ');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

async function fetchFeed(feed: { url: string; source: string }): Promise<PulseItem[]> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(RSS2JSON + encodeURIComponent(feed.url), { signal: ac.signal });
    if (!res.ok) throw new Error(`${feed.source}: ${res.status}`);
    const json = (await res.json()) as {
      status?: string;
      items?: { title?: string; link?: string; guid?: string; pubDate?: string; description?: string; content?: string }[];
    };
    if (json.status !== 'ok' || !Array.isArray(json.items)) throw new Error(`${feed.source}: bad payload`);
    const isHN = feed.source === 'Hacker News';
    return json.items.slice(0, isHN ? 6 : 10).map((it, i) => ({
      id: `${feed.source}-${it.guid || it.link || i}`,
      title: (it.title || '').trim(),
      link: it.link || '#',
      source: feed.source,
      publishedAt: it.pubDate ? new Date(it.pubDate).toISOString() : new Date().toISOString(),
      // HN RSS descriptions are just "Article URL / Comments URL / Points" metadata — skip them.
      excerpt: isHN ? '' : stripHtml(it.description || it.content || '').slice(0, 200),
    }));
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAIPulse(): Promise<PulseItem[]> {
  const settled = await Promise.allSettled(FEEDS.map(fetchFeed));
  const items = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
  if (items.length === 0) return AI_PULSE_FALLBACK;

  const seen = new Set<string>();
  const deduped = items.filter((i) => {
    const key = i.title.toLowerCase().slice(0, 80);
    if (!i.title || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Recent-first, but give named publications a small edge for the top slot when items are within
  // ~48h of each other, so the lead isn't a noisy HN version bump.
  const prio = (s: string) => (s === 'Hacker News' ? 1 : 0);
  deduped.sort((a, b) => {
    const dateDiff = +new Date(b.publishedAt) - +new Date(a.publishedAt);
    const pa = prio(a.source);
    const pb = prio(b.source);
    if (pa !== pb && Math.abs(dateDiff) < 48 * 3600 * 1000) return pa - pb;
    return dateDiff;
  });
  return deduped.slice(0, 12);
}

export function useAIPulse() {
  // `fetchAIPulse` already resolves to AI_PULSE_FALLBACK on total failure, so the query result is
  // never empty/errored — the widget only needs a first-load skeleton state.
  return useQuery({
    queryKey: ['ai-pulse'],
    queryFn: fetchAIPulse,
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

// ---- "Tool of the Week" — auto-rotates weekly through a curated cutting-edge set ----
export interface WeeklyTool {
  name: string;
  vendor: string;
  description: string;
  link: string;
}

const WEEKLY_TOOLS: WeeklyTool[] = [
  {
    name: 'Claude Code',
    vendor: 'Anthropic',
    description:
      'סוכן קידוד אגנטי הרץ מהטרמינל — מבצע משימות פיתוח מקצה לקצה (חיפוש וניתוח קוד, עריכה, בדיקות, קומיטים), עם תמיכה מובנית בפרוטוקול MCP.',
    link: 'https://claude.com/claude-code',
  },
  {
    name: 'Model Context Protocol (MCP)',
    vendor: 'Open standard',
    description:
      'הסטנדרט הפתוח לחיבור מודלי שפה למקורות מידע ולכלים חיצוניים — CRM, יומן, מסדי נתונים — בצורה אחידה, מאובטחת וקלה לתחזוקה.',
    link: 'https://modelcontextprotocol.io',
  },
  {
    name: 'Devin',
    vendor: 'Cognition',
    description:
      'מהנדס תוכנה אוטונומי שמתכנן, כותב ומריץ קוד בעצמו — מייצג את הדור הבא של סוכני פיתוח שרצים ללא פיקוח צמוד.',
    link: 'https://www.cognition.ai/blog/introducing-devin',
  },
  {
    name: 'LangGraph',
    vendor: 'LangChain',
    description:
      'פריימוורק לבניית סוכנים מרובי-שלבים עם מצב (state), מחזורים, בקרת זרימה ואישורים אנושיים — הבסיס למערכות סוכנים בייצור.',
    link: 'https://langchain-ai.github.io/langgraph/',
  },
  {
    name: 'AutoGen',
    vendor: 'Microsoft',
    description:
      'תשתית לתזמור רב-סוכני: הגדרת סוכנים שמשוחחים ביניהם, מריצים קוד ומחלקים משימה מורכבת לתת-משימות.',
    link: 'https://microsoft.github.io/autogen/',
  },
  {
    name: 'CrewAI',
    vendor: 'CrewAI',
    description:
      'הגדרת "צוות" סוכנים עם תפקידים, מטרות וכלים — כל סוכן אחראי על חלק, והצוות מרכיב את התוצאה יחד.',
    link: 'https://www.crewai.com',
  },
];

function isoWeek(date = new Date()): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((+d - +yearStart) / 86400000 + 1) / 7);
}

/** The current week's pick — changes automatically every ISO week, no data source needed. */
export function toolOfTheWeek(): WeeklyTool {
  return WEEKLY_TOOLS[isoWeek() % WEEKLY_TOOLS.length];
}
