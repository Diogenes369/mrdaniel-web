import { AlertTriangle, Wrench, Rocket } from 'lucide-react';
import { CASE_STUDIES, type CaseStudy } from '../../data/caseStudies';

/**
 * "Real-World Engineering" — vertical stack of wide case-study cards. Each card lays out the
 * Challenge -> Technical Solution -> Impact as three columns on desktop, stacked on mobile.
 * Content is anonymised and carries no testimonial/quote material (see data/caseStudies.ts).
 */

const BLOCKS = [
  { key: 'challenge' as const, label: 'האתגר', icon: AlertTriangle, accent: 'text-amber-400' },
  { key: 'solution' as const, label: 'הפתרון הטכני', icon: Wrench, accent: 'text-brand-400' },
  { key: 'impact' as const, label: 'ההשפעה', icon: Rocket, accent: 'text-brand-300' },
];

function Card({ study }: { study: CaseStudy }) {
  const Icon = study.icon;
  return (
    <article className="rounded-2xl border border-white/10 bg-carbon-900/60 p-6 md:p-8">
      <header className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 shrink-0 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-brand-400">
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-brand-400 mb-1">{study.tag}</div>
          <h3 className="font-display font-bold text-lg md:text-xl text-white leading-snug">{study.title}</h3>
        </div>
      </header>

      <div className="grid md:grid-cols-3 gap-5 md:gap-6">
        {BLOCKS.map((b) => (
          <div key={b.key} className="border-t-2 border-white/10 pt-4">
            <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-2 ${b.accent}`}>
              <b.icon className="w-3.5 h-3.5" />
              {b.label}
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">{study[b.key]}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mt-6 pt-5 border-t border-white/10">
        {study.metrics.map((m) => (
          <div key={m.label} className="rounded-lg border border-brand-500/25 bg-brand-500/[0.06] px-3.5 py-2">
            <div className="font-display font-black text-brand-400 tabular-nums leading-tight" dir="ltr">
              {m.value}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>
    </article>
  );
}

export default function CaseStudies() {
  return (
    <div className="space-y-5 md:space-y-6 mb-16">
      {CASE_STUDIES.map((study) => (
        <Card key={study.id} study={study} />
      ))}
    </div>
  );
}
