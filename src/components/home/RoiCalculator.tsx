import { memo, useMemo, useState, type CSSProperties } from 'react';
import { Calculator, Clock, TrendingUp, Send, Users, Timer, Wallet } from 'lucide-react';
import WebButton from '../WebButton';
import DepthSection from './DepthSection';
import PopHeadline from './PopHeadline';

/**
 * Interactive "AI & Automation ROI Calculator" — a lead magnet, not a binding quote.
 *
 * Three sliders (team size, hours/week each person burns on repetitive work, loaded hourly cost)
 * drive two headline figures — reclaimed operational hours and estimated monthly saving — plus an
 * annualised figure. Every coefficient is shown in the fine print so the number is defensible.
 *
 * Flicker-free dragging:
 *   - No `key`-based remount and no per-tick mount animation on the output (that was the flicker):
 *     the numbers just update in place.
 *   - `tabular-nums` + `whitespace-nowrap` + reserved min-heights so a changing digit count can
 *     never reflow or twitch neighbouring content.
 *   - The slider fill is a pure CSS gradient driven by one inline custom property (`--fill`), so
 *     moving a thumb repaints only that input — no sibling layout, no wasted React work.
 *   - Each `<Slider>` is memoised and gets a stable `useState` setter, so dragging one slider
 *     doesn't re-render the other two.
 */

const WEEKS_PER_MONTH = 4.33;
// Share of identified repetitive hours a well-scoped automation / agent build typically removes.
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

const Slider = memo(function Slider({ id, icon: Icon, label, value, min, max, step, onChange, display }: SliderProps) {
  const fill = `${((value - min) / (max - min)) * 100}%`;
  return (
    <div>
      <div className="flex items-start justify-between mb-2.5 gap-3">
        <label htmlFor={id} className="flex min-w-0 items-start gap-2 text-sm font-bold text-zinc-200 leading-snug">
          <Icon className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
          <span className="break-words">{label}</span>
        </label>
        <span className="shrink-0 font-display text-sm font-bold text-brand-300 tabular-nums whitespace-nowrap" dir="ltr">
          {display}
        </span>
      </div>
      <input
        id={id}
        type="range"
        dir="ltr"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="roi-range"
        style={{ '--fill': fill } as CSSProperties}
      />
    </div>
  );
});

export default function RoiCalculator() {
  const [employees, setEmployees] = useState(8);
  const [hoursPerWeek, setHoursPerWeek] = useState(10);
  const [hourlyCost, setHourlyCost] = useState(90);

  const { reclaimedHours, monthlySavings, annualSavings, weeklyHours } = useMemo(() => {
    const repetitiveMonthly = employees * hoursPerWeek * WEEKS_PER_MONTH;
    const reclaimed = repetitiveMonthly * AUTOMATION_RECLAIM;
    const monthly = reclaimed * hourlyCost;
    return {
      reclaimedHours: Math.round(reclaimed),
      monthlySavings: monthly,
      annualSavings: monthly * 12,
      weeklyHours: Math.round(reclaimed / WEEKS_PER_MONTH),
    };
  }, [employees, hoursPerWeek, hourlyCost]);

  const requestScoping = () => {
    window.dispatchEvent(
      new CustomEvent('open-lead-modal', {
        detail: {
          subject: `אפיון אוטומציה — ${employees} עובדים, חיסכון חודשי משוער ${ils(monthlySavings)} / ${FMT_INT.format(
            reclaimedHours
          )} שעות`,
          sourceSection: 'ROI Calculator',
        },
      })
    );
  };

  return (
    <section id="roi-calculator" className="relative py-20 md:py-28 overflow-x-clip cv-auto">
      <div className="container-wide relative z-10">
        <div className="max-w-4xl mx-auto text-center mb-12 md:mb-16">
          <PopHeadline lead="כמה זמן" accent="סוכן יכול להחזיר לכם" />
          <p className="font-sans text-fluid-body text-zinc-300 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">
            הזיזו את שלושת הפסים וראו הערכה גסה: כמה שעות וכמה כסף חוזרים אליכם כל חודש, כשסוכן לוקח חלק מהעבודה החוזרת.
          </p>
        </div>
      </div>

      <DepthSection className="container-wide relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 max-w-[1400px] mx-auto items-stretch">
          {/* ---- Inputs ---- */}
          <div className="glass-panel glass-panel--info w-full min-w-0 rounded-3xl p-5 sm:p-7 lg:p-10 flex flex-col">
            <div className="flex items-center gap-3 mb-8">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-black/40 text-brand-300">
                <Calculator className="w-5 h-5" />
              </span>
              <h3 className="font-display font-extrabold text-xl sm:text-2xl lg:text-3xl text-white">הנתונים שלכם</h3>
            </div>
            <div className="space-y-8 flex-1">
              <Slider
                id="roi-employees"
                icon={Users}
                label="כמה אנשים עושים את העבודה (גם אם זה רק אתם)"
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
                label="שעות שבועיות על משימות חוזרות (לאדם)"
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
            <p className="text-xs text-zinc-500 mt-8 leading-relaxed">
              החישוב מניח שסוכן לוקח {Math.round(AUTOMATION_RECLAIM * 100)}% מהשעות החוזרות, ו-{WEEKS_PER_MONTH} שבועות בחודש.
              זו הערכה להמחשה בלבד. את המספר האמיתי בודקים יחד על העבודה שלכם.
            </p>
          </div>

          {/* ---- Output (updates in place — no remount, no per-tick animation) ---- */}
          <div className="glass-panel glass-panel--info w-full min-w-0 break-words rounded-3xl p-5 sm:p-7 lg:p-10 flex flex-col shadow-[0_0_48px_-20px_rgba(118,185,0,0.4)]">
            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-7 flex-1 content-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm lg:text-base font-display font-bold text-zinc-200 tracking-tight mb-3">
                  <Clock className="w-4 h-4 lg:w-5 lg:h-5 text-brand-400 shrink-0" />
                  <span>הזמן שחוזר אליכם / חודש</span>
                </div>
                <div className="font-display text-xl sm:text-3xl lg:text-4xl font-black text-brand-400 tabular-nums break-words leading-none [text-shadow:0_0_36px_rgba(118,185,0,0.45)]">
                  {FMT_INT.format(reclaimedHours)}
                </div>
                <p className="text-xs lg:text-sm text-zinc-400 mt-3 tabular-nums">
                  ≈ <span dir="ltr">{FMT_INT.format(weeklyHours)}</span> שעות בשבוע חוזרות אליכם
                </p>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm lg:text-base font-display font-bold text-zinc-200 tracking-tight mb-3">
                  <TrendingUp className="w-4 h-4 lg:w-5 lg:h-5 text-brand-400 shrink-0" />
                  <span>הכסף שנשאר אצלכם / חודש</span>
                </div>
                <div className="font-display text-xl sm:text-3xl lg:text-4xl font-black text-brand-400 tabular-nums break-words leading-none [text-shadow:0_0_36px_rgba(118,185,0,0.55)]">
                  {ils(monthlySavings)}
                </div>
                <p className="text-xs lg:text-sm text-zinc-400 mt-3 tabular-nums">
                  ≈ <span dir="ltr">{ils(annualSavings)}</span> / שנה
                </p>
              </div>
            </div>

            <WebButton variant="primary" onClick={requestScoping} className="relative mt-8 w-full justify-center">
              <Send className="w-4 h-4 shrink-0" />
              בואו נבדוק את זה על העבודה שלי
            </WebButton>
          </div>
        </div>
      </DepthSection>
    </section>
  );
}
