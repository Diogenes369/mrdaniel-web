import React, { useRef, useState, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';

type Variant = 'primary' | 'glass' | 'ghost';

interface WebButtonProps {
  children: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => void;
  variant?: Variant;
  magnetic?: boolean;
  className?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
  href?: string;
  target?: string;
  rel?: string;
  'aria-label'?: string;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-500 text-black border border-brand-500 hover:bg-brand-400 hover:border-brand-400',
  glass: 'bg-carbon-800/60 text-white border border-white/15 hover:border-brand-500/50',
  ghost: 'bg-transparent text-white border border-white/15 hover:border-brand-400/50',
};

export default function WebButton({
  children,
  onClick,
  variant = 'glass',
  magnetic = false,
  className = '',
  type = 'button',
  disabled = false,
  href,
  ...rest
}: WebButtonProps) {
  const ref = useRef<HTMLButtonElement & HTMLAnchorElement>(null);
  const [flash, setFlash] = useState<{ x: number; y: number; id: number } | null>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 18, mass: 0.4 });

  const handleMove = (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    if (!magnetic || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - r.left - r.width / 2) * 0.35);
    y.set((e.clientY - r.top - r.height / 2) * 0.35);
  };

  const handleLeave = () => {
    x.set(0);
    y.set(0);
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setFlash({ x: e.clientX - r.left, y: e.clientY - r.top, id: Date.now() });
      window.setTimeout(() => setFlash(null), 500);
    }
    onClick?.(e);
  };

  const className_ = `gpu relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full font-bold tracking-wide px-6 py-3 text-sm md:text-base transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`;

  const content = (
    <>
      <span className="relative z-10 flex items-center gap-2">{children}</span>
      {flash && (
        <motion.span
          key={flash.id}
          initial={{ opacity: 0.5, scale: 0 }}
          animate={{ opacity: 0, scale: 5 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          style={{ left: flash.x, top: flash.y }}
          className="pointer-events-none absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40"
        />
      )}
    </>
  );

  if (href) {
    return (
      <motion.a
        ref={ref}
        href={href}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        onClick={handleClick}
        style={magnetic ? { x: sx, y: sy } : undefined}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        className={className_}
        {...rest}
      >
        {content}
      </motion.a>
    );
  }

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={handleClick}
      style={magnetic ? { x: sx, y: sy } : undefined}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      className={className_}
      {...rest}
    >
      {content}
    </motion.button>
  );
}
