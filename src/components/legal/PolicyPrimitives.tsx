import { type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Calendar, List } from 'lucide-react';

interface PolicyHeroProps {
  title: string;
  metaLabel: string;
  lead: ReactNode;
}

export function PolicyHero({ title, metaLabel, lead }: PolicyHeroProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="pt-14 md:pt-20 pb-6"
    >
      <h1 className="font-display font-black text-4xl md:text-6xl leading-[1.1] text-white mb-4">{title}</h1>
      <div className="flex items-center gap-3 text-sm text-zinc-400 mb-8 flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" /> עדכון אחרון: אוגוסט 2026
        </span>
        <span className="text-zinc-600">•</span>
        <span>{metaLabel}</span>
      </div>
      <div className="glyph-frame space-y-4 border-s border-solid border-s-[rgba(143,212,0,0.6)] p-6 text-lg leading-[1.9] text-ink-paper md:p-7">
        {lead}
      </div>
    </motion.div>
  );
}

export interface TocItem {
  num: string;
  label: string;
  href: string;
}

export function Toc({ items }: { items: TocItem[] }) {
  return (
    <nav
      aria-label="תוכן עניינים"
      className="glyph-frame mb-12 p-6"
    >
      <div className="flex items-center gap-2 font-bold text-white text-lg mb-4">
        <List className="w-5 h-5 text-brand-400" />
        תוכן עניינים וניווט מהיר בסעיפים
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((item) => (
          <a
            key={item.num}
            href={item.href}
            className="flex items-center gap-2.5 text-base text-zinc-400 hover:text-brand-400 hover:bg-white/[0.03] px-3 py-2 rounded-lg transition-colors"
          >
            <span className="font-mono text-sm text-brand-400/80">{item.num}</span>
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

export function PolicySection({
  id,
  num,
  title,
  children,
  contact = false,
}: {
  id: string;
  num: string | number;
  title: string;
  children: ReactNode;
  contact?: boolean;
}) {
  return (
    <motion.section
      id={id}
      className={
        contact
          ? 'glyph-frame policy-section policy-section--contact mb-14 scroll-mt-28 p-7 md:p-9'
          : 'glyph-frame policy-section mb-6 scroll-mt-28 p-7 md:p-9'
      }
    >
      <div className="mb-5 flex items-center gap-3 border-b border-dotted border-[var(--color-rule)] pb-4">
        <div
          className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center font-mono font-bold text-base ${
            contact ? 'bg-brand-500 text-black' : 'bg-brand-500/15 border border-brand-500/40 text-brand-400'
          }`}
        >
          {num}
        </div>
        <h2 className={`font-display font-bold text-xl md:text-2xl ${contact ? 'text-brand-400' : 'text-white'}`}>{title}</h2>
      </div>
      <div className={`space-y-4 text-lg leading-[1.85] ${contact ? 'text-zinc-200' : 'text-zinc-300'}`}>{children}</div>
    </motion.section>
  );
}

export function SubBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-black/35 border border-white/5 rounded-xl p-5 my-4">
      <h3 className="font-display font-bold text-lg text-brand-400 mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function BulletList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2.5 mt-3">
      {items.map((item, idx) => (
        <li key={idx} className="relative pr-6 text-base md:text-lg text-zinc-300 leading-[1.8]">
          <span className="absolute right-0 top-[0.7em] w-1.5 h-1.5 rounded-full bg-brand-500" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function ContactGrid({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
      {items.map((item) => (
        <div key={item.label} className="bg-black/40 border border-white/10 rounded-xl p-4">
          <div className="text-sm text-zinc-500 mb-1.5">{item.label}</div>
          <div className="text-lg font-semibold text-white">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
