import {
  Home,
  Bot,
  ShieldAlert,
  Layers,
  Grid3x3,
  Calculator,
  BookOpen,
  Mail,
  ShieldCheck,
  Gauge,
  GitCompare,
  Bug,
  CalendarCheck,
  Blocks,
  type LucideIcon,
} from 'lucide-react';

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
 * is a multi-route SPA, so About/AI/Cyber page content isn't in the tree while on the homepage),
 * so it would silently miss most of the site; this index covers every route consistently and
 * lets search results resolve to a real selector immediately, without waiting on a page to mount
 * first just to know if it contains a match.
 */
export const SEARCH_INDEX: SearchEntry[] = [
  // Home sections
  { id: 'hero', title: 'עמוד הבית', snippet: 'הופכים טכנולוגיה מורכבת לפתרון תחרותי', keywords: 'home דף הבית ראשי', icon: Home, route: '/', targetSelector: '#hero' },
  { id: 'system-metrics', title: 'מדדי מערכת Live', snippet: 'SLA 99.99%, זמן תגובה לאיום, צמתי RAG אוטונומיים, אכיפות Zero-Trust', keywords: 'metrics מדדים SLA uptime RAG zero trust live ארכיטקטורת מפתח', icon: Gauge, route: '/', targetSelector: '#system-metrics' },
  { id: 'tech-comparison', title: 'צ׳אטבוט גנרי מול ארכיטקטורה אוטונומית', snippet: 'השוואה אינטראקטיבית בין תבנית מדף לארכיטקטורת AI אוטונומית אמיתית', keywords: 'comparison השוואה chatbot ארכיטקטורה', icon: GitCompare, route: '/', targetSelector: '#tech-comparison' },
  { id: 'edge-case-simulator', title: 'סימולטור מקרי קצה', snippet: 'תרחישי תקיפה חיים — בקשות הנחה לא מורשות, חילוץ מידע, עומס קלט עוין', keywords: 'edge case simulator מקרי קצה stress test אבטחה', icon: Bug, route: '/', targetSelector: '#edge-case-simulator' },
  { id: 'cyber-audit', title: 'מטריצת בקרה סייבר ופרטיות', snippet: 'לוח בקרה חי לשש שכבות ההגנה — Zero-Trust, MFA, הצפנה ובידוד רשת', keywords: 'cyber audit סייבר פרטיות zero trust mfa', icon: ShieldCheck, route: '/', targetSelector: '#cyber-audit' },
  { id: 'tech-matrix', title: 'מטריצת יכולות וטכנולוגיה', snippet: 'סוכני AI, סייבר וארגונית, ארכיטקטורת Web — מודלים, פרוטוקולים וערך עסקי', keywords: 'יכולות capabilities matrix טכנולוגיה tech stack claude gemini', icon: Layers, route: '/', targetSelector: '#tech-matrix' },
  { id: 'deployment-roadmap', title: 'מסלול פריסה ל-14 יום', snippet: 'ציר זמן אינטראקטיבי מאפיון ועד Go-Live ואינטגרציית WhatsApp', keywords: 'roadmap deployment פריסה לוח זמנים', icon: CalendarCheck, route: '/', targetSelector: '#deployment-roadmap' },
  { id: 'roi-calculator', title: 'מחשבון ROI אינטראקטיבי', snippet: 'חוגה מעגלית ופרופילי עסק מהירים — הערכת חיסכון חודשי ושנתי לפי היקף פניות', keywords: 'roi calculator חיסכון עלות מחשבון סוכן חוגה', icon: Calculator, route: '/', targetSelector: '#roi-calculator' },
  { id: 'premium-advantage', title: 'היתרון הפרימיום', snippet: 'אבטחה ברמה ארגונית, אימון סוכנים מותאם אישית, Zero-Leakage Data Privacy', keywords: 'premium פרימיום אבטחה פרטיות privacy', icon: ShieldCheck, route: '/', targetSelector: '#premium-advantage' },
  { id: 'web3-dev', title: 'פיתוח Web3 וחוויות דיגיטליות', snippet: 'Wallet Connect, חוזים חכמים, חוויות WebGL תלת-ממדיות ועיצוב UI/UX יוקרתי', keywords: 'web3 בלוקצ׳יין wallet smart contracts webgl עיצוב', icon: Blocks, route: '/', targetSelector: '#web3-dev' },
  { id: 'matrix', title: 'מטריצת יכולות וטכנולוגיות', snippet: 'סנן לפי תחום: AI, סייבר או פיתוח', keywords: 'יכולות capabilities matrix טכנולוגיות', icon: Grid3x3, route: '/capabilities', targetSelector: '#matrix' },
  { id: 'magazines', title: 'מגזינים וחוברות עבודה', snippet: 'תוכן מקצועי דיגיטלי הנמכר ישירות — PDF להורדה מיידית', keywords: 'מגזין חוברת מדריך AI מדריך cyber', icon: BookOpen, route: '/', targetSelector: '#magazines' },
  { id: 'final-cta', title: 'יצירת קשר', snippet: 'בואו נתחיל פרויקט חדש', keywords: 'קשר contact פנייה', icon: Mail, route: '/', targetSelector: '#final-cta' },

  // Dedicated pages
  { id: 'about-page', title: 'עמוד אודות מלא', snippet: 'IT Management • Cyber Architecture • Agentic AI', keywords: 'about ניהול תשתיות רקע מקצועי', icon: Bot, route: '/about', targetSelector: '#page-top' },
  { id: 'ai-page', title: 'עמוד בינה מלאכותית מלא', snippet: 'פירוט שירותי AI, סוכנים אוטונומיים ואינטגרציה', keywords: 'AI page עמוד מלא סוכנים', icon: Bot, route: '/ai', targetSelector: '#page-top' },
  { id: 'cyber-page', title: 'עמוד סייבר מלא', snippet: 'פירוט שירותי סייבר, Zero-Trust ו-CISO להשכרה', keywords: 'cyber page עמוד מלא CISO', icon: ShieldAlert, route: '/cyber', targetSelector: '#page-top' },
];

/** Practical substring-token fuzzy match: every whitespace-separated token in the query must
 * appear somewhere in the entry's combined searchable text — order-independent, so "AI סייבר"
 * and "סייבר AI" match the same entries, and partial words still match (e.g. "ארכיטק"). */
export function searchEntries(query: string): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return SEARCH_INDEX;

  const tokens = q.split(/\s+/).filter(Boolean);
  return SEARCH_INDEX.filter((entry) => {
    const haystack = `${entry.title} ${entry.snippet} ${entry.keywords}`.toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
}
