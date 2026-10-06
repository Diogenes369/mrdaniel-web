import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { FACE, TONES, shapePath, type BotShape, type BotTone } from './botShapes';

export type BotMood = 'idle' | 'happy' | 'focus' | 'sleepy' | 'surprised' | 'sad';

/**
 * The Grok Bot deck's crew, living on the site (2026-10-06): the same heads and eyes as
 * public/grok-deck/js/bots.js, drawn as a small static SVG and kept alive by the cheapest things
 * that look alive.
 *
 *   breathing  a slow bob, on the HTML wrapper (a composited transform, no repaint), paused off screen
 *   blinking   one shared timer closes the lids for 150 ms now and then, each bot on its own rhythm
 *   looking    one shared pointer listener for every bot on the page writes two CSS variables per
 *              visible bot, only on frames where the pointer actually moved; on touch, the eyes
 *              follow the scroll instead (down when you scroll down)
 *   hopping    a Web Animations hop when the bot first comes into view, and again when tapped
 *
 * Nothing runs for a bot that is off screen, and under prefers-reduced-motion it simply stands
 * there with its eyes open. Decorative: hidden from screen readers.
 */
export interface SiteBotProps {
  shape?: BotShape;
  tone?: BotTone;
  mood?: BotMood;
  /** Width in px; the bot is a little taller than wide (room for its shadow). */
  size?: number;
  /** Hop when it first comes into view (default), never, or only when tapped. */
  hop?: 'view' | 'tap' | 'none';
  /** Seconds to wait before the hop on entering view, to stagger a crew. */
  hopDelay?: number;
  className?: string;
  style?: CSSProperties;
}

// ── the shared gaze ──────────────────────────────────────────────────────────────────────────
const visible = new Set<HTMLElement>();
let pointer: { x: number; y: number; at: number } | null = null;
let scrollDir = 0;
let scrollAt = 0;
let lastY = 0;
let raf = 0;
let settle = 0;
let installed = false;
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function look() {
  raf = 0;
  const now = performance.now();
  const hand = pointer && now - pointer.at < 3500 ? pointer : null;
  const scrolling = now - scrollAt < 700;
  visible.forEach((el) => {
    let gx = 0;
    let gy = 0;
    if (hand) {
      const r = el.getBoundingClientRect();
      const dx = hand.x - (r.left + r.width / 2);
      const dy = hand.y - (r.top + r.height * 0.42);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 220);
      gx = (dx / d) * k;
      gy = (dy / d) * k;
    } else if (scrolling) {
      gy = 0.75 * scrollDir;
    }
    el.style.setProperty('--gx', gx.toFixed(3));
    el.style.setProperty('--gy', gy.toFixed(3));
  });
  // Once the hand rests or the scroll stops, one more pass brings the eyes home.
  window.clearTimeout(settle);
  if (hand || scrolling) settle = window.setTimeout(schedule, hand ? 3600 : 760);
}
function schedule() {
  if (!raf) raf = requestAnimationFrame(look);
}

// Blinks: one shared timer for every visible bot, each on its own random rhythm. A lid only moves
// for the 150 ms of a blink, so a page full of bots repaints nothing in between.
const nextBlink = new WeakMap<HTMLElement, number>();
let blinkTimer = 0;
function blinkTick() {
  const now = performance.now();
  visible.forEach((el) => {
    const due = nextBlink.get(el) ?? now + 800 + Math.random() * 3000;
    if (now < due) {
      nextBlink.set(el, due);
      return;
    }
    el.setAttribute('data-blink', '');
    window.setTimeout(() => el.removeAttribute('data-blink'), 150);
    // Now and then a double blink.
    if (Math.random() < 0.18) window.setTimeout(() => { el.setAttribute('data-blink', ''); window.setTimeout(() => el.removeAttribute('data-blink'), 130); }, 300);
    nextBlink.set(el, now + 2600 + Math.random() * 4200);
  });
  if (!visible.size) {
    window.clearInterval(blinkTimer);
    blinkTimer = 0;
  }
}
function watch(el: HTMLElement) {
  visible.add(el);
  el.setAttribute('data-on', '');
  if (!blinkTimer && !reduceMotion()) blinkTimer = window.setInterval(blinkTick, 250);
}
function unwatch(el: HTMLElement) {
  visible.delete(el);
  el.removeAttribute('data-on');
}
function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse' || !visible.size) return;
      pointer = { x: e.clientX, y: e.clientY, at: performance.now() };
      schedule();
    },
    { passive: true }
  );
  lastY = window.scrollY;
  window.addEventListener(
    'scroll',
    () => {
      const y = window.scrollY;
      if (Math.abs(y - lastY) < 2 || !visible.size) return;
      scrollDir = y > lastY ? 1 : -1;
      lastY = y;
      scrollAt = performance.now();
      if (!pointer || performance.now() - pointer.at > 3500) schedule();
    },
    { passive: true }
  );
}

// ── the skin: a tile of real letters and density marks, made once ─────────────────────────────
let skinUrl: string | null = null;
function skin(): string {
  if (skinUrl !== null) return skinUrl;
  skinUrl = '';
  try {
    const cols = 16, rows = 7, cw = 9, ch = 14, k = 3;
    const c = document.createElement('canvas');
    c.width = cols * cw * k;
    c.height = rows * ch * k;
    const ctx = c.getContext('2d');
    if (!ctx) return skinUrl;
    ctx.scale(k, k);
    ctx.font = '700 11px Cousine, "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let seed = 11;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const MARKS = 'אבגדהוזחטיכלמנסעפצקרשתGROKBT+=:-';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const r = rand();
        if (r < 0.22) continue;
        ctx.fillStyle = `rgba(10, 11, 9, ${0.1 + r * 0.2})`;
        ctx.fillText(MARKS[Math.floor(rand() * MARKS.length)], x * cw + cw / 2, y * ch + ch * 0.55);
      }
    }
    skinUrl = c.toDataURL('image/png');
  } catch {
    /* a plain head is fine */
  }
  return skinUrl;
}

/** A small hash of the instance id, for each bot's own blink and breath. */
function seedOf(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

const HOP: Keyframe[] = [
  { transform: 'translateY(0) scale(1, 1)', easing: 'cubic-bezier(.3,0,.6,1)' },
  { offset: 0.14, transform: 'translateY(0) scale(1.12, 0.86)', easing: 'cubic-bezier(.15,.75,.35,1)' },
  { offset: 0.44, transform: 'translateY(-32%) scale(0.93, 1.09)', easing: 'cubic-bezier(.55,0,.85,.4)' },
  { offset: 0.7, transform: 'translateY(0) scale(1.14, 0.85)', easing: 'cubic-bezier(.2,.8,.3,1)' },
  { offset: 0.84, transform: 'translateY(0) scale(0.97, 1.04)' },
  { transform: 'translateY(0) scale(1, 1)' },
];
const SHADOW: Keyframe[] = [
  { transform: 'scale(1)', opacity: 1 },
  { offset: 0.44, transform: 'scale(0.62)', opacity: 0.4 },
  { offset: 0.7, transform: 'scale(1.08)', opacity: 1 },
  { transform: 'scale(1)', opacity: 1 },
];

export default function SiteBot({
  shape = 'circle',
  tone = 'ink',
  mood = 'idle',
  size = 120,
  hop = 'view',
  hopDelay = 0,
  className = '',
  style,
}: SiteBotProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9]/g, '');
  const [tex, setTex] = useState('');
  const [flash, setFlash] = useState<BotMood | null>(null);
  const d = shapePath(shape);
  const f = FACE[shape];
  const r = seedOf(rawId);

  useEffect(() => setTex(skin()), []);

  const doHop = (delay = 0) => {
    const el = ref.current;
    if (!el || reduceMotion()) return;
    const body = el.querySelector<HTMLElement>('.site-bot__hop');
    const shadow = el.querySelector<HTMLElement>('.site-bot__shadow');
    const t = { duration: 720, delay: delay * 1000 };
    body?.animate(HOP, t);
    shadow?.animate(SHADOW, t);
    window.setTimeout(() => setFlash('happy'), delay * 1000 + 300);
    window.setTimeout(() => setFlash(null), delay * 1000 + 1500);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    install();
    let hopped = false;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            watch(el);
            if (!hopped && hop === 'view' && e.intersectionRatio >= 0.6) {
              hopped = true;
              doHop(hopDelay);
            }
          } else {
            unwatch(el);
          }
        }
      },
      { threshold: [0, 0.6] }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      unwatch(el);
    };
    // doHop reads refs only; the observer is set up once per bot.
  }, [hop, hopDelay]);

  return (
    <span
      ref={ref}
      className={`site-bot ${className}`}
      data-mood={flash ?? mood}
      data-tap={hop !== 'none' ? '' : undefined}
      aria-hidden="true"
      onPointerDown={hop !== 'none' ? () => doHop(0) : undefined}
      style={
        {
          '--bot-size': `${size}px`,
          '--bot-tone': TONES[tone],
          '--bob-delay': `${(-r * 3.8).toFixed(2)}s`,
          ...style,
        } as CSSProperties
      }
    >
      <span className="site-bot__shadow">.:-=-:.</span>
      <span className="site-bot__hop">
        <span className="site-bot__bob">
          <svg className="site-bot__svg" viewBox="-120 -120 240 240">
            {tex && (
              <defs>
                <clipPath id={`bc${id}`}>
                  <path d={d} />
                </clipPath>
                <pattern id={`bp${id}`} patternUnits="userSpaceOnUse" width="144" height="98" x="-72" y="-49">
                  <image href={tex} width="144" height="98" preserveAspectRatio="none" />
                </pattern>
              </defs>
            )}
            <path className="site-bot__head" d={d} />
            {tex && <rect x="-130" y="-130" width="260" height="260" fill={`url(#bp${id})`} clipPath={`url(#bc${id})`} />}
            <path d={d} fill="none" stroke="rgba(10,11,9,0.22)" strokeWidth="3" />
            <g transform={`translate(${f[0]} ${f[1]}) scale(${f[2]})`}>
              <g className="site-bot__gaze">
                {[-1, 1].map((side) => (
                  <g key={side} transform={`translate(${side * 30} 0)`}>
                    <g className="site-bot__eye" style={{ ['--side' as string]: side }}>
                      <g className="site-bot__lid">
                        <rect className="site-bot__cap" x="-12" y="-26" width="24" height="52" rx="12" />
                        <rect className="site-bot__glint" x="-3" y="-18" width="6" height="10" />
                      </g>
                      <path className="site-bot__arc" d="M-14 6 Q0 -14 14 6" />
                    </g>
                  </g>
                ))}
              </g>
            </g>
          </svg>
        </span>
      </span>
    </span>
  );
}

/** A row of the crew, each its own shape and tone, hopping in one after another. */
export function BotCrew({
  size = 64,
  lead = 96,
  className = '',
  mood = 'happy',
}: {
  size?: number;
  /** The main (circle) bot in the middle is bigger. */
  lead?: number;
  className?: string;
  mood?: BotMood;
}) {
  const crew: [BotShape, BotTone][] = [
    ['flower', 'deep'],
    ['diamond', 'pale'],
    ['circle', 'ink'],
    ['square', 'hi'],
    ['triangle', 'fill'],
  ];
  return (
    <span className={`bot-crew ${className}`} aria-hidden="true">
      {crew.map(([shape, tone], i) => (
        <SiteBot key={shape} shape={shape} tone={tone} mood={mood} size={shape === 'circle' ? lead : size} hopDelay={0.12 * i} />
      ))}
    </span>
  );
}
