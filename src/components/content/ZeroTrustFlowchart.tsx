import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Fingerprint, KeyRound, Bot, Database, Radar, ArrowLeft, type LucideIcon } from 'lucide-react';

interface FlowNode {
  id: string;
  label: string;
  icon: LucideIcon;
  detail: string;
}

const NODES: FlowNode[] = [
  {
    id: 'request',
    label: 'בקשת גישה נכנסת',
    icon: Fingerprint,
    detail: 'כל בקשת גישה — של משתמש אנושי, מערכת פנימית או סוכן AI — נכנסת ללא שום הנחת אמון מוקדמת, גם אם היא מגיעה מתוך הרשת הארגונית עצמה.',
  },
  {
    id: 'identity',
    label: 'אימות זהות (Zero-Trust Gateway)',
    icon: KeyRound,
    detail: 'שכבת IAM/Entra ID ו-SASE בודקת זהות, מצב המכשיר וההקשר בזמן אמת — לפני שנפתחת כל גישה למשאב מוגן.',
  },
  {
    id: 'agent',
    label: 'בקרת סוכן AI (Guardian Agent)',
    icon: Bot,
    detail: 'כשהבקשה נוגעת בסוכן AI, Guardian Agent ייעודי בוחן אותה מול גבולות הרשאה והתנהגות מוגדרים מראש — לא "אמון עיוור" בפלט המודל.',
  },
  {
    id: 'data',
    label: 'מדיניות נתונים ומודלים',
    icon: Database,
    detail: 'גישה למאגר הידע (RAG) או לשכבת המודל מוגבלת בהיקפה, מתועדת ביומן ביקורת, ועוברת סינון Prompt Injection לפני עיבוד.',
  },
  {
    id: 'decision',
    label: 'החלטה: אישור או חסימה',
    icon: Radar,
    detail: 'שכבת EDR/XDR עם ניטור רציף מקבלת את ההחלטה הסופית — בקשה תקינה ממשיכה, וחריגה מבודדת אוטומטית עד לבדיקה.',
  },
];

export default function ZeroTrustFlowchart() {
  const [activeId, setActiveId] = useState<string>(NODES[0].id);
  const activeIndex = NODES.findIndex((n) => n.id === activeId);
  const active = NODES[activeIndex];

  return (
    <div className="cyber-glass cyber-glass--info rounded-2xl p-5 sm:p-6 lg:p-8 mb-16">
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2 mb-8">
        {NODES.map((node, idx) => (
          <div key={node.id} className="flex items-center gap-2 flex-1">
            <button
              type="button"
              onClick={() => setActiveId(node.id)}
              className={`flex-1 flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-right transition-all duration-300 cursor-pointer min-h-11 ${
                node.id === activeId
                  ? 'bg-brand-500/15 border-brand-500/50 shadow-[0_0_20px_rgba(118,185,0,0.15)]'
                  : 'bg-black/30 border-white/10 hover:border-brand-500/30'
              }`}
            >
              <span
                className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center border ${
                  node.id === activeId ? 'bg-brand-500/20 border-brand-400/50 text-brand-300' : 'bg-white/5 border-white/10 text-zinc-500'
                }`}
              >
                <node.icon className="w-4 h-4" />
              </span>
              <span className={`text-xs md:text-[13px] font-bold leading-tight ${node.id === activeId ? 'text-white' : 'text-zinc-400'}`}>
                {node.label}
              </span>
            </button>
            {idx < NODES.length - 1 && (
              <ArrowLeft className="hidden lg:block w-4 h-4 text-zinc-700 shrink-0" aria-hidden="true" />
            )}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={active.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
          className="flex items-start gap-4 bg-black/40 border border-white/10 rounded-xl p-5"
        >
          <span className="w-11 h-11 shrink-0 rounded-xl bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-brand-400">
            <active.icon className="w-5 h-5" />
          </span>
          <div>
            <span className="block text-[10px] font-mono font-bold text-brand-400 uppercase tracking-widest mb-1">
              שלב {activeIndex + 1} מתוך {NODES.length}
            </span>
            <p className="text-sm md:text-base text-zinc-300 leading-relaxed">{active.detail}</p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
