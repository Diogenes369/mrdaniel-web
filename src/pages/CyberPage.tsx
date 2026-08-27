import {
  ShieldCheck,
  User,
  Lock,
  Sparkles,
  Shield,
  ShieldAlert,
  Cpu,
  Server,
  Activity,
  Users,
  CheckCircle2,
  Target,
  BookOpen,
  Terminal,
  AlertTriangle,
  Send,
  Network,
} from 'lucide-react';
import { PageHero, SectionHeading, InteractiveServiceGrid, InfoBox, SpecTable, AudienceGrid, UnifiedCta } from '../components/content/ContentPrimitives';

export default function CyberPage() {
  return (
    <div id="page-top" className="min-h-screen pt-24 md:pt-28">
      <div className="container mx-auto px-6 max-w-4xl">
        <PageHero
          badgeIcon={ShieldCheck}
          badgeLabel="Cybersecurity & Resiliency Architecture"
          title="אבטחת מידע וסייבר מתקדם (Cybersecurity & Resiliency)"
          subtitle="הגנה היקפית, מענה לאיומי עידן ה-AI וניהול סיכונים טכנולוגי מקצה לקצה"
          metaChips={[
            { icon: User, label: 'מאת: דניאל' },
            { icon: Lock, label: 'Zero Trust • EDR/XDR • BCP/DRP' },
            { icon: Sparkles, label: 'AI Security & LLM Defense' },
          ]}
        />

        <div className="pt-10">
          <InfoBox badgeIcon={Shield} badgeLabel="תפיסת ההגנה והרציפות העסקית" title="אבטחת מידע בעידן החדש: מניעה, תגובה והמשכיות עסקית">
            <p>
              בעולם טכנולוגי שבו איומי הסייבר משתכללים מדי יום — החל מתקיפות הנדסה חברתית מבוססות AI, דרך נוזקות כופר מתקדמות ועד לחשיפת נתונים בשרשראות אספקה — אבטחת מידע היא כבר לא רק מערכת פיירוול או אנטי-ווירוס. היא מהווה <strong className="text-white">לב פועם של היציבות העסקית והדיגיטלית</strong>.
            </p>
            <p>
              תפיסת ההגנה שלי משלבת <strong className="text-white">הבנה טכנולוגית עמוקה ברמת התשתיות והרשת</strong>, היכרות עם מתקפות מורכבות, והטמעת מתודולוגיות מתקדמות (כגון Zero Trust ו-Cyber 2.0) כדי להבטיח את רציפות הפעילות של העסק או הארגון שלך.
            </p>
          </InfoBox>

          <SectionHeading icon={ShieldAlert} title="מהם שירותי הסייבר וההגנה שאני מציע?" description="מעטפת אבטחה היקפית ומותאמת אישית לצרכים הארגוניים" />
          <InteractiveServiceGrid
            items={[
              { icon: Network, title: 'ארכיטקטורת רשת והגנה היקפית (Network & Perimeter Security)', description: 'תכנון, הגדרה והקשחה של ציוד היקפי, חומות אש (Firewalls), הגדרת מדיניות סינון תנועה, וחלוקת רשתות (VLANs / Micro-segmentation) להגבלת תנועה רוחבית של תוקפים.' },
              { icon: Cpu, title: 'אבטחת מערכות בינה מלאכותית (AI Security & LLM Defense)', description: 'הגנה על מודלי שפה ופלטפורמות AI ארגוניות מול איומים חדשים כגון Prompt Injection, דליפת נתונים אישיים/עסקיים דרך פרומפטים, והקשחת ממשקי API.' },
              { icon: Server, title: 'הקשחת תחנות, שרתים ותשתיות ענן', description: 'יישום פתרונות Endpoint Detection & Response (EDR/XDR), ניהול הרשאות בגישת Least Privilege, ואבטחת סביבות Active Directory / Entra ID.' },
              { icon: Activity, title: 'ניהול סיכונים, תגובה לאירועים ותכנון BCP/DRP', description: 'הכנת תוכניות התאוששות מאסון, נהלי תגובה בזמן אמת לאירועי סייבר, וביצוע בדיקות תקופתיות למזעור פגיעה במידע עסקי רגיש.' },
              { icon: Users, title: 'הדרכות מודעות לארגונים ולצוותים', description: 'סדנאות מעשיות להגברת מודעות העובדים מול מתקפות פישינג, הנדסה חברתית ושימוש בטוח בכלי תוכנה וענן.' },
            ]}
          />

          <SectionHeading icon={CheckCircle2} title="הערך המוסף שאתה מקבל בעבודה איתי" description="שילוב ייחודי של פרקטיקה בשטח, שקט תפעולי וראייה טכנולוגית רחבה" />
          <SpecTable
            rows={[
              { label: 'אינטגרציה מלאה עם AI ודיגיטל', value: 'שילוב ייחודי בין עולמות הסייבר, פיתוח התוכנה והבינה המלאכותית — אבטחה שנבנית כחלק אינטגרלי מהפיתוח ולא כאחרונה.' },
              { label: 'ראייה מערכתית מעשית', value: 'ניסיון מעשי בניהול ותחזוקת תשתיות מורכבות בשטח, תוך הבנה של האתגרים היומיומיים של מנהלי רשת וצוותי טכנולוגיה.' },
              { label: 'חומרי לימוד ותוכן מקצועי', value: 'גישה ישירה למדריכים, חוברות עבודה ומגזינים טכנולוגיים שנועדו להקנות ידע פרקטי ומעודכן לשמירה על בטיחות הנתונים.' },
              { label: 'פתרונות בהתאמה אישית', value: 'התאמת ארכיטקטורת ההגנה לתקציב, לרגולציה ולצרכים הספציפיים של העסק — ללא מוצרי מדף מיותרים.' },
            ]}
          />

          <SectionHeading icon={Target} title="למי השירות מתאים?" description="מענה מותאם לחברות, למובילים טכנולוגיים ולצוותי פיתוח" />
          <AudienceGrid
            items={[
              { tag: '01 // ENTERPRISE & SMB', title: '1. עסקים וארגונים', description: 'חברות שרוצות להבטיח את רציפות העבודה, להגן על מאגרי המידע שלהן ולמנוע זמני השבתה יקרים או דליפת נתונים.' },
              { tag: '02 // TECH LEADERSHIP', title: '2. מנהלי טכנולוגיה וצוותי תשתיות', description: 'צוותים טכניים הזקוקים לייעוץ חיצוני מקצועי, הקשחת מערכות קיימות, או הטמעת פתרונות הגנה מתקדמים ברשת.' },
              { tag: '03 // DEVELOPERS & STARTUPS', title: '3. מפתחים וחברות סטארט-אפ', description: 'צוותי פיתוח המבקשים לאבטח מוצרים דיגיטליים, ממשקי API ומערכות AI כבר משלב ה-Design (Security by Design).' },
            ]}
          />

          <InfoBox badgeIcon={BookOpen} badgeLabel="ידע מקצועי יישומי" title="המגזינים וחוברות הלימוד בתחום הסייבר">
            <p>
              כחלק מעשייתי להפצת ידע טכנולוגי מעשי, אני מוציא לאור חוברות ומדריכים מקצועיים המשלבים בין תיאוריה, תרגול בשטח ואזהרות אבטחה עדכניות:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              {[
                { icon: Terminal, title: 'מדריכי הקשחה ונהלי עבודה', desc: 'צעד-אחר-צעד להגדרת מערכות הפעלה, ציוד תקשורת וסביבות ענן.' },
                { icon: Cpu, title: 'סייבר בשילוב AI', desc: 'ניתוח איומים מבוססי בינה מלאכותית ודרכי ההתגוננות בפועל.' },
                { icon: AlertTriangle, title: 'תרחישים מעשיים', desc: 'ניתוח אירועי אמת, זיהוי כשלים ואופן הטיפול בהם.' },
              ].map((item) => (
                <div key={item.title} className="bg-black/30 border border-white/5 rounded-xl p-4">
                  <item.icon className="w-5 h-5 text-brand-400 mb-2" />
                  <strong className="block text-white text-sm mb-1">{item.title}</strong>
                  <span className="block text-zinc-400 text-sm leading-relaxed">{item.desc}</span>
                </div>
              ))}
            </div>
          </InfoBox>

          <SectionHeading icon={Send} title="צור קשר והתחלה" description="ייעוץ אבטחה ראשוני או קבלת חוברות ההדרכה והמגזינים" />
          <UnifiedCta
            mailSubject="ייעוץ אבטחת סייבר ורשתות"
            whatsappMessage="שלום דניאל, אשמח לייעוץ ראשוני בנושא אבטחת סייבר ורשתות עבור הארגון שלי."
          />
        </div>
      </div>
    </div>
  );
}
