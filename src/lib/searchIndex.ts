import { Home, Workflow, Layers, BookOpen, Mail, Newspaper, AtSign, Share2, Bot, type LucideIcon } from 'lucide-react';

export interface SearchEntry {
  id: string;
  title: string;
  snippet: string;
  keywords: string;
  icon: LucideIcon;
  route: string;
  /** CSS selector to scroll to + highlight. `null` just navigates (used for whole-page entries). */
  targetSelector: string | null;
}

/**
 * Curated content index mirroring what's actually on each page — a hand-maintained index rather
 * than live DOM crawling. A crawler could only ever see the CURRENTLY MOUNTED route's DOM (this
 * is a multi-route SPA, so About/AI/News page content isn't in the tree while on the homepage),
 * so it would silently miss most of the site; this index covers every route consistently and
 * lets search results resolve to a real selector immediately, without waiting on a page to mount
 * first just to know if it contains a match.
 */
export const SEARCH_INDEX: SearchEntry[] = [
  // Home sections
  { id: 'hero', title: 'עמוד הבית', snippet: 'לומדים AI בעברית פשוטה, צעד אחרי צעד', keywords: 'home דף הבית ראשי', icon: Home, route: '/', targetSelector: '#hero' },
  { id: 'story-launches', title: 'השקות AI אחרונות', snippet: 'המודלים והכלים שיצאו בימים האחרונים', keywords: 'launches השקות מודלים חדשים models', icon: Layers, route: '/', targetSelector: '#story' },
  { id: 'story-path', title: 'המסלול ללמוד AI', snippet: 'מהצעד הראשון ועד לבנות כמו מפתחים', keywords: 'learn path מסלול ללמוד מתחילים מפתחים', icon: BookOpen, route: '/', targetSelector: '#path' },
  { id: 'grok-agent', title: 'סוכן GROK', snippet: 'מצגת חיה על Grok Bot ואיך מעבירים לו עבודה', keywords: 'grok bot xai cursor גרוק סוכן מצגת', icon: Bot, route: '/', targetSelector: '#grok-agent' },
  { id: 'story-start', title: 'מדריך חינם למתחילים', snippet: 'בינה מלאכותית מהיסודות, להורדה', keywords: 'guide מדריך חינם pdf מתחילים', icon: BookOpen, route: '/', targetSelector: '#start' },
  { id: 'offer-ai-agents', title: 'סוכני AI', snippet: 'סוכנים שעונים בוואטסאפ, קובעים פגישות ומכינים מסמכים בשבילכם', keywords: 'agents סוכנים אוטומציה whatsapp', icon: Workflow, route: '/', targetSelector: '#offer-ai-agents' },
  { id: 'offer-llm-lab', title: 'מעבדת מודלים', snippet: 'כל מודל AI חדש נבדק, ומה כדאי לבחור לאיזו עבודה', keywords: 'llm מודלים gpt claude gemini grok llama השוואה', icon: Layers, route: '/', targetSelector: '#offer-llm-lab' },
  { id: 'offer-ai-hub', title: 'חדשות ומדריכי AI', snippet: 'חדשות AI בזמן אמת ומדריכים מעשיים צעד אחר צעד', keywords: 'news חדשות מדריכים tutorials', icon: BookOpen, route: '/', targetSelector: '#offer-ai-hub' },
  { id: 'services', title: 'מה אני בונה', snippet: 'JARVIS, סוכנים, AI שעונה מהמסמכים ואוטומציות', keywords: 'services שירותים rag jarvis אוטומציה', icon: Layers, route: '/', targetSelector: '#services' },
  { id: 'contact', title: 'יצירת קשר', snippet: 'הודעה ישירה אליי, ואני עונה בעצמי', keywords: 'קשר contact פנייה', icon: Mail, route: '/', targetSelector: '#contact-portal' },

  // Dedicated pages
  { id: 'chat-page', title: 'דברו עם הסוכן', snippet: 'שואלים כל דבר על AI, מקבלים תשובה מיד, ודניאל מקבל את השיחה', keywords: 'chat צאט צ׳אט סוכן שיחה קשר contact bot', icon: Bot, route: '/chat', targetSelector: '#page-top' },
  { id: 'about-page', title: 'עמוד אודות מלא', snippet: 'בונה סוכני AI ומפרסם חדשות AI בעברית', keywords: 'about אודות רקע', icon: Workflow, route: '/about', targetSelector: '#page-top' },
  { id: 'ai-page', title: 'המדריך לסוכני AI', snippet: 'מה זה סוכן, מה צריך להכין ואיך בונים אותו יחד', keywords: 'AI page עמוד מלא סוכנים', icon: Workflow, route: '/ai', targetSelector: '#page-top' },
  { id: 'jarvis-page', title: 'מערכת JARVIS', snippet: 'סוכן AI אוטונומי שמבצע משימות שלמות מפקודה קולית', keywords: 'jarvis סוכן אוטונומי עוזר אישי assistant voice קולי', icon: Workflow, route: '/jarvis', targetSelector: '#page-top' },
  { id: 'grok-page', title: 'סוכן GROK', snippet: 'מה Grok Bot יודע לעשות ואיך עובדים איתו, במצגת ובמדריך כתוב', keywords: 'grok bot xai spacexai cursor גרוק סוכן מצגת מדריך שגרה בודק', icon: Bot, route: '/grok', targetSelector: '#page-top' },
  { id: 'magazines-page', title: 'לומדים AI', snippet: 'מדריכים ומגזינים חדשים על AI, בקרוב', keywords: 'מגזין חוברת מדריך AI guide', icon: BookOpen, route: '/magazines', targetSelector: '#page-top' },
  { id: 'news-page', title: 'עמוד החדשות', snippet: 'כל חדשות ה-AI, מתעדכנות בזמן אמת', keywords: 'news חדשות ai', icon: Newspaper, route: '/news', targetSelector: null },
];

/** Practical substring-token fuzzy match: every whitespace-separated token in the query must
 * appear somewhere in the entry's combined searchable text — order-independent, so "AI סוכן"
 * and "סוכן AI" match the same entries, and partial words still match (e.g. "ארכיטק"). */
export function searchEntries(query: string): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return SEARCH_INDEX;

  const tokens = q.split(/\s+/).filter(Boolean);
  return SEARCH_INDEX.filter((entry) => {
    const haystack = `${entry.title} ${entry.snippet} ${entry.keywords}`.toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
}
