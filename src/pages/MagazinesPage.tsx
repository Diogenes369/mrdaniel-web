import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Network,
  Package,
  Eye,
  X,
  ShoppingCart,
  Sparkles,
  Layers,
  RefreshCw,
  ChevronDown,
  FileText,
  Check,
  Users,
  Clock,
  Bot,
  Server,
  Gauge,
  TrendingUp,
  Code2,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { PageHero, ServiceGrid } from '../components/content/ContentPrimitives';
import WebButton from '../components/WebButton';
import SocialLinks from '../components/SocialLinks';
import AiAgentsSection from '../components/AiAgentsSection';
import { prefersReducedMotion } from '../lib/gsap';

type Category = 'ai' | 'cyber' | 'automation';

interface Product {
  id: string;
  category: Category;
  tierLabel: string;
  title: string;
  englishTag: string;
  subtitle: string;
  icon: LucideIcon;
  accent: string;
  glow: string;
  highlights: string[];
  chapters: string[];
  codeSnippet: string;
  codeLang: string;
  audience: string;
  price: number;
  badge?: string;
}

const PRODUCTS: Product[] = [
  {
    id: 'ai-agentic-2026',
    category: 'ai',
    tierLabel: 'Premium Flagship · VIP Guide',
    title: 'ארכיטקטורת סוכני AI אוטונומיים ומערכות Agentic 2026',
    englishTag: 'Enterprise Agentic AI Systems',
    subtitle: 'המדריך המלא לבניית סוכנים עצמאיים, פיתוח Multi-Agent Workflows, וחיבור ל-Enterprise APIs & Vector DBs.',
    icon: Sparkles,
    accent: 'text-brand-400',
    glow: 'group-hover:shadow-[0_20px_70px_rgba(0,255,102,0.2)]',
    highlights: [
      'תזמור Multi-Agent Workflows מקצה לקצה',
      'חיבור סוכנים ל-Enterprise APIs ו-Vector DBs',
      'Guardian Agents וממשל AI ארגוני',
      'ניהול עלויות, Prompt Caching ו-Model Routing',
      'תבניות קוד מוכנות לפריסה בפרודקשן',
    ],
    chapters: [
      'יסודות ה-Agentic AI וההבדל מ-Chat רגיל',
      'תכנון ארכיטקטורת Multi-Agent Workflows',
      'בניית שכבת Guardian Agents לממשל ובקרה',
      'חיבור ל-Vector DBs ומאגרי ידע ארגוניים',
      'אינטגרציה עם Enterprise APIs קיימים',
      'ניהול עלויות, Model Routing ו-Prompt Caching',
      'הערכת ביצועים (Evals) ובדיקות רגרסיה',
      'פרויקט מקצה לקצה: מ-POC לפרודקשן',
    ],
    codeLang: 'python',
    codeSnippet: `agent = Agent(
    name="ops-orchestrator",
    tools=[vector_db_search, enterprise_api_call],
    guardian=GuardianAgent(policy="least_privilege"),
)
result = agent.run(task="Reconcile weekly billing anomalies")`,
    audience: 'אדריכלי פתרונות, מובילי צוותי פיתוח AI ומנהלי טכנולוגיות שרוצים לעבור מהוכחת היתכנות (POC) לסביבת ייצור אמיתית.',
    price: 290,
    badge: 'Premium Flagship',
  },
  {
    id: 'zero-trust-cloud-2026',
    category: 'cyber',
    tierLabel: 'Standard Guide',
    title: 'Zero-Trust Architecture & Cloud Hardening 2026',
    englishTag: 'Practical Enterprise Hardening',
    subtitle: 'מדריך הקשחה מלא ליישום Zero-Trust אמיתי בענן ובארגון — פרוצדורות, רשימות תיוג וקוד תשתית, לא עוד תיאוריה.',
    icon: ShieldAlert,
    accent: 'text-brand-300',
    glow: 'group-hover:shadow-[0_20px_60px_rgba(159,232,112,0.15)]',
    highlights: [
      'מיפוי משטח תקיפה ו-Micro-Segmentation מעשי',
      'הקשחת IAM / Entra ID ומדיניות MFA אדפטיבית',
      'הקשחת ענן Cloud-Native ו-IaC Scanning',
      'תוכנית IR ו-BCP/DRP מוכנה להטמעה',
      'רשימות תיוג (Checklists) מוכנות לביקורת אבטחה',
    ],
    chapters: [
      'עקרונות Zero-Trust: Never Trust, Always Verify',
      'מיפוי משטח התקיפה הארגוני שלכם',
      'הקשחת זהויות: IAM, Entra ID ו-Conditional Access',
      'Micro-Segmentation ברשת הארגונית והענן',
      'CSPM ו-IaC Scanning לסביבות ענן דינמיות',
      'בניית תוכנית תגובה לאירועים (IR Playbook)',
      'BCP/DRP: המשכיות עסקית והתאוששות מאסון',
      'רשימות תיוג להטמעה ולביקורת תקופתית',
    ],
    codeLang: 'hcl',
    codeSnippet: `resource "aws_iam_policy" "least_privilege" {
  name   = "zero-trust-baseline"
  policy = jsonencode({
    Statement = [{
      Effect   = "Deny"
      Action   = "*"
      Resource = "*"
      Condition = { Bool = { "aws:MultiFactorAuthPresent" = "false" } }
    }]
  })
}`,
    audience: 'CISO-ים, מהנדסי אבטחת רשת ואחראי תשתיות שרוצים ליישם Zero-Trust בפועל — לא רק להציג אותו במצגת.',
    price: 129,
    badge: 'הכי נמכר',
  },
  {
    id: 'powershell-network-automation',
    category: 'automation',
    tierLabel: 'Standard Guide',
    title: 'מדריך PowerShell, אוטומציות וסקריפטים לניהול רשת וסייבר',
    englishTag: 'Network Admin Scripting Toolkit',
    subtitle: 'ספריית סקריפטים מוכנה לשימוש + שיטות עבודה לאוטומציה של ניהול רשת, סייבר ותשתיות Windows.',
    icon: Terminal,
    accent: 'text-brand-600',
    glow: 'group-hover:shadow-[0_20px_60px_rgba(92,146,0,0.15)]',
    highlights: [
      'עשרות סקריפטי PowerShell מוכנים לשימוש מיידי',
      'אוטומציה של ניהול משתמשים, הרשאות וגיבויים',
      'ניטור מערכת ודוחות אירועי אבטחה בסקריפט אחד',
      'שילוב עם Task Scheduler ואוטומציה פנים-ארגונית',
    ],
    chapters: [
      'יסודות PowerShell למנהלי רשת וסייבר',
      'אוטומציה של ניהול משתמשים והרשאות ב-AD',
      'סקריפטים לגיבוי ולשחזור אוטומטי',
      'ניטור מערכת, לוגים ודוחות אירועי אבטחה',
      'תזמון משימות עם Task Scheduler',
      'ספריית סקריפטים מוכנה — Copy/Paste לפרודקשן',
    ],
    codeLang: 'powershell',
    codeSnippet: `Get-ADUser -Filter {Enabled -eq $true} |
  Where-Object { $_.LastLogonDate -lt (Get-Date).AddDays(-90) } |
  Disable-ADAccount -WhatIf`,
    audience: 'מנהלי רשת ותשתיות (Sysadmins) שרוצים לחסוך שעות עבודה שבועיות באמצעות אוטומציה אמיתית, לא תיאוריה כללית.',
    price: 99,
  },
  {
    id: 'infra-fortigate-perimeter',
    category: 'cyber',
    tierLabel: 'Standard Guide',
    title: 'אבטחת תשתיות תקשורת, FortiGate וציוד היקפי בארגון',
    englishTag: 'Perimeter & Network Infrastructure Security',
    subtitle: 'הקשחה מעשית של ציוד היקפי, מדיניות FortiGate ותצורת רשת ארגונית — צעד אחר צעד, כולל קונפיגורציות אמיתיות.',
    icon: Network,
    accent: 'text-brand-400',
    glow: 'group-hover:shadow-[0_20px_60px_rgba(0,255,102,0.15)]',
    highlights: [
      'תצורת מדיניות FortiGate מאובטחת מקצה לקצה',
      'הקשחת ציוד היקפי: Firewalls, VPN ו-Load Balancers',
      'פילוח רשת ומדיניות גישה בין VLANs',
      'ניטור תעבורה וזיהוי חריגות ברמת הרשת',
    ],
    chapters: [
      'ארכיטקטורת רשת היקפית מאובטחת',
      'תצורת FortiGate: מדיניות בסיס ו-Best Practices',
      'הקשחת VPN וגישה מרוחקת מאובטחת',
      'פילוח VLAN ומדיניות גישה בין מקטעים',
      'ניטור תעבורה וזיהוי אנומליות רשת',
      'רשימת תיוג הקשחה לציוד היקפי',
    ],
    codeLang: 'bash',
    codeSnippet: `config firewall policy
  edit 12
    set srcintf "lan"
    set dstintf "wan1"
    set action accept
    set schedule "always"
    set utm-status enable
    set ssl-ssh-profile "deep-inspection"
  next
end`,
    audience: 'מהנדסי רשת ואבטחה האחראים על ציוד היקפי ארגוני שרוצים תצורת אבטחה מאומתת, לא ניחושים.',
    price: 149,
  },
];

const INDIVIDUAL_TOTAL = PRODUCTS.reduce((sum, p) => sum + p.price, 0);
const BUNDLE_PRICE = 399;
const BUNDLE_SAVINGS = INDIVIDUAL_TOTAL - BUNDLE_PRICE;

const BUNDLE: Product = {
  id: 'complete-bundle-2026',
  category: 'ai',
  tierLabel: 'VIP · Complete Collection',
  title: 'חבילת האוסף המלאה - כל המגזינים והמדריכים הדיגיטליים',
  englishTag: 'The Complete 2026 Collection',
  subtitle: `כל ${PRODUCTS.length} המדריכים המלאים במחיר מוזל משמעותית — חיסכון של ₪${BUNDLE_SAVINGS} לעומת רכישה נפרדת, כולל עדכונים עתידיים.`,
  icon: Package,
  accent: 'text-black',
  glow: '',
  highlights: [
    `כל ${PRODUCTS.length} המדריכים המלאים (AI, סייבר, תשתיות ואוטומציה)`,
    `חיסכון של ₪${BUNDLE_SAVINGS} לעומת רכישה נפרדת`,
    'עדכוני גרסאות עתידיים ללא תוספת תשלום',
    'עדיפות במענה לשאלות ובתמיכה טכנית',
  ],
  chapters: PRODUCTS.map((p) => `${p.title} — מלא`),
  codeLang: '',
  codeSnippet: '',
  audience: 'ארגונים וצוותים שרוצים כיסוי מלא של AI, סייבר, תשתיות ואוטומציה תחת רכישה אחת — במקום ארבע רכישות נפרדות.',
  price: BUNDLE_PRICE,
  badge: 'VIP · המבצע המשתלם ביותר',
};

const CATEGORY_FILTERS: { id: Category | 'all'; label: string }[] = [
  { id: 'all', label: 'הכל' },
  { id: 'ai', label: 'סוכני AI' },
  { id: 'cyber', label: 'סייבר ותשתיות' },
  { id: 'automation', label: 'אוטומציות' },
];

const VALUE_PROPS = [
  { icon: Check, title: 'אפס תיאוריות — 100% קוד וארכיטקטורה', description: 'כל פרק בנוי סביב דוגמאות אמיתיות, בלוקים של קוד ותבניות מוכנות — לא עוד הסברים כלליים שאי אפשר ליישם.' },
  { icon: Layers, title: 'מדריכים מעשיים צעד-אחר-צעד', description: 'מבנה מדורג מהיסודות ועד ליישום מלא, כך שאפשר להתחיל לעבוד כבר מהפרק הראשון — לא רק בסוף החוברת.' },
  { icon: RefreshCw, title: 'גישה לעדכונים עתידיים', description: 'עולם ה-AI והסייבר משתנה מדי חודש — רוכשי החבילה המלאה מקבלים עדכוני תוכן ללא עלות נוספת.' },
  { icon: Users, title: 'נכתב מניסיון בשטח, לא באקדמיה', description: 'כל תוכן מבוסס על פרויקטים אמיתיים בארגונים — כולל המכשולים וההחלטות שלא כתובים בשום מדריך רשמי.' },
];

const FAQ_ITEMS = [
  {
    q: 'באיזה פורמט מתקבלים המדריכים?',
    a: 'פורמט דיגיטלי מיידי בלבד — קובץ PDF מלא בתוספת קובצי קוד וסקריפטים (כשרלוונטי), נשלחים ישירות למייל מיד לאחר אישור התשלום. אין מהדורה מודפסת.',
  },
  {
    q: 'האם יש רישיון רכישה לצוותים או לארגונים?',
    a: 'כן — ניתן לרכוש רישיון צוות למספר עובדים במחיר מותאם. יש למלא את פרטי הפנייה ולציין את גודל הצוות, ותקבלו הצעת מחיר מותאמת אישית תוך יום עסקים.',
  },
  {
    q: 'האם אקבל עדכונים עתידיים לתוכן?',
    a: 'רוכשי חבילת האוסף המלאה מקבלים כל עדכון תוכן עתידי ללא עלות נוספת. רוכשי מדריך בודד מקבלים הנחה משמעותית על עדכוני גרסה עתידיים לאותו מדריך.',
  },
  {
    q: 'כמה זמן לוקח לקבל את המדריך אחרי הרכישה?',
    a: 'מיידי — הקובץ הדיגיטלי (PDF + קובצי קוד/סקריפטים) נשלח אוטומטית למייל תוך דקות מרגע אישור התשלום, ללא המתנה למשלוח.',
  },
  {
    q: 'האם ניתן לבטל רכישה ולקבל החזר כספי?',
    a: 'קובץ דיגיטלי שהורד אינו ניתן בדרך כלל להחזרה, אך בכל בעיה או טעות ברכישה ניתן לפנות ישירות ונטפל בכך באופן אישי.',
  },
];

interface Role {
  id: string;
  label: string;
  icon: LucideIcon;
  hoursSaved: number;
  scriptsIncluded: number;
  blurb: string;
}

const ROLES: Role[] = [
  {
    id: 'it',
    label: 'מנהל IT / תשתיות',
    icon: Server,
    hoursSaved: 6,
    scriptsIncluded: 22,
    blurb: 'ספריית הסקריפטים המוכנה חוסכת כתיבת אוטומציה מאפס לכל משימת ניהול רשת חוזרת — גיבויים, הרשאות וניטור.',
  },
  {
    id: 'cyber',
    label: 'מומחה סייבר',
    icon: ShieldAlert,
    hoursSaved: 9,
    scriptsIncluded: 18,
    blurb: 'רשימות תיוג והקשחה מוכנות (Zero-Trust ו-FortiGate) מקצרות משמעותית את זמן ההיערכות למבדק אבטחה או ביקורת.',
  },
  {
    id: 'ai',
    label: 'מפתח / אדריכל AI',
    icon: Bot,
    hoursSaved: 12,
    scriptsIncluded: 15,
    blurb: 'תבניות קוד לסוכנים ו-Multi-Agent Workflows חוסכות שבועות של ניסוי וטעייה בבניית ארכיטקטורה מאפס.',
  },
];

function openLead(inquiryTopic: string) {
  window.dispatchEvent(new CustomEvent('open-lead-modal', { detail: { subject: inquiryTopic, sourceSection: 'Magazines Store' } }));
}

function purchaseTopic(product: Product) {
  return `${product.title} (${product.tierLabel}, ₪${product.price})`;
}

function ProductCard({ product, onPreview }: { product: Product; onPreview: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      data-search-target={product.id}
      className="group"
    >
      <div className={`relative overflow-hidden bg-[#0D0E12] border border-white/10 rounded-2xl p-5 md:p-6 transition-all duration-500 hover:border-[#76B900]/50 ${product.glow}`}>
        {product.badge && (
          <span className="absolute top-4 left-4 z-10 text-[10px] font-mono font-bold tracking-widest uppercase bg-brand-500 text-black px-2.5 py-1 rounded-full shadow-[0_0_12px_rgba(0,255,102,0.5)]">
            {product.badge}
          </span>
        )}

        <div className="flex items-start gap-4 mb-4">
          <div className={`w-14 h-14 shrink-0 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center ${product.accent}`}>
            <product.icon className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <span className="block font-mono text-[10px] font-bold text-brand-400 uppercase tracking-widest mb-1">{product.tierLabel}</span>
            <h3 className="font-display text-lg font-bold text-[#F1F5F9] leading-snug">{product.title}</h3>
          </div>
        </div>

        <p className="text-zinc-400 text-sm leading-relaxed mb-4">{product.subtitle}</p>

        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 bg-white/5 border border-white/10 rounded-full px-2.5 py-1 mb-4">
          <FileText className="w-3 h-3 text-brand-400" />
          פורמט דיגיטלי (PDF + סקריפטים)
        </span>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="w-full flex items-center justify-between gap-2 text-sm font-bold text-zinc-200 hover:text-white transition-colors py-2.5 border-t border-white/10 min-h-11 cursor-pointer"
        >
          מה כלול בתוך החוברת
          <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform duration-300 ${expanded ? 'rotate-180 text-brand-400' : ''}`} />
        </button>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
              <ul className="space-y-2 pt-3 pb-1">
                {product.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-xs text-zinc-300 leading-relaxed">
                    <Check className="w-3.5 h-3.5 text-brand-400 shrink-0 mt-0.5" />
                    {h}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-white/10">
          <div className={`text-2xl font-black ${product.accent}`}>₪{product.price}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPreview}
              aria-label="הצץ פנימה"
              title="הצץ פנימה"
              className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full border border-white/15 text-zinc-300 hover:text-brand-400 hover:border-brand-400/50 transition-colors"
            >
              <Eye className="w-4 h-4" />
            </button>
            <WebButton variant="primary" onClick={() => openLead(purchaseTopic(product))} className="!px-5 whitespace-nowrap">
              <ShoppingCart size={16} />
              רכישה
            </WebButton>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function VipBundleBanner() {
  const reduced = prefersReducedMotion();

  return (
    <motion.div
      className="relative overflow-hidden rounded-[1.75rem] border border-brand-500/50 bg-gradient-to-l from-brand-500/15 via-carbon-900 to-carbon-900 p-6 md:p-8 mb-14"
    >
      {reduced ? (
        <div className="absolute -inset-1 rounded-[1.75rem] pointer-events-none" style={{ boxShadow: '0 0 40px 6px rgba(0,255,102,0.25)' }} aria-hidden="true" />
      ) : (
        <motion.div
          className="absolute -inset-1 rounded-[1.75rem] pointer-events-none"
          animate={{ opacity: [0.15, 0.4, 0.15] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          style={{ boxShadow: '0 0 60px 10px rgba(0,255,102,0.35)' }}
          aria-hidden="true"
        />
      )}
      <div className="relative flex flex-col md:flex-row items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 shrink-0 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-black">
            <Package className="w-7 h-7" />
          </div>
          <div>
            <span className="font-mono text-xs font-bold text-brand-400 uppercase tracking-widest">מארז VIP משולב</span>
            <h3 className="font-display text-xl md:text-2xl font-black text-white mt-1">{BUNDLE.title}</h3>
            <p className="text-zinc-400 text-sm mt-1">חיסכון של ₪{BUNDLE_SAVINGS} לעומת רכישה נפרדת — כל {PRODUCTS.length} המדריכים המלאים.</p>
          </div>
        </div>
        <WebButton variant="primary" onClick={() => openLead(purchaseTopic(BUNDLE))} className="shrink-0 !px-8 whitespace-nowrap">
          <ShoppingCart size={16} />
          לרכישת המארז ב-₪{BUNDLE_PRICE}
        </WebButton>
      </div>
    </motion.div>
  );
}

function PreviewModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  return createPortal(
    <AnimatePresence>
      {product && (
        <div className="fixed inset-0 z-[100] flex justify-center items-end md:items-center px-4 md:px-0 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-0">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/90"
          />
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 60, scale: 0.96 }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            className="relative w-full max-w-lg max-h-[90vh] flex flex-col bg-[#0b0c10] border border-white/15 shadow-[0_30px_80px_rgba(0,0,0,0.9)] rounded-3xl overflow-hidden"
          >
            <div className="relative p-6 md:p-8 pb-4 bg-[#0D0E12] border-b border-white/10">
              <button
                onClick={onClose}
                className="absolute top-5 left-5 w-11 h-11 flex items-center justify-center bg-white/5 text-zinc-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
                aria-label="סגירה"
              >
                <X size={18} />
              </button>
              <div className="flex items-center gap-2.5 mb-1 pl-14">
                <span className="w-2 h-2 rounded-full bg-brand-400 shadow-[0_0_8px_rgba(0,255,102,0.8)] shrink-0" aria-hidden="true" />
                <span className="text-xs font-mono font-bold text-brand-400 uppercase tracking-widest">{product.tierLabel} · תוכן העניינים</span>
              </div>
              <h3 className="font-display font-black text-xl md:text-2xl text-white mt-2">{product.title}</h3>
            </div>

            <div className="p-6 md:p-8 overflow-y-auto flex-1 momentum-scroll space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-2.5 text-brand-400 font-bold text-sm">
                  <Layers className="w-4 h-4" />
                  תוכן העניינים בקצרה
                </div>
                <ul className="space-y-2">
                  {product.chapters.map((c, idx) => (
                    <li key={c} className="flex items-start gap-3 text-sm text-zinc-300 leading-relaxed">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-mono font-bold text-brand-400">
                        {idx + 1}
                      </span>
                      {c}
                    </li>
                  ))}
                </ul>
              </div>

              {product.codeSnippet && (
                <div>
                  <div className="flex items-center gap-2 mb-2.5 text-brand-400 font-bold text-sm">
                    <Code2 className="w-4 h-4" />
                    קטע קוד לדוגמה
                  </div>
                  <pre dir="ltr" className="text-left overflow-x-auto rounded-xl bg-black/60 border border-white/10 p-4 text-xs leading-relaxed text-zinc-300 font-mono">
                    <code>{product.codeSnippet}</code>
                  </pre>
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-2 text-brand-400 font-bold text-sm">
                  <Users className="w-4 h-4" />
                  למי זה מתאים
                </div>
                <p className="text-zinc-300 text-sm leading-relaxed">{product.audience}</p>
              </div>
            </div>

            <div className="p-6 md:p-8 pt-2 border-t border-white/10">
              <WebButton
                variant="primary"
                onClick={() => {
                  onClose();
                  openLead(purchaseTopic(product));
                }}
                className="w-full justify-center"
              >
                <ShoppingCart size={16} />
                רכישה / הורדה מיידית
              </WebButton>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function RoiMeter() {
  const [activeId, setActiveId] = useState(ROLES[0].id);
  const active = ROLES.find((r) => r.id === activeId)!;

  return (
    <div className="max-w-3xl mx-auto bg-carbon-900/60 border border-white/10 rounded-[1.75rem] p-6 md:p-9 mb-24">
      <div className="flex items-center gap-2.5 mb-2 justify-center">
        <Gauge className="w-5 h-5 text-brand-400" />
        <h3 className="font-display font-black text-2xl text-white">מד ערך: כמה זמן החבילה חוסכת לכם?</h3>
      </div>
      <p className="text-zinc-400 text-sm text-center mb-7 max-w-xl mx-auto">בחרו את התפקיד שלכם וראו הערכה של שעות עבודה וסקריפטים/תבניות מוכנות שהחבילה המלאה חוסכת לכם.</p>

      <div className="flex items-center justify-center gap-2 flex-wrap mb-7">
        {ROLES.map((role) => {
          const isActive = role.id === activeId;
          return (
            <button
              key={role.id}
              type="button"
              onClick={() => setActiveId(role.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-bold transition-colors min-h-11 ${
                isActive ? 'bg-brand-500 border-brand-500 text-black' : 'bg-black/30 border-white/10 text-zinc-300 hover:border-brand-500/40'
              }`}
            >
              <role.icon className="w-4 h-4" />
              {role.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeId}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
        >
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="bg-black/40 border border-white/10 rounded-2xl p-5 text-center">
              <div className="flex items-center justify-center gap-1.5 text-brand-400 font-mono text-3xl font-black">
                <TrendingUp className="w-6 h-6" />
                {active.hoursSaved}
              </div>
              <div className="text-zinc-400 text-xs mt-1">שעות עבודה נחסכות בחודש בממוצע</div>
            </div>
            <div className="bg-black/40 border border-white/10 rounded-2xl p-5 text-center">
              <div className="flex items-center justify-center gap-1.5 text-brand-400 font-mono text-3xl font-black">
                <Code2 className="w-6 h-6" />
                {active.scriptsIncluded}
              </div>
              <div className="text-zinc-400 text-xs mt-1">סקריפטים ותבניות מוכנות לשימוש</div>
            </div>
          </div>
          <p className="text-zinc-300 text-sm leading-relaxed text-center max-w-lg mx-auto mb-6">{active.blurb}</p>
        </motion.div>
      </AnimatePresence>

      <div className="text-center">
        <WebButton variant="primary" onClick={() => openLead(purchaseTopic(BUNDLE))} className="!px-8">
          <ShoppingCart size={16} />
          לרכישת החבילה המלאה
        </WebButton>
      </div>
    </div>
  );
}

function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="max-w-3xl mx-auto space-y-3 mb-16">
      {FAQ_ITEMS.map((item, idx) => {
        const isOpen = open === idx;
        return (
          <div key={item.q} className="bg-carbon-900/60 border border-white/10 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : idx)}
              aria-expanded={isOpen}
              className="w-full text-right p-5 flex items-center gap-3 min-h-11 cursor-pointer"
            >
              <h3 className="font-display font-bold text-base md:text-lg text-[#F1F5F9] flex-1">{item.q}</h3>
              <ChevronDown className={`w-5 h-5 text-zinc-500 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180 text-brand-400' : ''}`} />
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <p className="px-5 pb-5 text-sm text-zinc-400 leading-relaxed border-t border-white/10 pt-4">{item.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

function SocialFollowBanner() {
  return (
    <div className="max-w-2xl mx-auto text-center bg-carbon-900/60 border border-white/10 rounded-2xl p-6 md:p-8">
      <p className="text-zinc-200 text-base md:text-lg font-medium mb-5 leading-relaxed">
        עקבו אחריי ב-LinkedIn ו-Instagram לקבלת עדכונים חמים, ניתוחי ארכיטקטורה וטיפים מעשיים ב-AI וסייבר
      </p>
      <SocialLinks className="justify-center" />
    </div>
  );
}

const STATS = [
  { icon: Check, label: '100% מעשי' },
  { icon: RefreshCw, label: 'עדכונים שוטפים' },
  { icon: Clock, label: 'PDF מיידי למייל' },
];

export default function MagazinesPage() {
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);
  const [activeFilter, setActiveFilter] = useState<Category | 'all'>('all');
  const [query, setQuery] = useState('');

  const visibleProducts = useMemo(() => {
    const base = activeFilter === 'all' ? PRODUCTS : PRODUCTS.filter((p) => p.category === activeFilter);
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((p) => p.title.toLowerCase().includes(q) || p.subtitle.toLowerCase().includes(q));
  }, [activeFilter, query]);

  return (
    <div id="page-top" className="min-h-screen pt-24 md:pt-28 pb-24">
      <div className="container mx-auto px-6 max-w-6xl">
        <PageHero
          badgeIcon={BookOpen}
          badgeLabel="החנות הדיגיטלית · Premium Guides 2026"
          title="מגזינים וחוברות פרימיום: המדריכים המעשיים לעולם ה-AI והסייבר"
          subtitle="ארכיטקטורה אמיתית, סקריפטים מוכנים לשימוש ואפס פילוסופיה מיותרת — כל מדריך נבנה כדי שתתחילו ליישם כבר מהפרק הראשון."
        />

        <div className="flex items-center justify-center gap-2.5 text-center bg-brand-500/10 border border-brand-500/25 rounded-full px-5 py-2.5 mx-auto w-fit mb-8">
          <ShieldCheck className="w-4 h-4 text-brand-400 shrink-0" />
          <span className="text-sm text-zinc-200 font-medium">הורדה מיידית לתיבת הדוא&quot;ל לאחר הרכישה — ללא המתנה, ללא סיכון</span>
        </div>

        <div className="flex items-center justify-center gap-3 flex-wrap mb-10">
          {STATS.map((s) => (
            <span
              key={s.label}
              className="inline-flex items-center gap-2 bg-white/[0.03] border border-white/10 px-4 py-2 rounded-full text-sm text-zinc-300 font-medium"
            >
              <s.icon className="w-4 h-4 text-brand-400" />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* AI Agents — the store's flagship high-ticket category, positioned ahead of the digital
          guides catalog below it (swapped up one position from the store's page order). */}
      <AiAgentsSection />

      <div className="container mx-auto px-6 max-w-6xl">
        <div className="max-w-md mx-auto relative mb-6">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש מדריך לפי שם..."
            className="input-glow !pr-10"
          />
        </div>

        <div className="flex items-center justify-center gap-3 flex-wrap mb-12">
          {CATEGORY_FILTERS.map((f) => {
            const isActive = activeFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id)}
                className={`px-5 py-2.5 rounded-full border text-sm font-bold transition-colors min-h-11 ${
                  isActive ? 'bg-brand-500 border-brand-500 text-black' : 'bg-carbon-900/60 border-white/10 text-zinc-300 hover:border-brand-500/40'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <VipBundleBanner />

        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeFilter}-${query}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6 mb-16"
          >
            {visibleProducts.length > 0 ? (
              visibleProducts.map((product) => <ProductCard key={product.id} product={product} onPreview={() => setPreviewProduct(product)} />)
            ) : (
              <div className="md:col-span-2 text-center py-12 text-zinc-400">לא נמצאו מדריכים התואמים את החיפוש.</div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="container mx-auto px-6 max-w-6xl">
        <RoiMeter />

        <div className="text-center mb-12">
          <h2 className="font-display text-3xl md:text-4xl font-black text-white mb-4">
            למה <span className="text-brand-500">המדריכים שלנו?</span>
          </h2>
          <p className="text-zinc-400 text-base md:text-lg max-w-2xl mx-auto">כל מדריך נכתב לפי אותם עקרונות — בלי קיצורי דרך.</p>
        </div>
        <ServiceGrid items={VALUE_PROPS} />

        <div className="text-center mb-10">
          <h2 className="font-display text-3xl md:text-4xl font-black text-white mb-4">
            שאלות <span className="text-brand-500">נפוצות</span>
          </h2>
          <p className="text-zinc-400 text-base md:text-lg">כל מה שצריך לדעת לפני הרכישה.</p>
        </div>
        <FaqAccordion />

        <SocialFollowBanner />
      </div>

      <PreviewModal product={previewProduct} onClose={() => setPreviewProduct(null)} />
    </div>
  );
}
