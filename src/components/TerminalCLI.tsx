import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

/**
 * Interactive Terminal / CLI mode. Opened from the header's `>_` toggle (or the mobile drawer)
 * via the `open-cli` window event; Escape or `exit` closes it.
 *
 * Layout: full-viewport overlay on mobile (< md) with mobile-safe padding + a 44px sticky close
 * button + a scrollable quick-command chip bar above the input; a centred floating window on
 * desktop. Background page scroll is locked while open (`body { overflow: hidden }`), the height
 * is `dvh` so the mobile virtual keyboard is handled, and the output area scrolls in its own
 * `overflow: auto` box so a wide ASCII table scrolls rather than wrapping.
 */

type Tone = 'prompt' | 'out' | 'dim' | 'accent' | 'err';
interface Line {
  text: string;
  tone: Tone;
}

const TONE_CLASS: Record<Tone, string> = {
  prompt: 'text-[#4ade80]',
  out: 'text-zinc-200',
  dim: 'text-zinc-500',
  accent: 'text-[#22d3ee]',
  err: 'text-[#f87171]',
};

const QUICK_CMDS = ['help', 'whoami', 'skills', 'stack', 'contact', 'clear', 'exit'] as const;

const BANNER: Line[] = [
  { text: 'mrdaniel.co.il — interactive shell  v1.0', tone: 'accent' },
  { text: "type 'help' for commands · 'exit' to close", tone: 'dim' },
  { text: '', tone: 'out' },
];

/** Box-drawing table. Values kept ASCII so `padEnd` alignment holds; the output box scrolls
 *  horizontally on narrow screens instead of wrapping. */
function asciiTable(rows: [string, string][], head: [string, string]): string[] {
  const c0 = Math.max(head[0].length, ...rows.map((r) => r[0].length));
  const c1 = Math.max(head[1].length, ...rows.map((r) => r[1].length));
  const bar = (l: string, m: string, r: string) => l + '─'.repeat(c0 + 2) + m + '─'.repeat(c1 + 2) + r;
  const row = (a: string, b: string) => `│ ${a.padEnd(c0)} │ ${b.padEnd(c1)} │`;
  return [bar('┌', '┬', '┐'), row(head[0], head[1]), bar('├', '┼', '┤'), ...rows.map((r) => row(r[0], r[1])), bar('└', '┴', '┘')];
}

const SKILLS: [string, string][] = [
  ['Cyber', 'Zero-Trust · IAM/Entra · EDR/XDR'],
  ['AI Agents', 'RAG · multi-model · guardian layer'],
  ['Web3 / WebGL', '3D UI · wallets · smart contracts'],
  ['Networking', 'Enterprise design · Wi-Fi 7'],
  ['IT Ops', 'Production infra · hands-on'],
];

const STACK: [string, string][] = [
  ['Frontend', 'React · TypeScript · Tailwind'],
  ['3D / Motion', 'three.js / R3F · GSAP · Framer'],
  ['Backend', 'Node · Vercel Functions'],
  ['AI', 'Gemini · Claude · GPT (routed)'],
  ['Data', 'Firebase RTDB · edge cache'],
];

const HELP: Line[] = [
  { text: 'available commands', tone: 'accent' },
  { text: '  help      show this list', tone: 'out' },
  { text: '  whoami    who runs this site', tone: 'out' },
  { text: '  skills    core capability matrix', tone: 'out' },
  { text: '  stack     tech stack', tone: 'out' },
  { text: '  contact   how to reach me', tone: 'out' },
  { text: '  clear     wipe the screen', tone: 'out' },
  { text: '  exit      close terminal', tone: 'out' },
];

const WHOAMI: Line[] = [
  { text: 'Daniel Ben Baruch  ·  mrdaniel.co.il', tone: 'accent' },
  { text: 'IT Manager turned AI-agent & cyber-security architect.', tone: 'out' },
  { text: 'Builds & runs real production systems — not slideware.', tone: 'out' },
  { text: 'Focus: autonomous AI agents, Zero-Trust security,', tone: 'out' },
  { text: '       enterprise networking, Web3 / WebGL.', tone: 'out' },
];

const CONTACT: Line[] = [
  { text: 'email     daniel@mrdaniel.co.il', tone: 'out' },
  { text: 'site      https://mrdaniel.co.il', tone: 'out' },
  { text: 'instagram https://www.instagram.com/mrdaniel.ai/', tone: 'out' },
  { text: 'linkedin  linkedin.com/in/daniel-ben-baruch', tone: 'out' },
  { text: '', tone: 'out' },
  { text: "tip: run 'exit' then use “דברו איתי” in the nav for the form.", tone: 'dim' },
];

export default function TerminalCLI() {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>(BANNER);
  const [input, setInput] = useState('');
  const history = useRef<string[]>([]);
  const histIdx = useRef<number>(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mobile virtual-keyboard handling. `dvh` still reports the *layout* viewport when the keyboard
  // is up on iOS/Android, so the overlay gets stretched behind the keyboard and the top bar /
  // input row are pushed off-screen. Bind the window instead to `window.visualViewport` — its
  // `height` shrinks with the keyboard and `offsetTop` tracks any viewport shift.
  const [isMobile, setIsMobile] = useState(false);
  const [vv, setVv] = useState<{ height: number; top: number } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const target = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!open || !target) {
      setVv(null);
      return;
    }
    let raf = 0;
    const apply = () => {
      raf = 0;
      setVv({ height: target.height, top: target.offsetTop });
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    target.addEventListener('resize', schedule);
    target.addEventListener('scroll', schedule);
    return () => {
      target.removeEventListener('resize', schedule);
      target.removeEventListener('scroll', schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [open]);

  const push = useCallback((add: Line[]) => {
    setLines((prev) => {
      const next = [...prev, ...add];
      return next.length > 400 ? next.slice(next.length - 400) : next;
    });
  }, []);

  const run = useCallback(
    (raw: string) => {
      const cmd = raw.trim();
      push([{ text: `> ${cmd}`, tone: 'prompt' }]);
      if (cmd) {
        history.current = [cmd, ...history.current.filter((c) => c !== cmd)].slice(0, 50);
      }
      histIdx.current = -1;

      const base = cmd.toLowerCase().split(/\s+/)[0];
      switch (base) {
        case '':
          break;
        case 'help':
        case '?':
          push(HELP);
          break;
        case 'whoami':
          push(WHOAMI);
          break;
        case 'skills':
          push(asciiTable(SKILLS, ['domain', 'stack']).map((t) => ({ text: t, tone: 'out' as Tone })));
          break;
        case 'stack':
          push(asciiTable(STACK, ['layer', 'tools']).map((t) => ({ text: t, tone: 'out' as Tone })));
          break;
        case 'contact':
          push(CONTACT);
          break;
        case 'clear':
        case 'cls':
          setLines([]);
          break;
        case 'exit':
        case 'quit':
        case 'q':
          setOpen(false);
          break;
        default:
          push([{ text: `command not found: ${base} — type 'help'`, tone: 'err' }]);
      }
      push([{ text: '', tone: 'out' }]);
    },
    [push]
  );

  // open via the header toggle
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('open-cli', onOpen);
    return () => window.removeEventListener('open-cli', onOpen);
  }, []);

  // Escape to close (only while open)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // lock background scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // focus the input on open
  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  // keep the view pinned to the newest line — also re-pin when the keyboard resizes the window
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, open, vv?.height]);

  const submit = () => {
    run(input);
    setInput('');
  };

  const onInputKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const h = history.current;
      if (!h.length) return;
      histIdx.current = Math.min(histIdx.current + 1, h.length - 1);
      setInput(h[histIdx.current] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      histIdx.current = Math.max(histIdx.current - 1, -1);
      setInput(histIdx.current === -1 ? '' : history.current[histIdx.current] ?? '');
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  };

  const quick = (c: string) => {
    if (c === 'clear') {
      setLines([]);
      inputRef.current?.focus();
      return;
    }
    if (c === 'exit') {
      setOpen(false);
      return;
    }
    run(c);
    setInput('');
    inputRef.current?.focus();
  };

  // On mobile, pin the window to the visual viewport (keyboard-aware); on desktop the `md:`
  // classes centre a fixed-size window and this stays empty so they win.
  const useVV = open && isMobile && !!vv;
  const windowStyle: CSSProperties = useVV
    ? {
        position: 'fixed',
        top: vv!.top,
        left: 0,
        right: 0,
        height: vv!.height,
        maxHeight: vv!.height,
        transform: 'translateZ(0)',
      }
    : { transform: 'translateZ(0)' };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="fixed inset-0 z-[120] flex items-stretch justify-center md:items-center md:p-6"
          style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', background: 'rgba(3,5,8,0.72)' }}
          role="dialog"
          aria-modal="true"
          aria-label="מסוף CLI"
          onMouseDown={(e) => {
            // click the dimmed area (desktop) to close
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <motion.div
            initial={{ y: 24, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 24, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex h-dvh w-full flex-col overflow-hidden border border-[#22d3ee]/25 bg-[#04060a]/95 font-mono text-[13px] leading-relaxed shadow-[0_0_60px_rgba(34,211,238,0.12)] md:h-[min(78dvh,640px)] md:max-w-3xl md:rounded-xl"
            style={windowStyle}
            onMouseDown={() => inputRef.current?.focus()}
          >
            {/* title bar + sticky close (>=44px touch target) */}
            <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#04060a]/95 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 md:pt-2">
              <span className="flex items-center gap-2 truncate text-[#4ade80]">
                <span className="inline-flex gap-1" aria-hidden="true">
                  <i className="h-2.5 w-2.5 rounded-full bg-[#f87171]" />
                  <i className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]" />
                  <i className="h-2.5 w-2.5 rounded-full bg-[#4ade80]" />
                </span>
                <span className="truncate text-zinc-400">daniel@mrdaniel:~$</span>
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="סגירת המסוף"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-zinc-400 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-[#22d3ee]/60"
              >
                <X size={20} />
              </button>
            </div>

            {/* output */}
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-auto px-3 py-3 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-white/15"
              style={{ overscrollBehavior: 'none', touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
            >
              {lines.map((l, i) => (
                <div key={i} className={`whitespace-pre ${TONE_CLASS[l.tone]}`}>
                  {l.text || ' '}
                </div>
              ))}
            </div>

            {/* quick-command chips — horizontal scroll, glued directly above the input row */}
            <div
              className="flex shrink-0 gap-2 overflow-x-auto border-t border-white/10 px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'none', touchAction: 'pan-x' }}
            >
              {QUICK_CMDS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => quick(c)}
                  className="shrink-0 rounded-md border border-[#22d3ee]/30 bg-[#22d3ee]/10 px-3 py-1.5 text-[12px] text-[#7dd3fc] transition-colors hover:bg-[#22d3ee]/20 active:scale-95"
                >
                  [{c}]
                </button>
              ))}
            </div>

            {/* input row */}
            <div className="flex shrink-0 items-center gap-2 border-t border-white/10 px-3 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] md:pb-2">
              <span className="shrink-0 text-[#4ade80]">{'>'}</span>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onInputKey}
                onFocus={() => {
                  // let the keyboard finish opening, then re-pin the output to the newest line
                  window.setTimeout(() => {
                    const el = scrollRef.current;
                    if (el) el.scrollTop = el.scrollHeight;
                  }, 180);
                }}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                inputMode="text"
                enterKeyHint="send"
                aria-label="שורת פקודה"
                placeholder="help"
                // 16px hard-coded (not rem/text-base) so iOS Safari never auto-zooms the page on
                // focus regardless of the root font scale set by the accessibility widget.
                style={{ fontSize: '16px' }}
                className="min-w-0 flex-1 bg-transparent leading-none text-zinc-100 caret-[#4ade80] outline-none placeholder:text-zinc-600"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
