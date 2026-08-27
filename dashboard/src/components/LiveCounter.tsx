import { Users, Smartphone, Monitor, Tablet } from 'lucide-react';

interface LiveCounterProps {
  count: number;
  mobile: number;
  desktop: number;
  tablet: number;
}

export default function LiveCounter({ count, mobile, desktop, tablet }: LiveCounterProps) {
  return (
    <div className="dash-card p-6">
      <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-3">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-400" />
        </span>
        משתמשים פעילים כעת
      </div>
      <div className="flex items-end gap-3">
        <Users className="w-8 h-8 text-brand-500 mb-1" />
        <span className="font-display text-5xl font-black text-white leading-none">{count}</span>
      </div>
      <div className="flex items-center gap-4 mt-4 text-xs text-zinc-400 font-mono">
        <span className="flex items-center gap-1.5">
          <Smartphone className="w-3.5 h-3.5" />
          {mobile}
        </span>
        <span className="flex items-center gap-1.5">
          <Monitor className="w-3.5 h-3.5" />
          {desktop}
        </span>
        <span className="flex items-center gap-1.5">
          <Tablet className="w-3.5 h-3.5" />
          {tablet}
        </span>
      </div>
    </div>
  );
}
