import { useNavigate } from 'react-router-dom';
import { BookOpen, BrainCircuit, ShieldAlert, ArrowLeft } from 'lucide-react';
import TiltCard from './TiltCard';
import WebButton from './WebButton';
import { useSectionDissolve } from '../hooks/useSectionDissolve';

const PILLARS = [
  { icon: ShieldAlert, label: 'ניתוחי סייבר ואיומים' },
  { icon: BrainCircuit, label: 'מדריכי אוטומציה ו-AI' },
  { icon: BookOpen, label: 'חוברות עבודה מעשיות' },
];

export default function Magazines() {
  const dissolveRef = useSectionDissolve<HTMLElement>();
  const navigate = useNavigate();

  return (
    <section
      id="magazines"
      ref={dissolveRef}
      data-field-form="scatter"
      className="py-12 md:py-20 border-t border-white/5 overflow-hidden relative cv-auto"
    >
      <div className="container mx-auto px-4 md:px-6">
        <TiltCard strength={4} className="max-w-5xl mx-auto">
          <div className="relative overflow-hidden bg-[#0D0E12] border border-white/10 rounded-[2.5rem] p-8 md:p-14 text-center">
            <div className="absolute inset-0 bg-gradient-to-b from-brand-500/[0.07] to-transparent pointer-events-none" aria-hidden="true" />

            <h2 className="relative font-display text-fluid-h2 font-black text-white mb-6">
              מגזינים, מדריכים <span className="text-brand-500">וחוברות עבודה</span>
            </h2>
            <p className="relative font-sans text-zinc-300 text-base md:text-lg max-w-2xl mx-auto leading-relaxed mb-10 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]">
              משאבים דיגיטליים מעשיים שאפשר ליישם מהיום הראשון — לא עוד תיאוריה כללית. כל הפרסומים, המחירים והרכישה המיידית נמצאים בחנות הדיגיטלית.
            </p>

            <div className="relative flex flex-wrap items-center justify-center gap-3 mb-10">
              {PILLARS.map((p) => (
                <span
                  key={p.label}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-white/10 bg-black/40 text-sm font-bold text-zinc-300"
                >
                  <p.icon className="w-4 h-4 text-brand-400" />
                  {p.label}
                </span>
              ))}
            </div>

            <WebButton variant="primary" onClick={() => navigate('/magazines')} className="relative !px-8">
              למעבר לחנות הדיגיטלית
              <ArrowLeft className="w-4 h-4" />
            </WebButton>
          </div>
        </TiltCard>
      </div>
    </section>
  );
}
