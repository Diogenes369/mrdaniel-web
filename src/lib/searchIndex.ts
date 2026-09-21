import { Home, Bot, Layers, Calculator, BookOpen, Mail, Newspaper, AtSign, Share2, type LucideIcon } from 'lucide-react';

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
  { id: 'hero', title: 'עמוד הבית', snippet: 'חדשות AI, מודלי שפה וסוכנים אוטונומיים', keywords: 'home דף הבית ראשי', icon: Home, route: '/', targetSelector: '#hero' },
  { id: 'offer-ai-agents', title: 'סוכני AI אוטונומיים', snippet: 'סוכנים שמתחברים ל-WhatsApp, למייל וליומן ומריצים עבודה חוזרת', keywords: 'agents סוכנים אוטומציה whatsapp', icon: Bot, route: '/', targetSelector: '#offer-ai-agents' },
  { id: 'offer-llm-lab', title: 'מעבדת LLM', snippet: 'פירוק מודלים חדשים, השוואות ובחירת המודל הנכון למשימה', keywords: 'llm מודלים gpt claude gemini grok llama השוואה', icon: Layers, route: '/', targetSelector: '#offer-llm-lab' },
  { id: 'offer-ai-hub', title: 'חדשות ומדריכי AI', snippet: 'חדשות AI בזמן אמת ומדריכים מעשיים צעד אחר צעד', keywords: 'news חדשות מדריכים tutorials', icon: BookOpen, route: '/', targetSelector: '#offer-ai-hub' },
  { id: 'roi-calculator', title: 'מחשבון חיסכון לסוכן AI', snippet: 'הערכת זמן שנחסך לפי היקף העבודה החוזרת', keywords: 'roi calculator חיסכון עלות מחשבון סוכן', icon: Calculator, route: '/', targetSelector: '#roi-calculator' },
  { id: 'services', title: 'מה אני בונה', snippet: 'JARVIS, סוכנים, RAG, אוטומציות ואינטגרציות LLM', keywords: 'services שירותים rag jarvis אוטומציה', icon: Layers, route: '/', targetSelector: '#services' },
  { id: 'news', title: 'חדשות AI חיות', snippet: 'עדכוני AI ממקורות מובילים, מתעדכנים לאורך היום', keywords: 'news חדשות ai llm openai anthropic google', icon: Newspaper, route: '/', targetSelector: '#news' },
  { id: 'contact', title: 'יצירת קשר', snippet: 'שיחה ישירה איתי, בלי בוטים', keywords: 'קשר contact פנייה', icon: Mail, route: '/', targetSelector: '#contact-portal' },

  // Dedicated pages
  { id: 'about-page', title: 'עמוד אודות מלא', snippet: 'בונה סוכני AI ומפרסם חדשות AI בעברית', keywords: 'about אודות רקע', icon: Bot, route: '/about', targetSelector: '#page-top' },
  { id: 'ai-page', title: 'עמוד סוכני AI מלא', snippet: 'פירוט סוכנים אוטונומיים, RAG ואינטגרציות LLM', keywords: 'AI page עמוד מלא סוכנים', icon: Bot, route: '/ai', targetSelector: '#page-top' },
  { id: 'jarvis-page', title: 'מערכת JARVIS', snippet: 'עוזר AI אישי בעברית למייל, ליומן ולמשימות', keywords: 'jarvis עוזר אישי assistant', icon: Bot, route: '/jarvis', targetSelector: '#page-top' },
  { id: 'magazines-page', title: 'מדריכים וחוברות', snippet: 'מדריכי AI מעשיים, PDF להורדה מיידית', keywords: 'מגזין חוברת מדריך AI guide', icon: BookOpen, route: '/magazines', targetSelector: '#page-top' },
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
