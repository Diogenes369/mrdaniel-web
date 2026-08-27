import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bot, ShieldCheck, Globe, Check, type LucideIcon } from 'lucide-react';
import { useSectionDissolve } from '../hooks/useSectionDissolve';

type TabId = 'ai-agents' | 'cybersecurity' | 'web-architecture';

interface Spec {
  label: string;
  value: string;
}

interface Tab {
  id: TabId;
  label: string;
  icon: LucideIcon;
  tagline: string;
  specs: Spec[];
  benefits: string[];
}

const TABS: Tab[] = [
  {
    id: 'ai-agents',
    label: 'סוכני AI',
    icon: Bot,
    tagline: 'ארכיטקטורת רב-מודלים אמיתית — לא עטיפה סביב API אחד, אלא ניתוב חכם למודל הנכון לכל משימה.',
    specs: [
      { label: 'מודלי יסוד', value: 'Claude Opus 4.5 · Gemini 3 Pro · GPT-5.2' },
      { label: 'מסד ידע וקטורי', value: 'Pinecone / Weaviate (RAG)' },
      { label: 'תזמור סוכנים', value: 'Multi-Agent Orchestration + MCP Protocol' },
      { label: 'שכבת ממשל', value: 'Guardian Agents · Audit Trail · Kill Switch' },
      { label: 'זמן תגובה ממוצע', value: '< 2 שניות' },
      { label: 'זמינות', value: '24/7 · ללא חלונות תחזוקה' },
    ],
    benefits: [
      'ניתוב עלות-מודל חכם (Model Routing) — המשימה הפשוטה לא "משלמת" על מודל הדגל',
      'Prompt Caching מקצץ עלויות API שוטפות ב-30-70% בעומס גבוה',
      'הזרקת ידע ארגוני (RAG) ללא הזיות — כל תשובה מבוססת מקור אמיתי',
    ],
  },
  {
    id: 'cybersecurity',
    label: 'סייבר וארגונית',
    icon: ShieldCheck,
    tagline: 'הגנה מבוססת Zero-Trust — "לעולם אל תבטח, תמיד תאמת" — לא רק ברמת הרשת, גם ברמת סוכני ה-AI עצמם.',
    specs: [
      { label: 'ארכיטקטורת אבטחה', value: 'Zero-Trust · Micro-Segmentation' },
      { label: 'ניהול זהויות', value: 'IAM / Entra ID · RBAC/ABAC · MFA אדפטיבי' },
      { label: 'זיהוי ותגובה', value: 'EDR / XDR · Continuous Monitoring' },
      { label: 'הצפנה', value: 'AES-256 (במנוחה) · TLS 1.3 (בתעבורה)' },
      { label: 'עמידה בתקנים', value: 'ISO 27001-aligned · GDPR' },
      { label: 'אבטחת פרומפטים', value: 'Prompt Injection Protection' },
    ],
    benefits: [
      'כל בקשת גישה מאומתת מחדש בזמן אמת — גם עבור תהליכים שכבר "בפנים"',
      'בידוד אוטומטי של תנועה חשודה לפני שהיא מתפשטת ברשת',
      'נתוני הלקוח לא משמשים לאימון מודלים חיצוניים — Zero-Leakage כעיקרון תשתיתי',
    ],
  },
  {
    id: 'web-architecture',
    label: 'ארכיטקטורת Web',
    icon: Globe,
    tagline: 'תשתית שנבנית לביצועים מהיום הראשון — קוד נקי, טעינה מהירה, וסקיילביליות שגדלה עם העסק.',
    specs: [
      { label: 'Frontend', value: 'React 19 · TypeScript · Vite 6' },
      { label: 'Backend', value: 'Node.js / Express' },
      { label: 'ענן ותשתית', value: 'AWS / Azure · Multi-AZ · Auto Scaling' },
      { label: 'CI/CD', value: 'Blue-Green Deployment · Automated Testing' },
      { label: 'ביצועים', value: 'Core Web Vitals ירוק · LCP < 1.5s' },
      { label: 'ארכיטקטורת API', value: 'REST / GraphQL · Microservices' },
    ],
    benefits: [
      'תשתית-כקוד (IaC) — כל סביבה משוכפלת בלחיצה, ללא "זה עבד אצלי במחשב"',
      'תשלום לפי שימוש בפועל — סקיילביליות אוטומטית בלי לשלם מראש על עומס תיאורטי',
      'כל שינוי קוד עובר סריקת אבטחה (SAST/DAST) לפני שהוא מגיע לפרודקשן',
    ],
  },
];

export default function TechCapabilitiesMatrix() {
  const [active, setActive] = useState<TabId>('ai-agents');
  const dissolveRef = useSectionDissolve<HTMLElement>();
  const activeTab = TABS.find((t) => t.id === active)!;

  return (
    <section id="tech-matrix" ref={dissolveRef} data-field-form="helix" data-field-anchor="right" className="py-12 md:py-20 border-t border-white/5 relative overflow-hidden w-full">
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <motion.div className="text-center mb-10 max-w-2xl mx-auto">
          <h2 className="font-display text-fluid-h2 font-black text-white mb-5">
            מטריצת יכולות <span className="text-brand-500">וטכנולוגיה</span>
          </h2>
          <p className="text-fluid-body text-zinc-300 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">
            לא "אמון עיוור" — שקיפות טכנולוגית מלאה. בחרו קטגוריה וראו בדיוק אילו מודלים, פרוטוקולים וסטנדרטים עומדים מאחורי כל פתרון.
          </p>
        </motion.div>

        <div className="flex items-center justify-center gap-3 flex-wrap mb-10">
          {TABS.map((tab) => {
            const isActive = tab.id === active;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActive(tab.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full border text-sm font-bold transition-colors min-h-11 cursor-pointer ${
                  isActive ? 'bg-brand-500 border-brand-500 text-black' : 'bg-carbon-900/60 border-white/10 text-zinc-300 hover:border-brand-500/40'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="max-w-5xl mx-auto bg-[#0D0E12] border border-white/10 rounded-[1.75rem] p-6 md:p-10 w-full"
          >
            <div className="flex items-start gap-4 mb-8">
              <div className="w-14 h-14 shrink-0 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center text-brand-400">
                <activeTab.icon className="w-7 h-7" />
              </div>
              <p className="text-zinc-300 text-base leading-relaxed pt-1.5">{activeTab.tagline}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {activeTab.specs.map((spec) => (
                <div key={spec.label} className="bg-black/40 border border-white/10 rounded-xl p-4">
                  <span className="block text-[10px] font-mono font-bold text-brand-400 uppercase tracking-widest mb-1.5">{spec.label}</span>
                  <span className="block text-sm text-zinc-200 font-medium leading-snug" dir="auto">
                    {spec.value}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-white/10 pt-6">
              <span className="block text-xs font-mono font-bold text-zinc-500 uppercase tracking-widest mb-4">ערך עסקי</span>
              <ul className="space-y-3">
                {activeTab.benefits.map((b) => (
                  <li key={b} className="flex items-start gap-3 text-sm text-zinc-300 leading-relaxed">
                    <Check className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
