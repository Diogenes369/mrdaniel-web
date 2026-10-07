import { useCallback, useEffect, useRef, useState, type Ref } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Check, Cloud, Cpu, FileText, Plus, RotateCcw } from 'lucide-react';
import GlyphButton from '../components/ui/GlyphButton';
import TermTooltip from '../components/TermTooltip';
import SiteBot from '../components/bots/SiteBot';
import { InfoBox } from '../components/content/ContentPrimitives';
import { fieldState, useFieldQuiet } from '../components/field/fieldState';

/**
 * /jarvis, in the glyph world since 2026-10-07: JARVIS shown doing, not described.
 *
 * The page is one conversation. The J.A.R.V.I.S mark is built out of the field's own glyphs (the
 * ring breaks where the name crosses it, as in the original mark), and under it a request types
 * itself and JARVIS answers with what it did, stopping to ask before it sends anything. Further
 * down, each thing it does is another short exchange, the ring returns at the middle of a sheet
 * that labels its four parts (the field hands its glyphs from the top mark to this one), the two
 * ways to run it are two install sheets, and the questions are asked and answered the same way.
 *
 * Every exchange is an illustration and says so ("דוגמה"). The four clips that used to sit on this
 * page were other people's videos (owner, 2026-10-07) and were removed with their files; there is
 * no footage, client, price or number here to invent around.
 */

const LEAD_SUBJECT = 'JARVIS System Inquiry';

function openJarvisLead(sourceSection: string) {
  window.dispatchEvent(new CustomEvent('open-lead-modal', { detail: { subject: LEAD_SUBJECT, sourceSection } }));
}

type Turn = { who: 'you' | 'jarvis'; text?: string; done?: string[] };

interface Ability {
  title: string;
  points: { lead: string; text: string }[];
  turns: Turn[];
}

// Copy from the page as rewritten 2026-09-23 in the plain client voice; the exchanges only act out
// what these points already say.
const ABILITIES: Ability[] = [
  {
    title: 'מדברים איתו כמו עם אדם',
    points: [
      { lead: 'בלי פקודות מיוחדות', text: 'מבקשים במילים שלכם, גם בסלנג, והוא מבין מה התכוונתם.' },
      { lead: 'עונה בקול', text: 'אפשר לדבר איתו ולשמוע תשובה, והוא שואל כשמשהו לא ברור לו.' },
    ],
    turns: [
      { who: 'you', text: 'תזכיר לי לחזור ליוסי בעוד שעה' },
      { who: 'jarvis', text: 'יש שני יוסי באנשי הקשר: יוסי כהן ויוסי מהמשרד. לאיזה מהם?' },
      { who: 'you', text: 'מהמשרד' },
      { who: 'jarvis', done: ['תזכורת בעוד שעה: לחזור ליוסי מהמשרד'] },
    ],
  },
  {
    title: 'מסדר לכם את העבודה',
    points: [
      { lead: 'מחובר לכלים שלכם', text: 'יומן, מייל, רשימת הלקוחות ורשימת המשימות.' },
      { lead: 'פגישות ותזכורות', text: 'קובע פגישות, שולח תזכורות ומסכם את המיילים שהגיעו.' },
      { lead: 'תמונת מצב', text: 'אומר לכם בכל רגע מה פתוח, מה מחכה לכם ומה כבר טופל.' },
    ],
    turns: [
      { who: 'you', text: 'מה מחכה לי היום?' },
      { who: 'jarvis', text: 'שתי פגישות, שלושה מיילים שמחכים לתשובה ומשימה אחת פתוחה מאתמול. לסכם לך את המיילים?' },
      { who: 'you', text: 'כן, בקצרה' },
      { who: 'jarvis', done: ['סיכום של שלושת המיילים', 'טיוטת תשובה לכל אחד, מחכה לאישור'] },
    ],
  },
  {
    title: 'גם בבית ובמשרד',
    points: [
      { lead: 'שליטה במכשירים', text: 'תאורה, מיזוג ומסכים, כשהם מחוברים לרשת.' },
      { lead: 'מצבים מוכנים', text: 'למשל "מצב פגישה": מחשיך את האור ומדליק את המקרן בבקשה אחת.' },
    ],
    turns: [
      { who: 'you', text: 'מצב פגישה' },
      { who: 'jarvis', done: ['האור במשרד הוחשך', 'המקרן הודלק'] },
    ],
  },
];

const BENEFITS = [
  'פחות מטלות קטנות שגוזלות לכם את היום.',
  'עובד גם כשאתם לא ליד המחשב.',
  'נבנה סביב הדרך שבה אתם עובדים, לא להפך.',
  'המידע שלכם נשאר בשליטה שלכם.',
];

const PARTS = [
  { term: 'הקול', text: 'מבין דיבור בעברית גם כשיש רעש ברקע, ועונה בקול טבעי.' },
  { term: 'המוח', text: 'מודלי ה-AI המובילים, כמו Claude, Gemini, GPT ו-Grok. לכל משימה נבחר המודל שעושה אותה הכי טוב.' },
  { term: 'הזיכרון', text: 'זוכר מה אתם מעדיפים ואיך אתם עובדים, ויודע לחפש תשובות בתוך המסמכים והמיילים שלכם.' },
  { term: 'הפרטיות', text: 'אתם קובעים לאילו כלים יש לו גישה. אפשר להריץ אותו אצלכם במשרד, כך שהמידע לא יוצא החוצה.' },
];

const SHEETS = [
  {
    icon: Cloud,
    title: 'בענן: הכי פשוט להתחיל',
    tag: 'רוב האנשים מתחילים כאן',
    description: 'JARVIS רץ על שרת בענן. לא צריך לקנות מחשב מיוחד, והעדכונים מגיעים לבד.',
    rows: [
      { label: 'מחשב', value: 'כל מחשב, טאבלט או טלפון.' },
      { label: 'אינטרנט', value: 'חיבור יציב.' },
      { label: 'לשיחה קולית', value: 'מיקרופון ורמקולים, או אוזניות.' },
    ],
  },
  {
    icon: Cpu,
    title: 'אצלכם במשרד: פרטיות מקסימלית',
    description: 'JARVIS מותקן על מחשב אצלכם, והמידע לא יוצא החוצה. דורש מחשב חזק במיוחד.',
    rows: [
      { label: 'מעבד', value: 'Intel Core i7 או AMD Ryzen 7 מדור עדכני ומעלה.' },
      { label: 'זיכרון', value: 'לפחות 32GB, עדיף 64GB.' },
      { label: 'כרטיס מסך', value: 'NVIDIA חזק (RTX 3090 או 4090 ומעלה). בלעדיו המודל לא ירוץ אצלכם.' },
      { label: 'אחסון', value: 'כונן SSD מהיר עם לפחות 1TB פנוי.' },
    ],
  },
];

// The answers are Daniel's (he builds JARVIS and talks to people about it), so they are tagged
// with his name, not JARVIS's.
const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'במה JARVIS שונה מ-ChatGPT?',
    a: 'ChatGPT עונה לכם. JARVIS גם עושה: הוא מחובר ליומן, למייל ולשאר הכלים שלכם, ויכול לקבוע פגישה, לשלוח מייל או לעדכן רשימה, ולעצור לאישור שלכם כשצריך.',
  },
  { q: 'הוא מבין עברית ומדבר בקול?', a: 'כן. הוא עובד בעברית טבעית, בכתב ובקול. אפשר לבקש ממנו דברים בדיבור ולקבל תשובה בקול.' },
  {
    q: 'למי זה מתאים?',
    a: 'לעצמאים ולעסקים קטנים שמבזבזים זמן על יומן, מיילים, תזכורות ומעקב אחרי לקוחות. בשיחה הראשונה נבדוק יחד אם זה באמת מתאים לכם.',
  },
  {
    q: 'מה קורה עם המידע שלי?',
    a: 'המידע נשאר שלכם. אפשר להריץ את JARVIS על מחשב אצלכם, כך שהמידע לא יוצא החוצה בכלל. בענן, הוא לא משמש לאימון מודלים ציבוריים.',
  },
  {
    q: 'איך מתחילים?',
    a: 'בשיחה קצרה אנחנו מבינים מה הכי מעמיס עליכם. אחר כך אני בונה ומחבר את JARVIS לכלים שלכם, בודק שהכל עובד, ומראה לכם איך להשתמש בו.',
  },
];

/** The J.A.R.V.I.S mark. The field draws it in glyphs when it can (data-glyph-ring adds the ring);
 *  otherwise it stays a solid green name in a CSS ring, a finished look of its own. */
function JarvisMark({ ref, className = '' }: { ref?: Ref<HTMLDivElement>; className?: string }) {
  return (
    <div ref={ref} className={`jv-mark ${className}`} data-glyph-ring aria-hidden="true">
      <span className="jv-mark__name" dir="ltr">
        J.A.R.V.I.S
      </span>
    </div>
  );
}

function DoneLines({ lines, caret = false }: { lines: string[]; caret?: boolean }) {
  return (
    <ul className="jv-done">
      {lines.map((l, i) => (
        <li key={l}>
          <Check size={15} aria-hidden="true" />
          <span>
            {l}
            {caret && i === lines.length - 1 && <span className="jv-caret" aria-hidden="true" />}
          </span>
        </li>
      ))}
    </ul>
  );
}

const HERO_REQUEST = 'תקבע לי פגישה עם רונית ביום שלישי בעשר, ותזכיר לה יום לפני.';
const HERO_DONE = ['נקבע ביומן: שלישי, 10:00, עם רונית', 'הזמנה במייל מוכנה לשליחה', 'תזכורת לרונית ביום שני'];

/**
 * The first viewport's exchange: the request types itself, JARVIS lists what it did and stops to
 * ask before sending. The two buttons answer it, so the example finishes the way the visitor says.
 */
function HeroExchange() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState(reduce ? HERO_REQUEST.length : 0);
  const [shown, setShown] = useState(reduce ? HERO_DONE.length : 0);
  const [asking, setAsking] = useState(!!reduce);
  const [outcome, setOutcome] = useState<null | 'sent' | 'later'>(null);
  const [run, setRun] = useState(0);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setInView(true), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduce || !inView) return;
    const timers: number[] = [];
    let i = 0;
    const type = () => {
      i += 1;
      setTyped(i);
      if (i < HERO_REQUEST.length) timers.push(window.setTimeout(type, 24 + (HERO_REQUEST[i - 1] === ' ' ? 30 : 0)));
      else {
        HERO_DONE.forEach((_, k) => timers.push(window.setTimeout(() => setShown(k + 1), 900 + k * 380)));
        timers.push(window.setTimeout(() => setAsking(true), 900 + HERO_DONE.length * 380 + 250));
      }
    };
    timers.push(window.setTimeout(type, 300));
    return () => timers.forEach(clearTimeout);
  }, [inView, run, reduce]);

  const replay = useCallback(() => {
    setTyped(0);
    setShown(0);
    setAsking(false);
    setOutcome(null);
    setRun((r) => r + 1);
  }, []);

  const typing = typed < HERO_REQUEST.length;
  const thinking = !typing && shown === 0;

  return (
    <div ref={ref} className="glyph-frame jv-chat jv-chat--hero" role="group" aria-label="דוגמה לשיחה עם JARVIS">
      <div className="jv-chat__bar">
        <span className="story-statusbar__live" aria-hidden="true" />
        <span>דוגמה</span>
      </div>
      <div className="jv-turn jv-turn--you">
        <span className="jv-turn__who">אתם</span>
        <p className="jv-turn__text">
          {HERO_REQUEST.slice(0, typed)}
          {typing && <span className="jv-caret" aria-hidden="true" />}
        </p>
      </div>
      {!typing && (
        <div className="jv-turn jv-turn--jarvis">
          <span className="jv-turn__who" dir="ltr">
            JARVIS
          </span>
          {thinking ? (
            <span className="jv-caret" aria-hidden="true" />
          ) : (
            <motion.div initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <DoneLines lines={HERO_DONE.slice(0, shown)} />
            </motion.div>
          )}
          <AnimatePresence initial={false}>
            {asking && !outcome && (
              <motion.div className="jv-ask" initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <p className="jv-turn__text">
                  לשלוח לה את ההזמנה?
                  <span className="jv-caret" aria-hidden="true" />
                </p>
                <div className="jv-ask__btns">
                  <GlyphButton className="glyph-btn--mini" onClick={() => setOutcome('sent')}>
                    שליחה
                  </GlyphButton>
                  <GlyphButton variant="line" className="glyph-btn--mini" onClick={() => setOutcome('later')}>
                    לא עכשיו
                  </GlyphButton>
                </div>
              </motion.div>
            )}
            {outcome && (
              <motion.div key="outcome" initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <DoneLines lines={[outcome === 'sent' ? 'נשלח. רונית תקבל הזמנה ותזכורת' : 'נשמר כטיוטה. שום דבר לא נשלח']} caret />
                <button type="button" className="jv-replay" onClick={replay}>
                  <RotateCcw size={13} aria-hidden="true" />
                  שוב מההתחלה
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/** A short exchange further down: the turns arrive one after another as the frame comes into view,
 *  and JARVIS's last line ends on the caret, where the next request would go. */
function Exchange({ turns }: { turns: Turn[] }) {
  const last = turns.map((t) => t.who).lastIndexOf('jarvis');
  return (
    <div className="glyph-frame jv-chat" role="group" aria-label="דוגמה לשיחה עם JARVIS" data-live="frame">
      <div className="jv-chat__bar">
        <span className="story-statusbar__live" aria-hidden="true" />
        <span>דוגמה</span>
      </div>
      <div className="jv-chat__turns" data-live="stagger">
        {turns.map((t, i) => (
          <div key={i} className={`jv-turn jv-turn--${t.who}`}>
            <span className="jv-turn__who" dir={t.who === 'jarvis' ? 'ltr' : undefined}>
              {t.who === 'you' ? 'אתם' : 'JARVIS'}
            </span>
            {t.text && (
              <p className="jv-turn__text">
                {t.text}
                {i === last && !t.done && <span className="jv-caret" aria-hidden="true" />}
              </p>
            )}
            {t.done && <DoneLines lines={t.done} caret={i === last} />}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The questions, asked and answered like the rest of the page. Each question is a disclosure
 *  button; its answer is Daniel's turn. */
function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="glyph-frame jv-chat jv-faq" data-live="frame">
      <div className="jv-chat__bar">
        <span className="story-statusbar__live" aria-hidden="true" />
        <span>שאלות ותשובות</span>
      </div>
      {FAQ_ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q} className="jv-faq__item">
            <button
              type="button"
              className="jv-turn jv-turn--you jv-faq__q"
              aria-expanded={isOpen}
              aria-controls={`jv-faq-${i}`}
              onClick={() => setOpen(isOpen ? null : i)}
            >
              <span className="jv-turn__who">אתם</span>
              <span className="jv-faq__row">
                <span className="jv-turn__text">{item.q}</span>
                <Plus size={17} className={`jv-faq__icon ${isOpen ? 'is-open' : ''}`} aria-hidden="true" />
              </span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={`jv-faq-${i}`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="jv-turn jv-turn--jarvis jv-faq__a">
                    <span className="jv-turn__who">דניאל</span>
                    <p className="jv-turn__text">{item.a}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

export default function JarvisPage() {
  const quietHero = useFieldQuiet();
  const quietChat = useFieldQuiet();
  const heroMark = useRef<HTMLDivElement>(null);
  const sheetMark = useRef<HTMLDivElement>(null);

  // The field builds one mark at a time: the top one, and the ring at the middle of the parts
  // sheet while that sheet is on screen, so the ring "returns" assembled from the noise.
  useEffect(() => {
    const hero = heroMark.current;
    const sheet = sheetMark.current;
    if (!hero) return;
    let current: HTMLElement | null = null;
    const show = (el: HTMLElement | null) => {
      if (current === el) return;
      current = el;
      fieldState.headline = el;
      fieldState.headlineVersion++;
    };
    show(hero);
    const io =
      sheet && typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([e]) => show(e.intersectionRatio >= 0.35 ? sheet : hero), { threshold: [0, 0.35] })
        : null;
    if (io && sheet) io.observe(sheet);
    return () => {
      io?.disconnect();
      if (fieldState.headline === current) {
        fieldState.headline = null;
        fieldState.headlineVersion++;
      }
    };
  }, []);

  return (
    <div id="page-top" className="relative pb-10">
      {/* ── First viewport: the mark, the promise, one request in action ── */}
      <section className="jv-hero" aria-labelledby="jarvis-title">
        <div className="container-wide jv-hero__grid">
          <header ref={quietHero} className="jv-hero__copy">
            <h1 id="jarvis-title" className="jv-title">
              JARVIS: עוזר אישי בעברית <span className="text-brand-400">שבאמת עושה דברים</span>
            </h1>
            <p className="jv-lead" data-live="rise">
              מבקשים ממנו בהודעה או בקול, והוא מסדר: קובע פגישות, עונה למיילים, מזכיר מה פתוח ומעדכן את הרשימות שלכם.
              אתם מחליטים, הוא עושה.
            </p>
            <div className="jv-hero__actions" data-live="rise" data-live-delay="120">
              <GlyphButton onClick={() => openJarvisLead('JARVIS Page · Hero')}>
                <FileText size={16} aria-hidden="true" />
                לקבלת הצעה
              </GlyphButton>
              <a href="#jarvis-does" className="story-link">
                איך זה נראה בפועל
              </a>
            </div>
          </header>
          <div ref={quietChat} className="jv-hero__stage">
            <JarvisMark ref={heroMark} />
            <HeroExchange />
          </div>
        </div>
      </section>

      {/* ── What it does, as three short exchanges ── */}
      <section id="jarvis-does" className="story-beat jv-does" aria-labelledby="jarvis-does-title">
        <div className="container-wide">
          <h2 id="jarvis-does-title" className="story-h2">
            מה הוא עושה, בשלוש בקשות
          </h2>
          <p className="story-body mt-6" data-live="rise">
            צ׳אטבוט רגיל רק עונה לכם. JARVIS הוא <TermTooltip term="AI Agent">סוכן AI</TermTooltip>: הוא מחובר לכלים שלכם, זוכר איך אתם
            עובדים, ועושה את הפעולה עצמה. כשמשהו חשוב, הוא עוצר ושואל אתכם לפני שהוא ממשיך.
          </p>
          <p className="jv-note" data-live="rise" data-live-delay="100">
            הדוגמאות להמחשה. את הבקשות שלכם תכתבו במילים שלכם.
          </p>
          <div className="jv-abilities">
            {ABILITIES.map((a) => (
              <article key={a.title} className="jv-ability">
                <div className="jv-ability__copy">
                  <h3 className="jv-ability__title" data-live="rise">
                    {a.title}
                  </h3>
                  <ul className="jv-ability__points" data-live="stagger">
                    {a.points.map((p) => (
                      <li key={p.lead}>
                        <b>{p.lead}.</b> {p.text}
                      </li>
                    ))}
                  </ul>
                </div>
                <Exchange turns={a.turns} />
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Inside: the ring returns, its four parts labeled around it ── */}
      <section className="story-beat jv-inside" aria-labelledby="jarvis-inside">
        <div className="container-wide">
          <div className="jv-inside__head">
            <h2 id="jarvis-inside" className="story-h2">
              מה יש בפנים, בפשטות
            </h2>
            <p className="story-body mt-6" data-live="rise">
              ארבעה חלקים שעובדים יחד. לא צריך להבין אותם כדי להשתמש, אבל טוב לדעת מה קורה מאחורי הקלעים.
            </p>
          </div>
          <div className="jv-schema">
            <dl className="jv-schema__side jv-schema__side--start" data-live="stagger">
              {PARTS.slice(0, 2).map((p) => (
                <div key={p.term} className="jv-schema__part">
                  <dt className="jv-schema__term">{p.term}</dt>
                  <dd className="jv-schema__text">{p.text}</dd>
                </div>
              ))}
            </dl>
            <div className="jv-schema__core">
              <JarvisMark ref={sheetMark} className="jv-mark--sheet" />
            </div>
            <dl className="jv-schema__side jv-schema__side--end" data-live="stagger">
              {PARTS.slice(2).map((p) => (
                <div key={p.term} className="jv-schema__part">
                  <dt className="jv-schema__term">{p.term}</dt>
                  <dd className="jv-schema__text">{p.text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ── Where it runs: two install sheets ── */}
      <section className="story-beat" aria-labelledby="jarvis-where">
        <div className="container-wide">
          <h2 id="jarvis-where" className="story-h2">
            איפה הוא רץ
          </h2>
          <p className="story-body mt-6" data-live="rise">
            שתי אפשרויות. רוב האנשים מתחילים בענן.
          </p>
          <div className="jv-sheets" data-live="stagger">
            {SHEETS.map((s) => (
              <div key={s.title} className={`glyph-frame jv-sheet ${s.tag ? 'jv-sheet--lead' : ''}`}>
                <div className="jv-sheet__head">
                  <s.icon size={20} aria-hidden="true" />
                  <h3 className="jv-sheet__title">{s.title}</h3>
                </div>
                {s.tag && <p className="jv-sheet__tag">{s.tag}</p>}
                <p className="jv-sheet__text">{s.description}</p>
                <dl className="jv-sheet__rows">
                  {s.rows.map((r) => (
                    <div key={r.label} className="jv-sheet__row">
                      <dt>{r.label}</dt>
                      <dd>{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Price, honestly ── */}
      <section className="container-wide">
        <InfoBox title="כמה זה עולה">
          <p>תלוי במה שאתם צריכים: לכמה כלים הוא מתחבר, כמה דברים הוא עושה, ואם הוא רץ בענן או אצלכם.</p>
          <p>
            לכן <strong className="text-ink-paper">אין כאן מחירון קבוע</strong>. אחרי שיחה קצרה אתם מקבלים הצעה ברורה בכתב, עם מחיר ולוח
            זמנים.
          </p>
        </InfoBox>
      </section>

      {/* ── Questions, asked and answered ── */}
      <section className="story-beat !pt-6 jv-faq-sec" aria-labelledby="jarvis-faq">
        <div className="container-wide">
          <div className="jv-faq-sec__head">
            <h2 id="jarvis-faq" className="story-h2">
              שאלות שאנשים שואלים
            </h2>
            <p className="story-body mt-6" data-live="rise">
              התשובות הקצרות. על כל השאר מדברים בשיחה.
            </p>
          </div>
          <Faq />
        </div>
      </section>

      {/* ── Close ── */}
      <section className="story-beat story-beat--last" aria-labelledby="jarvis-close">
        <div className="container-wide jv-close">
          <SiteBot shape="circle" tone="ink" mood="happy" size={112} className="jv-close__bot" />
          <h2 id="jarvis-close" className="story-h2">
            בואו נבנה לכם JARVIS
          </h2>
          <ul className="jv-gains" data-live="stagger">
            {BENEFITS.map((b) => (
              <li key={b}>
                <Check size={16} aria-hidden="true" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <p className="story-body mt-8" data-live="rise">
            שיחה קצרה: אתם מספרים מה מעמיס עליכם, ואני חוזר עם הצעה ברורה, מחיר ולוח זמנים.
          </p>
          <div className="mt-9" data-live="rise" data-live-delay="120">
            <GlyphButton onClick={() => openJarvisLead('JARVIS Page · Bottom Conversion')}>
              <FileText size={16} aria-hidden="true" />
              לקבלת הצעה
            </GlyphButton>
          </div>
        </div>
      </section>
    </div>
  );
}
