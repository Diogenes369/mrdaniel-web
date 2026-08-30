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
import { prefersReducedMotion } from '../lib/gsap';

/**
 * "Arsenal" — infinite tech-stack marquee. Uses the EXACT same seamless loop as the live news
 * ticker (see `.tech-marquee__*` / `.news-ticker__*` in index.css): two identical `__group`s inside
 * `__track`, the track translates left by exactly one group width and loops → no seam, no gap, no
 * jumpy reset. Duration scales with item count so adding entries keeps the pace readable.
 *
 * Pure CSS animation — the viewport is `overflow-x: clip` + `touch-action: pan-y`, never a
 * touch-scroll container, so a vertical swipe over it scrolls the page normally on Android.
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
    <span className="inline-flex items-center gap-3 rounded-xl border border-white/15 bg-carbon-fiber px-5 py-3.5 text-[1.05rem] md:text-[1.3rem] font-extrabold tracking-tight text-white shadow-[0_2px_16px_rgba(0,0,0,0.5)]">
      <Icon className="w-5 h-5 md:w-6 md:h-6 text-brand-400 shrink-0" aria-hidden="true" strokeWidth={2.4} />
      {tech.name}
    </span>
  );
}

export default function TechMarquee() {
  const reduced = prefersReducedMotion();
  // ~5s of travel per item, matching the news ticker's "scale the loop with its contents" rule.
  const animationDuration = `${Math.max(48, STACK.length * 5)}s`;

  return (
    <section className="relative py-14 md:py-20 border-t border-white/5 overflow-x-clip cv-auto">
      <div className="container-wide relative z-10">
        <p className="text-center text-xs md:text-sm font-mono font-bold uppercase tracking-[0.25em] text-zinc-500 mb-8">
          הארסנל הטכנולוגי — Infrastructure · Security · AI · Automation
        </p>
      </div>

      {reduced ? (
        <div className="container-wide flex flex-wrap justify-center gap-3">
          {STACK.map((tech) => (
            <Chip key={tech.name} tech={tech} />
          ))}
        </div>
      ) : (
        <div className="tech-marquee tech-marquee__viewport" dir="ltr" aria-label="רשימת טכנולוגיות בשימוש">
          <div className="tech-marquee__track" style={{ animationDuration }}>
            {[0, 1].map((dup) => (
              <div className="tech-marquee__group" key={dup} aria-hidden={dup === 1}>
                {STACK.map((tech) => (
                  <Chip key={`${dup}-${tech.name}`} tech={tech} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
