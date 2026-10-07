import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Lock } from 'lucide-react';
import { BOOKING, CODE, MAP_PLACES, MESSAGES, SITES, type ArtifactKind, type Mission } from './missions';
import { rtl } from '../../lib/rtl';

/**
 * What JARVIS produces at each step of a demo mission, drawn in the site's own materials: dotted
 * rules, the field's density glyphs, Cousine for the machine's labels and code, Heebo for people's
 * words, one green ink. No screenshots, no stock imagery: a map is dotted streets and block pins,
 * a site's picture is a patch of density glyphs, a chart is a line of real points.
 *
 * Every artifact is a function of one state ('idle' before its step, 'run' while JARVIS works on
 * it, 'done' after) and paces its own animation to the step's length with `useBeats`, so the
 * console only says which step is running. 'done' renders the finished state directly, which is
 * also what reduced motion shows.
 */

export type ArtState = 'idle' | 'run' | 'done';

interface ArtProps {
  state: ArtState;
  ms: number;
  mission: Mission['id'];
}

/** Counts 0 → `count` while running, one beat every `every` ms after `delay`; `count` when done. */
function useBeats(state: ArtState, count: number, every: number, delay = 0): number {
  const [n, setN] = useState(state === 'done' ? count : 0);
  useEffect(() => {
    if (state !== 'run') {
      setN(state === 'done' ? count : 0);
      return;
    }
    setN(0);
    let i = 0;
    let id = 0;
    const tick = () => {
      i += 1;
      setN(i);
      if (i < count) id = window.setTimeout(tick, every);
    };
    id = window.setTimeout(tick, delay);
    return () => clearTimeout(id);
  }, [state, count, every, delay]);
  return n;
}

/** The pane's size in CSS px, for the charts (drawn in real pixels so strokes and marks keep
 *  their shape at any aspect). */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

const Caret = () => <i className="jv-caret" aria-hidden="true" />;

// ── Map: the area scanned for businesses ─────────────────────────────────────────────────────

// Streets in a 160 × 100 box, stretched to the pane: a loose grid, one avenue on a slant and one
// curving road, so it reads as a neighbourhood and not as graph paper.
const STREETS = [
  'M0 22 L160 18',
  'M0 47 L160 44',
  'M0 74 L160 70',
  'M24 0 L20 100',
  'M62 0 L60 100',
  'M104 0 L101 100',
  'M140 0 L137 100',
  'M0 96 L160 6',
  'M0 60 C40 52 70 90 110 84 S150 60 160 58',
];

function MapArt({ state, ms }: ArtProps) {
  // The scan sweeps from the reading start (right) to the left, so places light in that order.
  const order = useMemo(() => [...MAP_PLACES].sort((a, b) => b.x - a.x), []);
  const n = useBeats(state, order.length, (ms - 1000) / order.length, 450);
  const found = order.slice(0, n).filter((p) => !p.site).length;
  return (
    <div className="jv-art jv-map">
      <svg className="jv-map__streets" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
        {STREETS.map((d) => (
          <path key={d} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <span className="jv-map__area" />
      <span className="jv-map__you">אתם</span>
      {state === 'run' && <span className="jv-map__scan" style={{ animationDuration: `${ms - 700}ms` }} />}
      {order.map((p, i) => (
        <span
          key={p.name}
          className={`jv-pin ${i < n ? 'is-on' : ''} ${p.site ? 'jv-pin--site' : 'jv-pin--none'}`}
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
        >
          <i className="jv-pin__dot" />
          <span className="jv-pin__name">{p.name}</span>
          <span className="jv-pin__tag">{p.site ? 'יש אתר' : 'אין אתר'}</span>
        </span>
      ))}
      <p className="jv-art__count">
        <span>עסקים בלי אתר</span>
        <b>{found}</b>
      </p>
    </div>
  );
}

// ── Sites: one site per business, built in front of you ──────────────────────────────────────

const GLYPHS = ' .:-=+*';

/** A site's picture as a patch of density glyphs: a soft blob, different for every site. */
function GlyphPicture({ seed }: { seed: number }) {
  const text = useMemo(() => {
    const rows = 9;
    const cols = 30;
    const cx = cols * (0.35 + ((seed * 37) % 30) / 100);
    const cy = rows * 0.5;
    const lines: string[] = [];
    for (let r = 0; r < rows; r++) {
      let line = '';
      for (let c = 0; c < cols; c++) {
        const d = Math.hypot((c - cx) / (cols * 0.42), (r - cy) / (rows * 0.62));
        const wobble = Math.sin(c * 0.9 + seed) * 0.12 + Math.cos(r * 1.7 + seed * 0.5) * 0.1;
        const v = Math.max(0, Math.min(0.999, 1 - d + wobble));
        line += GLYPHS[Math.floor(v * GLYPHS.length)];
      }
      lines.push(line);
    }
    return lines.join('\n');
  }, [seed]);
  return (
    <pre className="jv-site__pic" dir="ltr" aria-hidden="true">
      {text}
    </pre>
  );
}

const SITE_PARTS = 7;

function SitesArt({ state, ms }: ArtProps) {
  const total = SITES.length * SITE_PARTS;
  const n = useBeats(state, total, (ms - 600) / total, 250);
  const current = Math.min(SITES.length - 1, Math.floor(n / SITE_PARTS));
  const parts = n - current * SITE_PARTS;
  const site = SITES[current];
  const on = (k: number) => (parts > k ? 'is-on' : '');
  return (
    <div className="jv-art jv-sites">
      <div className="jv-browser">
        <div className="jv-browser__bar">
          <Lock size={11} aria-hidden="true" />
          <span dir="ltr">{site.path}</span>
        </div>
        <div className="jv-site" key={site.path}>
          <div className={`jv-site__nav ${on(0)}`}>
            <b>{site.name}</b>
            <i />
            <i />
            <i />
          </div>
          <div className="jv-site__hero">
            <div className="jv-site__copy">
              <p className={`jv-site__title ${on(2)}`}>{site.name}</p>
              <p className={`jv-site__tagline ${on(3)}`}>{site.tagline}</p>
              <span className={`jv-site__btn ${on(4)}`}>{site.action}</span>
            </div>
            <div className={`jv-site__media ${on(1)}`}>
              <GlyphPicture seed={site.seed} />
            </div>
          </div>
          <ul className={`jv-site__items ${on(5)}`}>
            {site.items.map((it) => (
              <li key={it}>{it}</li>
            ))}
          </ul>
          <div className={`jv-site__foot ${on(6)}`} />
        </div>
      </div>
      <ol className="jv-sites__built">
        {SITES.map((s, i) => {
          const built = i < current || (i === current && parts >= SITE_PARTS);
          return (
            <li key={s.path} className={built ? 'is-built' : i === current ? 'is-now' : ''}>
              {built ? <Check size={12} aria-hidden="true" /> : <i />}
              {s.name}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── Messages: written and sent, one after another ────────────────────────────────────────────

const SEND_PAUSE = 14;

function MessagesArt({ state, ms, mission }: ArtProps) {
  const set = MESSAGES[mission === 'app' ? 'app' : 'sites'];
  // Bidi-anchored once (a time like 09:30 becomes one LTR isolate), then typed out mark by mark.
  const texts = useMemo(() => set.items.map((m) => rtl(m.text)), [set]);
  const per = texts.map((t) => t.length + SEND_PAUSE);
  const total = per.reduce((a, b) => a + b, 0);
  const n = useBeats(state, total, (ms - 500) / total, 200);
  let rest = n;
  let cur = 0;
  while (cur < set.items.length && rest >= per[cur]) {
    rest -= per[cur];
    cur += 1;
  }
  return (
    <div className="jv-art jv-msgs">
      <p className="jv-art__title">{set.title}</p>
      <ul className="jv-msgs__list">
        {set.items.map((m, i) => {
          const sent = i < cur;
          const now = i === cur;
          const typed = now ? Math.min(rest, texts[i].length) : 0;
          return (
            <li key={m.to} className={sent ? 'is-sent' : now && state === 'run' ? 'is-now' : ''}>
              <span className="jv-msgs__avatar" aria-hidden="true">
                {m.to[0]}
              </span>
              <div className="min-w-0">
                <b className="jv-msgs__to">{m.to}</b>
                <p className="jv-msgs__text">
                  {sent ? texts[i] : now ? texts[i].slice(0, typed) : ''}
                  {now && state === 'run' && <Caret />}
                </p>
              </div>
              <span className="jv-msgs__status">
                {sent ? (
                  <>
                    <Check size={13} aria-hidden="true" />
                    נשלח
                  </>
                ) : now && state === 'run' ? (
                  'כותב'
                ) : (
                  'בתור'
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Code: typed at machine speed ─────────────────────────────────────────────────────────────

const TOKENS = /(\b(?:def|if|elif|and|not|return|export|async|function|await|const)\b)|("[^"]*")|(\b\d+\b)/g;

function highlight(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKENS)) {
    const at = m.index ?? 0;
    if (at > last) out.push(line.slice(last, at));
    const cls = m[1] ? 'tk-k' : m[2] ? 'tk-s' : 'tk-n';
    out.push(
      <span key={at} className={cls}>
        {m[0]}
      </span>
    );
    last = at + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

function CodeArt({ state, ms, mission }: ArtProps) {
  const { file, lines } = CODE[mission === 'trading' ? 'trading' : 'app'];
  const text = lines.join('\n');
  const n = useBeats(state, text.length, (ms - 700) / text.length, 200);
  const shown = text.slice(0, n).split('\n');
  const finished = state === 'done' || n >= text.length;
  return (
    <div className="jv-art jv-code" dir="ltr">
      <div className="jv-code__tab">
        <span>{file}</span>
      </div>
      <div className="jv-code__body">
        {shown.map((l, i) => (
          <div key={i} className="jv-code__line">
            <span className="jv-code__no">{i + 1}</span>
            <code>
              {highlight(l)}
              {!finished && i === shown.length - 1 && <Caret />}
            </code>
          </div>
        ))}
      </div>
      <p className={`jv-code__run ${finished ? 'is-on' : ''}`}>
        <Check size={13} aria-hidden="true" />
        <span>tests passed</span>
      </p>
    </div>
  );
}

// ── Charts: the back-test and the bot running live ───────────────────────────────────────────

function makeSeries(count: number, seed: number) {
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const out: number[] = [];
  let x = 100;
  for (let i = 0; i < count; i++) {
    x += (rnd() - 0.48) * 2.4 + Math.sin(i / 8) * 0.9;
    out.push(x);
  }
  return out;
}

function movingAvg(series: number[], win: number) {
  return series.map((_, i) => {
    const from = Math.max(0, i - win + 1);
    const slice = series.slice(from, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

/** Where the price crosses its average: up is a buy, down a sell. */
function crossings(series: number[], avg: number[]) {
  const out: { i: number; kind: 'buy' | 'sell' }[] = [];
  for (let i = 12; i < series.length; i++) {
    const was = series[i - 1] - avg[i - 1];
    const now = series[i] - avg[i];
    if (was <= 0 && now > 0) out.push({ i, kind: 'buy' });
    if (was >= 0 && now < 0) out.push({ i, kind: 'sell' });
  }
  return out;
}

const SERIES = makeSeries(150, 7);
const AVG = movingAvg(SERIES, 12);
const BACK = 96;

function Chart({ series, avg, upto, live = false }: { series: number[]; avg: number[]; upto: number; live?: boolean }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const pad = { t: 14, b: 14, x: 6 };
  const lo = Math.min(...series) - 1;
  const hi = Math.max(...series) + 1;
  const X = (i: number) => pad.x + (i / (series.length - 1)) * (w - pad.x * 2);
  const Y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);
  const pts = (arr: number[]) => arr.slice(0, upto).map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const marks = crossings(series.slice(0, upto), avg.slice(0, upto));
  const tip = upto > 0 ? { x: X(upto - 1), y: Y(series[upto - 1]) } : null;
  return (
    <div ref={ref} className="jv-chart" dir="ltr">
      {w > 0 && (
        <svg width={w} height={h} aria-hidden="true">
          <polyline className="jv-chart__avg" points={pts(avg)} />
          <polyline className="jv-chart__price" points={pts(series)} />
          {marks.map((m) =>
            m.kind === 'buy' ? (
              <rect key={m.i} className="jv-chart__buy" x={X(m.i) - 3.5} y={Y(series[m.i]) + 7} width={7} height={7} />
            ) : (
              <rect key={m.i} className="jv-chart__sell" x={X(m.i) - 3.5} y={Y(series[m.i]) - 14} width={7} height={7} />
            )
          )}
          {live && tip && <rect className="jv-chart__tip" x={tip.x - 3.5} y={tip.y - 6} width={7} height={12} />}
        </svg>
      )}
    </div>
  );
}

function Legend() {
  return (
    <p className="jv-chart__legend">
      <span>
        <i className="is-buy" />
        קנייה
      </span>
      <span>
        <i className="is-sell" />
        מכירה
      </span>
      <span>
        <i className="is-avg" />
        הממוצע
      </span>
    </p>
  );
}

function BacktestArt({ state, ms }: ArtProps) {
  const n = useBeats(state, BACK, (ms - 500) / BACK, 150);
  const series = SERIES.slice(0, BACK);
  return (
    <div className="jv-art jv-trade">
      <p className="jv-art__title">בדיקה על נתוני עבר</p>
      <Chart series={series} avg={AVG.slice(0, BACK)} upto={Math.max(2, n)} />
      <Legend />
    </div>
  );
}

function LiveArt({ state }: ArtProps) {
  // Keeps ticking while it is on screen: the bot does not stop when the step is ticked off.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (state === 'idle') return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const id = window.setInterval(() => setTick((t) => (t + 1) % (SERIES.length - BACK)), 520);
    return () => clearInterval(id);
  }, [state]);
  const end = BACK + tick;
  const series = SERIES.slice(end - 70, end);
  const avg = AVG.slice(end - 70, end);
  const last = crossings(SERIES.slice(0, end), AVG.slice(0, end)).pop();
  return (
    <div className="jv-art jv-trade">
      <ul className="jv-trade__status">
        <li>
          <span>חשבון דמו</span>
          <b>
            <Check size={13} aria-hidden="true" />
            מחובר
          </b>
        </li>
        <li>
          <span>הבוט</span>
          <b>
            <span className="story-statusbar__live" aria-hidden="true" />
            רץ
          </b>
        </li>
        <li>
          <span>האות האחרון</span>
          <b>{last?.kind === 'sell' ? 'מכירה' : 'קנייה'}</b>
        </li>
      </ul>
      <Chart series={series} avg={avg} upto={series.length} live />
      <Legend />
    </div>
  );
}

// ── Phone: the booking app, live ─────────────────────────────────────────────────────────────

function PhoneArt({ state, ms }: ArtProps) {
  const total = 5 + BOOKING.slots.length;
  const n = useBeats(state, total, (ms - 500) / total, 200);
  const on = (k: number) => (n > k ? 'is-on' : '');
  return (
    <div className="jv-art jv-app">
      <div className={`jv-phone ${on(0)}`}>
        <div className={`jv-phone__head ${on(1)}`}>
          <b>{BOOKING.title}</b>
          <span>{BOOKING.place}</span>
        </div>
        <ul className={`jv-phone__services ${on(2)}`}>
          {BOOKING.services.map((x, i) => (
            <li key={x} className={i === 0 ? 'is-pick' : ''}>
              {x}
            </li>
          ))}
        </ul>
        <ul className={`jv-phone__days ${on(3)}`}>
          {BOOKING.days.map((d, i) => (
            <li key={d} className={i === BOOKING.day ? 'is-day' : ''}>
              {d}
            </li>
          ))}
        </ul>
        <ul className="jv-phone__slots">
          {BOOKING.slots.map((s, i) => (
            <li
              key={s}
              dir="ltr"
              className={`${on(4 + i)} ${BOOKING.taken.includes(s) ? 'is-taken' : ''} ${s === BOOKING.chosen && n >= total ? 'is-chosen' : ''}`}
            >
              {s}
            </li>
          ))}
        </ul>
        <p className={`jv-phone__done ${n >= total ? 'is-on' : ''}`}>
          <Check size={12} aria-hidden="true" />
          {BOOKING.confirm}
        </p>
        <span className={`jv-phone__btn ${n >= total - 1 ? 'is-on' : ''}`}>{BOOKING.action}</span>
      </div>
      <p className={`jv-app__live ${n >= total ? 'is-on' : ''}`}>
        <span className="story-statusbar__live" aria-hidden="true" />
        באוויר
        <code dir="ltr">{BOOKING.path}</code>
      </p>
    </div>
  );
}

// ── The pane ─────────────────────────────────────────────────────────────────────────────────

const ARTIFACTS: Record<ArtifactKind, (p: ArtProps) => ReactNode> = {
  map: MapArt,
  sites: SitesArt,
  messages: MessagesArt,
  code: CodeArt,
  backtest: BacktestArt,
  live: LiveArt,
  phone: PhoneArt,
};

export function Artifact({ kind, ...props }: ArtProps & { kind: ArtifactKind }) {
  const Art = ARTIFACTS[kind];
  return <Art {...props} />;
}
