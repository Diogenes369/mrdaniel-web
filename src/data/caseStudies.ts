import { Network, HardDrive, Bot, type LucideIcon } from 'lucide-react';

/**
 * "Real-World Engineering" case studies. Anonymised — these describe the engineering work and its
 * measurable outcome, not named clients, and carry no testimonial/quote content. Each follows the
 * same Challenge -> Technical Solution -> Impact structure.
 */
export interface CaseStudy {
  id: string;
  icon: LucideIcon;
  tag: string;
  title: string;
  challenge: string;
  solution: string;
  impact: string;
  metrics: { label: string; value: string }[];
}

export const CASE_STUDIES: CaseStudy[] = [
  {
    id: 'network-instability',
    icon: Network,
    tag: 'Network Forensics & Resiliency',
    title: 'ייצוב רשת רב-אתרית עם קריסות ובידוד תנועה חוזרים',
    challenge:
      'ארגון עם מספר אתרים סבל מנתקים אקראיים, השהיות קיצוניות ובידוד מקטעי רשת שלמים מספר פעמים ביום. צוות ה-IT הפנימי לא הצליח לאתר מקור — ההנחה הראשונית הייתה תקלת ספק.',
    solution:
      'ביצוע Deep Packet Inspection ו-ARP Inspection על מקטעי הליבה חשף הצפות ARP והתנגשויות כתובות שנבעו ממנגנון הגנה שהוגדר בצורה אגרסיבית וממכשיר סורר ברשת. הוגדר בידוד ממוקד, נכתבו חוקי סינון ב-FortiGate, בוצע bypass מבוקר של מצב-ההגנה על המקטעים הקריטיים תוך שמירה על אכיפה בשאר הרשת, וחולקה הרשת מחדש ל-VLANs עם מדיניות תנועה רוחבית מוקשחת.',
    impact:
      'הרשת יוצבה במלואה תוך ימים ספורים. זמני ההשבתה הבלתי-מתוכננים ירדו לאפס, וצוות ה-IT קיבל תיעוד ארכיטקטורה ונהלי ניטור שמונעים הישנות.',
    metrics: [
      { label: 'זמן השבתה חודשי', value: '→ 0' },
      { label: 'זמן לאבחון שורש', value: '< 72 ש\'' },
    ],
  },
  {
    id: 'storage-automation',
    icon: HardDrive,
    tag: 'Storage & PowerShell Automation',
    title: 'איחוד אחסון רב-אתרי והנגשת גישה מרחוק',
    challenge:
      'מידע תפעולי פוזר בין תחנות, כונני רשת ישנים ושרתי קבצים לא מנוהלים בכמה מיקומים. גישה מרחוק הייתה ידנית ולא עקבית, הגיבויים חלקיים, וכל מיגרציה קודמת דרשה השבתה ארוכה.',
    solution:
      'תוכננה טופולוגיית NAS מרכזית עם רפליקציה בין אתרים. נכתבו סקריפטי PowerShell מותאמים למיפוי הרשאות NTFS קיימות, העתקה מדורגת עם אימות שלמות (checksums), חיתוך משתמשים לפי מבנה ה-Active Directory, ותזמון גיבויים. הגישה מרחוק אוחדה תחת חיבור מאובטח עם אימות מול Entra ID.',
    impact:
      'המיגרציה בוצעה בחלונות תחזוקה קצרים ללא אובדן נתונים. זמן הגישה לקבצים מרחוק קוצר משמעותית, והגיבוי הפך אוטומטי ומנוטר מקצה לקצה.',
    metrics: [
      { label: 'זמן מיגרציה מול תכנון קודם', value: '−80%' },
      { label: 'כיסוי גיבוי', value: '100%' },
    ],
  },
  {
    id: 'agent-workflow',
    icon: Bot,
    tag: 'Autonomous AI Agents & Integration',
    title: 'ייעול תהליך תפעולי עם סוכן AI אוטונומי',
    challenge:
      'תהליך ליבה עסקי דרש איסוף ידני של נתונים ממספר מערכות, הצלבה ידנית והקלדה חוזרת ל-CRM. התהליך גזל שעות ביום, היה מועד לשגיאות אנוש ותלוי באדם אחד.',
    solution:
      'נבנה סוכן AI אוטונומי המחובר למערכות דרך MCP ו-APIs: הוא שולף את הנתונים, מריץ לוגיקת החלטה מבוססת LLM עם שליפה מבוססת-מקור (RAG) על הידע הארגוני, מעדכן את ה-CRM, ומריץ follow-up יזום. שכבת Guardian מאשרת או חוסמת כל פעולה רגישה לפני ביצוע.',
    impact:
      'התהליך רץ מקצה לקצה ללא התערבות שוטפת. זמן הטיפול ירד משעות לדקות, שגיאות ההקלדה נעלמו, והידע התפעולי הפסיק להיות תלוי באדם בודד.',
    metrics: [
      { label: 'זמן טיפול בתהליך', value: 'שעות → דקות' },
      { label: 'שגיאות הקלדה', value: '→ 0' },
    ],
  },
];
