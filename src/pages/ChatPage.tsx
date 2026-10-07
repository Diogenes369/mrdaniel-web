import { AnimatePresence, motion } from 'motion/react';
import { Check } from 'lucide-react';
import IntakeChat, { HebrewWithEmail } from '../components/chat/IntakeChat';
import { useFieldQuiet } from '../components/field/fieldState';
import { FIELD_LABEL, FIELD_ORDER, REQUIRED_FIELDS } from '../lib/intakeFields';
import { useIntakeChat } from '../lib/intakeChat';
import { rtl } from '../lib/rtl';

/**
 * /chat (2026-10-07): talk to the agent. The owner wanted the site's way in to be a conversation
 * that feels human rather than a form: it answers anything, asks back, and hands Daniel the whole
 * thing as a lead with a summary (src/server/intakeAgent.ts, api/leads `chat-lead`).
 *
 * The page is the window and, beside it, what the agent already knows: every detail it has picked
 * up shows there as it is said, so the visitor sees exactly what will reach Daniel, and nothing is
 * gathered behind their back. On phones the panel follows the window.
 */
export default function ChatPage() {
  const quiet = useFieldQuiet();
  const s = useIntakeChat();
  const shown = FIELD_ORDER.filter((k) => k !== 'phone' || s.fields.phone);

  const status =
    s.lead === 'sent'
      ? `השיחה אצל דניאל. אישור נשלח ל-${s.fields.email}.`
      : s.lead === 'sending'
        ? 'מעביר לדניאל...'
        : `כשיהיו ${REQUIRED_FIELDS.map((k) => FIELD_LABEL[k]).join(', ')}, השיחה עוברת לדניאל.`;

  return (
    <div id="page-top" className="chat-page pt-24 md:pt-28">
      <div className="container-wide">
        <header className="chat-page__head">
          <h1 className="story-h1">
            <span className="story-h1__lead">דברו עם הסוכן</span>
          </h1>
          <p className="story-body">{rtl('שאלו כל דבר על AI ועל העבודה שלכם. הסוכן עונה מיד, שואל בחזרה, ומעביר לדניאל את כל השיחה.')}</p>
        </header>

        <div ref={quiet} className="chat-page__grid">
          <IntakeChat variant="page" />

          <aside className="chat-dossier glyph-frame" aria-labelledby="chat-dossier-title">
            <p id="chat-dossier-title" className="chat-dossier__bar">
              <span className="story-statusbar__live" aria-hidden="true" />
              מה הסוכן כבר יודע
            </p>
            <dl className="chat-dossier__list">
              {shown.map((k) => {
                const value = s.fields[k];
                return (
                  <div key={k} className={`chat-dossier__row${value ? ' is-known' : ''}`}>
                    <dt>
                      <span className="chat-dossier__mark" aria-hidden="true">
                        <AnimatePresence initial={false}>
                          {value && (
                            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 26 }}>
                              <Check className="h-3 w-3" />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </span>
                      {FIELD_LABEL[k]}
                      {REQUIRED_FIELDS.includes(k) && !value && <span className="chat-dossier__need"> · חסר</span>}
                    </dt>
                    <dd dir={k === 'email' ? 'ltr' : undefined}>{value ? rtl(value) : 'עוד לא נאמר'}</dd>
                  </div>
                );
              })}
            </dl>
            <p className={`chat-dossier__status${s.lead === 'sent' ? ' is-sent' : ''}`} role="status">
              <HebrewWithEmail text={status} />
            </p>
            <p className="chat-dossier__fine">הפרטים עוברים רק לדניאל. אין טלפון ואין וואטסאפ: התשובה מגיעה במייל.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
