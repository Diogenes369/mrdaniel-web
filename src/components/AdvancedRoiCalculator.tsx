import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { motion, useSpring, useTransform, useInView } from 'motion/react';
import { TrendingUp, Clock, Users, Sparkles, Home, ShoppingCart, Building2, Briefcase, Plus, Minus, type LucideIcon } from 'lucide-react';
import WebButton from './WebButton';
import { useSectionDissolve } from '../hooks/useSectionDissolve';
import { AI_AGENTS, type AiAgent } from '../data/aiAgents';

const INQUIRIES_MIN = 50;
const INQUIRIES_MAX = 4000;
const INQUIRIES_STEP = 50;
const TEAM_MIN = 1;
const TEAM_MAX = 60;

// Assumptions, stated plainly to visitors (see the disclaimer footnote) rather than presented as
// hard fact — this is an estimate, not a guarantee.
const MINUTES_PER_INQUIRY = 7;
const AUTOMATION_RATE = 0.68;
const HOURLY_RATE = 120;
const MONTHLY_HOURS_PER_EMPLOYEE = 186;

interface BusinessPreset {
  id: string;
  label: string;
  icon: LucideIcon;
  teamSize: number;
  monthlyInquiries: number;
}

const PRESETS: BusinessPreset[] = [
  { id: 'real-estate', label: 'סוכנות נדל"ן', icon: Home, teamSize: 6, monthlyInquiries: 450 },
  { id: 'ecommerce', label: 'חנות מסחר אלקטרוני', icon: ShoppingCart, teamSize: 10, monthlyInquiries: 1400 },
  { id: 'enterprise', label: 'ארגון Enterprise', icon: Building2, teamSize: 40, monthlyInquiries: 3200 },
  { id: 'freelancer', label: 'פרילנסר / עצמאי', icon: Briefcase, teamSize: 1, monthlyInquiries: 120 },
];

function recommendAgentForVolume(monthlyInquiries: number): AiAgent {
  const pool = AI_AGENTS.filter((a) => a.goals.includes('lead-gen') || a.goals.includes('support'));
  const candidates = pool.length > 0 ? pool : AI_AGENTS;
  const sorted = [...candidates].sort((a, b) => a.price - b.price);
  if (monthlyInquiries < 500) return sorted[0];
  if (monthlyInquiries < 1800) return sorted[Math.floor(sorted.length / 2)];
  return sorted[sorted.length - 1];
}

function AnimatedNumber({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const spring = useSpring(0, { stiffness: 90, damping: 22, mass: 0.6 });
  const display = useTransform(spring, (v) => `${prefix}${Math.round(v).toLocaleString('he-IL')}${suffix}`);

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  return <motion.span>{display}</motion.span>;
}

// ---- Circular Cyber Dial -----------------------------------------------------------------
// 270° sweep gauge with a 90° gap centered at the bottom, in a "0deg = top, clockwise" angle
// convention. Drag/click/touch/keyboard all map to the same underlying percentage.
const DIAL_START = 225;
const DIAL_SWEEP = 270;
const DIAL_R = 82;
const DIAL_CX = 100;
const DIAL_CY = 100;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function angleToPct(angleDeg: number) {
  const rel = (angleDeg - DIAL_START + 360) % 360;
  if (rel <= DIAL_SWEEP) return rel / DIAL_SWEEP;
  const distToEnd = rel - DIAL_SWEEP;
  const distToStart = 360 - rel;
  return distToEnd < distToStart ? 1 : 0;
}

function CyberDial({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const pct = (value - min) / (max - min);
  const currentAngle = DIAL_START + DIAL_SWEEP * pct;

  const trackPath = describeArc(DIAL_CX, DIAL_CY, DIAL_R, DIAL_START, DIAL_START + DIAL_SWEEP);
  const progressPath = pct > 0 ? describeArc(DIAL_CX, DIAL_CY, DIAL_R, DIAL_START, currentAngle) : '';
  const knob = polarToCartesian(DIAL_CX, DIAL_CY, DIAL_R, currentAngle);

  const updateFromPointer = (clientX: number, clientY: number) => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const atan2Deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    const angleDeg = (atan2Deg + 90 + 360) % 360;
    const p = angleToPct(angleDeg);
    const raw = min + p * (max - min);
    const stepped = Math.round(raw / step) * step;
    onChange(Math.min(max, Math.max(min, stepped)));
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    updateFromPointer(e.clientX, e.clientY);
  };
  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updateFromPointer(e.clientX, e.clientY);
  };
  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setDragging(false);
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (['ArrowUp', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      onChange(Math.min(max, value + step));
    } else if (['ArrowDown', 'ArrowLeft'].includes(e.key)) {
      e.preventDefault();
      onChange(Math.max(min, value - step));
    }
  };

  return (
    <div className="relative w-64 h-64 mx-auto select-none">
      <div className="absolute inset-6 rounded-full bg-brand-500/10 blur-3xl pointer-events-none" aria-hidden="true" />

      <div
        ref={wrapRef}
        role="slider"
        tabIndex={0}
        aria-label="היקף פניות חודשי"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onKeyDown={handleKeyDown}
        className="relative w-full h-full cursor-grab active:cursor-grabbing touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 rounded-full"
      >
        <svg viewBox="0 0 200 200" className="w-full h-full pointer-events-none">
          <path d={trackPath} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={14} strokeLinecap="round" />
          {progressPath && (
            <path
              d={progressPath}
              fill="none"
              stroke="#76B900"
              strokeWidth={14}
              strokeLinecap="round"
              style={{ filter: 'drop-shadow(0 0 8px rgba(0,255,102,0.65))' }}
            />
          )}
          <circle cx={knob.x} cy={knob.y} r={11} fill="#08090C" stroke="#76B900" strokeWidth={4} style={{ filter: 'drop-shadow(0 0 10px rgba(0,255,102,0.8))' }} />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="font-display text-4xl font-black text-white tabular-nums">{value.toLocaleString('he-IL')}</span>
          <span className="text-[11px] font-mono font-bold text-zinc-500 uppercase tracking-widest mt-1">פניות בחודש</span>
        </div>

        <span className="absolute bottom-3 left-6 text-[10px] font-mono text-zinc-600">{min.toLocaleString('he-IL')}</span>
        <span className="absolute bottom-3 right-6 text-[10px] font-mono text-zinc-600">{max.toLocaleString('he-IL')}</span>
      </div>
    </div>
  );
}

export default function AdvancedRoiCalculator() {
  const [teamSize, setTeamSize] = useState(8);
  const [monthlyInquiries, setMonthlyInquiries] = useState(600);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const sectionRef = useSectionDissolve<HTMLElement>();
  const inView = useInView(sectionRef, { once: true, margin: '-100px' });

  const applyPreset = (preset: BusinessPreset) => {
    setActivePresetId(preset.id);
    setTeamSize(preset.teamSize);
    setMonthlyInquiries(preset.monthlyInquiries);
  };

  const adjustTeam = (delta: number) => {
    setActivePresetId(null);
    setTeamSize((v) => Math.min(TEAM_MAX, Math.max(TEAM_MIN, v + delta)));
  };

  const handleDialChange = (v: number) => {
    setActivePresetId(null);
    setMonthlyInquiries(v);
  };

  const hoursSavedPerMonth = ((monthlyInquiries * MINUTES_PER_INQUIRY) / 60) * AUTOMATION_RATE;
  const monthlySavings = hoursSavedPerMonth * HOURLY_RATE;
  const annualSavings = monthlySavings * 12;
  const capacityEquivalent = Math.max(1, Math.round(hoursSavedPerMonth / MONTHLY_HOURS_PER_EMPLOYEE));
  const recommendedAgent = recommendAgentForVolume(monthlyInquiries);

  const handleCta = () => {
    const summary = [
      `גודל צוות: ${teamSize} עובדים`,
      `היקף פניות חודשי: ${monthlyInquiries.toLocaleString('he-IL')}`,
      `חיסכון חודשי משוער: ₪${Math.round(monthlySavings).toLocaleString('he-IL')} (${Math.round(hoursSavedPerMonth).toLocaleString('he-IL')} שעות)`,
      `חיסכון שנתי משוער: ₪${Math.round(annualSavings).toLocaleString('he-IL')}`,
      `סוכן מומלץ: ${recommendedAgent.name} (₪${recommendedAgent.price.toLocaleString('he-IL')})`,
    ].join('\n');

    window.dispatchEvent(
      new CustomEvent('open-lead-modal', {
        detail: {
          subject: `בדיקת התאמה: ${recommendedAgent.name}`,
          sourceSection: 'Advanced ROI Calculator',
          prefillMessage: summary,
          product: { name: recommendedAgent.name, price: recommendedAgent.price, tierLabel: recommendedAgent.tierLabel, category: 'ai-agent' },
        },
      })
    );
  };

  return (
    <section id="roi-calculator" ref={sectionRef} className="py-12 md:py-20 border-t border-white/5 relative overflow-hidden w-full">
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="text-center mb-12 max-w-2xl mx-auto">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-brand-500/30 bg-brand-500/5 text-xs font-mono font-bold tracking-widest text-brand-400 uppercase mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            מחשבון ROI אינטראקטיבי
          </span>
          <h2 className="font-display text-fluid-h2 font-black text-white mb-5">
            כמה סוכן AI <span className="text-brand-500">שווה לעסק שלך?</span>
          </h2>
          <p className="text-zinc-300 text-base md:text-lg max-w-xl mx-auto leading-relaxed [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">
            בחרו פרופיל עסק להתחלה מהירה, או סובבו את החוגה ידנית — קבלו הערכת חיסכון בזמן אמת + המלצת סוכן AI מדויקת.
          </p>
        </div>

        <div className="max-w-2xl mx-auto flex flex-wrap items-center justify-center gap-3 mb-10">
          {PRESETS.map((preset) => {
            const isActive = preset.id === activePresetId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-bold transition-colors min-h-11 cursor-pointer ${
                  isActive ? 'bg-brand-500 border-brand-500 text-black' : 'bg-carbon-900/60 border-white/10 text-zinc-300 hover:border-brand-500/40'
                }`}
              >
                <preset.icon className="w-4 h-4" />
                {preset.label}
              </button>
            );
          })}
        </div>

        <div className="max-w-5xl mx-auto rounded-[2rem] border border-white/10 bg-[#0D0E12] p-8 md:p-12 w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-14">
            <div className="flex flex-col items-center gap-8">
              <CyberDial value={monthlyInquiries} min={INQUIRIES_MIN} max={INQUIRIES_MAX} step={INQUIRIES_STEP} onChange={handleDialChange} />

              <div className="flex items-center justify-between w-full max-w-xs bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5">
                <span className="flex items-center gap-2 text-sm font-sans text-zinc-300">
                  <Users className="w-4 h-4 text-brand-400" />
                  גודל הצוות
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => adjustTeam(-1)}
                    aria-label="הפחת גודל צוות"
                    className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300 hover:border-brand-500/40 hover:text-white transition-colors cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-display font-bold text-lg text-white w-6 text-center tabular-nums">{teamSize}</span>
                  <button
                    type="button"
                    onClick={() => adjustTeam(1)}
                    aria-label="הוסף גודל צוות"
                    className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300 hover:border-brand-500/40 hover:text-white transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-center gap-7 border-t md:border-t-0 md:border-r border-white/10 pt-8 md:pt-0 md:pr-12">
              <div>
                <div className="flex items-center gap-2 text-sm font-sans text-zinc-400 uppercase tracking-wide mb-2">
                  <TrendingUp className="w-4 h-4 text-brand-400" />
                  חיסכון חודשי משוער
                </div>
                <div className="font-display text-4xl md:text-5xl font-black text-white">
                  {inView ? <AnimatedNumber value={monthlySavings} prefix="₪" /> : '₪0'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-sans text-zinc-400 uppercase tracking-wide mb-2">חיסכון שנתי</div>
                  <div className="font-display text-xl md:text-2xl font-bold text-brand-500">
                    {inView ? <AnimatedNumber value={annualSavings} prefix="₪" /> : '₪0'}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-sans text-zinc-400 uppercase tracking-wide mb-2">
                    <Clock className="w-3.5 h-3.5" />
                    שעות נחסכות/חודש
                  </div>
                  <div className="font-display text-xl md:text-2xl font-bold text-white">
                    {inView ? <AnimatedNumber value={hoursSavedPerMonth} /> : '0'}
                  </div>
                </div>
              </div>

              <div className="bg-black/40 border border-brand-500/20 rounded-2xl p-5">
                <span className="block text-[11px] font-mono font-bold text-brand-400 uppercase tracking-widest mb-1.5">הסוכן המומלץ להיקף שלכם</span>
                <span className="block font-display text-lg font-bold text-white">{recommendedAgent.name}</span>
                <span className="block text-sm text-zinc-500 mt-0.5">{recommendedAgent.tierLabel} · החל מ-₪{recommendedAgent.price.toLocaleString('he-IL')}</span>
              </div>

              <div className="flex items-center gap-3 bg-brand-500/5 border border-brand-500/20 rounded-2xl px-4 py-3.5">
                <Users className="w-5 h-5 text-brand-400 shrink-0" />
                <p className="text-sm text-zinc-300 leading-relaxed">
                  שווה ערך לגיוס <span className="text-brand-400 font-bold">{capacityEquivalent}</span> {capacityEquivalent === 1 ? 'עובד/ת נוסף/ת' : 'עובדים נוספים'} — בלי לגייס אף אחד.
                </p>
              </div>

              <WebButton variant="primary" onClick={handleCta} className="w-full justify-center">
                בדיקת התאמה עם דניאל
              </WebButton>

              <p className="text-xs text-zinc-500 leading-relaxed">
                *הערכה בלבד, מבוססת על {MINUTES_PER_INQUIRY} דקות טיפול ידני ממוצע לפנייה, {Math.round(AUTOMATION_RATE * 100)}% שיעור אוטומציה ועלות שעתית ממוצעת של ₪{HOURLY_RATE}. תוצאות בפועל משתנות לפי מורכבות התהליך.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
