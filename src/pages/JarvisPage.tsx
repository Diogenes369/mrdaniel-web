import { useEffect, useRef, useState, type Ref } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Cloud, Cpu, FileText, Mic, Plus } from 'lucide-react';
import GlyphButton from '../components/ui/GlyphButton';
import TermTooltip from '../components/TermTooltip';
import SiteBot from '../components/bots/SiteBot';
import MissionConsole from '../components/jarvis/MissionConsole';
import { InfoBox } from '../components/content/ContentPrimitives';
import { fieldState, useFieldQuiet } from '../components/field/fieldState';
import { rtl } from '../lib/rtl';

/**
 * /jarvis, in the glyph world since 2026-10-07: JARVIS shown doing, not described.
 *
 * Rewritten the same day around the owner's brief: JARVIS is fully autonomous on voice commands.
 * One sentence said out loud, and it plans, searches, builds, sends and reports on its own, so
 * the page sells missions, not chores (mail and reminders are what every assistant does). The
 * first viewport is the promise and the J.A.R.V.I.S mark, built out of the field's own glyphs;
 * right under it the demo (MissionConsole) runs three whole missions from a single spoken
 * sentence: local businesses without a website get one built and offered, a trading bot is
 * written, tested and run on a demo account, a booking app goes live with WhatsApp reminders.
 * Further down: more missions to say, the ring returns at the middle of a sheet of its four parts
 * (the field hands its glyphs from the top mark to this one), the limits the owner sets, where it
 * runs, the price stated honestly, the questions, and the close.
 *
 * Every mission is an illustration and says so ("הדגמה"); the businesses, clients and code in it
 * are made up. The four clips that used to sit on this page were other people's videos (owner,
 * 2026-10-07) and were removed with their files. No client, price, return or result figure is
 * invented anywhere here, and the trading example never promises a profit.
 */

const LEAD_SUBJECT = 'JARVIS System Inquiry';

function openJarvisLead(sourceSection: string) {
  window.dispatchEvent(new CustomEvent('open-lead-modal', { detail: { subject: LEAD_SUBJECT, sourceSection } }));
}

/** More things to say to it, beyond the three missions the demo plays. */
const MORE_MISSIONS: { say: string; does: string }[] = [
  {
    say: 'תבדוק מה המתחרים שלי מציעים, ותבנה לי דף נחיתה שמראה במה אני שונה.',
    does: 'עובר על האתרים והמחירים שלהם, כותב, בונה ומעלה את הדף לאוויר.',
  },
  {
    say: 'תמצא לי ספקים, תשווה מחירים ותבקש מכל אחד הצעה.',
    does: 'מחפש, משווה תנאים, שולח בקשות ומסדר לכם את התשובות בטבלה אחת.',
  },
  {
    say: 'תבנה לי חנות אונליין ותעלה אליה את כל המוצרים מהקטלוג.',
    does: 'בונה את החנות, כותב לכל מוצר תיאור ומעלה תמונות ומחירים.',
  },
  {
    say: 'תעקוב כל בוקר אחרי המחירים של המתחרים, ותגיד לי כשמשהו משתנה.',
    does: 'בודק לבד כל יום, ומעדכן אתכם בקול רק כשיש שינוי.',
  },
  {
    say: 'תכין לי תוכן לשבוע הבא ותתזמן אותו ברשתות.',
    does: 'בוחר נושאים, כותב פוסטים, מכין תמונות ומתזמן לפי הימים שקבעתם.',
  },
  {
    say: 'תעבור על ההזמנות של החודש, ותגיד לי מה הכי נמכר ומה כדאי לחדש.',
    does: 'מנתח את הנתונים ועונה לכם בקול, עם טבלה מסודרת.',
  },
];

const PARTS = [
  { term: 'הקול', text: 'שומע עברית מדוברת, גם כשיש רעש ברקע, ועונה לכם בקול טבעי.' },
  {
    term: 'המוח',
    text: 'מפרק כל מטרה לשלבים, ובוחר לכל שלב את מודל ה-AI שעושה אותו הכי טוב, כמו Claude, Gemini, GPT ו-Grok.',
  },
  { term: 'הידיים', text: 'גולש, כותב קוד, בונה אתרים ואפליקציות, שולח הודעות ועובד בתוך החשבונות שלכם.' },
  { term: 'הזיכרון', text: 'זוכר את העסק שלכם, את הסגנון ואת אנשי הקשר, וממשיך משימה מהמקום שבו עצרה.' },
];

const SHEETS = [
  {
    icon: Cloud,
    title: 'בענן: הכי פשוט להתחיל',
    tag: 'רוב האנשים מתחילים כאן',
    description: 'JARVIS רץ על שרת בענן ועובד מסביב לשעון, גם כשהמחשב שלכם כבוי. לא צריך לקנות מחשב מיוחד, והעדכונים מגיעים לבד.',
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
    a: 'ChatGPT עונה לכם, ואת העבודה עושים אתם. JARVIS עושה אותה: אומרים לו מה המטרה, והוא מתכנן, גולש, כותב קוד, בונה ושולח, עד שהמשימה גמורה.',
  },
  {
    q: 'הוא באמת עושה הכל לבד?',
    a: 'כן, זה כל הרעיון: משפט אחד, ומשם הוא ממשיך לבד עד הסוף. מראש אתם קובעים את הגבולות: לאילו חשבונות יש לו גישה, למי מותר לו לשלוח, ועל מה הוא צריך לשאול אתכם קודם.',
  },
  { q: 'הוא מבין עברית ומדבר בקול?', a: 'כן. מדברים איתו בעברית רגילה, והוא עונה בקול. אפשר גם לכתוב לו.' },
  {
    q: 'אפשר לבנות איתו בוט מסחר?',
    a: 'כן. מסבירים לו את האסטרטגיה במילים, והוא כותב את הבוט, בודק אותו על נתוני עבר ומריץ אותו בחשבון שתבחרו. את האסטרטגיה ואת הסכום קובעים אתם, וכדאי להתחיל בחשבון דמו: אף בוט לא מבטיח רווח.',
  },
  {
    q: 'מה קורה עם המידע והחשבונות שלי?',
    a: 'הם נשארים שלכם. JARVIS ניגש רק למה שנתתם לו גישה אליו, ואפשר להריץ אותו על מחשב אצלכם, כך שהמידע לא יוצא החוצה בכלל. בענן, המידע לא משמש לאימון מודלים ציבוריים.',
  },
  {
    q: 'איך מתחילים?',
    a: 'בשיחה קצרה אתם מספרים אילו משימות הייתם רוצים לתת לו. אחר כך אני בונה ומחבר את JARVIS לכלים ולחשבונות שלכם, בודק אותו על משימות אמיתיות, ומראה לכם איך לדבר איתו.',
  },
];

const GAINS = [
  'משימות שלמות, מתוך משפט אחד בקול.',
  'עובד לבד, מסביב לשעון.',
  'בונה בשבילכם אתרים, אפליקציות ובוטים.',
  'אתם קובעים את הגבולות, הוא עושה את העבודה.',
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

/** The questions, asked and answered as a conversation. Each question is a disclosure button; its
 *  answer is Daniel's turn. */
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
                <span className="jv-turn__text">{rtl(item.q)}</span>
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
                    <p className="jv-turn__text">{rtl(item.a)}</p>
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
  const quietMissions = useFieldQuiet();
  const quietNote = useFieldQuiet();
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
      {/* ── First viewport: the promise and the mark; the demo right under them ── */}
      <section className="jv-hero" aria-labelledby="jarvis-title">
        <div className="container-wide">
          <div className="jv-hero__grid">
            <header ref={quietHero} className="jv-hero__copy">
              <h1 id="jarvis-title" className="jv-title">
                {/* The no-break space keeps the dash on the line it closes, so the last line opens
                    on the reveal, not on a dash. */}
                {rtl('העתיד המטורף של AI כבר כאן')}{'\u00A0'}— <span className="text-brand-400">{rtl('וזה JARVIS')}</span>
              </h1>
              <p className="jv-lead" data-live="rise">
                אומרים לו משפט אחד, בקול. מכאן הוא ממשיך לבד: מתכנן, מחפש, בונה, שולח, ומדווח לכם כשהמשימה גמורה.
              </p>
              <div className="jv-hero__actions" data-live="rise" data-live-delay="120">
                <GlyphButton onClick={() => openJarvisLead('JARVIS Page · Hero')}>
                  <FileText size={16} aria-hidden="true" />
                  לקבלת הצעה
                </GlyphButton>
                <a href="#jarvis-missions" className="story-link">
                  מה עוד אפשר לתת לו
                </a>
              </div>
            </header>
            <div className="jv-hero__stage">
              <JarvisMark ref={heroMark} />
            </div>
          </div>

          <div id="jarvis-demo" className="jv-demo">
            <MissionConsole />
            <p ref={quietNote} className="jv-note">ההדגמות להמחשה: העסקים, הלקוחות והקוד בהן לא אמיתיים. את JARVIS שלכם בונים סביב המשימות והחשבונות שלכם.</p>
          </div>
        </div>
      </section>

      {/* ── More missions to say ── */}
      <section id="jarvis-missions" className="story-beat" aria-labelledby="jarvis-missions-title">
        <div className="container-wide">
          <div ref={quietMissions} className="jv-missions__head">
            <h2 id="jarvis-missions-title" className="story-h2">
              משפט אחד. <span className="text-brand-400">משימה שלמה.</span>
            </h2>
            <p className="story-body mt-6" data-live="rise">
              צ׳אטבוט עונה לכם, ואת העבודה עושים אתם. JARVIS הוא <TermTooltip term="AI Agent">סוכן AI</TermTooltip> אוטונומי: אומרים
              לו מה רוצים להשיג, והוא מפרק את זה לשלבים, עובד בכלים האמיתיים ומביא את המשימה עד הסוף. עוד כמה דברים שאפשר להגיד לו:
            </p>
          </div>
          <ul className="jv-missions" data-live="stagger">
            {MORE_MISSIONS.map((m) => (
              <li key={m.say} className="jv-mission">
                <p className="jv-mission__say">
                  <Mic size={15} aria-hidden="true" />
                  <span>{rtl(m.say)}</span>
                </p>
                <p className="jv-mission__does">
                  <span className="jv-mission__who" dir="ltr">
                    JARVIS
                  </span>
                  <span>{rtl(m.does)}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Inside: the ring returns, its four parts labeled around it ── */}
      <section className="story-beat jv-inside" aria-labelledby="jarvis-inside">
        <div className="container-wide">
          <div className="jv-inside__head">
            <h2 id="jarvis-inside" className="story-h2">
              ככה הוא עובד לבד
            </h2>
            <p className="story-body mt-6" data-live="rise">
              ארבעה חלקים שעובדים יחד, מהרגע שאמרתם משפט ועד שהמשימה גמורה.
            </p>
          </div>
          <div className="jv-schema">
            <dl className="jv-schema__side jv-schema__side--start" data-live="stagger">
              {PARTS.slice(0, 2).map((p) => (
                <div key={p.term} className="jv-schema__part">
                  <dt className="jv-schema__term">{p.term}</dt>
                  <dd className="jv-schema__text">{rtl(p.text)}</dd>
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
                  <dd className="jv-schema__text">{rtl(p.text)}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="jv-limits" data-live="rise">
            אוטונומיה מלאה, בגבולות שאתם קובעים: לאילו חשבונות יש לו גישה, למי מותר לו לשלוח, ועל מה הוא צריך לשאול אתכם קודם.
          </p>
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
                <p className="jv-sheet__text">{rtl(s.description)}</p>
                <dl className="jv-sheet__rows">
                  {s.rows.map((r) => (
                    <div key={r.label} className="jv-sheet__row">
                      <dt>{r.label}</dt>
                      {/* Plain on purpose: rtl() isolates the digits of "32GB" or "1TB" apart from the
                          unit, and the pair then reads backwards; the browser keeps them as one run. */}
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
          <p>תלוי במה שאתם צריכים: כמה משימות הוא מבצע, לאילו כלים וחשבונות הוא מתחבר, ואם הוא רץ בענן או אצלכם.</p>
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
            {GAINS.map((b) => (
              <li key={b}>
                <Check size={16} aria-hidden="true" />
                <span>{rtl(b)}</span>
              </li>
            ))}
          </ul>
          <p className="story-body mt-8" data-live="rise">
            שיחה קצרה: אתם מספרים מה הייתם רוצים שהוא יעשה, ואני חוזר עם הצעה ברורה, מחיר ולוח זמנים.
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
