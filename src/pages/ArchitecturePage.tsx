import {
  ShieldCheck,
  User,
  Layers,
  Bot,
  Database,
  KeyRound,
  Radar,
  Server,
  MessageSquare,
  Mail,
  Send,
  ShieldAlert,
  Target,
  Workflow,
  LifeBuoy,
} from 'lucide-react';
import {
  PageHero,
  SectionHeading,
  ServiceGrid,
  InfoBox,
  SpecTable,
  AudienceGrid,
  UnifiedCta,
} from '../components/content/ContentPrimitives';
import ZeroTrustFlowchart from '../components/content/ZeroTrustFlowchart';

export default function ArchitecturePage() {
  return (
    <div id="page-top" className="min-h-screen pt-24 md:pt-28">
      <div className="container mx-auto px-6 max-w-4xl">
        <PageHero
          badgeIcon={ShieldCheck}
          badgeLabel="Zero-Trust AI Defense Architecture"
          title="תרשים ארכיטקטורת הגנה ופריסת AI"
          subtitle="ארבע שכבות הגנה ברמה ארגונית — משכבת ההיקף ועד לתגובה אוטומטית בזמן אמת"
          metaChips={[
            { icon: User, label: 'מאת: דניאל' },
            { icon: KeyRound, label: 'Zero-Trust • IAM • SASE' },
            { icon: Bot, label: 'Guardian Agents & Monitoring' },
          ]}
        />

        <div className="pt-10">
          <InfoBox badgeIcon={Layers} badgeLabel="תפיסת הארכיטקטורה" title="הגנה מדורגת בעולם שבו גם ה-AI צריך שומרים">
            <p>
              ארגון שמטמיע AI ברצינות לא יכול להסתפק בחומת אש בהיקף הרשת. <strong className="text-white">כל בקשת גישה</strong> — של משתמש, מערכת או סוכן AI — נבחנת מחדש בזמן אמת, ללא הנחת אמון מובנית, גם עבור זרימות שכבר נמצאות בתוך הרשת הארגונית.
            </p>
            <p>
              הארכיטקטורה שלהלן היא תמצית שיטת העבודה שלי: ארבע שכבות שמתחברות זו לזו — היקף וזהות, תזמור סוכני AI, נתונים ומודלים, ותגובה וניטור — כך שכל שכבה מגבה את הבאה אחריה.
            </p>
          </InfoBox>

          <SectionHeading icon={ShieldAlert} title="ארבע שכבות ההגנה" description="פירוט מלא של כל שכבה — הרכיבים הטכנולוגיים ותפקידה בשרשרת ההגנה" />
          <ServiceGrid
            items={[
              { icon: KeyRound, title: 'שכבת היקף וזהות (Perimeter & Identity)', description: 'Zero-Trust Gateway, IAM/Entra ID ו-SASE — כל בקשת גישה מאומתת מחדש בזמן אמת, ללא הנחת אמון מובנית.' },
              { icon: Bot, title: 'שכבת תזמור סוכני AI (Agent Orchestration)', description: 'Multi-Agent Orchestration עם Guardian Agents המפקחים על היקף הפעולה, כדי שאוטומציה תישאר בטוחה ומבוקרת בקנה מידה ארגוני.' },
              { icon: Database, title: 'שכבת נתונים ומודלים (Data & Models)', description: 'RAG Enterprise Knowledge מאובטח, הגנה מפני הזרקת פרומפטים (Prompt Security), והערכת ביצועים שוטפת (Model Evaluation).' },
              { icon: Radar, title: 'שכבת תגובה וניטור (Response & Monitoring)', description: 'EDR/XDR עם ניטור רציף 24/7, זיהוי אנומליות ותגובה אוטומטית ראשונית לצמצום חלון הזמן בין חדירה לבידוד.' },
            ]}
          />

          <SectionHeading icon={Workflow} title="מסלול בקשת גישה — Zero-Trust Flowchart" description="לחצו על כל שלב כדי לראות בדיוק מה קורה בו, מרגע כניסת הבקשה ועד ההחלטה הסופית" />
          <ZeroTrustFlowchart />

          <SectionHeading icon={LifeBuoy} title="SLA ועמידות ברמה ארגונית" description="סטנדרטים מחייבים לזמינות, התאוששות ותגובה לאירועים — לא הבטחות שיווקיות" />
          <SpecTable
            rows={[
              { label: 'זמינות מערכת (Uptime SLA)', value: <><strong className="text-white">99.99%</strong> — עד כ-52 דקות השבתה מצטברת בשנה</> },
              { label: 'RTO — זמן התאוששות מרבי', value: <>פחות מ-<strong className="text-white">15 דקות</strong> לחזרה לפעילות מלאה לאחר תקלה</> },
              { label: 'RPO — אובדן נתונים מרבי', value: <>פחות מ-<strong className="text-white">5 דקות</strong> של נתונים, בזכות גיבוי רציף</> },
              { label: 'זמן תגובה לאירוע קריטי', value: <>עד <strong className="text-white">30 דקות</strong> ממועד הזיהוי ועד תחילת טיפול אנושי</> },
              { label: 'מדיניות גיבוי', value: 'עותק 3-2-1 — שלושה עותקים, שני סוגי מדיה, עותק אחד מחוץ לאתר' },
              { label: 'עדכוני אבטחה', value: 'טלאי קריטי מוטמע תוך 72 שעות ממועד פרסום ה-CVE' },
              { label: 'רזילנטיות תשתית', value: 'Multi-AZ עם Auto Failover — ללא נקודת כשל בודדת (Single Point of Failure)' },
            ]}
          />

          <SectionHeading icon={Target} title="נתוני שוק לשנת 2026" description="למה ארגונים משקיעים כעת בארכיטקטורת Zero-Trust ו-Agentic AI" />
          <SpecTable
            rows={[
              { label: 'אימוץ Zero-Trust', value: <><strong className="text-white">81%</strong> מהארגונים מתכננים ליישם Zero-Trust במהלך 2026</> },
              { label: 'סוכני AI ייעודיים', value: <><strong className="text-white">40%</strong> מהאפליקציות הארגוניות צפויות לשלב סוכני AI ייעודיים</> },
              { label: 'צמיחת שוק Agentic AI', value: <>קפיצה של <strong className="text-white">פי 4</strong> מ-2025 ל-2026 (7.6B➜10.8B$)</> },
              { label: 'רכיבי הליבה', value: 'IAM, Micro-Segmentation, Guardian Agents, RAG מאובטח, EDR/XDR' },
            ]}
          />

          <SectionHeading icon={Server} title="למי הארכיטקטורה מתאימה?" description="מענה לארגונים בכל שלב של הטמעת AI וסייבר" />
          <AudienceGrid
            items={[
              { tag: '01 // ENTERPRISE', title: '1. ארגונים המטמיעים AI', description: 'חברות שמריצות או מתכננות סוכני AI אוטונומיים בתהליכים עסקיים ורוצות לוודא שהם פועלים בגבולות בטוחים.' },
              { tag: '02 // SECURITY TEAMS', title: '2. צוותי אבטחת מידע', description: 'צוותים שרוצים לעדכן את ארכיטקטורת ההגנה שלהם לעידן שבו גם AI הוא וקטור תקיפה פוטנציאלי.' },
              { tag: '03 // REGULATED SECTORS', title: '3. מגזרים מפוקחים', description: 'ארגונים הכפופים לרגולציה (פיננסים, בריאות) הזקוקים לתיעוד ובקרה מלאה על כל פעולת AI.' },
            ]}
          />

          <SectionHeading icon={Send} title="צור קשר והתחלה" description="מיפוי ארכיטקטורת ההגנה הקיימת בארגון שלכם" />
          <UnifiedCta
            mailSubject="התאמת ארכיטקטורת הגנה ופריסת AI"
            whatsappMessage="שלום דניאל, אשמח למיפוי ארכיטקטורת ההגנה הקיימת אצלנו ובחינת פערים מול Zero-Trust."
          />
        </div>
      </div>
    </div>
  );
}
