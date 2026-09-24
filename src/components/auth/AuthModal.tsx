import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Download, Loader2, Lock, Mail, User as UserIcon, X } from 'lucide-react';
import {
  authErrorHe, isInAppBrowser, resetPassword, signInWithEmail, signInWithGoogle, signUpWithEmail, type User,
} from '../../lib/siteAuth';

/**
 * Sign-in / sign-up gate in front of the free guide downloads (2026-09-24).
 *
 * One job: get the visitor to the file with as little friction as possible. Google is the primary
 * path (one tap, no password to invent); email/password sits under it. On success the modal closes
 * itself and hands the user back, and the page starts the download — the visitor never has to find
 * the download button a second time.
 *
 * Inside the Instagram/Facebook in-app browser Google OAuth is refused outright, so there the email
 * form leads and the Google button carries a hint to open the page in a real browser.
 *
 * Lazy-loaded by GuideDownloadPage, so neither this nor `firebase/auth` ships to visitors who never
 * press download.
 */

type Mode = 'signup' | 'login';

interface Props {
  open: boolean;
  guideSlug: string;
  guideTitle: string;
  onClose: () => void;
  onAuthed: (user: User) => void;
}

const EASE = [0.16, 1, 0.3, 1] as const;

export default function AuthModal({ open, guideSlug, guideTitle, onClose, onAuthed }: Props) {
  const [mode, setMode] = useState<Mode>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'google' | 'email' | 'reset' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [inApp] = useState(isInAppBrowser);
  const firstField = useRef<HTMLInputElement>(null);

  // Esc closes, the page underneath stops scrolling, focus lands in the form (not on Google: in the
  // common in-app case that button is the one that cannot work).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => firstField.current?.focus({ preventScroll: true }), 250);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      window.clearTimeout(t);
    };
  }, [open, busy, onClose]);

  useEffect(() => {
    setError('');
    setNotice('');
  }, [mode]);

  const finish = (user: User | null) => {
    // null = a redirect sign-in is under way; the page resumes the download when it comes back.
    if (user) onAuthed(user);
  };

  const google = async () => {
    setBusy('google');
    setError('');
    try {
      finish(await signInWithGoogle(guideSlug));
    } catch (err) {
      setError(authErrorHe(err));
    } finally {
      setBusy(null);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('email');
    setError('');
    try {
      const user = mode === 'signup' ? await signUpWithEmail(name, email, password) : await signInWithEmail(email, password);
      finish(user);
    } catch (err) {
      setError(authErrorHe(err));
    } finally {
      setBusy(null);
    }
  };

  const forgot = async () => {
    if (!email.trim()) {
      setError('הזינו את האימייל ונשלח קישור לאיפוס.');
      return;
    }
    setBusy('reset');
    setError('');
    try {
      await resetPassword(email);
      setNotice('שלחנו קישור לאיפוס הסיסמה. בדקו את תיבת הדואר.');
    } catch (err) {
      setError(authErrorHe(err));
    } finally {
      setBusy(null);
    }
  };

  const googleButton = (
    <button
      type="button"
      onClick={google}
      disabled={busy !== null}
      className="group relative flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl bg-white px-5 py-3.5 text-[15px] font-bold text-zinc-900 shadow-[0_8px_30px_-10px_rgba(255,255,255,0.45)] transition-all hover:shadow-[0_10px_36px_-8px_rgba(255,255,255,0.6)] active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
    >
      {busy === 'google' ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleMark />}
      המשך עם Google
    </button>
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="auth-backdrop"
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-md sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) onClose();
          }}
          dir="rtl"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="relative max-h-[100dvh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-carbon-900/95 p-6 pb-8 shadow-[0_0_80px_-20px_rgba(118,185,0,0.45)] sm:max-w-md sm:rounded-3xl sm:p-8"
          >
            {/* Top hairline + bloom: the same light language as the guide page's conversion block. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-8 top-0 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(118,185,0,0.8), transparent)' }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full opacity-30 blur-[70px]"
              style={{ background: 'radial-gradient(circle, #76B900 0%, transparent 70%)' }}
            />

            <button
              type="button"
              onClick={onClose}
              disabled={busy !== null}
              aria-label="סגירה"
              className="absolute top-4 left-4 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="relative">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-500/30 bg-brand-500/10 text-brand-300">
                <Download className="h-5 w-5" />
              </span>
              <h2 id="auth-modal-title" className="font-display text-2xl leading-tight font-extrabold text-white">
                {mode === 'signup' ? 'עוד רגע והמדריך אצלכם' : 'ברוכים השבים'}
              </h2>
              <p className="mt-2 text-[14px] leading-relaxed text-zinc-400">
                {mode === 'signup' ? 'הרשמה חינמית של כמה שניות, וההורדה של ' : 'התחברו וההורדה של '}
                <span className="font-semibold text-zinc-200">{guideTitle}</span>
                {' מתחילה מיד.'}
              </p>

              <div className="mt-6 space-y-3">
                {!inApp && googleButton}
                {!inApp && (
                  <div className="flex items-center gap-3 py-1 text-[12px] text-zinc-500">
                    <span className="h-px flex-1 bg-white/10" />
                    או עם אימייל
                    <span className="h-px flex-1 bg-white/10" />
                  </div>
                )}

                <form onSubmit={submit} className="space-y-3" noValidate>
                  {mode === 'signup' && (
                    <Field icon={<UserIcon className="h-4 w-4" />}>
                      <input
                        ref={firstField}
                        type="text"
                        autoComplete="name"
                        placeholder="שם מלא"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={120}
                        className="auth-input"
                      />
                    </Field>
                  )}
                  <Field icon={<Mail className="h-4 w-4" />}>
                    <input
                      ref={mode === 'login' ? firstField : undefined}
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      required
                      placeholder="אימייל"
                      dir="ltr"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="auth-input text-right placeholder:text-right"
                    />
                  </Field>
                  <Field icon={<Lock className="h-4 w-4" />}>
                    <input
                      type="password"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      required
                      minLength={6}
                      placeholder={mode === 'signup' ? 'סיסמה (לפחות 6 תווים)' : 'סיסמה'}
                      dir="ltr"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="auth-input text-right placeholder:text-right"
                    />
                  </Field>

                  {error && (
                    <p role="alert" className="text-[13px] leading-relaxed text-red-400">
                      {error}
                    </p>
                  )}
                  {notice && <p className="text-[13px] leading-relaxed text-brand-300">{notice}</p>}

                  <button
                    type="submit"
                    disabled={busy !== null}
                    className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3.5 text-[15px] font-extrabold text-carbon-950 transition-all hover:bg-brand-400 hover:shadow-[0_0_28px_-4px_rgba(118,185,0,0.6)] active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
                  >
                    {busy === 'email' && <Loader2 className="h-4 w-4 animate-spin" />}
                    {mode === 'signup' ? 'הרשמה והורדה' : 'התחברות והורדה'}
                  </button>
                </form>

                {inApp && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center gap-3 py-1 text-[12px] text-zinc-500">
                      <span className="h-px flex-1 bg-white/10" />
                      או
                      <span className="h-px flex-1 bg-white/10" />
                    </div>
                    {googleButton}
                    <p className="text-center text-[11px] leading-relaxed text-zinc-500">
                      בדפדפן של אינסטגרם Google לא מאפשרת התחברות. לכניסה עם Google פתחו את הדף בדפדפן (⋯ ← פתיחה בדפדפן).
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-[13px]">
                <button
                  type="button"
                  onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
                  className="cursor-pointer font-semibold text-brand-300 hover:text-brand-200"
                >
                  {mode === 'signup' ? 'כבר רשומים? להתחברות' : 'אין לכם חשבון? להרשמה'}
                </button>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={forgot}
                    disabled={busy !== null}
                    className="cursor-pointer text-zinc-500 hover:text-zinc-300"
                  >
                    שכחתי סיסמה
                  </button>
                )}
              </div>

              <p className="mt-6 text-center text-[11px] leading-relaxed text-zinc-500">
                ההרשמה חינמית. נשמור את השם והאימייל כדי לשלוח עדכונים על מדריכים חדשים, ותמיד אפשר לבקש הסרה.{' '}
                <a href="/privacy" target="_blank" rel="noopener" className="underline decoration-zinc-600 underline-offset-2 hover:text-zinc-300">
                  מדיניות פרטיות
                </a>
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <label className="relative block">
      <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-zinc-500">{icon}</span>
      {children}
    </label>
  );
}

/** The four-colour Google "G", inline — no image request, and the brand guidelines require the real mark. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
