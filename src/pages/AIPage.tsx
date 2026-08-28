import {
  Sparkles,
  User,
  Calendar,
  Layers,
  Cpu,
  Database,
  Bot,
  ShieldAlert,
  Presentation,
  BookOpen,
  Users,
  ListOrdered,
  Compass,
  Zap,
  Briefcase,
  Code2,
  Send,
  Download,
  ShoppingCart,
  Mail,
  Check,
  Clapperboard,
  Newspaper,
  Clock,
  ExternalLink,
} from 'lucide-react';
import {
  PageHero,
  SectionHeading,
  ServiceGrid,
  InfoBox,
  SpecTable,
  AudienceGrid,
  TocGrid,
  UnifiedCta,
} from '../components/content/ContentPrimitives';
import AIPulseWidget from '../components/content/AIPulseWidget';
import VideoEmbed from '../components/content/VideoEmbed';
import NewsletterCapture from '../components/content/NewsletterCapture';
import { useAINewsFeed } from '../services/aiNewsService';
import { formatRelativeTime } from '../services/newsService';

const enterpriseAgentsImage = 'https://images.pexels.com/photos/3861957/pexels-photo-3861957.jpeg?auto=compress&cs=tinysrgb&w=1600';
const aiInfraImage = 'https://images.pexels.com/photos/1597776/pexels-photo-1597776.jpeg?auto=compress&cs=tinysrgb&w=1600';
const automationImage = 'https://images.pexels.com/photos/34207359/pexels-photo-34207359.jpeg?auto=compress&cs=tinysrgb&w=1600';

interface FeaturePoint {
  image: string;
  imageAlt: string;
  badge: string;
  title: string;
  description: string;
  points: string[];
  reverse?: boolean;
}

function ImageFeatureSection({ image, imageAlt, title, description, points, reverse = false }: FeaturePoint) {
  return (
    <div className={`grid grid-cols-1 lg:grid-cols-2 gap-8 items-center mb-14 ${reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}>
      <div className="relative rounded-2xl overflow-hidden border border-white/10 h-64 lg:h-80">
        <img src={image} alt={imageAlt} className="absolute inset-0 w-full h-full object-cover grayscale opacity-90" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      </div>
      <div>
        <h3 className="font-display text-2xl md:text-3xl font-black text-white mb-4 leading-tight">{title}</h3>
        <p className="text-zinc-300 text-base leading-relaxed mb-5">{description}</p>
        <ul className="space-y-2">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2 text-sm text-zinc-400">
              <Check className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// Fallback content only — used while the live /api/ai-news feed is loading for the first time,
// or if it fails/returns nothing, so this section is never empty or broken.
const CURATED_VIDEOS = [
  { youtubeId: 'PLyCki2K0Lg', title: 'Why we built—and donated—the Model Context Protocol (MCP)', channel: 'Anthropic' },
  { youtubeId: '5CcL6I3fdcA', title: 'What Is an Enterprise AI Agent? (Assistant vs Workflow vs Agent)', channel: 'Zenphi' },
];

const CURATED_ARTICLES = [
  {
    title: 'הגנת סוכני AI בסביבות ארגוניות מפני מתקפות',
    source: 'Geektime',
    url: 'https://www.geektime.co.il/securing-ai-agents-everywhere-17925/',
    readTime: '6 דקות קריאה',
    tags: ['Agentic AI', 'סייבר'],
  },
  {
    title: 'איך מודלי שפה אוטונומיים משנים את מחזור הפיתוח',
    source: 'Geektime',
    url: 'https://www.geektime.co.il/effective-ai-driven-sdlc-strategy/',
    readTime: '7 דקות קריאה',
    tags: ['AI Agents', 'SDLC'],
  },
  {
    title: 'Introducing the Model Context Protocol',
    source: 'Anthropic',
    url: 'https://www.anthropic.com/news/model-context-protocol',
    readTime: '5 דקות קריאה',
    tags: ['MCP', 'Enterprise'],
  },
];

export default function AIPage() {
  const { data: aiNews, isLoading: aiNewsLoading } = useAINewsFeed();

  const videos = aiNews && aiNews.videos.length > 0 ? aiNews.videos : CURATED_VIDEOS;
  const articles =
    aiNews && aiNews.articles.length > 0
      ? aiNews.articles.map((item) => ({
          title: item.title,
          source: item.source,
          url: item.link,
          readTime: formatRelativeTime(item.publishedAt),
          tags: [item.category],
        }))
      : CURATED_ARTICLES;

  return (
    <div id="page-top" className="min-h-screen pt-24 md:pt-28">
      <div className="container-wide">
        <PageHero
          badgeIcon={Sparkles}
          badgeLabel="Enterprise AI Architecture & Practice"
          title="פתרונות בינה מלאכותית וחוברת הלימוד המקיפה"
          subtitle="מתיאוריה ליישום מעשי: פיתוח מערכות, ייעוץ ארגוני וספרי לימוד מתקדמים"
          metaChips={[
            { icon: User, label: 'מאת: דניאל' },
            { icon: Calendar, label: 'מהדורה מעודכנת: 4/2026' },
            { icon: Layers, label: 'Agentic AI • RAG • MCP Protocol' },
          ]}
        />

        <div className="pt-10">
          <AIPulseWidget />

          <SectionHeading
            icon={Cpu}
            title="שירותי ייעוץ ופיתוח AI"
            description="אם אתה מחפש להטמיע בינה מלאכותית בעסק, לבנות ארכיטקטורת ידע חכמה, או לקחת את צוות הפיתוח שלך שלב אחד קדימה — אלו הפתרונות שאני מציע:"
          />
          <ServiceGrid
            items={[
              { icon: Database, title: 'פיתוח ארכיטקטורת RAG וניהול ידע', description: 'חיבור מודלי שפה (LLMs) למאגרי המידע, ה-PDFים וה-DB הארגוניים שלכם בשיטות שליפה מתקדמות ללא דליפת מידע.' },
              { icon: Bot, title: 'פיתוח סוכנים אוטונומיים (AI Agents & MCP)', description: 'בניית סוכנים מבוססי פרוטוקול MCP המבצעים משימות מורכבות, מפעילים כלי תוכנה חיצוניים, ומציגים תוצאות בזמן אמת.' },
              { icon: ShieldAlert, title: 'ייעוץ, אבטחה והטמעה בארגונים', description: 'הגדרת מדיניות עבודה, מניעת הזיות (Hallucinations), ניהול עלויות API (Prompt Caching), והגנה מול משטחי תקיפה חדשים.' },
              { icon: Presentation, title: 'הדרכות וסדנאות מעשיות', description: 'העברת סדנאות פרונטליות/דיגיטליות לצוותים טכניים ולמנהלים — ממאפס ועד ייצור (Production).' },
            ]}
          />

          <InfoBox badgeIcon={BookOpen} badgeLabel="ספר הלימוד והעבודה המלא" title="המוצר: חוברת הלימוד המלאה — מהדורת 2026">
            <p className="text-brand-400 font-bold text-lg">ספר העבודה המקיף ביותר ללימוד, שליטה ובניית מערכות AI</p>
            <p>
              החוברת שנכתבה על ידי דניאל היא לא עוד תיאוריה — היא <strong className="text-white">ספר עבודה מעשי</strong> (31 פרקים | 3 נספחים). היא נבנתה מתוך עיקרון ברור: בינה מלאכותית היא מיומנות נלמדת, והדרך היחידה לשלוט בה היא דרך ניסוי, תרגול ובנייה.
            </p>
          </InfoBox>

          <SpecTable
            rows={[
              { label: 'היקף', value: <><strong className="text-white">31 פרקים מלאים</strong> + 3 נספחים מקצועיים</> },
              { label: 'עדכניות', value: <>מהדורת <strong className="text-white">4/2026</strong> (כוללת Agentic AI, MCP, Test-time compute)</> },
              { label: 'אופי הלימוד', value: <><strong className="text-white">100% מעשי:</strong> כולל בלוקים של קוד, תרגילים, ואזהרות אבטחה</> },
              { label: 'פורמט', value: 'דיגיטלי (PDF מותאם לקריאה/עבודה) / מודפס' },
            ]}
          />

          <SectionHeading icon={Layers} title="עומק טכני: מהארכיטקטורה עד התשתית" description="שלושה תחומים שכל ארגון שמטמיע AI ברצינות נתקל בהם במוקדם או במאוחר" />
          <ImageFeatureSection
            image={enterpriseAgentsImage}
            imageAlt="לוח בקרה דיגיטלי עם נתונים וגרפים"
            badge="Enterprise Agents"
            title="סוכני AI ארגוניים שמבצעים עבודה בפועל"
            description="מעבר מ-Chatbot שעונה על שאלות לסוכן שמבצע משימות עסקיות שלמות — קריאה למערכות פנימיות, קבלת החלטות בגבולות מוגדרים, ודיווח לאדם רק כשבאמת נדרש."
            points={[
              'תזמור Multi-Agent לתהליכים מרובי-שלבים',
              'Guardian Agents לפיקוח ובלימת פעולות לא רצויות',
              'חיבור ל-CRM, ERP ומערכות ארגוניות קיימות דרך MCP',
            ]}
          />
          <ImageFeatureSection
            image={aiInfraImage}
            imageAlt="כבלי רשת וציוד תקשורת בחדר שרתים"
            badge="AI Infrastructure"
            title="התשתית שמאחורי כל מודל: רשת, Wi-Fi 7 וחומרה"
            description="מודל AI מהיר על הנייר שרץ על רשת איטית הוא מודל איטי בפועל. דור הרשתות החדש (Wi-Fi 7) והתשתית התומכת בו הופכים לחלק בלתי נפרד מארכיטקטורת AI ארגונית רצינית — במיוחד עם עומסי Edge AI ואינפרנס בזמן אמת."
            points={[
              'רוחב פס ו-Latency נמוך לעומסי Inference בזמן אמת',
              'תשתית רשת שתומכת בעומסי Multi-Link Operation של Wi-Fi 7',
              'תכנון קיבולת לצמיחת עומסי AI מקומיים (Edge)',
            ]}
            reverse
          />
          <ImageFeatureSection
            image={automationImage}
            imageAlt="זרוע רובוטית תעשייתית בקו ייצור אוטומטי"
            badge="Automation Workflows"
            title="אוטומציה שמחליפה תהליכים ידניים שלמים"
            description="לא עוד סקריפט בודד שרץ פעם ביום — תזרימי עבודה שלמים שמחברים בין מערכות, מקבלים החלטות ומתריעים כשמשהו חורג מהצפוי, בלי שאיש יצטרך להריץ אותם ידנית."
            points={[
              'חיבור בין כלים קיימים ללא צורך בפיתוח אינטגרציה מאפס',
              'לוגיקת החלטה מבוססת AI בתוך תהליך האוטומציה עצמו',
              'ניטור וטיפול בחריגות ללא התערבות ידנית שוטפת',
            ]}
          />

          <SectionHeading icon={Clapperboard} title="עדכון יומי: סרטונים חדשים מבתי היוצר של ה-AI" description="נשלף אוטומטית מערוצי היוטיוב הרשמיים של Anthropic, OpenAI ו-Google DeepMind" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-16">
            {aiNewsLoading && !aiNews
              ? Array.from({ length: 2 }).map((_, idx) => (
                  <div key={idx} className="aspect-video rounded-2xl bg-white/[0.03] border border-white/5 animate-pulse" />
                ))
              : videos.map((v) => <VideoEmbed key={v.youtubeId} youtubeId={v.youtubeId} title={v.title} channel={v.channel} />)}
          </div>

          <SectionHeading icon={Newspaper} title="עדכון יומי: מומלץ לקריאה" description="כתבות AI טריות מהפיד החי של האתר, מתעדכנות אוטומטית" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-16">
            {aiNewsLoading && !aiNews
              ? Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="h-44 rounded-2xl bg-white/[0.03] border border-white/5 animate-pulse" />
                ))
              : articles.map((a) => (
              <a
                key={a.url}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col bg-carbon-fiber border border-white/10 rounded-2xl p-6 hover:border-brand-500/40 transition-colors"
              >
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  {a.tags.map((tag) => (
                    <span key={tag} className="text-[10px] font-mono font-bold text-brand-400 bg-brand-500/10 border border-brand-500/25 rounded-full px-2.5 py-1">
                      {tag}
                    </span>
                  ))}
                </div>
                <h3 dir="auto" className="font-display font-bold text-base text-white mb-3 leading-snug flex-grow group-hover:text-brand-300 transition-colors">
                  {a.title}
                </h3>
                <div className="flex items-center justify-between text-xs text-zinc-500 pt-3 border-t border-white/10">
                  <span dir="ltr">{a.source}</span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    {a.readTime}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 group-hover:text-brand-400 transition-colors mt-3">
                  <ExternalLink className="w-3.5 h-3.5" />
                  קריאה במקור
                </div>
              </a>
            ))}
          </div>

          <SectionHeading icon={Users} title="למי החוברת מתאימה?" description="תוכנית לימודים מדורגת המותאמת לכל רמות הידע בארגון" />
          <AudienceGrid
            items={[
              { tag: '01 // BASIC', title: '1. המתחיל המוחלט', description: 'מי שרוצה להבין מה קורה מתחת למכסה המנוע, להפסיק לנחש פרומפטים, ולהפוך את כלי ה-AI לעוזר יומיומי אישי.' },
              { tag: '02 // PRO USER', title: '2. המשתמש המקצועי', description: 'מנהלים, אנליסטים ומשווקים שרוצים לייעל תהליכי עבודה, לחסוך שעות שבועיות ולנהל משימות מורכבות.' },
              { tag: '03 // DEVELOPER', title: '3. המפתח (Developer)', description: 'מי שרוצה לעבור מצ׳אט לבניית מערכות ייצור: עבודה מול APIs, פיתוח סוכנים, RAG, והערכת ביצועים (Evals).' },
              { tag: '04 // LEADERSHIP', title: '4. היזם ומנהל הטכנולוגיות', description: 'מי שצריך להבין עלויות, לטנציה, סיכוני אבטחה, ושיקולי רגולציה לפני השקעת משאבים.' },
            ]}
          />

          <SectionHeading icon={ListOrdered} title="תוכן העניינים בקצרה (8 חלקים)" description="מבנה פרקים סדור ומדורג ממעוף הציפור ועד ארכיטקטורת ייצור מלאה" />
          <TocGrid
            items={[
              { badge: 'חלק א׳', title: 'יסודות הבינה המלאכותית', description: 'מהי AI באמת, למידת מכונה, ורשתות נוירונים.' },
              { badge: 'חלק ב׳', title: 'מודלי שפה גדולים (LLMs)', description: 'ארכיטקטורת הטרנספורמר, טוקנים, אימון, ומפת המודלים.' },
              { badge: 'חלק ג׳', title: 'הכלים בפועל', description: 'עבודה מול ChatGPT, Claude, Gemini, ועבודה חסכונית במכסות.' },
              { badge: 'חלק ד׳', title: 'הנדסת פרומפט והקשר', description: 'טכניקות מתקדמות, הנדסת הקשר (Context Engineering), ומולטימודליות.' },
              { badge: 'חלק ה׳', title: 'מערכות - ידע, כלים וסוכנים', description: 'RAG, פרוטוקול MCP, Function Calling, וארכיטקטורות רב-סוכניות.' },
              { badge: 'חלק ו׳', title: 'בנייה בפועל', description: 'עבודה מול API, תכנות עם סוכנים, ופרויקט מקצה לקצה.' },
              { badge: 'חלק ז׳', title: 'הפעלה בייצור (Production)', description: 'הערכה (Evals), אבטחה (Prompt Injection), ניהול עלויות ואתיקה.' },
              { badge: 'חלק ח׳', title: 'הדרך קדימה', description: 'תוכנית עבודה 90 יום ומבט לעתיד.' },
              { badge: 'נספחים', title: 'נספחים מקצועיים להרחבה', description: 'מילון מונחים מקצועי, ערכת פרומפטים מוכנה לפיתוח וניהול, וביבליוגרפיה.', wide: true },
            ]}
          />

          <SectionHeading icon={Compass} title="מסלולי לימוד מומלצים בתוך החוברת" description="התאמה אישית לפי התפקיד והזמן העומד לרשותך" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-16">
            {[
              { icon: Zap, title: 'מסלול מהיר למתחילים', chapters: 'פרקים 1, 10–17', duration: '6–9 שעות' },
              { icon: Briefcase, title: 'מסלול המשתמש המקצועי', chapters: 'פרקים 1, 3, 5–17, 29', duration: '10–15 שעות' },
              { icon: Code2, title: 'מסלול המפתחים (Dev Track)', chapters: 'פרקים 5–9, 16, 18–28', duration: '15–25 שעות' },
            ].map((track) => (
              <div key={track.title} className="bg-carbon-900/60 border border-white/10 border-r-2 border-r-brand-500 rounded-xl p-5">
                <div className="flex items-center gap-2 font-display font-bold text-white mb-2">
                  <track.icon className="w-4 h-4 text-brand-400" />
                  {track.title}
                </div>
                <div className="text-zinc-300 text-sm mb-1">{track.chapters}</div>
                <div className="font-mono text-xs text-brand-400">משך משוער: {track.duration}</div>
              </div>
            ))}
          </div>

          <div className="bg-gradient-to-br from-brand-500/10 to-carbon-900/60 border border-brand-500/30 rounded-2xl p-6 md:p-8 mb-16">
            <div className="flex items-center gap-2.5 mb-3">
              <Mail className="w-5 h-5 text-brand-400" />
              <h3 className="font-display font-bold text-xl text-white">עדכוני AI ישירות למייל</h3>
            </div>
            <p className="text-zinc-300 text-sm leading-relaxed mb-5 max-w-xl">
              הרשמה חד-פעמית, בלי ספאם — עדכונים תקופתיים על כלים חדשים, תובנות ארכיטקטורה ומאמרים מקצועיים בתחומי ה-AI.
            </p>
            <NewsletterCapture source="ai-page" />
          </div>

          <SectionHeading icon={Send} title="צור קשר והתחלה" description="קבלת החוברת, הורדת פרק ניסיון או תיאום ייעוץ מותאם אישית" />
          <UnifiedCta
            mailSubject="רכישת חוברת AI / ייעוץ AI ארגוני"
            whatsappMessage="שלום דניאל, אשמח לפרטים על חוברת ה-AI ו/או ייעוץ להטמעת בינה מלאכותית בארגון שלי."
          />
        </div>
      </div>
    </div>
  );
}
