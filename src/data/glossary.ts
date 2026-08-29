/**
 * Plain-Hebrew explanations for the technical terms that show up across the site. Used by
 * <TermTooltip> to render an "מה זה אומר?" info popover next to jargon so a non-technical visitor
 * isn't left guessing. Keys are matched case-insensitively and also by a few aliases.
 */
export interface GlossaryEntry {
  label: string;
  text: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  llm: {
    label: 'LLM — מודל שפה גדול',
    text: 'המנוע שמאחורי כלים כמו ChatGPT. מודל שאומן על כמויות עצומות של טקסט ויודע להבין שאלה, לכתוב תשובה ולנהל שיחה בשפה טבעית.',
  },
  rag: {
    label: 'RAG — אחזור מידע והזנתו למודל',
    text: 'שיטה שבה המערכת קודם שולפת את המסמכים והנתונים הרלוונטיים שלכם, ורק אז נותנת ל-AI לענות — כך התשובות מבוססות על המידע האמיתי של העסק ולא על ניחוש.',
  },
  'agentic ai': {
    label: 'Agentic AI — סוכן AI פעיל',
    text: 'לא רק צ׳אט שמשיב לשאלות, אלא AI שיודע לבצע פעולות בפועל: לשלוח מייל, לעדכן CRM, לתאם פגישה — לרוץ על משימה מקצה לקצה בעצמו.',
  },
  stt: {
    label: 'STT — המרת דיבור לטקסט',
    text: 'הטכנולוגיה שמקשיבה למה שאתם אומרים והופכת אותו לטקסט שהמערכת יכולה לעבד. עם סינון רעשי רקע.',
  },
  tts: {
    label: 'TTS — המרת טקסט לדיבור',
    text: 'ההפך מ-STT: המערכת מקריאה את התשובה בקול אנושי וטבעי, כך שאפשר לנהל שיחה קולית רציפה.',
  },
  'zero-trust': {
    label: 'Zero-Trust — "אפס אמון"',
    text: 'גישת אבטחה שבה שום משתמש, מכשיר או בקשה לא נחשבים מהימנים אוטומטית — כל גישה נבדקת ומאומתת מחדש בכל פעם.',
  },
  'on-premise': {
    label: 'On-Premise — התקנה מקומית',
    text: 'המערכת מותקנת פיזית על השרתים שבבעלות העסק, ולא בענן חיצוני. נותן שליטה ופרטיות מקסימליות ואפשרות לעבוד גם בניתוק מהאינטרנט.',
  },
  'ci/cd': {
    label: 'CI/CD — אינטגרציה ופריסה רציפה',
    text: 'צינור אוטומטי שבודק כל שינוי בקוד ומעלה אותו לאוויר בבטחה, עם אפשרות לחזרה מהירה אחורה אם משהו משתבש.',
  },
  api: {
    label: 'API — ממשק בין תוכנות',
    text: 'ה"שקע" שדרכו שתי מערכות מדברות ביניהן. דרכו JARVIS מתחברת ליומן, למייל, ל-CRM ולכל כלי אחר שאתם כבר משתמשים בו.',
  },
  'full-stack': {
    label: 'Full-Stack — פיתוח מקצה לקצה',
    text: 'טיפול בכל שכבות המוצר על ידי גורם אחד: הצד שהמשתמש רואה, השרת שמאחורי הקלעים, מסד הנתונים והאבטחה.',
  },
};

/** Case-insensitive lookup with a couple of common aliases folded in. */
export function lookupTerm(term: string): GlossaryEntry | undefined {
  const key = term.trim().toLowerCase();
  const aliases: Record<string, string> = {
    'large language models': 'llm',
    'retrieval-augmented generation': 'rag',
    'stt & tts': 'stt',
    'stt/tts': 'stt',
    'agentic': 'agentic ai',
    'ai agent': 'agentic ai',
  };
  return GLOSSARY[key] ?? GLOSSARY[aliases[key] ?? ''];
}
