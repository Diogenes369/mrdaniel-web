import { Network, KeyRound, ShieldCheck, type LucideIcon } from 'lucide-react';

/**
 * Enterprise IT & Security tier — three deep-capability cards aimed at IT managers and C-level.
 * Direct technical language, concrete product/protocol names, no marketing softening.
 */

interface EnterpriseService {
  icon: LucideIcon;
  title: string;
  summary: string;
  bullets: string[];
}

const SERVICES: EnterpriseService[] = [
  {
    icon: Network,
    title: 'הנדסת רשת מתקדמת',
    summary:
      'תכנון וניהול תשתית רשת ארגונית יציבה ומאובטחת — מרמת ה-Core ועד קצה המשתמש, עם הפרדה לוגית מלאה ובקרת תנועה.',
    bullets: [
      'תכנון והטמעת VLANs ו-Micro-segmentation להגבלת תנועה רוחבית',
      'ניתוב מתקדם, מדיניות NAT ו-Traffic Shaping',
      'תשתית Fortinet מקצה לקצה — FortiGate (NGFW, IPS, SD-WAN) ו-FortiSwitch מנוהל',
      'חיבורי VPN אתר-לאתר ומרחוק (IPSec / SSL-VPN) עם אימות רב-שלבי',
      'ניטור, לוגים ותיעוד ארכיטקטורה לצוות ה-IT הפנימי',
    ],
  },
  {
    icon: KeyRound,
    title: 'ניהול זהויות והרשאות (IAM)',
    summary:
      'שליטה מלאה במי ניגש למה — סנכרון זהויות בין הסביבה המקומית לענן, אכיפת מדיניות אחידה וצמצום הרשאות עודפות.',
    bullets: [
      'תכנון וניהול Active Directory — יערות, דומיינים, OU ו-Sites',
      'Group Policy (GPO) לאכיפת אבטחה, הקשחה ותצורת תחנות',
      'ניהול Microsoft 365 — Exchange Online, SharePoint, Teams ו-Licensing',
      'Entra ID — Hybrid Join, Conditional Access, MFA ו-SSO ליישומים',
      'Least Privilege, סקירת הרשאות תקופתית ו-Privileged Access',
    ],
  },
  {
    icon: ShieldCheck,
    title: 'הגנת סייבר פרואקטיבית',
    summary:
      'מעבר מהגנה תגובתית להגנה יזומה — ארכיטקטורת אמון-אפס, הגנת קצה מנוהלת ומנגנוני חסימה שלא מסתמכים על חתימות בלבד.',
    bullets: [
      'ארכיטקטורת Zero Trust — אימות מתמשך, מזעור משטח תקיפה ו-Least Privilege',
      'הגנת קצה (EDR/XDR) עם ESET PROTECT — ניהול מרוכז, מדיניות ותגובה',
      'Cyber 2.0 — חסימת התפשטות מבוססת עקרון מתמטי, כולל מצבי הגנה (Defense Modes)',
      'הקשחת שרתים, תחנות וסביבות ענן לפי Benchmark',
      'תוכניות תגובה לאירועים (IR), BCP/DRP ותרגולי שחזור',
    ],
  },
];

export default function EnterpriseServicesSection() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6 mb-16">
      {SERVICES.map((s) => {
        const Icon = s.icon;
        return (
          <div
            key={s.title}
            className="flex flex-col rounded-2xl cyber-glass cyber-glass--marketing p-6 md:p-7 hover:border-brand-500/40 transition-colors"
          >
            <div className="w-12 h-12 shrink-0 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-brand-400 mb-4">
              <Icon className="w-6 h-6" />
            </div>
            <h3 className="font-display font-bold text-lg text-white leading-snug mb-2">{s.title}</h3>
            <p className="text-sm text-zinc-400 leading-relaxed mb-4">{s.summary}</p>
            <ul className="space-y-2 mt-auto">
              {s.bullets.map((b) => (
                <li key={b} className="flex gap-2 text-sm text-zinc-300 leading-relaxed">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-400" aria-hidden="true" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
