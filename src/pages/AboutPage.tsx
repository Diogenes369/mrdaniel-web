import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import {
  Terminal,
  ShieldCheck,
  Bot,
  Cpu,
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
import { ABOUT_COPY } from '../data/siteCopy';
import { rtl } from '../lib/rtl';

const PILLAR_ICONS = [Bot, Cpu, Network, Rocket];

const HUB_LINKS = [
  { icon: Terminal, to: '/news', title: 'חדשות ומדריכי AI', description: 'מה חדש ב-AI כל יום, והסבר פשוט על המודלים החדשים' },
  { icon: Bot, to: '/ai', title: 'סוכני AI', description: 'מה זה סוכן, מה צריך להכין ואיך בונים אותו יחד' },
  { icon: Rocket, to: '/jarvis', title: 'מערכת JARVIS', description: 'עוזר AI אישי בעברית למייל, ליומן ולמשימות' },
  { icon: LayoutGrid, to: '/magazines', title: 'מדריכים וחוברות', description: 'מדריכי AI מעשיים, PDF להורדה מיידית' },
];

export default function AboutPage() {
  return (
    <div id="page-top" className="min-h-screen pt-24 md:pt-28">
      <div className="container-wide">
        <PageHero
          badgeIcon={Terminal}
          badgeLabel="AI News • LLMs • Autonomous Agents"
          title={rtl(ABOUT_COPY.title)}
          subtitle={rtl(ABOUT_COPY.subtitle)}
        />

        <div className="glass-panel glass-panel--info text-lg text-zinc-200 leading-[1.9] rounded-xl p-5 sm:p-6 lg:p-7 mb-14 max-w-4xl">
          {rtl(ABOUT_COPY.lede)}
        </div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="glass-panel glass-panel--info rounded-2xl p-6 sm:p-8 mb-16 max-w-4xl">
          <h2 className="flex items-center gap-3 font-display font-bold text-xl md:text-2xl text-white mb-5">
            <ShieldCheck className="w-6 h-6 text-brand-400" />
            מי אני ומה אני בונה
          </h2>
          <div className="space-y-4 text-base md:text-lg text-zinc-300 leading-[1.85]">
            {ABOUT_COPY.paras.map((para) => (
              <p key={para}>{rtl(para)}</p>
            ))}
          </div>
        </motion.div>

        <SectionHeading icon={Layout} title="ארבעת עמודי התווך" description="מה אני בונה, למי, ואיפה לומדים את זה לבד" />
        <ServiceGrid
          items={ABOUT_COPY.pillars.map((pillar, i) => ({
            icon: PILLAR_ICONS[i % PILLAR_ICONS.length],
            title: rtl(pillar.title),
            description: rtl(pillar.description),
          }))}
        />

        <div className="glass-panel glass-panel--info rounded-2xl p-5 sm:p-6 lg:p-8 mb-16">
          <div className="flex items-center gap-2.5 mb-5">
            <LayoutGrid className="w-5 h-5 text-brand-400" />
            <h3 className="font-display font-bold text-xl text-white">כל שירותי האתר במקום אחד</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
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

        <div className="glass-panel glass-panel--info rounded-2xl p-6 sm:p-8 mb-16 text-center max-w-3xl mx-auto">
          <div className="flex items-center justify-center gap-2.5 mb-3">
            <Share2 className="w-5 h-5 text-brand-400" />
            <h3 className="font-display font-bold text-xl text-white">עקבו אחרי הפעילות באופן שוטף</h3>
          </div>
          <p className="text-zinc-400 text-sm md:text-base leading-relaxed mb-6 max-w-lg mx-auto">
            טיפים, עדכוני AI ומה שאני לומד תוך כדי עבודה, ישירות ברשתות או במייל.
          </p>
          <SocialLinks className="justify-center" iconClassName="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300 hover:text-brand-400 hover:border-brand-500/40 hover:shadow-[0_0_16px_rgba(0,255,102,0.35)] transition-all outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60" glyphClassName="w-5 h-5" />
        </div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="glass-panel glass-panel--flagship rounded-2xl p-8 md:p-12 text-center mb-16 max-w-4xl mx-auto">
          <p className="font-display text-xl md:text-2xl font-bold text-white leading-relaxed mb-4">
            "{rtl(ABOUT_COPY.quote)}"
          </p>
          <span className="text-brand-400 font-medium">— דניאל</span>
        </motion.div>

        <div className="bg-gradient-to-br from-brand-500/15 via-carbon-900 to-carbon-900 border border-brand-500/30 rounded-2xl p-7 md:p-10 mb-16 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-right max-w-5xl mx-auto">
          <div>
            <h3 className="font-display font-bold text-xl md:text-2xl text-white mb-2">רוצים ללמוד לבד? יש מדריכים</h3>
            <p className="text-zinc-400 max-w-md">מדריכים וחוברות על סוכני AI, צעד אחר צעד. דברים שאפשר לעשות, לא תיאוריה.</p>
          </div>
          <Link
            to="/magazines"
            className="shrink-0 inline-flex items-center gap-2 bg-brand-500 text-black font-bold rounded-full px-6 py-3.5 text-sm md:text-base hover:bg-brand-400 transition-colors shadow-[0_0_20px_rgba(0,255,102,0.2)]"
          >
            <ShoppingBag className="w-4 h-4" />
            למעבר לחנות
          </Link>
        </div>

        <SectionHeading icon={ShieldCheck} title={rtl(ABOUT_COPY.ctaTitle)} description={rtl(ABOUT_COPY.ctaDescription)} />
        <UnifiedCta
          mailSubject="אפיון סוכן AI"
          whatsappMessage="שלום דניאל, אשמח לשיחת אפיון ראשונית על סוכן AI."
        />
      </div>
    </div>
  );
}
