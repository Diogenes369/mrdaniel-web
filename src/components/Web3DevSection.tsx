import { Wallet, Blocks, ShieldCheck, Boxes, Palette, Zap, Sparkles, Orbit, type LucideIcon } from 'lucide-react';
import TiltCard from './TiltCard';
import WebButton from './WebButton';
import { useSectionDissolve } from '../hooks/useSectionDissolve';

interface Capability {
  icon: LucideIcon;
  title: string;
  description: string;
  tags: string[];
}

const CAPABILITIES: Capability[] = [
  {
    icon: Wallet,
    title: 'אינטגרציית Web3 מהדור הבא',
    description: 'חיבור ארנקים חלק (Wallet Connect), חוזים חכמים מותאמים אישית, ואבטחה מבוזרת ברמת פרוטוקול — לא תוסף מדף.',
    tags: ['Wallet Connect', 'Smart Contracts', 'Decentralized Security'],
  },
  {
    icon: Orbit,
    title: 'חוויות WebGL תלת-ממדיות אינטראקטיביות',
    description: 'סצנות תלת-ממד אמיתיות בדפדפן — לא סרטון רקע. אינטראקציה חיה עם מצביע/מגע, מותאמת לביצועים בכל מכשיר.',
    tags: ['Three.js / WebGL', 'GPU-Accelerated', '60 FPS'],
  },
  {
    icon: Palette,
    title: 'עיצוב UI/UX יוקרתי ומותאם אישית',
    description: 'שום תבנית מדף. כל פיקסל נבנה סביב זהות המותג שלכם — טיפוגרפיה, תנועה ומרווחים ברמת בוטיק דיגיטלי.',
    tags: ['Custom Design System', 'Motion Design', 'Pixel-Perfect'],
  },
  {
    icon: Zap,
    title: 'ארכיטקטורת טעינה מהירה',
    description: 'קוד נקי ותשתית מותאמת ל-Core Web Vitals — טעינה תת-שנייתית, ללא פשרה על העושר החזותי.',
    tags: ['Sub-1s Load', 'Edge Deployment', 'Code Splitting'],
  },
];

export default function Web3DevSection() {
  const sectionRef = useSectionDissolve<HTMLElement>();

  const handleCta = () => window.dispatchEvent(new CustomEvent('open-agent-qualifier'));

  return (
    <section
      id="web3-dev"
      ref={sectionRef}
      data-field-form="helix"
      data-field-anchor="right"
      className="py-12 md:py-20 border-t border-white/5 relative overflow-hidden w-full"
    >
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="text-center mb-14 max-w-2xl mx-auto">
          <h2 className="font-display text-fluid-h2 font-black text-white mb-5">
            פיתוח <span className="text-brand-500">Web3 וחוויות דיגיטליות</span> ברמה הגבוהה ביותר
          </h2>
          <p className="text-fluid-body text-zinc-300 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">
            עבור לקוחות פרטיים ועסקיים שרוצים נוכחות דיגיטלית שנראית ומרגישה כמו מוצר טכנולוגי אמיתי — לא עוד אתר תדמית.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-10 max-w-6xl mx-auto items-center">
          <div className="mobile-carousel-track -mx-4 px-4 pb-2 gap-4 md:mx-0 md:px-0 md:pb-0 md:grid md:grid-cols-2 md:gap-5">
            {CAPABILITIES.map((cap) => (
              <TiltCard key={cap.title} strength={6} className="mobile-carousel-item w-[78%] md:w-auto h-full">
                <div className="mobile-compact-card group relative h-full overflow-hidden bg-[#0D0E12] border border-white/10 rounded-2xl p-6 transition-all duration-500 hover:border-[#76B900]/50 hover:-translate-y-1.5 hover:shadow-[0_10px_40px_-10px_rgba(118,185,0,0.2)]">
                  <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" aria-hidden="true" />
                  <div className="relative w-12 h-12 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-brand-400 mb-4">
                    <cap.icon className="w-6 h-6" />
                  </div>
                  <h3 className="relative font-display text-base font-bold text-white mb-2 leading-snug">{cap.title}</h3>
                  <p className="relative text-zinc-400 text-sm leading-relaxed mb-4">{cap.description}</p>
                  <div className="relative flex flex-wrap gap-1.5">
                    {cap.tags.map((tag) => (
                      <span key={tag} className="text-[10px] font-mono font-bold text-brand-400 bg-brand-500/10 border border-brand-500/20 rounded-full px-2 py-1">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </TiltCard>
            ))}
          </div>

          {/* Decorative "live" Web3/3D showcase mockup — pure CSS/SVG orbit, GPU-cheap transform-only animation */}
          <TiltCard strength={8} className="h-full">
            <div className="relative h-full min-h-[360px] bg-[#0D0E12] border border-white/10 rounded-[2rem] overflow-hidden flex flex-col items-center justify-center p-8">
              <div className="absolute inset-0 bg-gradient-to-b from-brand-500/[0.06] to-transparent pointer-events-none" aria-hidden="true" />

              <div className="relative w-52 h-52" aria-hidden="true">
                <div className="absolute inset-0 rounded-full border border-brand-500/20" />
                <div className="absolute inset-6 rounded-full border border-brand-500/15" />
                <div className="absolute inset-12 rounded-full bg-brand-500/10 border border-brand-500/30 flex items-center justify-center">
                  <Boxes className="w-9 h-9 text-brand-400" />
                </div>

                <div className="absolute inset-0 gpu" style={{ animation: 'web3-orbit 14s linear infinite' }}>
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-lg bg-black border border-brand-500/50 flex items-center justify-center text-brand-400 shadow-[0_0_16px_rgba(0,255,102,0.4)]">
                    <Wallet className="w-3 h-3" />
                  </span>
                </div>
                <div className="absolute inset-0 gpu" style={{ animation: 'web3-orbit 14s linear infinite', animationDelay: '-4.6s' }}>
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-lg bg-black border border-brand-500/50 flex items-center justify-center text-brand-400 shadow-[0_0_16px_rgba(0,255,102,0.4)]">
                    <ShieldCheck className="w-3 h-3" />
                  </span>
                </div>
                <div className="absolute inset-0 gpu" style={{ animation: 'web3-orbit 14s linear infinite', animationDelay: '-9.3s' }}>
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-lg bg-black border border-brand-500/50 flex items-center justify-center text-brand-400 shadow-[0_0_16px_rgba(0,255,102,0.4)]">
                    <Sparkles className="w-3 h-3" />
                  </span>
                </div>
              </div>

              <p className="relative mt-6 text-center text-xs font-mono text-zinc-500 uppercase tracking-widest">Live Interactive Rendering Preview</p>
            </div>
          </TiltCard>
        </div>

        <div className="text-center mt-12">
          <WebButton variant="primary" onClick={handleCta} className="!px-8">
            בואו נבנה את הפרויקט שלכם
          </WebButton>
        </div>
      </div>

      <style>{`
        @keyframes web3-orbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </section>
  );
}
