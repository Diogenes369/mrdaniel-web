import {
  ShieldHalf,
  Server,
  TerminalSquare,
  Grid3x3,
  KeyRound,
  Radar,
  Braces,
  Atom,
  Plug,
  CandlestickChart,
  type LucideIcon,
} from 'lucide-react';

/**
 * "Arsenal" — a lightweight, CSS-only infinite marquee of the working tech stack. Two identical
 * groups scroll left by exactly one group width and loop (see `.tech-marquee__*` in index.css).
 * Pure decoration: no touch-scroll container, so it cannot hijack vertical scrolling on mobile.
 * Pauses on hover, collapses to a static centered wrap under `prefers-reduced-motion`.
 */

interface Tech {
  name: string;
  icon: LucideIcon;
}

const STACK: Tech[] = [
  { name: 'Fortinet', icon: ShieldHalf },
  { name: 'Windows Server', icon: Server },
  { name: 'PowerShell', icon: TerminalSquare },
  { name: 'Microsoft 365', icon: Grid3x3 },
  { name: 'Entra ID', icon: KeyRound },
  { name: 'Cyber 2.0', icon: Radar },
  { name: 'Python', icon: Braces },
  { name: 'React', icon: Atom },
  { name: 'Claude MCP', icon: Plug },
  { name: 'MetaTrader 5', icon: CandlestickChart },
];

function Chip({ tech }: { tech: Tech }) {
  const Icon = tech.icon;
  return (
    <span className="inline-flex items-center gap-2.5 rounded-xl border border-white/10 bg-carbon-fiber px-4 py-3 text-sm font-bold text-zinc-300">
      <Icon className="w-4 h-4 text-brand-400 shrink-0" aria-hidden="true" />
      {tech.name}
    </span>
  );
}

export default function TechMarquee() {
  return (
    <section className="relative py-14 md:py-20 border-t border-white/5 overflow-x-clip cv-auto">
      <div className="container-wide relative z-10">
        <p className="text-center text-xs font-mono font-bold uppercase tracking-[0.25em] text-zinc-500 mb-8">
          הארסנל הטכנולוגי — Infrastructure · Security · AI · Automation
        </p>
      </div>
      <div className="tech-marquee tech-marquee__viewport" role="marquee" aria-label="רשימת טכנולוגיות בשימוש">
        <div className="tech-marquee__track">
          {[0, 1].map((g) => (
            <div key={g} className="tech-marquee__group" aria-hidden={g === 1}>
              {STACK.map((tech) => (
                <Chip key={tech.name} tech={tech} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
