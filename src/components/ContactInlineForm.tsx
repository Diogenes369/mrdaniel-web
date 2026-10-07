import { useCallback, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import GlyphButton from './ui/GlyphButton';
import { CONTACT_FORM_COPY as C } from '../data/siteCopy';
import { rtl } from '../lib/rtl';
import { sendLeadWebhook } from '../lib/leadWebhook';
import { loadTracker } from '../lib/loadTracker';

const SOURCE = 'Contact Inline Form';
const CONTACT_EMAIL = 'daniel@mrdaniel.co.il';
const SWAP = { type: 'spring', stiffness: 380, damping: 32 } as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const trackField = (field: string, action: 'focus' | 'blur' | 'submit') =>
  loadTracker().then((t) => t.trackFormInteraction('ContactInline', field, action));

type Status = 'idle' | 'sending' | 'sent' | 'error';
interface Errors {
  name?: string;
  contact?: string;
}

function validate(name: string, contact: string): Errors {
  const errors: Errors = {};
  if (name.trim().length < 2) errors.name = C.nameError;
  if (!EMAIL_RE.test(contact.trim())) errors.contact = C.contactError;
  return errors;
}

/**
 * The homepage's closing lead form, open on the page instead of behind a button (2026-10-03).
 *
 * The reply goes to an email (2026-10-07): the field used to take "phone or email", and the owner
 * answers by email only, with no phone or WhatsApp. /api/leads sends the visitor an automatic reply
 * the moment the lead is stored, so the confirmation below can promise one.
 *
 * Three fields and nothing to choose: the old modal's topic picker and multi-step flow are what a
 * button-first form needs to qualify a stranger; here the visitor has just read the whole story and
 * writes in their own words. Same delivery as the modal — `/api/leads` (stored for the dashboard,
 * then emailed) plus the fire-and-forget Apps Script webhook — so a lead from here lands everywhere
 * a modal lead does.
 *
 * Errors appear only after the first submit attempt, then update as the visitor types; focus moves
 * to the first field that needs fixing, and to the confirmation once the lead is in.
 */
export default function ContactInlineForm() {
  const id = useId();
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [attempted, setAttempted] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const contactRef = useRef<HTMLInputElement>(null);
  // Focus lands on the confirmation when it MOUNTS — after the form's exit animation, which
  // `mode="wait"` plays first — not when the status flips, when the heading does not exist yet.
  const focusSent = useCallback((el: HTMLHeadingElement | null) => el?.focus(), []);

  const errors = attempted ? validate(name, contact) : {};

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (status === 'sending') return;
    setAttempted(true);
    const found = validate(name, contact);
    if (found.name) return nameRef.current?.focus();
    if (found.contact) return contactRef.current?.focus();

    const email = contact.trim().toLowerCase();
    const notes = message.trim();
    setStatus('sending');
    trackField('submit', 'submit');
    sendLeadWebhook({ name: name.trim(), email, phone: '', message: notes, sourceSection: SOURCE, inquiryTopic: 'יצירת קשר' });
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email, project: 'יצירת קשר', notes, sourceSection: SOURCE }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  };

  const again = () => {
    setName('');
    setContact('');
    setMessage('');
    setAttempted(false);
    setStatus('idle');
    window.setTimeout(() => nameRef.current?.focus(), 0);
  };

  const sending = status === 'sending';

  return (
    <MotionConfig reducedMotion="user">
      <div className="glyph-frame contact-form">
        <div className="contact-form__bar">
          <span className="story-statusbar__live" aria-hidden="true" />
          <span>{rtl(C.bar)}</span>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {status === 'sent' ? (
            <motion.div
              key="sent"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={SWAP}
              className="px-5 py-10 sm:px-8 sm:py-12"
              role="status"
            >
              <h3 ref={focusSent} tabIndex={-1} className="contact-form__sent-title">
                {rtl(C.successTitle)}
              </h3>
              <p className="story-body mt-3">{rtl(C.successBody)}</p>
              <button type="button" onClick={again} className="story-link mt-8 text-[14px]">
                {rtl(C.again)}
              </button>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              noValidate
              onSubmit={submit}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -6 }}
              transition={SWAP}
              aria-busy={sending}
              className="space-y-5 px-5 py-6 sm:px-8 sm:py-8"
            >
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="term-row">
                  <label htmlFor={`${id}-name`} className="term-label">
                    {rtl(C.nameLabel)}
                  </label>
                  <input
                    ref={nameRef}
                    id={`${id}-name`}
                    name="name"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onFocus={() => trackField('name', 'focus')}
                    placeholder={C.namePlaceholder}
                    aria-invalid={!!errors.name}
                    aria-describedby={errors.name ? `${id}-name-err` : undefined}
                    className="term-field"
                  />
                  {errors.name && (
                    <p id={`${id}-name-err`} className="term-error">
                      {rtl(errors.name)}
                    </p>
                  )}
                </div>

                <div className="term-row">
                  <label htmlFor={`${id}-contact`} className="term-label">
                    {rtl(C.contactLabel)}
                  </label>
                  {/* LTR: an address is typed left-to-right; right-aligned so the column edge
                      matches the Hebrew fields beside it. */}
                  <input
                    ref={contactRef}
                    id={`${id}-contact`}
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    dir="ltr"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    onFocus={() => trackField('contact', 'focus')}
                    placeholder="name@mail.com"
                    aria-invalid={!!errors.contact}
                    aria-describedby={errors.contact ? `${id}-contact-err` : undefined}
                    className="term-field text-right"
                  />
                  {errors.contact && (
                    <p id={`${id}-contact-err`} className="term-error">
                      {rtl(errors.contact)}
                    </p>
                  )}
                </div>
              </div>

              <div className="term-row">
                <label htmlFor={`${id}-message`} className="term-label">
                  {rtl(C.messageLabel)}
                </label>
                <textarea
                  id={`${id}-message`}
                  name="message"
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onFocus={() => trackField('message', 'focus')}
                  placeholder={C.messagePlaceholder}
                  maxLength={4000}
                  className="term-field"
                />
              </div>

              {status === 'error' && (
                <p className="term-error" role="alert">
                  {rtl(C.sendError)}{' '}
                  <a href={`mailto:${CONTACT_EMAIL}`} dir="ltr" className="underline underline-offset-4">
                    {CONTACT_EMAIL}
                  </a>
                </p>
              )}

              <div className="flex flex-col-reverse items-stretch gap-4 pt-1 sm:flex-row sm:items-center sm:justify-between">
                <Link to="/privacy" className="text-center text-[12.5px] text-ink-faint underline-offset-4 hover:text-ink-muted hover:underline sm:text-right">
                  {rtl(C.privacy)}
                </Link>
                <GlyphButton type="submit" disabled={sending} className="w-full sm:w-auto">
                  {sending ? (
                    <>
                      {rtl(C.submitting)}
                      <span className="contact-form__caret" aria-hidden="true" />
                    </>
                  ) : (
                    <>
                      {rtl(C.submit)}
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    </>
                  )}
                </GlyphButton>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
