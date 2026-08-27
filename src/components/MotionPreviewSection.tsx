import { useWordReveal } from '../hooks/useWordReveal';
import { isMotionV2Enabled } from '../lib/motionFlag';

/**
 * Self-contained preview banner for the `?motion=2d` experiment — demonstrates the reversible
 * word-mask reveal (scroll it into view, then back out, to see it reverse) against real page
 * content, and tells whoever's previewing how the flag works. Renders nothing at all unless the
 * flag is on, so this is the only line HomePage.tsx needs to carry the whole feature.
 */
export default function MotionPreviewSection() {
  const headingRef = useWordReveal<HTMLHeadingElement>();
  if (!isMotionV2Enabled()) return null;

  return (
    <section className="relative z-10 py-24 border-y border-white/10 bg-carbon-900/60">
      <div className="container mx-auto px-6 max-w-3xl text-center">
        <p className="font-mono text-xs tracking-[0.25em] text-brand-500 uppercase mb-4">
          תצוגה מקדימה · Motion Engine v2
        </p>
        <h2 ref={headingRef} className="font-display text-fluid-h2 font-bold text-white mb-6">
          שדה חלקיקים ריאקטיבי, בהשראת Latitude
        </h2>
        <p className="text-zinc-300 leading-relaxed mb-8">
          הרקע שמאחורי הדף — הכוכבים התלת-ממדיים בראש הדף, השדה הריאקטיבי לעכבר, והסמן המותאם — כולם
          רצים על מנוע <span className="text-white font-medium">Canvas2D</span> קליל, ללא Three.js
          וללא ספריית אנימציה, מעל שכבת כוכבים אמיתית ב-WebGL. גררו את הכוכבים בראש הדף, הזיזו את
          העכבר קרוב אליהם, וגללו למעלה ולמטה כדי לראות את הכותרת הזו נכנסת ויוצאת דרך המסכה שלה.
        </p>
        <p className="font-mono text-[11px] tracking-wide text-zinc-500">
          כדי לכבות את התצוגה המקדימה: הוסיפו <code className="text-zinc-300">?motion=off</code> לכתובת.
        </p>
        <p
          data-cursor="נסו לרחף כאן"
          className="inline-block mt-6 font-mono text-[11px] tracking-widest text-brand-400 uppercase border border-brand-500/30 rounded-full px-4 py-2 cursor-default"
        >
          דוגמה לסמן מותאם — data-cursor
        </p>
      </div>
    </section>
  );
}
