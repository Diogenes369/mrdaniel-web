import {
  Rocket,
  User,
  Layers,
  Smartphone,
  Database,
  GitBranch,
  Cloud,
  Network,
  Gauge,
  Target,
  Send,
  Code2,
  ShieldCheck,
  FileCode2,
  TestTube2,
  PackageCheck,
  UploadCloud,
  Activity,
  Compass,
  DraftingCompass,
  Hammer,
  TrendingUp,
  Search,
  MousePointerClick,
  LineChart,
  Repeat,
  Megaphone,
  PhoneCall,
  FileSearch,
  FileText,
} from 'lucide-react';
import {
  PageHero,
  SectionHeading,
  InteractiveServiceGrid,
  ServiceGrid,
  InfoBox,
  SpecTable,
  AudienceGrid,
} from '../components/content/ContentPrimitives';
import LiveSimulation from '../components/content/LiveSimulation';
import ProjectEstimator from '../components/content/ProjectEstimator';
import LeadCtaGrid from '../components/content/LeadCtaGrid';

export default function DigitalPage() {
  return (
    <div id="page-top" className="min-h-screen pt-24 md:pt-28">
      <div className="container-wide">
        <PageHero
          badgeIcon={Rocket}
          badgeLabel="Digital Development & Web3"
          title="פיתוח דיגיטלי ו-Web3 ברמה ארגונית"
          subtitle="ממוצר MVP ועד פלטפורמת SaaS מלאה — קוד נקי, ארכיטקטורת ענן ופייפליין פריסה אוטומטי"
          metaChips={[
            { icon: User, label: 'מאת: דניאל' },
            { icon: Layers, label: 'Full-Stack • Cloud • Web3' },
            { icon: Gauge, label: 'Performance & Core Web Vitals' },
          ]}
        />

        <div className="pt-10">
          <InfoBox badgeIcon={Code2} badgeLabel="תפיסת הפיתוח" title="קוד נקי, Web3 מתקדם ואבטחה מהיסוד">
            <p>
              בעידן שבו כל חלקיק שנייה קובע, פלטפורמות דיגיטליות נדרשות להפגין מהירות, יציבות וחווית משתמש חסרת פשרות. בניית פלטפורמות מורכבות ו-SaaS מצריכה <strong className="text-white">ארכיטקטורת ענן מתקדמת</strong>, שילוב טכנולוגיות Web3 חדשניות וקוד נקי מבוסס סטנדרטים בינלאומיים.
            </p>
            <p>
              כל פרויקט נבנה עם <strong className="text-white">ארכיטקטורת אבטחת סייבר מקצה לקצה</strong> משולבת מהיסוד (Security by Design) — לא כשכבה שמתווספת בסוף — לצד עיצוב מתקדם וביצועים מיטביים, כדי שהמוצר שלכם ימיר, יעבוד חלק ויוביל את התעשייה.
            </p>
          </InfoBox>

          <SectionHeading icon={Layers} title="שירותי הפיתוח שאני מציע" description="מוצר דיגיטלי אחד עקבי מקצה לקצה — Frontend, Backend, Web3, ענן ואבטחת סייבר תחת אותה ארכיטקטורה" />
          <InteractiveServiceGrid
            items={[
              { icon: Smartphone, title: 'Mobile-First & Fully Responsive', description: 'חווית משתמש (UX/UI) פורצת דרך, מותאמת באופן מושלם לכל מכשיר, עם דגש על עיצוב נקי וביצועים מהירים (Web Vitals) המגדילים המרות.' },
              { icon: Database, title: 'Full-Stack (React / Node)', description: 'ניהול State מודרני וטעינה עצלה (Code Splitting) בצד הלקוח, מול שכבת API מתועדת ב-Node.js/Express — בסיס קוד אחיד לצוות אחד.' },
              { icon: Network, title: 'Web3 וחוזים חכמים מתקדמים', description: 'כניסה בטוחה לעולם הבלוקצ׳יין — dApps, ארנקים דיגיטליים וטוקניזציה של נכסים, עם דגש על אבטחת החוזים החכמים לפני עלייה לרשת הראשית.' },
              { icon: ShieldCheck, title: 'ארכיטקטורת אבטחת סייבר מקצה לקצה', description: 'הגנה משולבת מהיסוד לאורך כל שכבות המוצר — אימות והרשאות, הקשחת API, וסריקת פגיעויות לפני כל פריסה לייצור, לא כתוספת מאוחרת.' },
              { icon: Cloud, title: 'ארכיטקטורת ענן (AWS / Azure)', description: 'תשתית Cloud-Native עם שירותים מנוהלים, תשתית-כקוד (IaC) לפריסה חוזרת, וסקיילביליות אוטומטית לפי עומס.' },
              { icon: GitBranch, title: 'CI/CD ו-DevOps', description: 'צינור אוטומטי הכולל בדיקות, סריקת אבטחה ו-Deployment הדרגתי (Blue-Green / Canary), עם Rollback אוטומטי במקרה כשל.' },
              { icon: Gauge, title: 'אופטימיזציית ביצועים', description: 'פרופיילינג ביצועים בצד השרת והלקוח, Caching רב-שכבתי ו-Code Splitting — כל שנייה של השהייה עולה בלקוחות פוטנציאליים.' },
            ]}
          />

          <SectionHeading
            icon={Compass}
            title="ארכיטקטורה דיגיטלית לכל מחזור החיים"
            description="לא רק לבנות — ללוות מהרעיון ועד הצמיחה. חמישה שלבים, כל אחד עם תוצר עסקי ברור שאפשר למדוד."
          />
          <ServiceGrid
            items={[
              { icon: Compass, title: '1. אפיון ואסטרטגיה', description: 'שיחת עומק על המטרות, המשתמשים והמספרים. יוצאים עם מסמך אפיון, סקופ מדויק ותוכנית עבודה — לפני שורת קוד אחת.' },
              { icon: DraftingCompass, title: '2. ארכיטקטורה ועיצוב', description: 'תשתית נתונים, מודל הרשאות, בחירת ענן ומסכים ראשוניים (Prototype) שאפשר ללחוץ עליהם — כדי לתקן על נייר, לא בפרודקשן.' },
              { icon: Hammer, title: '3. פיתוח באיטרציות', description: 'גרסאות קטנות שעולות לסביבת בדיקה כל שבוע. אתם רואים התקדמות אמיתית ומשפיעים תוך כדי, בלי "בלאק-בוקס" של חצי שנה.' },
              { icon: Rocket, title: '4. השקה מבוקרת', description: 'פריסה הדרגתית, בדיקות עומס, גיבוי ו-Rollback מיידי. עולים לאוויר בלי לילות לבנים.' },
              { icon: TrendingUp, title: '5. צמיחה ואופטימיזציה', description: 'אחרי ההשקה מתחילה העבודה החשובה: מדידה, ניסויים ושיפור מתמשך של יחסי ההמרה, המהירות והשימור.' },
            ]}
          />

          <SectionHeading icon={Activity} title="הדגמה חיה: תהליך פריסה אוטומטי" description="כך נראה מעבר שינוי קוד מהמחשב שלכם עד לפרודקשן, בביטחון ובלי התערבות ידנית" />
          <LiveSimulation
            title="Live Deployment Pipeline"
            description="סימולציה של צינור CI/CD טיפוסי — כל שינוי קוד עובר את השלבים הבאים לפני שהוא מגיע ללקוחות אמיתיים."
            steps={[
              { icon: FileCode2, label: 'קוד נכתב', detail: 'מפתח דוחף (push) שינוי קוד לענף עבודה, מופעל אוטומטית ע"י ה-CI.' },
              { icon: TestTube2, label: 'בדיקות אוטומטיות', detail: 'הרצת בדיקות יחידה, אינטגרציה וסריקת אבטחה (SAST) על השינוי.' },
              { icon: PackageCheck, label: 'Build', detail: 'בנייה של חבילת ייצור מותאמת (Production Build) וחתימת גרסה.' },
              { icon: UploadCloud, label: 'פריסה (Deploy)', detail: 'פריסה הדרגתית (Blue-Green / Canary) לסביבת הייצור, עם אפשרות Rollback מיידי.' },
              { icon: Activity, label: 'ניטור בפרודקשן', detail: 'מעקב בזמן אמת אחר ביצועים ושגיאות, עם התרעה אוטומטית על חריגה.' },
            ]}
          />

          <SectionHeading
            icon={Target}
            title="למי השירות מתאים?"
            description="פתרון גמיש שנבנה ומתומחר לפי היקף הפרויקט בפועל — מ-Landing Page ממוקד ליזם עצמאי, ועד פלטפורמה ארגונית מלאה. כל פרויקט מתומחר בנפרד, לא לפי חבילה קבועה מהמדף."
          />
          <AudienceGrid
            items={[
              {
                tag: '01 // STARTUPS & INDIVIDUALS',
                title: '1. סטארט-אפים, יזמים ועצמאיים',
                description: 'בניית MVP או אתר תדמית מהיר, נקי ומודרני שמאפשר לגייס משקיעים או לבחון שוק בזמן קצר — בלי לפשר על ארכיטקטורה נכונה או על אבטחה בסיסית מהיום הראשון, כדי שהמוצר יהיה מוכן לצמוח בלי שכתוב מיותר.',
              },
              {
                tag: '02 // SMB & ENTERPRISE',
                title: '2. עסקים וארגונים',
                description: 'פלטפורמות ואתרים ברמה ארגונית שדורשים יציבות, ארכיטקטורת אבטחה מקצה לקצה וסקיילביליות תחת עומס משתמשים אמיתי — כולל אינטגרציה למערכות פנימיות קיימות.',
              },
              {
                tag: '03 // WEB3 PROJECTS',
                title: '3. פרויקטי בלוקצ׳יין ו-Web3',
                description: 'צוותים הנכנסים לעולם ה-Web3 עם חוזים חכמים, ארנקים דיגיטליים או טוקניזציה של נכסים, וזקוקים לביקורת אבטחה מלאה וליווי מקצועי לפני השקה לרשת הראשית.',
              },
            ]}
          />
          <ProjectEstimator />

          <SpecTable
            rows={[
              { label: 'סטאק טכנולוגי', value: <>React, TypeScript, Node.js/Express, Vite — <strong className="text-white">קוד אחיד מקצה לקצה</strong></> },
              { label: 'ענן ותשתית', value: 'AWS / Azure, Infrastructure as Code, Auto Scaling, Multi-AZ' },
              { label: 'איכות ואבטחה', value: 'CI/CD עם בדיקות אוטומטיות, סריקת SAST/DAST, ו-Security by Design' },
              { label: 'ביצועים', value: 'Code Splitting, Caching רב-שכבתי, ומעקב אחר Core Web Vitals' },
            ]}
          />

          <SectionHeading
            icon={TrendingUp}
            title="אסטרטגיות צמיחה — הפיתוח הוא רק ההתחלה"
            description="אתר שאף אחד לא מוצא, או שנכנסים אליו ולא ממירים, הוא נכס שלא עובד. אלה המנועים שמזיזים את המחט אחרי ההשקה."
          />
          <ServiceGrid
            items={[
              { icon: Search, title: 'SEO ותנועה אורגנית', description: 'מבנה טכני נכון, מהירות, ותוכן שגוגל אוהב — כדי שלקוחות ימצאו אתכם בלי לשלם על כל קליק.' },
              { icon: MousePointerClick, title: 'אופטימיזציית המרות (CRO)', description: 'ניתוח נקודות הנטישה בפועל ושיפור נתיב המשתמש — יותר פניות מאותה כמות מבקרים.' },
              { icon: LineChart, title: 'מדידה וניסויים (A/B)', description: 'החלטות לפי מספרים, לא תחושות. בדיקות מבוקרות על כותרות, מסכים וטפסים.' },
              { icon: Repeat, title: 'שימור ומחזור לקוח', description: 'רצפי מייל/וואטסאפ אוטומטיים, אונבורדינג והחזרת לקוחות רדומים — ה-LTV הוא המשחק האמיתי.' },
              { icon: Megaphone, title: 'רכישה בתשלום', description: 'קמפיינים ממוקדים עם דפי נחיתה ייעודיים ומעקב המרות מלא — תקציב שעובד, לא נשרף.' },
            ]}
          />

          <SectionHeading icon={Send} title="הצעד הבא" description="בחרו את נקודת הכניסה שמתאימה לכם — כל פנייה מגיעה אליי מסווגת ומוכנה לשיחה ממוקדת" />
          <LeadCtaGrid
            sourceSection="Digital Page · Specialized CTA"
            items={[
              {
                icon: PhoneCall,
                title: 'שיחת אסטרטגיה',
                sub: '30 דקות, ללא עלות. עוברים על המטרות, האתגרים והכיוון הנכון — עם המלצות קונקרטיות שאפשר ליישם גם בלעדיי.',
                subject: 'שיחת אסטרטגיה דיגיטלית (30 דק׳)',
                action: 'לתיאום שיחה',
                featured: true,
              },
              {
                icon: FileSearch,
                title: 'אודיט לאתר / מערכת קיימת',
                sub: 'יש לכם כבר משהו שרץ? דו״ח ממוקד על ביצועים, אבטחה, SEO וחווית משתמש — עם רשימת תיקונים לפי סדר עדיפויות.',
                subject: 'אודיט טכני לאתר / מערכת קיימת',
                action: 'לבקשת אודיט',
              },
              {
                icon: FileText,
                title: 'הצעת מחיר מפורטת',
                sub: 'יודעים בדיוק מה אתם צריכים? שלחו את הדרישות ותקבלו סקופ, לוחות זמנים ומחיר מפורט — לא טווח כללי.',
                subject: 'הצעת מחיר מפורטת — פרויקט פיתוח',
                action: 'לבקשת הצעה',
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
