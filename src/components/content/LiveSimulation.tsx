import { useEffect, useRef, useState } from 'react';
import { motion, useSpring, useTransform } from 'motion/react';
import { CheckCircle2, Circle, Cpu, Gauge, Terminal, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface SimulationStep {
  icon: LucideIcon;
  label: string;
  detail: string;
}

interface LiveSimulationProps {
  title: string;
  description: string;
  steps: SimulationStep[];
  intervalMs?: number;
}

const BAR_COUNT = 14;
const METRIC_TICK_MS = 700;

function AnimatedMetric({ value }: { value: number }) {
  const spring = useSpring(value, { stiffness: 90, damping: 20, mass: 0.5 });
  const display = useTransform(spring, (v) => Math.round(v).toLocaleString('he-IL'));

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  return <motion.span className="tabular-nums">{display}</motion.span>;
}

function MetricTile({ icon: Icon, label, value, suffix = '' }: { icon: LucideIcon; label: string; value: number; suffix?: string }) {
  return (
    <div className="bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 flex flex-col gap-1 min-h-[72px] justify-center">
      <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500 uppercase tracking-wide">
        <Icon className="w-3 h-3 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="font-display font-bold text-lg text-white">
        <AnimatedMetric value={value} />
        {suffix}
      </div>
    </div>
  );
}

/** Bounded random-walk — each tick nudges the previous value rather than jumping fully random, so
 * the metric reads as a live sensor rather than flickering noise. */
function walk(prev: number, min: number, max: number, maxDelta: number) {
  const next = prev + (Math.random() - 0.5) * 2 * maxDelta;
  return Math.max(min, Math.min(max, next));
}

function BarChart({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="h-16 flex items-end gap-1" aria-hidden="true">
      {values.map((v, idx) => (
        <div
          key={idx}
          className="flex-1 bg-gradient-to-t from-brand-500/70 to-brand-300/70 rounded-sm transition-[height] duration-500 ease-out"
          style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function StepRow({ step, status }: { step: SimulationStep; status: 'done' | 'active' | 'pending' }) {
  const Icon = step.icon;
  return (
    <div
      className={`flex items-center gap-3 min-h-[52px] px-3 rounded-lg border transition-colors duration-300 ${
        status === 'active'
          ? 'bg-brand-500/10 border-brand-400/50'
          : status === 'done'
            ? 'bg-black/20 border-white/10'
            : 'bg-black/10 border-white/5'
      }`}
    >
      <div
        className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center border transition-colors duration-300 ${
          status === 'active'
            ? 'bg-brand-500/20 border-brand-400/50 text-brand-300'
            : status === 'done'
              ? 'bg-white/5 border-white/10 text-zinc-500'
              : 'bg-white/[0.02] border-white/5 text-zinc-600'
        }`}
      >
        <Icon className="w-3.5 h-3.5" />
      </div>
      <span className={`flex-1 min-w-0 truncate text-sm font-bold ${status === 'pending' ? 'text-zinc-500' : 'text-white'}`}>
        {step.label}
      </span>
      {status === 'active' && (
        <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-brand-400 uppercase shrink-0">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-400" />
          </span>
          מבצע כעת
        </span>
      )}
      {status === 'done' && <CheckCircle2 className="w-4 h-4 text-brand-500/70 shrink-0" />}
      {status === 'pending' && <Circle className="w-3.5 h-3.5 text-zinc-700 shrink-0" />}
    </div>
  );
}

/** A "live dashboard" visual: steps auto-advance on a timer and loop continuously, driving
 * animated metrics, a throughput bar chart, and a technical log that narrates each step in Hebrew.
 * Every piece has a fixed footprint (row heights, chart height, log panel height) — nothing ever
 * grows/shrinks the surrounding layout as the simulation runs, which is what caused visible page
 * jumps in an earlier version that toggled a detail paragraph's height per step.
 * Explicitly labeled as a simulation — same honesty convention as ArchitectureBlueprint's
 * LiveActivityTicker (a real illustrative animation, not a claim of live production data). */
export default function LiveSimulation({ title, description, steps, intervalMs = 2600 }: LiveSimulationProps) {
  const [active, setActive] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [tokens, setTokens] = useState(1400);
  const [cpu, setCpu] = useState(42);
  const [latency, setLatency] = useState(90);
  const [history, setHistory] = useState<number[]>(() => Array.from({ length: BAR_COUNT }, () => 40 + Math.random() * 40));
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setActive((a) => (a + 1) % steps.length), intervalMs);
    return () => clearInterval(id);
  }, [steps.length, intervalMs]);

  // Appends one log line each time the active step changes — the technical narration lives here
  // (fixed-height, internally scrollable) rather than as a per-card detail block.
  useEffect(() => {
    const step = steps[active];
    if (!step) return;
    const timestamp = new Date().toLocaleTimeString('he-IL', { hour12: false });
    setLogs((prev) => [...prev.slice(-24), `[${timestamp}] ${step.detail}`]);
  }, [active, steps]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    const id = setInterval(() => {
      setTokens((v) => walk(v, 600, 2600, 220));
      setCpu((v) => walk(v, 15, 92, 9));
      setLatency((v) => walk(v, 35, 210, 18));
      setHistory((prev) => [...prev.slice(1), 20 + Math.random() * 80]);
    }, METRIC_TICK_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="cyber-glass cyber-glass--info rounded-2xl p-5 sm:p-6 lg:p-8 mb-16 min-h-[500px] max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
        <h3 className="font-display font-bold text-xl text-white">{title}</h3>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold text-brand-400 uppercase tracking-widest border border-brand-500/30 rounded-full px-2.5 py-1 shrink-0">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-400" />
          </span>
          הדגמה חיה (סימולציה להמחשה)
        </span>
      </div>
      <p className="text-zinc-400 text-sm mb-6 max-w-2xl leading-relaxed">{description}</p>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
        <div className="flex flex-col gap-2">
          {steps.map((step, idx) => (
            <StepRow key={step.label} step={step} status={idx < active ? 'done' : idx === active ? 'active' : 'pending'} />
          ))}
        </div>

        <div className="bg-black/40 border border-white/10 rounded-xl p-4 md:p-5 flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2.5">
            <MetricTile icon={Zap} label="טוקנים/שנייה" value={tokens} />
            <MetricTile icon={Cpu} label="עומס CPU" value={cpu} suffix="%" />
            <MetricTile icon={Gauge} label="זמן תגובה" value={latency} suffix="ms" />
          </div>

          <BarChart values={history} />

          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500 uppercase tracking-wide mb-2">
              <Terminal className="w-3 h-3" />
              יומן ביצוע (Live Log)
            </div>
            <div
              ref={logRef}
              dir="rtl"
              className="h-[130px] overflow-y-auto momentum-scroll bg-black/60 border border-white/10 rounded-lg p-3 font-mono text-[11px] leading-relaxed text-brand-300 space-y-1"
            >
              {logs.map((line, idx) => (
                <div key={idx} className={idx === logs.length - 1 ? 'text-brand-200' : 'text-brand-300/70'}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
