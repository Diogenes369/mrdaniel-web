import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { ArrowUpLeft, Maximize2, RotateCcw, Send, X } from 'lucide-react';
import SiteBot, { type BotMood } from '../bots/SiteBot';
import { rtl } from '../../lib/rtl';
import { FIELD_ORDER } from '../../lib/intakeFields';
import { resetChat, sendChat, useIntakeChat, type ChatMsg } from '../../lib/intakeChat';

/**
 * The chat agent's window (2026-10-07), the same conversation in two hosts: the /chat page and the
 * floating drawer (AIAssistantWidget). The state lives in lib/intakeChat.ts; this is only the
 * window: who is talking, the thread, one-tap answers to the question just asked, and the composer.
 *
 * In the glyph world: a dotted frame, a mono status bar with the crew's round bot as the agent's
 * face (it looks focused while it types and happy once Daniel has the conversation), sharp message
 * blocks. The agent speaks from the start edge of the line (right, in Hebrew), the visitor from the
 * other, the way every RTL messenger lays a thread out.
 */

const TIME = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' });
const EMAIL = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/;

/**
 * Hebrew with an address in it. rtl() isolates each Latin run on its own, and an address is two
 * runs around an "@", so in a right-to-left line it came out as "example.com@noam.yoga". The
 * address is cut out first and kept whole in one left-to-right isolate; the rest goes through rtl().
 */
export function HebrewWithEmail({ text }: { text: string }) {
  return (
    <>
      {text.split(EMAIL).map((part, i) =>
        i % 2 ? (
          <bdi key={i} dir="ltr">
            {part}
          </bdi>
        ) : (
          <span key={i}>{rtl(part)}</span>
        )
      )}
    </>
  );
}

/** `**bold**` and line breaks; the agent writes nothing else. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i}>
            <HebrewWithEmail text={part.slice(2, -2)} />
          </strong>
        ) : (
          <HebrewWithEmail key={i} text={part} />
        )
      )}
    </>
  );
}

function Message({ m }: { m: ChatMsg }) {
  if (m.role === 'note') {
    return (
      <motion.p className="chat__note" initial={{ opacity: 0 }} animate={{ opacity: 1 }} role="status">
        <span className="chat__note-mark" aria-hidden="true" />
        <span>
          <HebrewWithEmail text={m.content} />
        </span>
      </motion.p>
    );
  }
  const mine = m.role === 'user';
  return (
    <motion.div
      className={`chat__msg ${mine ? 'chat__msg--user' : 'chat__msg--agent'}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
    >
      <span className="sr-only">{mine ? 'אתם:' : 'הסוכן:'}</span>
      <div className="chat__bubble" dir={mine ? 'auto' : undefined}>
        {mine ? m.content : <Rich text={m.content} />}
      </div>
      <time className="chat__time" dateTime={new Date(m.at).toISOString()}>
        {TIME.format(m.at)}
      </time>
    </motion.div>
  );
}

export default function IntakeChat({ variant, onClose }: { variant: 'page' | 'drawer'; onClose?: () => void }) {
  const s = useIntakeChat();
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const known = FIELD_ORDER.filter((k) => k !== 'phone' && s.fields[k]).length;
  const total = FIELD_ORDER.length - 1;
  const mood: BotMood = s.typing ? 'focus' : s.lead === 'sent' ? 'happy' : 'idle';

  // Follow the thread: every new message and the typing mark scroll the log to its end.
  useLayoutEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: s.messages.length > 1 ? 'smooth' : 'auto' });
  }, [s.messages.length, s.typing]);

  // The full page puts the cursor in the composer on desktop; a phone would open its keyboard over
  // the greeting, so it waits for a tap there.
  useEffect(() => {
    if (variant === 'drawer' || window.matchMedia('(min-width: 1024px)').matches) inputRef.current?.focus({ preventScroll: true });
  }, [variant]);

  // The composer grows with what is typed, up to five lines.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [draft]);

  const send = (text: string) => {
    if (!text.trim() || s.typing) return;
    setDraft('');
    void sendChat(text);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(draft);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(draft);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <section className={`chat chat--${variant} glyph-frame`} aria-label="שיחה עם הסוכן של דניאל">
        <header className="chat__bar">
          <SiteBot shape="circle" tone="fill" mood={mood} size={variant === 'page' ? 40 : 34} hop="tap" className="chat__face" />
          <div className="chat__who">
            <strong className="chat__name">הסוכן של דניאל</strong>
            <span className="chat__status" aria-live="polite">
              <span className={`chat__dot${s.typing ? ' chat__dot--busy' : ''}`} aria-hidden="true" />
              {s.typing ? 'מקליד' : s.lead === 'sent' ? 'דניאל קיבל את השיחה' : 'זמין עכשיו'}
            </span>
          </div>
          <span className="chat__count" title="כמה פרטים הסוכן כבר יודע">
            {known}/{total}
          </span>
          {variant === 'drawer' && (
            <Link to="/chat" onClick={onClose} className="hdr-icon-btn" aria-label="פתיחה בעמוד מלא" title="פתיחה בעמוד מלא">
              <Maximize2 className="h-4 w-4" />
            </Link>
          )}
          <button type="button" onClick={resetChat} className="hdr-icon-btn" aria-label="שיחה חדשה" title="שיחה חדשה">
            <RotateCcw className="h-4 w-4" />
          </button>
          {onClose && (
            <button type="button" onClick={onClose} className="hdr-icon-btn" aria-label="סגירת הצ׳אט">
              <X className="h-4 w-4" />
            </button>
          )}
        </header>

        <div ref={logRef} className="chat__log story-scroll" role="log" aria-label="ההודעות בשיחה" data-lenis-prevent>
          {s.messages.map((m) => (
            <Message key={m.id} m={m} />
          ))}
          <AnimatePresence>
            {s.typing && (
              <motion.div className="chat__msg chat__msg--agent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="chat__bubble chat__typing" aria-label="הסוכן מקליד">
                  <span />
                  <span />
                  <span />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!s.typing && s.suggestions.length > 0 && (
          <div className="chat__chips" role="group" aria-label="תשובות מהירות">
            {s.suggestions.map((t) => (
              <button key={t} type="button" className="chat__chip" onClick={() => send(t)}>
                <ArrowUpLeft className="h-3.5 w-3.5" aria-hidden="true" />
                {rtl(t)}
              </button>
            ))}
          </div>
        )}

        <form className="chat__composer" onSubmit={onSubmit}>
          <label htmlFor={`chat-input-${variant}`} className="sr-only">
            הודעה לסוכן
          </label>
          <textarea
            ref={inputRef}
            id={`chat-input-${variant}`}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            maxLength={1200}
            enterKeyHint="send"
            placeholder={s.ask === 'email' ? 'name@mail.com' : 'כתבו כאן...'}
            dir="auto"
            className="chat__input"
          />
          <button type="submit" className="chat__send" disabled={!draft.trim() || s.typing} aria-label="שליחה">
            <Send className="h-4 w-4 -scale-x-100" aria-hidden="true" />
          </button>
        </form>
        <p className="chat__fine">
          הסוכן הוא AI. דניאל קורא כל שיחה וחוזר במייל.{' '}
          <Link to="/privacy" onClick={onClose}>
            פרטיות
          </Link>
        </p>
      </section>
    </MotionConfig>
  );
}
