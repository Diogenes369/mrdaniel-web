/**
 * The missions JARVIS runs in the /jarvis demo (MissionConsole). Each is one sentence said out loud
 * and everything JARVIS does with it on its own: the plan it makes, each step with the tool it
 * works in and what that step produces on screen (an "artifact"), and what it says back when the
 * mission is done.
 *
 * Every mission is an illustration (the console says "הדגמה"): the businesses, clients, code and
 * prices are made up for the demo and none of them is a claim about a real result. The counts the
 * report says out loud ("ארבעה עסקים") are the demo's own items, the ones the artifacts show.
 * No profit, return or performance figure appears anywhere, and the trading bot runs on a demo
 * account.
 */

export type ArtifactKind = 'map' | 'sites' | 'messages' | 'code' | 'backtest' | 'live' | 'phone';

export interface MissionStep {
  /** What JARVIS is doing, as it would say it. */
  label: string;
  /** The tool it is working in, a word or two. */
  tool: string;
  artifact: ArtifactKind;
  /** How long the step runs in the demo. Each artifact paces its own animation to fit. */
  ms: number;
}

export interface Mission {
  id: 'sites' | 'trading' | 'app';
  tab: string;
  /** What the person says. */
  command: string;
  steps: MissionStep[];
  /** What JARVIS says back. */
  report: string;
}

export const MISSIONS: Mission[] = [
  {
    id: 'sites',
    tab: 'עסקים בלי אתר',
    command: 'JARVIS, תמצא מסעדות וחנויות באזור שלי שאין להן אתר. תבנה לכל אחת אתר, ותשלח להן הצעה בשמי.',
    steps: [
      { label: 'סורק את העסקים באזור', tool: 'מפות', artifact: 'map', ms: 3600 },
      { label: 'בונה לכל עסק אתר משלו', tool: 'קוד', artifact: 'sites', ms: 4800 },
      { label: 'שולח לכל אחד הצעה בשמכם', tool: 'וואטסאפ', artifact: 'messages', ms: 4600 },
    ],
    report: 'סיימתי. מצאתי ארבעה עסקים בלי אתר, בניתי לכל אחד אתר ושלחתי הצעה. כשמישהו עונה, אני מעדכן אתכם.',
  },
  {
    id: 'trading',
    tab: 'בוט מסחר',
    command: 'JARVIS, תבנה לי בוט מסחר שקונה כשהמחיר עולה מעל הממוצע ומוכר כשהוא יורד מתחתיו. תבדוק אותו על נתוני עבר ותריץ על חשבון דמו.',
    steps: [
      { label: 'כותב את הקוד של הבוט', tool: 'קוד', artifact: 'code', ms: 3800 },
      { label: 'בודק אותו על נתוני עבר', tool: 'נתונים', artifact: 'backtest', ms: 3800 },
      { label: 'מריץ אותו על חשבון הדמו', tool: 'חשבון', artifact: 'live', ms: 3000 },
    ],
    report: 'הבוט רץ על חשבון הדמו. כל עסקה נרשמת, ובסוף כל יום אני שולח לכם סיכום.',
  },
  {
    id: 'app',
    tab: 'אפליקציה',
    command: 'JARVIS, תבנה לי אפליקציה לקביעת תורים למספרה, עם תזכורת בוואטסאפ יום לפני, ותעלה אותה לאוויר.',
    steps: [
      { label: 'כותב את האפליקציה', tool: 'קוד', artifact: 'code', ms: 3600 },
      { label: 'מעלה אותה לאוויר', tool: 'שרת', artifact: 'phone', ms: 3600 },
      { label: 'מחבר תזכורות בוואטסאפ', tool: 'וואטסאפ', artifact: 'messages', ms: 4200 },
    ],
    report: 'האפליקציה באוויר. לקוחות קובעים בה תור, והתזכורת בוואטסאפ יוצאת לבד יום לפני.',
  },
];

// ── What the artifacts show, per mission ─────────────────────────────────────────────────────

/** Businesses on the map. x/y are fractions of the map; `site` = it already has a website. */
export const MAP_PLACES = [
  { name: 'פיצרייה', x: 0.74, y: 0.27, site: false },
  { name: 'בית קפה', x: 0.4, y: 0.2, site: true },
  { name: 'מספרה', x: 0.6, y: 0.62, site: false },
  { name: 'חנות פרחים', x: 0.24, y: 0.5, site: false },
  { name: 'מכולת', x: 0.86, y: 0.7, site: true },
  { name: 'סטודיו ליוגה', x: 0.42, y: 0.84, site: false },
];

/** The sites JARVIS builds, one per business without one. `path` is shown in the address bar
 *  instead of a domain, so no real address is implied. */
export const SITES = [
  { name: 'פיצרייה', path: '/pizzeria', tagline: 'בצק טרי כל בוקר, עד הבית', action: 'להזמנה', items: ['מרגריטה', 'פטריות', 'זיתים'], seed: 3 },
  { name: 'מספרה', path: '/barber', tagline: 'תספורת בלי לחכות בתור', action: 'לקביעת תור', items: ['תספורת', 'זקן', 'צבע'], seed: 7 },
  { name: 'חנות פרחים', path: '/flowers', tagline: 'זרים טריים לכל אירוע', action: 'להזמנת זר', items: ['זרים', 'עציצים', 'אירועים'], seed: 11 },
  { name: 'סטודיו ליוגה', path: '/yoga', tagline: 'שיעורים לכל רמה, כל יום', action: 'לשיעור ראשון', items: ['בוקר', 'ערב', 'פרטי'], seed: 5 },
];

export interface OutMessage {
  to: string;
  text: string;
}

export const MESSAGES: Record<'sites' | 'app', { title: string; items: OutMessage[] }> = {
  sites: {
    title: 'הצעות שיוצאות בשמכם',
    items: [
      { to: 'פיצרייה', text: 'היי, ראיתי שלפיצרייה שלכם עוד אין אתר, אז בניתי לכם אחד. אם הוא מתאים לכם, הוא שלכם.' },
      { to: 'מספרה', text: 'היי, ראיתי שלמספרה שלכם עוד אין אתר, אז בניתי לכם אחד. אם הוא מתאים לכם, הוא שלכם.' },
      { to: 'חנות פרחים', text: 'היי, ראיתי שלחנות הפרחים שלכם עוד אין אתר, אז בניתי לכם אחד. אם הוא מתאים לכם, הוא שלכם.' },
      { to: 'סטודיו ליוגה', text: 'היי, ראיתי שלסטודיו שלכם עוד אין אתר, אז בניתי לכם אחד. אם הוא מתאים לכם, הוא שלכם.' },
    ],
  },
  app: {
    title: 'תזכורות למחר',
    items: [
      { to: 'דנה', text: 'היי דנה, תזכורת: מחר ב-09:30 יש לך תור במספרה.' },
      { to: 'אבי', text: 'היי אבי, תזכורת: מחר ב-10:00 יש לך תור במספרה.' },
      { to: 'נועה', text: 'היי נועה, תזכורת: מחר ב-11:30 יש לך תור במספרה.' },
      { to: 'יוסי', text: 'היי יוסי, תזכורת: מחר ב-12:00 יש לך תור במספרה.' },
    ],
  },
};

/** Code the two building missions type out. Latin, set left to right. */
export const CODE: Record<'trading' | 'app', { file: string; lines: string[] }> = {
  trading: {
    file: 'bot.py',
    lines: [
      'avg = prices.rolling(50).mean()',
      '',
      'def on_price(price):',
      '    if price > avg[-1] and not holding():',
      '        buy()',
      '    elif price < avg[-1] and holding():',
      '        sell()',
      '',
      'run(on_price, account="demo")',
    ],
  },
  app: {
    file: 'booking.ts',
    lines: [
      'export async function book(slot: Slot, client: Client) {',
      '  await calendar.reserve(slot)',
      '  await whatsapp.schedule(client.phone, reminder(slot), {',
      '    at: slot.start.minus({ days: 1 }),',
      '  })',
      '  return confirm(slot)',
      '}',
    ],
  },
};

/** The booking app's screen. Times are the app's own slots. */
export const BOOKING = {
  title: 'קביעת תור',
  place: 'המספרה',
  services: ['תספורת', 'זקן', 'צבע'],
  days: ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳'],
  day: 2,
  slots: ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'],
  taken: ['09:00', '10:30'],
  chosen: '10:00',
  action: 'קביעת תור',
  confirm: 'התור נקבע: יום ג׳, 10:00',
  path: '/booking',
};
