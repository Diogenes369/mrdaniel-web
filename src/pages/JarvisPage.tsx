import { motion } from 'motion/react';
import {
  Bot,
  Braces,
  Activity,
  Workflow,
  ShieldCheck,
  Cpu,
  Network,
  Gauge,
  TrendingDown,
  Building2,
  ArrowLeft,
  CalendarClock,
  FileText,
  Layers,
  Lock,
  Database,
} from 'lucide-react';
import {
  SectionHeading,
  ServiceGrid,
  InfoBox,
  SpecTable,
} from '../components/content/ContentPrimitives';
import JarvisShowcaseVideo from '../components/content/JarvisShowcaseVideo';
import LeadCtaGrid from '../components/content/LeadCtaGrid';
import WebButton from '../components/WebButton';

const LEAD_SUBJECT = 'JARVIS System Inquiry';

function openJarvisLead(sourceSection: string) {
  window.dispatchEvent(
    new CustomEvent('open-lead-modal', { detail: { subject: LEAD_SUBJECT, sourceSection } })
  );
}

/** Custom cyber badge/logo element — an arc-reactor style ring with the JARVIS wordmark, pure
 * SVG + CSS glow, tuned to the dark site palette. */
function JarvisBadge() {
  return (
    <div className="relative inline-flex items-center justify-center">
      <div className="absolute inset-0 rounded-full bg-brand-500/25 blur-2xl" aria-hidden="true" />
      <svg viewBox="0 0 120 120" className="relative w-28 h-28 md:w-32 md:h-32" role="img" aria-label="JARVIS">
        <defs>
          <linearGradient id="jarvisRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#9FE870" />
            <stop offset="100%" stopColor="#4d7c0f" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="52" fill="none" stroke="url(#jarvisRing)" strokeWidth="2" opacity="0.5" />
        <circle
          cx="60"
          cy="60"
          r="44"
          fill="none"
          stroke="#76B900"
          strokeWidth="3"
          strokeDasharray="6 10"
          strokeLinecap="round"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 60 60"
            to="360 60 60"
            dur="18s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="60" cy="60" r="30" fill="none" stroke="url(#jarvisRing)" strokeWidth="1.5" opacity="0.7" />
        <circle cx="60" cy="60" r="6" fill="#9FE870" />
      </svg>
      <span className="absolute font-mono text-[11px] md:text-xs font-bold tracking-[0.35em] text-brand-200 translate-y-10 md:translate-y-11">
        JARVIS
      </span>
    </div>
  );
}

export default function JarvisPage() {
  return (
    <div id="page-top" className="min-h-screen pt-24 md:pt-28 pb-24">
      <div className="container-wide">
        {/* ---- Hero ---- */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col items-center text-center pt-8 pb-12 md:pt-12 md:pb-16"
        >
          <JarvisBadge />
          <span className="mt-8 inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3.5 py-1.5 text-xs font-mono font-bold uppercase tracking-widest text-brand-300">
            <Cpu className="w-3.5 h-3.5" />
            Enterprise AI Operating System
          </span>
          <h1 className="mt-5 font-display font-black text-4xl md:text-6xl leading-[1.1] text-white max-w-4xl">
            מערכת JARVIS — שכבת ה-AI האוטונומית של הארגון
          </h1>
          <p className="mt-5 text-lg md:text-xl text-zinc-300 leading-relaxed max-w-3xl">
            תשתית אחת שמאחדת סוכני בינה מלאכותית אוטונומיים, תזמור מודלי שפה, פייפליינים של דאטה בזמן אמת,
            מנוע אוטומציה לתהליכים ובקרת גישה ברמת בנק — פרוסה בתוך הסביבה הארגונית שלכם, לא כשירות חיצוני.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <WebButton variant="primary" onClick={() => openJarvisLead('JARVIS Page · Hero')}>
              <CalendarClock className="w-4 h-4" />
              תיאום פגישת אפיון והתאמה אישית
            </WebButton>
            <WebButton variant="ghost" onClick={() => openJarvisLead('JARVIS Page · Hero (RFP)')}>
              <FileText className="w-4 h-4" />
              בקשת הצעת מחיר לארגון
            </WebButton>
          </div>
        </motion.div>

        <div className="pt-4">
          <InfoBox title="פתרון בהתאמה אישית לפי מורכבות הארגון">
            <p>
              JARVIS אינה חבילת מדף. כל הטמעה נתפרת סביב מפת התהליכים, המערכות והרגולציה של הארגון —
              מספר הסוכנים, מקורות הדאטה, רמת ההרשאות ועומק האינטגרציות נקבעים באפיון משותף.
            </p>
            <p>
              לכן <strong className="text-white">אין באתר זה מחירון או עלויות חבילה קבועות</strong>. ההיקף,
              לוחות הזמנים והתמחור נבנים לאחר פגישת אפיון, ומוגשים כהצעה ארגונית מסודרת.
            </p>
          </InfoBox>

          {/* ---- Video showcase ---- */}
          <SectionHeading
            icon={Activity}
            title="הדגמת מערכת"
            description="סיור מודרך קצר בליבת JARVIS — מהסוכנים ועד בקרת הגישה. הרכיב מוכן להצגת קובץ וידאו או הטמעת YouTube / Vimeo."
          />
          <JarvisShowcaseVideo />

          {/* ---- Deep system breakdown ---- */}
          <SectionHeading
            icon={Layers}
            title="פירוק המערכת — חמש שכבות ליבה"
            description="כל שכבה עומדת בפני עצמה וניתנת להטמעה בהדרגה, אך הערך המלא מגיע כשהן פועלות יחד תחת ממשל אחד."
          />
          <ServiceGrid
            items={[
              {
                icon: Bot,
                title: 'סוכני AI אוטונומיים',
                description:
                  'סוכנים ייעודיים לכל תהליך עסקי — פיננסים, תפעול, מכירות ושירות — הפועלים תחת שכבת Guardian Agents לממשל, בקרה ותיעוד מלא של כל פעולה.',
              },
              {
                icon: Braces,
                title: 'תזמור LLM ארגוני',
                description:
                  'ניתוב חכם בין מודלים (ענן ומקומיים) לפי עלות, חביון ורגישות מידע, עם ארכיטקטורת RAG על מאגר הידע הארגוני והסתרת מידע רגיש (PII) בזמן ריצה.',
              },
              {
                icon: Activity,
                title: 'פייפליינים של דאטה בזמן אמת',
                description:
                  'קליטה זורמת (streaming) ממערכות המקור, נרמול ואחסון וקטורי — כדי שהסוכנים יפעלו על המצב העדכני של הארגון, לא על תמונת מצב ישנה.',
              },
              {
                icon: Workflow,
                title: 'מנוע אוטומציה לתהליכים',
                description:
                  'תהליכים רב-שלביים עם תנאים, אישורים אנושיים (human-in-the-loop), חזרות (retries) ו-Rollback — מוגדרים כקוד וניתנים לניטור מקצה לקצה.',
              },
              {
                icon: ShieldCheck,
                title: 'אבטחה ובקרת גישה ברמת בנק',
                description:
                  'Zero-Trust, ניהול זהויות (IAM / Entra ID), הרשאות מבוססות תפקיד לכל סוכן, הצפנה בתנועה ובמנוחה, ויומן ביקורת (audit log) בלתי ניתן לשינוי.',
              },
            ]}
          />

          <SpecTable
            rows={[
              {
                label: 'שכבת ממשל',
                value: (
                  <>
                    Guardian Agents — <strong className="text-white">אישור, חסימה ותיעוד</strong> של כל פעולת סוכן, כולל
                    הגנה מפני Prompt Injection ודליפת מידע.
                  </>
                ),
              },
              { label: 'מודלים', value: 'תזמור רב-מודלי (ענן + מקומי), RAG ארגוני, מטמון תשובות ומיסוך PII' },
              { label: 'דאטה', value: 'חיבור למערכות מקור, streaming, אחסון וקטורי וסנכרון מצב תמידי' },
              { label: 'אוטומציה', value: 'תהליכים כקוד, אישורים אנושיים, retries, Rollback וניטור מלא' },
              { label: 'אבטחה', value: 'Zero-Trust, IAM / RBAC לכל סוכן, הצפנה מקצה לקצה, audit log בלתי ניתן לשינוי' },
              { label: 'פריסה', value: 'ענן פרטי / היברידי / on-prem — בתוך הפרימטר הארגוני, לא כ-SaaS חיצוני' },
            ]}
          />

          {/* ---- Business value & ROI ---- */}
          <SectionHeading
            icon={TrendingDown}
            title="ערך עסקי ו-ROI"
            description="הסבר ברמת הנהלה: מה JARVIS משנה בשורה התחתונה, ואיך זה נמדד."
          />
          <ServiceGrid
            items={[
              {
                icon: Gauge,
                title: 'יעילות תפעולית',
                description:
                  'תהליכים ידניים חוזרים עוברים לאוטומציה מפוקחת — זמני מחזור מתקצרים משעות לדקות, וצוותים מתפנים לעבודה בעלת ערך גבוה.',
              },
              {
                icon: TrendingDown,
                title: 'הפחתת עלויות',
                description:
                  'תזמור מודלים לפי עלות/חביון מוריד את הוצאות ה-AI, וצמצום עבודה ידנית ושגיאות אנוש מקטין עלויות תפעול ותיקון.',
              },
              {
                icon: Building2,
                title: 'יכולת פריסה ארגונית',
                description:
                  'פריסה בתוך הפרימטר הארגוני עם עמידה ברגולציה, בקרת גישה מלאה ויומני ביקורת — מוכן לביקורת אבטחת מידע ולסביבות מפוקחות.',
              },
              {
                icon: Network,
                title: 'הטמעה הדרגתית',
                description:
                  'מתחילים משכבה אחת ותהליך אחד עם מדד הצלחה ברור, ומרחיבים לפי תוצאות — בלי פרויקט "ביג-בנג" מסוכן.',
              },
              {
                icon: Database,
                title: 'ידע ארגוני ממונף',
                description:
                  'הדאטה והמסמכים הפנימיים הופכים לנכס פעיל שהסוכנים משתמשים בו — במקום ידע שכלוא במגירות ובראשים של אנשים.',
              },
              {
                icon: Lock,
                title: 'שליטה וריבונות מידע',
                description:
                  'המידע הרגיש לא יוצא מהארגון. מודלים מקומיים ומיסוך PII מאפשרים AI מתקדם גם על נתונים מסווגים.',
              },
            ]}
          />

          {/* ---- Mid-page CTA band ---- */}
          <div className="my-16 rounded-2xl border border-brand-500/30 bg-gradient-to-bl from-brand-500/15 via-carbon-900 to-carbon-900 p-8 md:p-12 text-center">
            <h2 className="font-display font-black text-2xl md:text-3xl text-white mb-3">
              נבנה את ארכיטקטורת JARVIS סביב הארגון שלכם
            </h2>
            <p className="text-zinc-300 max-w-2xl mx-auto mb-7">
              פגישת אפיון קצרה ממפה את התהליכים, המערכות והרגולציה — ובסופה הצעה ארגונית מסודרת עם היקף,
              לוחות זמנים ותמחור מותאם. ללא מחירון מדף.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <WebButton variant="primary" onClick={() => openJarvisLead('JARVIS Page · Mid CTA')}>
                <CalendarClock className="w-4 h-4" />
                תיאום פגישת אפיון והתאמה אישית
              </WebButton>
              <WebButton variant="ghost" onClick={() => openJarvisLead('JARVIS Page · Mid CTA (RFP)')}>
                <FileText className="w-4 h-4" />
                בקשת הצעת מחיר לארגון
              </WebButton>
            </div>
          </div>

          {/* ---- Qualified lead routes ---- */}
          <SectionHeading
            icon={ArrowLeft}
            title="הצעד הבא"
            description="בחרו את נקודת הכניסה — כל פנייה מגיעה מסווגת כ־JARVIS System Inquiry ומוכנה לשיחה ממוקדת."
          />
          <LeadCtaGrid
            sourceSection="JARVIS Page · Specialized CTA"
            items={[
              {
                icon: CalendarClock,
                title: 'פגישת אפיון והתאמה',
                sub: 'ממפים יחד תהליכים, מערכות ורגולציה, ומגדירים שכבה ראשונה עם מדד הצלחה ברור להטמעה הדרגתית.',
                subject: LEAD_SUBJECT,
                action: 'לתיאום פגישת אפיון',
                featured: true,
              },
              {
                icon: FileText,
                title: 'הצעת מחיר לארגון',
                sub: 'יש כבר דרישות והיקף? שלחו אותם ותקבלו הצעה ארגונית מסודרת — היקף, לוחות זמנים ותמחור מותאם.',
                subject: LEAD_SUBJECT,
                action: 'לבקשת הצעה ארגונית',
              },
              {
                icon: ShieldCheck,
                title: 'סקירת אבטחה וארכיטקטורה',
                sub: 'לצוותי אבטחת מידע: מעבר על מודל ה-Zero-Trust, בקרת הגישה לכל סוכן ויומני הביקורת של JARVIS.',
                subject: LEAD_SUBJECT,
                action: 'לתיאום סקירה',
              },
            ]}
          />

          <p className="mt-10 text-center text-sm text-zinc-500">
            אין באתר זה מחירים ציבוריים או עלויות חבילה קבועות עבור מערכת JARVIS. התמחור נקבע לפי מורכבות הארגון,
            לאחר פגישת אפיון.
          </p>
        </div>
      </div>
    </div>
  );
}
