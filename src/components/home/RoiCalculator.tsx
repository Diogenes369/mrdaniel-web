import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Calculator, Clock, TrendingUp, Send, Users, Timer, Wallet } from 'lucide-react';
import WebButton from '../WebButton';

/**
 * Interactive "AI & Automation ROI Calculator" — a lead magnet, not a binding quote.
 *
 * The visitor sets three sliders (team size, hours/week each person burns on repetitive work,
 * loaded hourly cost). The output panel derives two headline figures — reclaimed operational hours
 * and estimated monthly saving — plus an annualised figure. Every coefficient is shown in the fine
 * print so the number is defensible rather than magic.
 *
 * Layout-shift safety: the output panel is a fixed-height grid with `tabular-nums`, so digits
 * changing as a slider drags never reflow the card. Sliders are native `<input type="range">` with
 * `accent-color` — no JS drag handling, no custom thumb measurement.
 */

const WEEKS_PER_MONTH = 4.33;
// Share of identified repetitive hours a well-scoped automation / agent build typically removes.
// Deliberately conservative — real projects often clear more, but this keeps the estimate credible.
const AUTOMATION_RECLAIM = 0.6;

const FMT_INT = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 });
const ils = (n: number) => `₪${FMT_INT.format(Math.round(n))}`;

interface SliderProps {
  id: string;
  icon: typeof Users;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: string;
}

function Slider({ id, icon: Icon, label, value, min, max, step, onChange, display }: SliderProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label htmlFor={id} className="flex items-center gap-2 text-sm font-bold text-zinc-300">
          <Icon className="w-4 h-4 text-brand-400 shrink-0" />
          {label}
        </label>
        <span className="font-mono text-sm font-bold text-brand-300 tabular-nums" dir="ltr">
          {display}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 cursor-pointer appearance-none rounded-full bg-white/10 [accent-color:#76B900] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
      />
    </div>
  );
}

export default function RoiCalculator() {
  const [employees, setEmployees] = useState(8);
  const [hoursPerWeek, setHoursPerWeek] = useState(10);
  const [hourlyCost, setHourlyCost] = useState(90);

  const { reclaimedHours, monthlySavings, annualSavings } = useMemo(() => {
    const repetitiveMonthly = employees * hoursPerWeek * WEEKS_PER_MONTH;
    const reclaimed = repetitiveMonthly * AUTOMATION_RECLAIM;
    const monthly = reclaimed * hourlyCost;
    return { reclaimedHours: reclaimed, monthlySavings: monthly, annualSavings: monthly * 12 };
  }, [employees, hoursPerWeek, hourlyCost]);

  const requestScoping = () => {
    window.dispatchEvent(
      new CustomEvent('open-lead-modal', {
        detail: {
          subject: `אפיון אוטומציה — ${employees} עובדים, חיסכון חודשי משוער ${ils(monthlySavings)} / ${FMT_INT.format(
            Math.round(reclaimedHours)
          )} שעות`,
          sourceSection: 'ROI Calculator',
        },
      })
    );
  };

  return (
    <section id="roi-calculator" className="relative py-20 md:py-32 border-t border-white/5 overflow-x-clip cv-auto">
      <div className="container-wide relative z-10">
        <div className="max-w-3xl mx-auto text-center mb-12 md:mb-16">
          <h2 className="font-display text-fluid-h2 font-black text-white mb-5">
            מחשבון <span className="text-brand-500">ROI לאוטומציה ו-AI</span>
          </h2>
          <p className="font-sans text-fluid-body text-zinc-300 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">
            כמה זמן ותקציב הצוות שלכם מאבד על עבודה חוזרת שאפשר להעביר לסוכן AI — הזיזו את המחוונים וקבלו הערכה מיידית.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 md:gap-8 max-w-5xl mx-auto items-stretch">
          {/* ---- Inputs ---- */}
          <div className="bg-carbon-900/60 border border-white/10 rounded-2xl p-6 md:p-8 flex flex-col">
            <div className="flex items-center gap-2.5 mb-7">
              <Calculator className="w-5 h-5 text-brand-400" />
              <h3 className="font-display font-bold text-xl text-white">הנתונים שלכם</h3>
            </div>
            <div className="space-y-7 flex-1">
              <Slider
                id="roi-employees"
                icon={Users}
                label="מספר עובדים רלוונטיים"
                value={employees}
                min={1}
                max={200}
                step={1}
                onChange={setEmployees}
                display={`${employees}`}
              />
              <Slider
                id="roi-hours"
                icon={Timer}
                label="שעות שבועיות למשימות חוזרות (לעובד)"
                value={hoursPerWeek}
                min={1}
                max={40}
                step={1}
                onChange={setHoursPerWeek}
                display={`${hoursPerWeek} ש'`}
              />
              <Slider
                id="roi-cost"
                icon={Wallet}
                label="עלות שעת עבודה ממוצעת (₪)"
                value={hourlyCost}
                min={40}
                max={250}
                step={5}
                onChange={setHourlyCost}
                display={ils(hourlyCost)}
              />
            </div>
            <p className="text-[11px] text-zinc-500 mt-7 leading-relaxed">
              ההערכה מניחה ש-{Math.round(AUTOMATION_RECLAIM * 100)}% מהשעות החוזרות שזוהו עוברות לאוטומציה / סוכן AI, לפי{' '}
              {WEEKS_PER_MONTH} שבועות בחודש. מספרים להמחשה בלבד — ההיקף המדויק נקבע בשיחת אפיון.
            </p>
          </div>

          {/* ---- Output ---- */}
          <motion.div
            key={`${Math.round(reclaimedHours)}-${Math.round(monthlySavings)}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="bg-gradient-to-br from-brand-500/[0.12] to-carbon-900 border border-brand-500/30 rounded-2xl p-6 md:p-8 flex flex-col"
          >
            <div className="grid sm:grid-cols-2 gap-5 flex-1 content-center">
              <div className="min-h-[132px]">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest mb-2">
                  <Clock className="w-4 h-4 text-brand-400" />
                  שעות תפעול שמוחזרות / חודש
                </div>
                <div className="font-display text-4xl md:text-5xl font-black text-brand-400 tabular-nums leading-none">
                  {FMT_INT.format(Math.round(reclaimedHours))}
                </div>
                <p className="text-[11px] text-zinc-500 mt-2">≈ {FMT_INT.format(Math.round(reclaimedHours / WEEKS_PER_MONTH))} שעות בשבוע חוזרות לצוות</p>
              </div>
              <div className="min-h-[132px]">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest mb-2">
                  <TrendingUp className="w-4 h-4 text-brand-400" />
                  חיסכון תפעולי משוער / חודש
                </div>
                <div className="font-display text-4xl md:text-5xl font-black text-brand-400 tabular-nums leading-none" dir="ltr">
                  {ils(monthlySavings)}
                </div>
                <p className="text-[11px] text-zinc-500 mt-2" dir="ltr">≈ {ils(annualSavings)} / שנה</p>
              </div>
            </div>

            <WebButton variant="primary" onClick={requestScoping} className="mt-6 w-full justify-center">
              <Send className="w-4 h-4" />
              תאם שיחת אפיון טכנית
            </WebButton>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
