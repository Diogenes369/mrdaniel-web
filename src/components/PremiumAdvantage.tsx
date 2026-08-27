import { motion } from 'motion/react';
import { ShieldCheck, BrainCog, EyeOff, Fingerprint, Crown, RefreshCw, type LucideIcon } from 'lucide-react';
import TiltCard from './TiltCard';
import WebButton from './WebButton';
import { useSectionDissolve } from '../hooks/useSectionDissolve';

interface Advantage {
  icon: LucideIcon;
  title: string;
  description: string;
}

const ADVANTAGES: Advantage[] = [
  {
    icon: ShieldCheck,
    title: 'אבטחה ברמה ארגונית',
    description: 'כל סוכן AI נפרס על ארכיטקטורת Zero-Trust — הצפנה מקצה לקצה, בקרת גישה granular, וניטור רציף 24/7 מהיום הראשון.',
  },
  {
    icon: BrainCog,
    title: 'אימון סוכנים מותאם אישית',
    description: 'לא תבנית גנרית — כל סוכן מאומן על הטון, הידע והתהליכים הייחודיים של העסק שלכם, ולא על "מה שעבד למישהו אחר".',
  },
  {
    icon: EyeOff,
    title: 'Zero-Leakage Data Privacy',
    description: 'הנתונים שלכם לא משמשים לאימון מודלים חיצוניים, אף פעם. בידוד מלא בין הסביבה שלכם לכל לקוח אחר — עיקרון תשתיתי, לא הבטחה שיווקית.',
  },
  {
    icon: Fingerprint,
    title: 'שכבת ממשל ובקרה (Guardian Agents)',
    description: 'סוכן-על עצמאי בוחן כל פעולה מול מדיניות עסקית מוגדרת מראש, עם יומני ביקורת מלאים ומנגנון עצירת חירום בכל רגע.',
  },
  {
    icon: Crown,
    title: 'ליווי אישי, לא כרטיס תמיכה',
    description: 'קשר ישיר עם דניאל לאורך כל תהליך ההטמעה — לא תור לתמיכה גנרית. זמינות אמיתית כשמשהו דחוף.',
  },
  {
    icon: RefreshCw,
    title: 'עדכונים ושדרוגים שוטפים',
    description: 'עולם ה-AI משתנה מדי חודש. הסוכנים שלכם מתעדכנים למודלים ולשיטות העבודה החדשות ביותר, ללא פרויקט שדרוג נפרד.',
  },
];

export default function PremiumAdvantage() {
  const dissolveRef = useSectionDissolve<HTMLElement>();

  const handleCta = () => {
    window.dispatchEvent(
      new CustomEvent('open-lead-modal', {
        detail: { subject: 'שיחת ייעוץ — היתרון הפרימיום', sourceSection: 'Premium Advantage' },
      })
    );
  };

  return (
    <section id="premium-advantage" ref={dissolveRef} data-field-form="rings" data-field-anchor="right" className="py-12 md:py-20 border-t border-white/5 relative overflow-hidden w-full">
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <motion.div className="text-center mb-14 md:mb-16 max-w-2xl mx-auto">
          <h2 className="font-display text-fluid-h2 font-black text-white mb-5">
            היתרון <span className="text-brand-500">הפרימיום</span>
          </h2>
          <p className="text-fluid-body text-zinc-300 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">
            שירות ברמה ארגונית עבור עסקים שרוצים AI אמיתי — לא כלי מדף, אלא מערכת מותאמת עם אבטחה, פרטיות וליווי ברמה שלא מתפשרת.
          </p>
        </motion.div>

        <div className="mobile-carousel-track -mx-4 px-4 pb-2 gap-4 md:mx-0 md:px-0 md:pb-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-6 w-full mb-14">
          {ADVANTAGES.map((adv) => (
            <motion.div
              key={adv.title}
              className="mobile-carousel-item w-[78%] md:w-auto group h-full"
            >
              <TiltCard strength={5} className="h-full">
                <div className="mobile-compact-card relative h-full overflow-hidden bg-[#0D0E12] border border-white/10 rounded-2xl p-7 transition-all duration-500 hover:border-[#76B900]/50 hover:-translate-y-1.5 hover:shadow-[0_10px_40px_-10px_rgba(118,185,0,0.2)]">
                  <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" aria-hidden="true" />
                  <div className="relative w-14 h-14 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center text-brand-400 mb-5">
                    <adv.icon className="w-7 h-7" />
                  </div>
                  <h3 className="relative font-display text-lg font-bold text-[#F1F5F9] mb-2.5">{adv.title}</h3>
                  <p className="relative text-zinc-400 text-sm leading-relaxed">{adv.description}</p>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>

        <div className="text-center">
          <WebButton variant="primary" onClick={handleCta} className="!px-8">
            שיחת ייעוץ והתאמה
          </WebButton>
        </div>
      </div>
    </section>
  );
}
