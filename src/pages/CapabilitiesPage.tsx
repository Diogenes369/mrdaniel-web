import { LayoutGrid, User, Layers, Send, Inbox, Brain, Wrench, CheckCircle2, FileOutput, Blocks, ShieldCheck, Database, Cloud, Workflow, Bot } from 'lucide-react';
import { PageHero, SectionHeading, InteractiveServiceGrid, SpecTable, UnifiedCta } from '../components/content/ContentPrimitives';
import LiveSimulation from '../components/content/LiveSimulation';
import CapabilityMatrix from '../components/CapabilityMatrix';

export default function CapabilitiesPage() {
  return (
    <div id="page-top" className="min-h-screen pt-24 md:pt-28">
      <div className="container-wide">
        <PageHero
          badgeIcon={LayoutGrid}
          badgeLabel="Full Capability & Technology Matrix"
          title="מטריצת יכולות וטכנולוגיות"
          subtitle="18 יכולות מפורטות בשלושה תחומים — AI, סייבר ופיתוח — עם ערך עסקי, מתודולוגיה, סטאק ו-ROI"
          metaChips={[
            { icon: User, label: 'מאת: דניאל' },
            { icon: Layers, label: 'AI • Cyber • Dev' },
          ]}
        />

        <div className="pt-10">
          <SectionHeading icon={Brain} title="הדגמה חיה: סוכן AI מטפל בבקשה" description="כך נראית פעולה בודדת של סוכן AI אוטונומי, מרגע קבלת הבקשה ועד הדיווח על תוצאה" />
          <LiveSimulation
            title="Live Agent Task Simulation"
            description="סימולציה של סוכן AI המבצע משימה עסקית מקצה לקצה — תכנון, הפעלת כלים ואימות לפני דיווח לאדם."
            steps={[
              { icon: Inbox, label: 'קבלת בקשה', detail: 'הסוכן מקבל משימה עסקית (למשל: פנייה של לקוח או עדכון במערכת פנימית).' },
              { icon: Brain, label: 'תכנון', detail: 'פירוק המשימה לשלבי ביצוע וקביעת סדר פעולות מיטבי.' },
              { icon: Wrench, label: 'הפעלת כלי (Tool Call)', detail: 'קריאה למערכת חיצונית דרך MCP — CRM, מסד נתונים, או API ייעודי.' },
              { icon: CheckCircle2, label: 'אימות תוצאה', detail: 'Guardian Agent בודק שהתוצאה עומדת במדיניות העסקית לפני שהיא מאושרת.' },
              { icon: FileOutput, label: 'דיווח', detail: 'הסוכן מדווח על התוצאה, ומעביר לאדם רק כשבאמת נדרש אישור.' },
            ]}
          />
        </div>
      </div>

      <CapabilityMatrix />

      <div className="container-wide">
        <div className="pt-4">
          <SectionHeading
            icon={Blocks}
            title="ארכיטקטורות ייחוס (Reference Architecture Patterns)"
            description="דפוסי ארכיטקטורה חוזרים שמאחורי היכולות במטריצה למעלה — לא תיאוריה, אלא המבנה בפועל שכל פרויקט ארגוני נשען עליו"
          />
          <InteractiveServiceGrid
            items={[
              {
                icon: ShieldCheck,
                title: 'Zero-Trust + Agentic AI Reference Architecture',
                description: 'שילוב שכבת הזהות/Zero-Trust עם שכבת תזמור סוכני ה-AI, כך שכל פעולה של סוכן עוברת אימות זהות ואכיפת מדיניות בדיוק כמו משתמש אנושי — לא ערוץ צד נפרד וחסר בקרה.',
              },
              {
                icon: Database,
                title: 'Enterprise RAG Pipeline',
                description: 'אינדוקס מסמכים ← Embeddings ← Retrieval היברידי ← הטמעה מבוססת-מקור (Grounding) במודל השפה, עם אכיפת הרשאות ברמת המסמך — כך שסוכן AI לעולם לא "רואה" מידע שהמשתמש ששאל אותו לא היה מורשה לראות בעצמו.',
              },
              {
                icon: Cloud,
                title: 'Multi-Cloud High-Availability Pattern',
                description: 'פריסה מבוזרת Multi-AZ / Multi-Region עם Auto Failover, תשתית-כקוד (IaC) לשחזור סביבה מלא תוך דקות, ו-Circuit Breakers בין שירותים כדי שתקלה מקומית לא תתפשט למערכת כולה.',
              },
              {
                icon: Workflow,
                title: 'Event-Driven Microservices',
                description: 'תקשורת א-סינכרונית מבוססת אירועים בין שירותים עצמאיים — מאפשרת קנה מידה עצמאי לכל שירות וגמישות פיתוח בין צוותים בלי תלות הדוקה בין רכיבים.',
              },
              {
                icon: Bot,
                title: 'Guardian-Gated Automation Pattern',
                description: 'כל פעולה אוטומטית — סוכן AI, סקריפט מתוזמן או Webhook — עוברת דרך שכבת Guardian שבודקת מדיניות לפני ביצוע בפועל, לא רק תיעוד אחרי מעשה.',
              },
            ]}
          />

          <SectionHeading
            icon={Layers}
            title="סטאק טכנולוגי מלא לפי תחום"
            description="תמונה מרוכזת של הכלים והפלטפורמות בשימוש בפועל — פירוט נוסף לכל יכולת זמין בכרטיסים למעלה"
          />
          <SpecTable
            rows={[
              { label: 'בינה מלאכותית (AI)', value: <>LangGraph, MCP Protocol, Vector DB, Embeddings, Hybrid Search, Prompt Caching, <strong className="text-white">Eval Harness</strong></> },
              { label: 'סייבר', value: <>Zero-Trust, IAM / Entra ID, SASE, XDR, EDR, CSPM, <strong className="text-white">IR Playbooks & BCP/DRP</strong></> },
              { label: 'פיתוח וענן', value: <>React, TypeScript, Node.js/Express, AWS/Azure, Infrastructure as Code, <strong className="text-white">CI/CD Blue-Green</strong></> },
              { label: 'Web3', value: 'Solidity, Smart Contracts, dApps, Wallet Integration, Audit לפני Deployment' },
            ]}
          />

          <SectionHeading icon={Send} title="צור קשר והתחלה" description="התאמת הטכנולוגיות והיכולות המתאימות ביותר לארגון שלכם" />
          <UnifiedCta
            mailSubject="התאמת מטריצת יכולות לעסק"
            whatsappMessage="שלום דניאל, אשמח לשיחה על התאמת היכולות מהמטריצה (AI / סייבר / פיתוח) לארגון שלי."
          />
        </div>
      </div>
    </div>
  );
}
