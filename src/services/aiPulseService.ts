import { useQuery } from '@tanstack/react-query';
import type { NewsItem } from './newsService';

/**
 * "AI Pulse" — the live AI/cyber news strip on the AI page. It reads the SAME sanitized Hebrew
 * stream as the rest of the site (`/api/news`, strict-by-default: Hebrew-only titles, no scrape
 * artefacts, AI/cyber/cloud only), keeps just the `ai` + `cyber` items, and maps them to the
 * widget's shape. If the fetch fails or comes back empty it returns a curated, evergreen Hebrew
 * fallback so the section is NEVER empty or broken. Cached ~30 min via react-query.
 *
 * (Previously aggregated English RSS — TechCrunch / VentureBeat / Hacker News — via rss2json;
 * dropped so the widget is 100% Hebrew and on-topic, consistent with the feed policy.)
 */
export interface PulseItem {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  excerpt: string;
}

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

/** The site's sanitized Hebrew feed. The server already: aggregates, de-duplicates cross-source,
 * sorts newest-first, and applies the Hebrew + on-topic gate — so all this needs to do is keep the
 * ai/cyber slice and reshape. */
export async function fetchAIPulse(): Promise<PulseItem[]> {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 9000);
    let json: { items?: NewsItem[] };
    try {
      const res = await fetch('/api/news', { signal: ac.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`/api/news responded ${res.status}`);
      json = (await res.json()) as { items?: NewsItem[] };
    } finally {
      clearTimeout(timer);
    }

    const items = Array.isArray(json.items) ? json.items : [];
    const pulse: PulseItem[] = items
      .filter((i) => i.topic === 'ai' || i.topic === 'cyber')
      .slice(0, 14)
      .map((i) => ({
        id: `news-${i.id}`,
        title: (i.title || '').trim(),
        link: i.link || '#',
        source: i.source || 'חדשות',
        publishedAt: i.publishedAt || new Date().toISOString(),
        excerpt: (i.excerpt || i.summary || '').replace(/\s+/g, ' ').trim().slice(0, 200),
      }))
      .filter((p) => p.title.length > 8);

    return pulse.length >= 3 ? pulse.slice(0, 12) : AI_PULSE_FALLBACK;
  } catch (err) {
    console.error('[ai-pulse] failed to read /api/news:', err);
    return AI_PULSE_FALLBACK;
  }
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
