import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { backdropMotion, panelMotion } from '../lib/modalMotion';
import {
  Terminal,
  X,
  Send,
  CalendarClock,
  Asterisk,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import TypingIndicator from './TypingIndicator';
import { sendLeadWebhook } from '../lib/leadWebhook';
import { isValidPhone } from '../lib/phone';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

// Firebase (~200KB gzipped) is dynamically imported, not statically — same reasoning as App.tsx's
// own `loadTracker`, kept out of this widget's bundle until a visitor actually opens the chat.
import { loadTracker } from '../lib/loadTracker';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const QUICK_PROMPTS: { label: string; text: string; response?: string }[] = [
  {
    label: 'איזה מודל שפה לבחור',
    text: 'איך אני בוחר בין Grok, Claude, Gemini ו-GPT למשימה שלי?',
    response:
      'אין מודל אחד שמנצח בכל משימה. ככה אני בוחר:\n\n' +
      '• **מתחילים מהמשימה:** כתיבה בעברית, קוד, ניתוח מסמכים ארוכים או תשובות מהירות — כל אחת מעדיפה מודל אחר.\n' +
      '• **בודקים על דוגמאות אמיתיות שלכם:** 10–20 מקרים אמיתיים מלמדים יותר מכל בנצ׳מרק.\n' +
      '• **מודדים שלושה צירים:** איכות, מהירות ועלות לטוקן. לפעמים מודל קטן וזול מספיק לגמרי.\n' +
      '• **ניתוב:** מערכת טובה שולחת כל סוג משימה למודל שמתאים לו, במקום מודל אחד לכל דבר.\n\n' +
      '**הצעד הבא:** ספרו לי מה המשימה, ואגיד לכם מאיפה הייתי מתחיל.',
  },
  {
    label: 'בניית סוכן AI ו-RAG',
    text: 'היי, מעניין אותי לבנות סוכן AI אוטונומי עם RAG. מה התהליך?',
    response:
      'מעולה, זה בדיוק התחום המרכזי שלי. כך נראה תהליך בניית סוכן AI אוטונומי:\n\n' +
      '• **אפיון:** משימה אחת צרה ומדידה, ומה נחשב הצלחה.\n' +
      '• **ארכיטקטורה:** מודל שפה, כלים דרך MCP, RAG על המסמכים שלכם, ואישור אנושי לפני כל פעולה בלתי הפיכה.\n' +
      '• **תוצרים:** סוכן שרץ בפועל, לוג של כל צעד, ותיעוד שמאפשר להבין למה הוא עשה מה שעשה.\n' +
      '• **ערך:** פחות עבודה חוזרת, תשובות מהירות יותר, וזמינות גם כשאתם לא ליד המחשב.\n\n' +
      '**הצעד הבא:** ספרו לי בקצרה על המשימה שאתם רוצים להפוך לאוטומטית, ונקבע שיחת אפיון ראשונית.',
  },
  {
    label: 'מדריך ה-AI וחוברות לימוד',
    text: 'ספר לי על מדריך ה-AI (מהדורת 2026) שדניאל פירסם.',
    response:
      'בשמחה! מדריך ה-AI (מהדורת 2026) הוא חוברת עבודה מקיפה בת 31 פרקים ו-3 נספחים, כתובה כולה בעברית וממוקדת ביישום מעשי:\n\n' +
      '• **תוכן:** יסודות ה-LLM, הנדסת פרומפטים מתקדמת, בניית סוכני AI (Agentic AI) ו-RAG.\n' +
      '• **פורמט:** קובץ PDF להורדה מיידית, ללא מנוי חודשי, עלות חד-פעמית בלבד.\n' +
      '• **קהל יעד:** מי שרוצה להבין וליישם AI בפועל, לא רק תיאוריה.\n\n' +
      '**הצעד הבא:** ניתן לרכוש ולהוריד מיידית דרך מדור "מגזינים וחוברות עבודה" באתר.',
  },
  { label: 'תיאום שיחת אפיון', text: 'אני מעוניין לתאם שיחת היכרות עם דניאל לגבי סוכן AI.' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Renders `**bold**` spans as real `<strong>` elements — the canned responses use markdown-style
 * bold for highlights, and this is the minimal parser needed for that (no other markdown syntax
 * is supported or expected). Line breaks are still handled by the message bubble's own
 * `whitespace-pre-line`. */
function renderMessageContent(content: string) {
  const parts = content.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-bold text-white">{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function AIAssistantWidget() {
  const [isOpen, setIsOpen] = useState(false);
  // Hide-on-scroll-down for the floating launcher (see the launcher markup below).
  const [tucked, setTucked] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - last;
      if (Math.abs(dy) < 6) return;
      setTucked(dy > 0 && y > 140);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content: 'שלום. אני הסוכן הדיגיטלי של דניאל. במה אוכל לעזור בנושאי חדשות AI, מודלי שפה וסוכני AI?',
      timestamp: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [leadFormVisible, setLeadFormVisible] = useState(false);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [leadData, setLeadData] = useState({
    name: '',
    email: '',
    phone: '',
    project: ''
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [messages, isOpen, isLoading]);

  useEffect(() => {
    const handleOpenAi = () => setIsOpen(true);
    window.addEventListener('open-ai-chat', handleOpenAi);
    return () => window.removeEventListener('open-ai-chat', handleOpenAi);
  }, []);

  useEffect(() => {
    if (isOpen) loadTracker().then((t) => t.trackChatOpen());
  }, [isOpen]);

  // Lock background scroll while the drawer is open — same reasoning as LeadForm's modal: a touch
  // starting on the backdrop, or a fast swipe past the message list's scroll bounds, could
  // otherwise scroll the page behind this fixed drawer.
  // Shared, reference-counted — see useBodyScrollLock for why a local
  // save/restore of body.style.overflow permanently locked the page when overlays
  // overlapped.
  useBodyScrollLock(isOpen);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isLoading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputMessage('');
    setIsLoading(true);
    loadTracker().then((t) => t.trackChatQuery(text));

    // Quick-prompt chips get a pre-written, comprehensive answer instead of a live API round-trip
    // — guarantees a consistently high-value, well-formatted response for these known questions
    // regardless of backend availability. This only inserts the message into the chat stream; the
    // booking/lead-capture drawer must stay closed unless the user explicitly clicks "תיאום שיחה".
    const cannedResponse = QUICK_PROMPTS.find((p) => p.text === text)?.response;
    if (cannedResponse) {
      window.setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: cannedResponse,
            timestamp: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        setIsLoading(false);
      }, 750);
      return;
    }

    try {
      // Check if message looks like user wants contact or booking
      const lower = text.toLowerCase();
      if (
        lower.includes('טלפון') ||
        lower.includes('מחיר') ||
        lower.includes('עלות') ||
        lower.includes('תיאום') ||
        lower.includes('פגישה') ||
        lower.includes('שיחה') ||
        lower.includes('הצעת מחיר') ||
        lower.includes('ליצור קשר')
      ) {
        setLeadFormVisible(true);
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newHistory.map(m => ({ role: m.role, content: m.content }))
        })
      });

      const data = await response.json();
      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.reply || 'תודה על פנייתך. אשמח לסייע בהמשך.',
        timestamp: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'מצטער, חלה שגיאת תקשורת רגעית. אפשר גם למלא את טופס יצירת הקשר באתר או לפנות ישירות במייל daniel@mrdaniel.co.il.',
          timestamp: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadData.name || !EMAIL_RE.test(leadData.email) || !isValidPhone(leadData.phone)) return;

    const notes = messages.map(m => `[${m.role}] ${m.content}`).join('\n');
    sendLeadWebhook({
      name: leadData.name,
      email: leadData.email,
      phone: leadData.phone,
      message: `${leadData.project}\n${notes}`,
      sourceSection: 'AI Assistant Chat',
      inquiryTopic: leadData.project || 'שיחה עם עוזר ה-AI',
    });

    // `/api/leads` both emails the lead and records it for the dashboard.
    try {
      await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...leadData,
          notes,
          sourceSection: 'AI Assistant Chat',
        })
      });

      setLeadSubmitted(true);
      
      const confirmMsg: Message = {
        id: `lead-confirm-${Date.now()}`,
        role: 'assistant',
        content: `תודה רבה ${leadData.name}! הפרטים שלך נקלטו בהצלחה במערכת.\n\nדניאל יבחן את הפרטים ויחזור אליך בהקדם למייל שהשארת.\nבינתיים, ניתן לעיין בחוברות ובתכנים הטכנולוגיים באתר!`,
        timestamp: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, confirmMsg]);
      setTimeout(() => setLeadFormVisible(false), 3000);
    } catch (err) {
      console.error('Lead submit error:', err);
    }
  };

  return (
    <>
      {/* Floating launcher — square since 2026-10-01 (the redesign bans round buttons). It tucks out
          of the way while the visitor scrolls DOWN (reading), so it never sits on the text being
          read, and springs back on any scroll up, near the top, or when it takes keyboard focus. */}
      <motion.div
        className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-[calc(1.5rem+env(safe-area-inset-left))] z-40 flex items-center gap-3"
        animate={tucked && !isOpen ? { x: -96, opacity: 0 } : { x: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        style={{ pointerEvents: tucked && !isOpen ? 'none' : undefined }}
        onFocusCapture={() => setTucked(false)}
      >
        <motion.button
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(!isOpen)}
          className="relative w-11 h-11 md:w-12 md:h-12 rounded-none bg-[#0D0E12] border border-brand-400/35 hover:border-brand-400/70 flex items-center justify-center cursor-pointer transition-colors duration-300"
          aria-label="פתח עוזר AI דיגיטלי"
        >
          {isOpen ? (
            <X className="w-5 h-5 text-brand-400" strokeWidth={2} />
          ) : (
            <>
              <Terminal className="w-5 h-5 text-brand-400" strokeWidth={1.75} />
              {/* A static "available" mark; the pinging pulse was removed with the redesign. */}
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-brand-400" />
            </>
          )}
        </motion.button>
      </motion.div>

      {/* Interactive AI Chat Drawer / Modal */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            {...panelMotion}
            className="modal-panel fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-3 md:left-6 right-3 md:right-auto z-50 md:w-[460px] max-h-[78dvh] h-[640px] flex flex-col overflow-hidden text-right"
            dir="rtl"
          >
            {/* Widget Top Header — subtle, sleek, no vibrant blocks */}
            <div className="p-4 md:p-5 bg-ground border-b border-dotted border-[var(--color-rule)] flex items-center justify-between relative">
              <div className="flex items-center gap-2.5">
                <span className="story-statusbar__live shrink-0" aria-hidden="true" />
                <div>
                  <h3 className="modal-title text-lg">
                    העוזר של דניאל
                  </h3>
                  <p className="font-sans text-ink-faint text-xs mt-0.5">
                    חדשות AI, מודלים, סוכנים וחוברות
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setLeadFormVisible(!leadFormVisible)}
                  className={`p-2 rounded-xl border transition-all text-xs flex items-center gap-1 ${
                    leadFormVisible
                      ? 'bg-brand-500 text-black border-brand-400'
                      : 'bg-white/5 hover:bg-white/10 text-zinc-300 border-white/10'
                  }`}
                  title="השארת פרטים לתיאום"
                >
                  <CalendarClock size={14} />
                  <span className="hidden sm:inline">תיאום שיחה</span>
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Optional Lead Capture Drawer inside Chat */}
            <AnimatePresence>
              {leadFormVisible && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-brand-600/30 border-b border-brand-500/30 p-4 overflow-hidden"
                >
                  {leadSubmitted ? (
                    <div className="flex items-center gap-2 text-brand-400 text-sm font-medium py-1">
                      <CheckCircle2 size={18} />
                      <span>הפרטים נשלחו בהצלחה! דניאל ייצור עמך קשר בקרוב.</span>
                    </div>
                  ) : (
                    <form onSubmit={handleLeadSubmit} className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-brand-300 flex items-center gap-1.5">
                          <Asterisk size={14} /> השארת פרטים לשיחת ייעוץ / הצעת מחיר
                        </span>
                        <button 
                          type="button" 
                          onClick={() => setLeadFormVisible(false)}
                          className="text-xs text-zinc-400 hover:text-white"
                        >
                          סגור
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          required
                          placeholder="שם מלא *"
                          value={leadData.name}
                          onChange={e => setLeadData({ ...leadData, name: e.target.value })}
                          className="w-full bg-black/60 border border-brand-500/30 rounded-lg px-3 py-2 text-base text-white placeholder-zinc-500 focus:outline-none focus:border-brand-400"
                        />
                        <input
                          type="email"
                          required
                          placeholder="אימייל *"
                          value={leadData.email}
                          onChange={e => setLeadData({ ...leadData, email: e.target.value })}
                          dir="ltr"
                          className="w-full bg-black/60 border border-brand-500/30 rounded-lg px-3 py-2 text-base text-white placeholder-zinc-500 focus:outline-none focus:border-brand-400 text-left"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="tel"
                          required
                          placeholder="טלפון נייד *"
                          value={leadData.phone}
                          onChange={e => setLeadData({ ...leadData, phone: e.target.value })}
                          dir="ltr"
                          className="w-full bg-black/60 border border-brand-500/30 rounded-lg px-3 py-2 text-base text-white placeholder-zinc-500 focus:outline-none focus:border-brand-400 text-left"
                        />
                        <input
                          type="text"
                          placeholder="ארגון / פרויקט"
                          value={leadData.project}
                          onChange={e => setLeadData({ ...leadData, project: e.target.value })}
                          className="w-full bg-black/60 border border-brand-500/30 rounded-lg px-3 py-2 text-base text-white placeholder-zinc-500 focus:outline-none focus:border-brand-400"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={!leadData.name || !EMAIL_RE.test(leadData.email) || !isValidPhone(leadData.phone)}
                        className="w-full py-2 bg-brand-400 hover:bg-brand-300 text-black font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <CheckCircle2 size={14} /> שליחת פרטים ישירות לדניאל
                      </button>
                    </form>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Chat Conversation Scroll Area */}
            <div className="flex-1 p-4 md:p-5 overflow-y-auto momentum-scroll space-y-4 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
              {messages.map((m) => {
                const isUser = m.role === 'user';
                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[86%] rounded-2xl p-3.5 md:p-4 text-sm leading-relaxed whitespace-pre-line ${
                        isUser
                          ? 'bg-brand-500 text-ground font-medium'
                          : 'border border-dotted border-[var(--color-rule)] bg-ground text-ink-paper'
                      }`}
                    >
                      {renderMessageContent(m.content)}
                    </div>
                    <span className="text-xs text-zinc-400 mt-1 px-1 font-mono">
                      {m.timestamp}
                    </span>
                  </motion.div>
                );
              })}

              {isLoading && <TypingIndicator />}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Suggestion Chips */}
            <div className="px-4 py-2 border-t border-white/5 bg-black/40 flex items-center gap-2 overflow-x-auto no-scrollbar">
              {QUICK_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(prompt.text)}
                  className="whitespace-nowrap bg-white/5 border border-white/10 hover:border-emerald-500/30 text-zinc-300 text-xs py-1.5 px-3 rounded-full transition-all shrink-0 cursor-pointer"
                >
                  {prompt.label}
                </button>
              ))}
            </div>

            {/* Input Form Bar */}
            <div className="p-3 md:p-4 bg-zinc-950 border-t border-white/10">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="relative"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="שאלו כל דבר על AI, מודלים או סוכנים..."
                  className="w-full bg-black/40 border border-white/10 focus:border-emerald-500/50 rounded-xl pr-4 pl-14 py-3 text-base text-white placeholder-zinc-500 focus:outline-none transition-all font-sans"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={!inputMessage.trim() || isLoading}
                  className="absolute left-0.5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-lg flex items-center justify-center text-zinc-500 hover:text-brand-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  aria-label="שלח הודעה"
                >
                  <Send size={16} className="rotate-180" />
                </button>
              </form>
              <div className="flex items-center justify-end mt-2 px-1 text-xs text-zinc-400">
                <button
                  onClick={() => {
                    setMessages([
                      {
                        id: 'welcome-reset',
                        role: 'assistant',
                        content: 'השיחה אותחלה. כיצד אוכל לעזור בנושאי חדשות AI, מודלי שפה או סוכני AI?',
                        timestamp: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
                      }
                    ]);
                  }}
                  className="hover:text-zinc-300 flex items-center gap-1"
                >
                  <RefreshCw size={10} /> איפוס שיחה
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
