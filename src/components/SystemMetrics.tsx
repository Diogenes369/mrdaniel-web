import { useEffect, useRef, useState } from 'react';
import { motion, useSpring, useTransform, useInView, useReducedMotion } from 'motion/react';
import { Gauge, Zap, Database, Lock, type LucideIcon } from 'lucide-react';
import { useSectionDissolve } from '../hooks/useSectionDissolve';

interface Metric {
  icon: LucideIcon;
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  label: string;
  sub: string;
}

const STATIC_METRICS: Metric[] = [
  { icon: Gauge, value: 99.99, decimals: 2, suffix: '%', label: 'SLA זמינות', sub: 'Enterprise Uptime' },
  { icon: Zap, value: 100, prefix: '<', suffix: 'ms', label: 'זמן תגובה לאיום', sub: 'Threat Response Time' },
  { icon: Database, value: 24, suffix: '+', label: 'צמתי RAG אוטונומיים', sub: 'Autonomous RAG Nodes' },
];

const PARTICLES = [
  { top: '18%', right: '8%', delay: 0 },
  { top: '65%', right: '22%', delay: 0.8 },
  { top: '28%', right: '52%', delay: 1.6 },
  { top: '72%', right: '78%', delay: 0.4 },
  { top: '12%', right: '92%', delay: 1.2 },
];

function AnimatedMetric({ value, decimals = 0, prefix = '', suffix = '' }: Pick<Metric, 'value' | 'decimals' | 'prefix' | 'suffix'>) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const spring = useSpring(0, { stiffness: 90, damping: 22, mass: 0.6 });
  const display = useTransform(spring, (v) =>
    `${prefix ?? ''}${v.toLocaleString('he-IL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix ?? ''}`
  );

  useEffect(() => {
    if (inView) spring.set(value);
  }, [inView, value, spring]);

  return (
    <motion.span ref={ref} dir="ltr">
      {display}
    </motion.span>
  );
}

/** Illustrative, clearly-labeled live-updating counter — same simulation pattern used by
 * ArchitectureBlueprint's LiveActivityTicker: a visual demonstration of the enforcement layer's
 * throughput, not a claim of real production telemetry. */
function LiveEnforcementsCard() {
  const [count, setCount] = useState(48_260);

  useEffect(() => {
    const id = setInterval(() => setCount((c) => c + Math.floor(Math.random() * 5) + 1), 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="group relative overflow-hidden bg-[#0D0E12] border border-white/10 hover:border-[#76B900]/50 rounded-2xl p-5 md:p-6 text-center transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_10px_40px_-10px_rgba(118,185,0,0.2)]">
      <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" aria-hidden="true" />
      <div className="relative w-10 h-10 mx-auto mb-3 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-brand-400">
        <Lock className="w-5 h-5" />
      </div>
      <div className="relative font-cyber font-bold text-2xl md:text-3xl text-[#F1F5F9]" dir="ltr">
        {count.toLocaleString('he-IL')}+
      </div>
      <div className="relative text-sm text-zinc-300 mt-1.5">אכיפות Zero-Trust</div>
      <div className="relative text-[11px] font-mono text-zinc-500 mt-0.5" dir="ltr">Live (סימולציה להמחשה)</div>
    </div>
  );
}

export default function SystemMetrics() {
  const dissolveRef = useSectionDissolve<HTMLElement>();
  const reduceMotion = useReducedMotion();

  return (
    <section
      id="system-metrics"
      ref={dissolveRef}
      data-field-form="helix"
      className="py-12 md:py-16 border-t border-white/5 relative overflow-hidden"
    >
      {!reduceMotion && (
        <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
          {PARTICLES.map((p, i) => (
            <motion.span
              key={i}
              className="absolute w-1 h-1 rounded-full bg-[#76B900] shadow-[0_0_10px_3px_rgba(118,185,0,0.5)]"
              style={{ top: p.top, right: p.right }}
              animate={{ y: [0, -16, 0], opacity: [0.15, 0.65, 0.15] }}
              transition={{ duration: 4.5, repeat: Infinity, delay: p.delay, ease: 'easeInOut' }}
            />
          ))}
        </div>
      )}

      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <motion.div
          className="flex items-center justify-center gap-2.5 mb-8"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse shadow-[0_0_8px_rgba(0,255,102,0.8)]" aria-hidden="true" />
          <h2 className="font-cyber text-xs sm:text-sm font-semibold text-brand-400 uppercase tracking-[0.25em] text-center">
            ארכיטקטורת מפתח ומדדי מערכת <span dir="ltr">Live</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
          {STATIC_METRICS.map((m) => (
            <div
              key={m.label}
              className="group relative overflow-hidden bg-[#0D0E12] border border-white/10 hover:border-[#76B900]/50 rounded-2xl p-5 md:p-6 text-center transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_10px_40px_-10px_rgba(118,185,0,0.2)]"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" aria-hidden="true" />
              <div className="relative w-10 h-10 mx-auto mb-3 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-brand-400">
                <m.icon className="w-5 h-5" />
              </div>
              <div className="relative font-cyber font-bold text-2xl md:text-3xl text-[#F1F5F9]">
                <AnimatedMetric value={m.value} decimals={m.decimals} prefix={m.prefix} suffix={m.suffix} />
              </div>
              <div className="relative text-sm text-zinc-300 mt-1.5">{m.label}</div>
              <div className="relative text-[11px] font-mono text-zinc-500 mt-0.5" dir="ltr">{m.sub}</div>
            </div>
          ))}

          <LiveEnforcementsCard />
        </div>
      </div>
    </section>
  );
}
