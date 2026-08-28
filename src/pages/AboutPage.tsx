import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import {
  Terminal,
  ShieldCheck,
  Bot,
  Lock,
  Layout,
  Network,
  Rocket,
  LayoutGrid,
  ShoppingBag,
  ArrowLeft,
  Share2,
} from 'lucide-react';
import { PageHero, SectionHeading, ServiceGrid, UnifiedCta } from '../components/content/ContentPrimitives';
import SocialLinks from '../components/SocialLinks';

const HUB_LINKS = [
  { icon: Lock, to: '/cyber', title: 'אבטחת סייבר', description: 'הגנה ברמת Zero-Trust, EDR/XDR ואבטחת מערכות AI' },
  { icon: Rocket, to: '/digital', title: 'פיתוח דיגיטלי ו-Web3', description: 'פלטפורמות, אתרים ואפליקציות בלוקצ׳יין ברמה ארגונית' },
  { icon: Bot, to: '/ai', title: 'בינה מלאכותית', description: 'סוכני AI אוטונומיים, RAG וחוברת הלימוד המלאה' },
  { icon: Network, to: '/architecture', title: 'ארכיטקטורת הגנה', description: 'תרשים ארבע השכבות ופריסת AI בטוחה בארגון' },
  { icon: LayoutGrid, to: '/capabilities', title: 'מטריצת יכולות', description: '18 יכולות מפורטות בשלושה תחומי הליבה' },
];

export default function AboutPage() {
  return (
    <div id="page-top" className="min-h-screen pt-24 md:pt-28">
      <div className="container mx-auto px-6 max-w-4xl">
        <PageHero
          badgeIcon={Terminal}
          badgeLabel="IT Management • Cyber Architecture • Agentic AI • Web3"
          title="הופכים טכנולוגיה מורכבת לפתרון תחרותי"
          subtitle="מנהל תשתיות ורשתות, ארכיטקט אבטחת סייבר ומומחה ליישום בינה מלאכותית ארגונית"
        />

        <div className="text-lg text-zinc-200 leading-[1.9] bg-carbon-900/60 border border-white/10 border-r-4 border-r-brand-500 rounded-xl p-6 md:p-7 mb-14">
          בעולם טכנולוגי שנע במהירות שיא, הפער בין אימוץ טכנולוגיה חדשה לבין יצירת יתרון עסקי אמיתי טמון בחיבור הנכון בין תשתיות רשת חזקות, הגנה היקפית מודרנית ואוטומציה חכמה מבוססת AI — לא בכל רכיב בנפרד.
        </div>

        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.5 }} className="bg-carbon-900/50 border border-white/10 rounded-2xl p-7 md:p-9 mb-16">
          <h2 className="flex items-center gap-3 font-display font-bold text-xl md:text-2xl text-white mb-5">
            <ShieldCheck className="w-6 h-6 text-brand-400" />
            על הפעילות והחזון המקצועי
          </h2>
          <div className="space-y-4 text-base md:text-lg text-zinc-300 leading-[1.85]">
            <p>
              אני <strong className="text-white">דניאל</strong>, מנהל רשת ותשתיות IT (IT Manager) עם רקע מעשי בניהול מערכות תקשורת ארגוניות בפועל — לא מתוך תיאוריה בלבד. על גבי הרקע הזה נבנתה התמחות מעמיקה בשלושה תחומים שמזינים זה את זה: ארכיטקטורת אבטחת סייבר ברמת Zero-Trust, יישום סוכני בינה מלאכותית אוטונומיים ברמה ארגונית, ופיתוח פלטפורמות דיגיטליות וטכנולוגיות Web3 מתקדמות.
            </p>
            <p>
              השילוב הזה — ניהול תשתיות אמיתי, יחד עם AI מתקדם ואבטחה ברמה ארגונית — הוא ההבדל המרכזי מול "יועץ AI" גנרי או פרילנסר שמכיר רק שכבה אחת. כל מערכת נבנית מתוך הבנה איך היא באמת תתנהג ברשת ארגונית תחת עומס, ולא רק איך היא נראית ב-Demo.
            </p>
            <p>
              החזון שלי מבוסס על גישה הנדסית, מעשית ומדויקת: לבנות מערכות שאינן רק מאובטחות ברמה הגבוהה ביותר, אלא כאלו המזניקות את היעילות התפעולית של העסק. החל מתכנון והקמת רשתות ארגוניות מתקדמות (כולל Wi-Fi 7 והשפעתו המעשית על ארכיטקטורת רשת), דרך הגנת סייבר אקטיבית במודל Zero-Trust — הגנה שכוללת גם את סוכני ה-AI עצמם מפני Prompt Injection ודליפת מידע — ועד להטמעת כלי אוטומציה ופיתוח פלטפורמות דיגיטליות מקצה לקצה, כולל Web3 וחוזים חכמים.
            </p>
            <p>
              לצד העבודה הניהולית והטכנולוגית, אני מאמין בשיתוף ידע ובהנגשת המהפכה הטכנולוגית. דרך האתר, המגזינים וחוברות התוכן המקצועיות שאני מוציא לאור, אני מעניק לבעלי עסקים, מנהלים ומובילי טכנולוגיה את הכלים, הניתוחים והתובנות העדכניים ביותר — בדיוק כפי שהם קורים בשטח, לא כפי שהם מתוארים בפוסט שיווקי.
            </p>
          </div>
        </motion.div>

        <SectionHeading icon={Layout} title="ארבעת עמודי התווך" description="הפעילות המקצועית והפתרונות הטכנולוגיים שהאתר בנוי סביבם" />
        <ServiceGrid
          items={[
            { icon: Bot, title: 'בינה מלאכותית (Agentic AI)', description: 'הטמעת סוכנים אוטונומיים תחת שכבת Guardian Agents לממשל ובקרה, ארכיטקטורת RAG לניהול ידע ארגוני, וייעול שרשרת העבודה מקצה לקצה.' },
            { icon: Lock, title: 'סייבר ואבטחת מידע ברמת Zero-Trust', description: 'הגנה אקטיבית שלעולם לא מניחה אמון מובנה — ניהול זהויות (IAM / Entra ID), הקשחת רשתות ארגוניות, EDR/XDR והגנה על מערכות ה-AI עצמן.' },
            { icon: Rocket, title: 'פיתוח דיגיטלי ו-Web3', description: 'בניית פלטפורמות ואתרים ברמה ארגונית, dApps וחוזים חכמים מאובטחים, עם ארכיטקטורת ענן וקוד נקי מקצה לקצה.' },
            { icon: Network, title: 'תשתיות רשת ארגוניות (כולל Wi-Fi 7)', description: 'תכנון וייעוץ רשתות ארגוניות ברמה גבוהה — רוחב פס, latency נמוך ואבטחת שכבת רשת, ישירות מתוך ניסיון ניהול תשתיות בשטח.' },
          ]}
        />

        <div className="bg-carbon-800/60 border border-white/10 rounded-2xl p-6 md:p-8 mb-16">
          <div className="flex items-center gap-2.5 mb-5">
            <LayoutGrid className="w-5 h-5 text-brand-400" />
            <h3 className="font-display font-bold text-xl text-white">כל שירותי האתר במקום אחד</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {HUB_LINKS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="group flex items-center gap-4 bg-black/30 border border-white/5 rounded-xl p-4 hover:border-brand-500/40 hover:bg-black/50 transition-colors"
              >
                <span className="shrink-0 w-11 h-11 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-brand-400 group-hover:bg-brand-500/15 group-hover:border-brand-500/40 transition-colors">
                  <item.icon className="w-5 h-5" />
                </span>
                <span className="min-w-0 flex-grow">
                  <strong className="block text-white text-sm mb-0.5">{item.title}</strong>
                  <span className="block text-zinc-500 text-xs leading-relaxed">{item.description}</span>
                </span>
                <ArrowLeft className="w-4 h-4 text-zinc-600 group-hover:text-brand-400 shrink-0 transition-colors" />
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-carbon-900/60 border border-white/10 rounded-2xl p-7 md:p-9 mb-16 text-center">
          <div className="flex items-center justify-center gap-2.5 mb-3">
            <Share2 className="w-5 h-5 text-brand-400" />
            <h3 className="font-display font-bold text-xl text-white">עקבו אחרי הפעילות באופן שוטף</h3>
          </div>
          <p className="text-zinc-400 text-sm md:text-base leading-relaxed mb-6 max-w-lg mx-auto">
            תובנות טכניות, עדכוני AI וסייבר, ותוכן מהשטח — ישירות ברשתות החברתיות או במייל.
          </p>
          <SocialLinks className="justify-center" iconClassName="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300 hover:text-brand-400 hover:border-brand-500/40 hover:shadow-[0_0_16px_rgba(0,255,102,0.35)] transition-all outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60" glyphClassName="w-5 h-5" />
        </div>

        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.5 }} className="bg-carbon-900 border border-brand-500/30 rounded-2xl p-8 md:p-12 text-center mb-16">
          <p className="font-display text-xl md:text-2xl font-bold text-white leading-relaxed mb-4">
            "טכנולוגיה איכותית אינה נמדדת בסיבוכיות שלה, אלא בשקט התפעולי ובערך העסקי שהיא מייצרת."
          </p>
          <span className="text-brand-400 font-medium">— דניאל</span>
        </motion.div>

        <div className="bg-gradient-to-br from-brand-500/15 via-carbon-900 to-carbon-900 border border-brand-500/30 rounded-2xl p-7 md:p-10 mb-16 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-right">
          <div>
            <h3 className="font-display font-bold text-xl md:text-2xl text-white mb-2">רוצים להעמיק בעצמכם? זה בחנות</h3>
            <p className="text-zinc-400 max-w-md">חוברות עבודה מקצועיות ומגזינים דיגיטליים בנושאי AI, סייבר ורשתות ארגוניות — ידע מעשי, לא תיאוריה.</p>
          </div>
          <Link
            to="/magazines"
            className="shrink-0 inline-flex items-center gap-2 bg-brand-500 text-black font-bold rounded-full px-6 py-3.5 text-sm md:text-base hover:bg-brand-400 transition-colors shadow-[0_0_20px_rgba(0,255,102,0.2)]"
          >
            <ShoppingBag className="w-4 h-4" />
            למעבר לחנות
          </Link>
        </div>

        <SectionHeading icon={ShieldCheck} title="מעוניינים בייעוץ, ליווי או שיתוף פעולה?" description="בואו נבחן יחד כיצד לחזק את התשתיות, להגן על הארגון ולהטמיע כלי AI מתקדמים בעסק שלכם" />
        <UnifiedCta
          mailSubject="ייעוץ אסטרטגי — AI, סייבר ותשתיות"
          whatsappMessage="שלום דניאל, אשמח לשיחת ייעוץ ראשונית על AI, סייבר או תשתיות עבור העסק שלי."
        />
      </div>
    </div>
  );
}
