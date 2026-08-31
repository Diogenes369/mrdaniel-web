import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import WebButton from './WebButton';

export default function Hero() {
  const handleCtaClick = (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('open-lead-modal', { detail: { subject: 'שיחת אפיון — פרויקט חדש', sourceSection: 'Hero CTA' } }));
  };

  return (
    <section
      id="hero"
      className="relative min-h-[100dvh] flex items-center pt-28 pb-16 overflow-hidden"
    >
      <div className="container-wide relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-5xl mx-auto text-center px-4"
        >
          <h1 className="font-display text-fluid-hero font-black text-white mb-7 [text-shadow:0_2px_18px_rgba(0,0,0,0.85),0_6px_44px_rgba(0,0,0,0.75)]">
            סוכני AI, אוטומציה ופיתוח
            <br />
            <span className="text-brand-500 [text-shadow:0_2px_18px_rgba(0,0,0,0.85),0_0_30px_rgba(0,255,102,0.35)]">שנותנים לכם יתרון בלתי הוגן.</span>
          </h1>

          <p className="text-base md:text-xl text-zinc-300 font-light max-w-2xl mx-auto leading-relaxed mb-10 [text-shadow:0_2px_14px_rgba(0,0,0,0.9)]">
            למפתחים, לעצמאים, ליוצרים ולעסקים קטנים: <span className="text-white font-medium">סוכני AI ואוטומציות</span> שעובדות 24/7, הגנת סייבר בלי כאב ראש, ואתרים שממירים — הכל בהתאמה אישית, עם ROI שרואים במספרים.
          </p>

          <div className="flex justify-center">
            <WebButton variant="primary" magnetic onClick={handleCtaClick} className="w-full sm:w-auto">
              בואו נזניק את העסק
              <ArrowLeft className="w-5 h-5" />
            </WebButton>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
