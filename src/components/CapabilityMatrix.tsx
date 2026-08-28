import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Bot, ShieldAlert, Code2, X, TrendingUp, Layers, Wrench, Target, ArrowLeft, Lightbulb } from 'lucide-react';
import { useSectionDissolve } from '../hooks/useSectionDissolve';
import WebButton from './WebButton';
import ModalHeaderBanner from './ModalHeaderBanner';

type CategoryId = 'ai' | 'cyber' | 'dev';

const CATEGORIES: { id: CategoryId; label: string; icon: typeof Bot }[] = [
  { id: 'ai', label: 'בינה מלאכותית', icon: Bot },
  { id: 'cyber', label: 'סייבר', icon: ShieldAlert },
  { id: 'dev', label: 'פיתוח', icon: Code2 },
];

interface Capability {
  label: string;
  businessValue: string;
  benefit: string;
  methodology: string;
  stack: string[];
  roi: string;
}

const CAPABILITIES: Record<CategoryId, Capability[]> = {
  ai: [
    {
      label: 'Agentic AI ותזמור רב-סוכני',
      businessValue: 'צוות דיגיטלי שעובד לבד 24/7 — מבצע משימות שגרתיות באופן עצמאי, ומשחרר את הצוות שלכם להתמקד בדברים החשובים באמת.',
      benefit: 'בניית צוותי סוכני AI אוטונומיים המבצעים משימות עסקיות מורכבות מקצה לקצה — משחרור זמן ניהולי יקר ועד קיצור זמני תגובה לפניות לקוחות מימים לדקות.',
      methodology: 'ארכיטקטורת Multi-Agent Orchestration עם היררכיית Guardian Agents לפיקוח, הפרדת תפקידים בין סוכני תכנון, ביצוע ואימות, ומנגנוני Fallback אנושיים בנקודות החלטה קריטיות.',
      stack: ['LangGraph', 'MCP Protocol', 'Vector DB', 'Guardian Agents'],
      roi: 'ארגונים שהטמיעו תזמור רב-סוכני דיווחו על קיצור של 40-60% בזמן טיפול בתהליכים חוזרים תוך 3-6 חודשי הטמעה.',
    },
    {
      label: 'RAG וניהול ידע ארגוני',
      businessValue: 'כל הידע של הארגון זמין תוך שנייה לכל עובד ולקוח — פחות זמן חיפוש, תשובות מדויקות יותר, ושירות לקוחות מהיר יותר.',
      benefit: 'הנגשת מלוא הידע הארגוני הפזור במסמכים, מיילים ומערכות CRM לצוותים ולסוכני AI בזמן אמת, ללא הזיות (Hallucinations) ותוך שמירה על מקור אמת אחד.',
      methodology: 'אינדוקס סמנטי של מאגרי הידע באמצעות Embeddings, Chunking מותאם לסוג המסמך, ו-Retrieval היברידי (סמנטי + מילות מפתח) לשיפור דיוק השליפה.',
      stack: ['Vector DB', 'Embeddings', 'Hybrid Search', 'LLM Grounding'],
      roi: 'צמצום זמן איתור מידע פנימי בכ-70%, ושיפור מובהק בדיוק תשובות שירות הלקוחות והתמיכה הפנים-ארגונית.',
    },
    {
      label: 'MCP Protocol',
      businessValue: 'כמו שקע חשמל אוניברסלי לכלי AI — מחברים מערכת אחת לכל הכלים הקיימים בלי לבנות כל חיבור מאפס, וחוסכים עלויות פיתוח.',
      benefit: 'חיבור אחיד וסטנדרטי בין סוכני ה-AI לכלים, מסדי נתונים ומערכות ארגוניות קיימות — ללא צורך בפיתוח אינטגרציה ייעודית לכל כלי בנפרד.',
      methodology: 'מימוש שרתי MCP ייעודיים סביב מערכות הליבה של הארגון (CRM, ERP, מסדי נתונים), עם שכבת הרשאות granular וניטור קריאות כלים.',
      stack: ['MCP Servers', 'Tool Calling', 'API Gateway', 'Access Control'],
      roi: 'קיצור זמן פיתוח אינטגרציות חדשות לסוכני AI בכ-50%, והפחתת עלויות תחזוקה לאורך זמן.',
    },
    {
      label: 'Guardian Agents & Governance',
      businessValue: 'בקרת איכות אוטומטית שמוודאת שה-AI לא "יוצא משליטה" — מאפשרת להשתמש בבינה מלאכותית בביטחון גם בתהליכים עסקיים קריטיים.',
      benefit: 'שכבת פיקוח ובקרה עצמאית המוודאת שסוכני ה-AI פועלים בגבולות המדיניות העסקית והרגולטורית, ומונעת פעולות בלתי-מבוקרות לפני שהן מתבצעות.',
      methodology: 'סוכן-על (Guardian) הבוחן כל פעולה יזומה מול מדיניות עסקית מוגדרת מראש, עם יומני ביקורת (Audit Trail) מלאים ומנגנון עצירת חירום (Kill Switch).',
      stack: ['Policy Engine', 'Audit Logging', 'Prompt Security', 'Human-in-the-Loop'],
      roi: 'הפחתה משמעותית בסיכון תפעולי ורגולטורי, ומעבר בטוח יותר להטמעת AI אוטונומי בתהליכים רגישים.',
    },
    {
      label: 'Prompt Caching ואופטימיזציית עלויות',
      businessValue: 'אותה איכות שירות AI, בפחות כסף — התאמה חכמה שחותכת עלויות תפעול חודשיות באופן משמעותי.',
      benefit: 'הפחתה דרמטית בעלויות התפעול השוטפות של מערכות AI ארגוניות תוך שמירה על איכות תגובה זהה — קריטי בקנה מידה של אלפי קריאות ביום.',
      methodology: 'מיפוי הפרומפטים החוזרים במערכת, שימוש ב-Prompt Caching ברמת ה-API, ובחירת המודל האופטימלי לכל משימה (Model Routing) לפי מורכבות.',
      stack: ['Prompt Caching', 'Model Routing', 'Token Budgeting', 'Cost Monitoring'],
      roi: 'חיסכון תיעודי של 30-70% בעלויות ה-API החודשיות במערכות בעומס גבוה.',
    },
    {
      label: 'הערכת ביצועי מודלים (Evals)',
      businessValue: 'בדיקת איכות לפני שהלקוח רואה תקלה — מונעת נזק לשירות ולמוניטין לפני שהוא בכלל קורה.',
      benefit: 'מדידה אובייקטיבית ומתמשכת של איכות תשובות מערכת ה-AI — לפני שינוי מגיע לפרודקשן ולא אחרי שהלקוח כבר נתקל בבעיה.',
      methodology: 'בניית מערכי Evals ייעודיים לתהליכי הליבה של הארגון, בדיקות רגרסיה אוטומטיות בכל שינוי פרומפט או מודל, ומדדי איכות כמותיים.',
      stack: ['Eval Harness', 'Regression Testing', 'LLM-as-Judge', 'Quality Metrics'],
      roi: 'מניעת תקלות בפרודקשן לפני שהן פוגעות בלקוחות, וקיצור מחזור השיפור של מערכת ה-AI.',
    },
  ],
  cyber: [
    {
      label: 'ארכיטקטורת Zero-Trust',
      businessValue: 'כל גישה למערכת נבדקת מחדש, תמיד — גם אם תוקף הצליח לחדור, הוא לא יכול לזוז חופשי ברשת ולגרום נזק רחב.',
      benefit: 'ביטול ההנחה ש"פנים הרשת בטוח" — כל בקשת גישה מאומתת ומאושרת בנפרד, מה שחוסם תנועה רוחבית של תוקף שכבר חדר לרשת.',
      methodology: 'מיפוי משטח התקיפה המלא, אימות מתמיד ("Never Trust, Always Verify"), Micro-Segmentation בין מקטעי רשת, ואכיפת עקרון ה-Least Privilege בכל הרשאה.',
      stack: ['IAM', 'Micro-Segmentation', 'MFA', 'Policy Enforcement Points'],
      roi: 'צמצום דרמטי במשטח התקיפה והגבלת נזק פוטנציאלי גם במקרה של פריצה ראשונית מוצלחת.',
    },
    {
      label: 'SASE & XDR',
      businessValue: 'הגנה אחידה על העובדים בין אם הם במשרד או מהבית — פחות כלים נפרדים לתחזק, פחות עלויות רישוי, יותר שליטה.',
      benefit: 'איחוד אבטחת הרשת והאבחון בפלטפורמה אחת מבוססת ענן — הגנה עקבית לעובדים מרוחקים כמו לעובדים במשרד, וזיהוי איומים חוצה-שכבות.',
      methodology: 'פריסת ארכיטקטורת SASE (SD-WAN + אבטחת ענן) יחד עם XDR לאיסוף וקורלציית אירועים מ-Endpoint, רשת וענן במקום מרכזי אחד.',
      stack: ['SASE', 'XDR', 'SD-WAN', 'Threat Correlation'],
      roi: 'קיצור זמן זיהוי ותגובה לאירוע אבטחה (MTTD/MTTR) באופן משמעותי, ואיחוד עלויות רישוי מספר כלים נפרדים.',
    },
    {
      label: 'IAM / Entra ID',
      businessValue: 'שליטה מדויקת מי ניגש למה — מונעת את הסיבה הנפוצה ביותר לפריצות: הרשאות עודפות שאף אחד לא זוכר למה בכלל ניתנו.',
      benefit: 'שליטה מדויקת במי ניגש למה, מתי ומאיזה מכשיר — הבסיס לכל אסטרטגיית Zero-Trust ולציות לתקנות כמו ISO 27001 ו-GDPR.',
      methodology: 'עיצוב מדיניות RBAC/ABAC מדורגת, אכיפת MFA אדפטיבי לפי רמת סיכון, וסקירות הרשאות תקופתיות (Access Reviews) אוטומטיות.',
      stack: ['Entra ID', 'RBAC/ABAC', 'Conditional Access', 'MFA'],
      roi: 'הפחתת חשבונות עם הרשאות עודפות (Over-Privileged Accounts) — אחד מווקטורי התקיפה הנפוצים ביותר בפריצות ארגוניות.',
    },
    {
      label: 'הקשחת Endpoint ו-EDR',
      businessValue: 'כל מחשב בארגון הופך לחיישן אזעקה במקום לחור באבטחה — תקלה מתגלה ונעצרת לפני שהיא מתפשטת לכל הרשת.',
      benefit: 'כל תחנת קצה הופכת לנקודת בקרה פעילה במקום חוליה חלשה — זיהוי והכלה של פעילות זדונית לפני שהיא מתפשטת ברשת.',
      methodology: 'הקשחת מדיניות מערכת ההפעלה לפי בנצ׳מארקים מוכרים (CIS), פריסת EDR עם זיהוי התנהגותי, ותהליכי Patch Management שוטפים.',
      stack: ['EDR', 'CIS Hardening', 'Patch Management', 'Behavioral Detection'],
      roi: 'צמצום חלון החשיפה לנוזקות Zero-Day והפחתת זמן ההכלה מגילוי אירוע ועד נטרולו.',
    },
    {
      label: 'אבטחת ענן Cloud-Native',
      businessValue: 'תצורת ענן שגויה היא הסיבה הנפוצה ביותר לדליפות מידע — שכבה זו תופסת ומתקנת טעויות כאלה לפני שמישהו מנצל אותן.',
      benefit: 'הגנה על סביבות ענן דינמיות שמשתנות מדי יום — קונטיינרים, Serverless ותשתית-כקוד — במקום מדיניות אבטחה סטטית שלא מתאימה למציאות הענן.',
      methodology: 'סריקת תצורה רציפה (CSPM), הקשחת IAM ענני לפי Least Privilege, וסריקת פגיעויות בצינור ה-CI/CD לפני עלייה לפרודקשן.',
      stack: ['CSPM', 'IaC Scanning', 'Cloud IAM', 'Container Security'],
      roi: 'זיהוי וסגירת תצורות שגויות (Misconfigurations) — הגורם המוביל לדליפות מידע מסביבות ענן — עוד לפני שהן מנוצלות.',
    },
    {
      label: 'תגובה לאירועים ו-BCP/DRP',
      businessValue: 'תוכנית מוכנה מראש הופכת אירוע פריצה מהשבתה של ימים להשבתה של שעות — וזה ההבדל בין תקלה לאסון עסקי.',
      benefit: 'מוכנות מבצעית של ממש למקרה פריצה או תקלה קריטית — ההבדל בין השבתה של שעות לבין השבתה של ימים שעולה לארגון מיליונים.',
      methodology: 'בניית תוכנית IR מפורטת עם תרחישי תקיפה ריאליים, תרגולי Tabletop תקופתיים, ותוכניות המשכיות עסקית והתאוששות מאסון (BCP/DRP) מתועדות ומתורגלות.',
      stack: ['IR Playbooks', 'Tabletop Exercises', 'BCP/DRP', 'Forensics Readiness'],
      roi: 'קיצור משמעותי בזמן ההתאוששות מאירוע (RTO) והפחתת הנזק הכספי והתדמיתי הכרוך בו.',
    },
  ],
  dev: [
    {
      label: 'Full-Stack (React / Node)',
      businessValue: 'אתר ומערכת מהירים ועקביים מקצה לקצה — פחות באגים, פחות זמן פיתוח, ויותר לקוחות שמשלימים רכישה בלי להיתקע.',
      benefit: 'מוצר דיגיטלי אחד עקבי מקצה לקצה — ממשק משתמש מהיר וחוויתי מחובר לשרת יציב וסקיילבילי, בלי חיכוכים בין צוותי Frontend ל-Backend כי מדובר באותו ארכיטקט.',
      methodology: 'React עם ניהול State מודרני וטעינה עצלה (Code Splitting), Node.js/Express בצד השרת עם שכבת API מתועדת, ובדיקות אוטומטיות לאורך כל הפייפליין.',
      stack: ['React', 'Node.js / Express', 'TypeScript', 'Vite'],
      roi: 'זמן פיתוח פיצ׳רים מקוצר ותחזוקה זולה יותר לאורך חיי המוצר, בזכות בסיס קוד אחיד ומתועד.',
    },
    {
      label: 'Web3 וחוזים חכמים',
      businessValue: 'כניסה בטוחה לעולם הבלוקצ׳יין — טעות אחת בקוד של חוזה חכם יכולה לעלות הון, ולכן אבטחה כאן היא לא אופציה.',
      benefit: 'כניסה בטוחה ומקצועית לעולם הבלוקצ׳יין — מאפליקציות מבוזרות (dApps) ועד טוקניזציה של נכסים — עם דגש על אבטחת החוזים החכמים לפני עלייה לרשת הראשית.',
      methodology: 'פיתוח חוזים חכמים לפי דפוסי אבטחה מוכרים (OpenZeppelin), בדיקות יחידה ואודיט קוד לפני Deployment, ואינטגרציה עם ארנקים וספריות Web3 מובילות.',
      stack: ['Solidity', 'Smart Contracts', 'dApps', 'Wallet Integration'],
      roi: 'מניעת פגיעויות אבטחה קריטיות בחוזים חכמים — תחום שבו טעות קוד אחת עלולה לעלות לארגון מיליוני דולרים.',
    },
    {
      label: 'ארכיטקטורת ענן (AWS / Azure)',
      businessValue: 'משלמים רק על מה שבאמת משתמשים בו, והמערכת גדלה אוטומטית עם העומס — בלי לשלם מראש על תשתית מיותרת.',
      benefit: 'תשתית שגדלה עם העסק במקום להגביל אותו — סקיילביליות אוטומטית, זמינות גבוהה, ועלויות תשתית משולמות רק לפי שימוש בפועל.',
      methodology: 'עיצוב ארכיטקטורה Cloud-Native עם שירותים מנוהלים, תשתית-כקוד (IaC) לפריסה חוזרת ועקבית, ואסטרטגיית Multi-AZ להבטחת זמינות.',
      stack: ['AWS / Azure', 'Infrastructure as Code', 'Auto Scaling', 'Multi-AZ'],
      roi: 'הפחתת עלויות תשתית תוך שיפור זמינות השירות, והתאמה אוטומטית לעומסים משתנים ללא התערבות ידנית.',
    },
    {
      label: 'CI/CD ו-DevOps',
      businessValue: 'כל עדכון עולה לאתר במהירות ובביטחון, בלי פריסות ידניות שעלולות להפיל את המערכת בדיוק בשעת שיא.',
      benefit: 'כל שינוי קוד מגיע לפרודקשן בביטחון ובמהירות — במקום פריסות ידניות מלחיצות ומועדות לטעויות אנוש.',
      methodology: 'צינור CI/CD אוטומטי הכולל בדיקות, סריקת אבטחה (SAST/DAST) ו-Deployment הדרגתי (Blue-Green / Canary), עם Rollback אוטומטי במקרה כשל.',
      stack: ['CI/CD Pipelines', 'IaC', 'Blue-Green Deployment', 'Automated Testing'],
      roi: 'קיצור זמן ה-Time-to-Market לפיצ׳רים חדשים והפחתה משמעותית בתקלות פרודקשן הנובעות מפריסות ידניות.',
    },
    {
      label: 'API ומיקרו-שירותים',
      businessValue: 'תקלה בחלק אחד לא מפילה את כל המערכת — וצוותים יכולים לפתח ולשחרר במקביל בלי לחכות אחד לשני.',
      benefit: 'ארכיטקטורה מודולרית שמאפשרת לצוותים שונים לפתח ולשחרר במקביל, ולמערכת לגדול ולהתרחב בלי לשבור פונקציונליות קיימת.',
      methodology: 'פירוק לוגי לשירותים עצמאיים לפי גבולות עסקיים (Domain-Driven Design), תיעוד API סטנדרטי (OpenAPI), ותקשורת א-סינכרונית בין שירותים במקומות הרלוונטיים.',
      stack: ['Microservices', 'REST / GraphQL', 'API Gateway', 'Message Queues'],
      roi: 'גמישות פיתוח גבוהה יותר וזמן השבתה מופחת — תקלה בשירות אחד לא מפילה את כל המערכת.',
    },
    {
      label: 'אופטימיזציית ביצועים',
      businessValue: 'כל שנייה של האטה עולה בלקוחות פוטנציאליים — אתר מהיר יותר משמעותו יותר המרות ויותר הכנסות, בלי לשנות דבר אחר.',
      benefit: 'אתר ואפליקציה מהירים משמעותית משפרים המרות, דירוג במנועי חיפוש וחוויית משתמש — כל שנייה של השהייה עולה בלקוחות פוטנציאליים.',
      methodology: 'פרופיילינג ביצועים בצד השרת והלקוח, אופטימיזציית שאילתות מסד נתונים, Code Splitting וטעינה עצלה, ואסטרטגיית Caching רב-שכבתית.',
      stack: ['Performance Profiling', 'Caching Strategy', 'Code Splitting', 'CDN'],
      roi: 'שיפור מדיד בזמני טעינה ובמדדי Core Web Vitals, המתורגם ישירות לשיעורי המרה גבוהים יותר.',
    },
  ],
};

export default function CapabilityMatrix() {
  const dissolveRef = useSectionDissolve<HTMLElement>();
  const [active, setActive] = useState<CategoryId>('ai');
  const [selected, setSelected] = useState<Capability | null>(null);

  const handleContactClick = () => {
    setSelected(null);
    window.dispatchEvent(new CustomEvent('open-lead-modal', { detail: { subject: selected?.label || 'מטריצת יכולות', sourceSection: selected?.label || 'Capability Matrix' } }));
  };

  return (
    <section id="matrix" ref={dissolveRef} className="py-20 md:py-32 border-t border-white/5 relative overflow-hidden">
      <div className="container-wide">
        <motion.div
          className="text-center mb-12"
        >
          <h2 className="font-display text-fluid-h2 font-black text-white mb-5">
            מטריצת <span className="text-brand-500">יכולות וטכנולוגיות</span>
          </h2>
          <p className="text-zinc-300 text-base md:text-lg max-w-2xl mx-auto leading-relaxed [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">
            סנן לפי תחום, ולחצו על כל כרטיס כדי לראות ערך עסקי, מתודולוגיה, סטאק טכנולוגי ו-ROI בפועל.
          </p>
        </motion.div>

        <div className="flex items-center justify-center gap-3 mb-10 flex-wrap">
          {CATEGORIES.map((cat) => {
            const isActive = active === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActive(cat.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full border text-sm font-bold transition-colors min-h-11 ${
                  isActive
                    ? 'bg-brand-500 border-brand-500 text-black'
                    : 'bg-carbon-900/60 border-white/10 text-zinc-300 hover:border-brand-500/40'
                }`}
              >
                <cat.icon className="w-4 h-4" />
                {cat.label}
              </button>
            );
          })}
        </div>

        <div className="max-w-4xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3"
            >
              {CAPABILITIES[active].map((item, idx) => (
                <motion.button
                  key={item.label}
                  type="button"
                  onClick={() => setSelected(item)}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.04, duration: 0.3 }}
                  className="relative overflow-hidden bg-[#0D0E12] border border-white/10 rounded-xl px-4 py-3.5 min-h-11 text-right transition-all duration-500 hover:border-[#76B900]/50 hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_rgba(118,185,0,0.2)] cursor-pointer"
                >
                  <span className="block text-sm text-[#F1F5F9] font-medium mb-1.5">{item.label}</span>
                  <span className="block text-xs text-zinc-400 leading-relaxed line-clamp-2">{item.businessValue}</span>
                </motion.button>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="text-center mt-12">
          <p className="text-zinc-400 text-base mb-4">רוצים להתאים את הטכנולוגיות האלו לארגון שלכם?</p>
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent('open-lead-modal', { detail: { subject: 'התאמת ארכיטקטורה טכנולוגית לעסק', sourceSection: 'Capability Matrix CTA' } })
              )
            }
            className="group inline-flex items-center gap-2 text-white font-medium pb-1.5 border-b border-white/30 hover:border-brand-400 hover:text-brand-400 transition-colors text-sm"
          >
            שיחת ייעוץ קצרה להתאמת הארכיטקטורה לעסק
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          </button>
        </div>
      </div>

      {createPortal(
        <AnimatePresence>
        {selected && (
          <div className="fixed inset-0 z-[100] flex justify-center items-end md:items-center px-4 md:px-0 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
              className="absolute inset-0 bg-black/90"
            />
            <motion.div
              initial={{ opacity: 0, y: 60, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 60, scale: 0.96 }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className="relative w-full max-w-lg max-h-[90vh] flex flex-col bg-[#0b0c10] border border-white/15 shadow-[0_30px_80px_rgba(0,0,0,0.9)] rounded-3xl overflow-hidden"
            >
              <div className="relative bg-[#0D0E12] border-b border-white/10">
                <ModalHeaderBanner />
                <button
                  onClick={() => setSelected(null)}
                  className="absolute top-4 left-4 w-11 h-11 flex items-center justify-center bg-black/40 backdrop-blur-sm text-zinc-300 hover:text-white rounded-full hover:bg-black/60 transition-colors"
                  aria-label="סגירה"
                >
                  <X size={18} />
                </button>
                <div className="relative -mt-7 md:-mt-8 px-6 md:px-8 pb-4">
                  <div className="flex items-center gap-2.5 mb-1 pl-14">
                    <span className="w-2 h-2 rounded-full bg-brand-400 shadow-[0_0_8px_rgba(0,255,102,0.8)] shrink-0" aria-hidden="true" />
                    <h3 className="font-display font-black text-xl md:text-2xl text-white">{selected.label}</h3>
                  </div>
                </div>
              </div>

              <div className="p-6 md:p-8 overflow-y-auto flex-1 momentum-scroll space-y-6">
                <div className="bg-brand-500/10 border border-brand-500/25 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2 text-brand-400 font-bold text-sm">
                    <Lightbulb className="w-4 h-4" />
                    מה זה אומר ואיך זה עוזר לעסק?
                  </div>
                  <p className="text-zinc-200 text-sm leading-relaxed">{selected.businessValue}</p>
                </div>
                <DetailBlock icon={Target} title="ערך עסקי לארגון" text={selected.benefit} />
                <DetailBlock icon={Layers} title="מתודולוגיה מקצועית" text={selected.methodology} />
                <div>
                  <div className="flex items-center gap-2 mb-2.5 text-brand-400 font-bold text-sm">
                    <Wrench className="w-4 h-4" />
                    סטאק טכנולוגי
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selected.stack.map((tech) => (
                      <span key={tech} className="text-xs font-mono font-medium text-zinc-200 bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
                <DetailBlock icon={TrendingUp} title="ROI ללקוח" text={selected.roi} />
              </div>

              <div className="p-6 md:p-8 pt-2 border-t border-white/10">
                <WebButton variant="primary" onClick={handleContactClick} className="w-full justify-center">
                  לשיחת ייעוץ בנושא {selected.label}
                </WebButton>
              </div>
            </motion.div>
          </div>
        )}
        </AnimatePresence>,
        document.body
      )}
    </section>
  );
}

function DetailBlock({ icon: Icon, title, text }: { icon: typeof Target; title: string; text: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-brand-400 font-bold text-sm">
        <Icon className="w-4 h-4" />
        {title}
      </div>
      <p className="text-zinc-300 text-sm leading-relaxed">{text}</p>
    </div>
  );
}
