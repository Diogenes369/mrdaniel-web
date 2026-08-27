import { motion } from 'motion/react';

export default function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-4 py-3.5 rounded-2xl rounded-bl-none w-fit">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-brand-400"
          animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}
