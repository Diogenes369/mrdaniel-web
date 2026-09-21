import React, { useRef, useState, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { isReducedMotion, isTouchFirst } from '../lib/perfMode';

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  strength?: number;
}

export default function TiltCard({ children, className = '', strength = 10 }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);

  const spx = useSpring(px, { stiffness: 260, damping: 24 });
  const spy = useSpring(py, { stiffness: 260, damping: 24 });

  const rotateX = useTransform(spy, [0, 1], [strength, -strength]);
  const rotateY = useTransform(spx, [0, 1], [-strength, strength]);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  };

  const handleLeave = () => {
    px.set(0.5);
    py.set(0.5);
  };

  // No precise hover pointer → nothing can drive the tilt, so skip the springs and the preserve-3d
  // layer entirely: one fewer composited layer per card on phones, and a flat card for users who
  // asked the OS for less motion. Hooks above still run unconditionally (rules of hooks).
  const [inert] = useState(() => isTouchFirst() || isReducedMotion());
  if (inert) return <div className={`relative h-full ${className}`}>{children}</div>;

  return (
    <div style={{ perspective: 1200 }} className={className}>
      <motion.div
        ref={ref}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        className="gpu relative h-full"
      >
        {children}
      </motion.div>
    </div>
  );
}
