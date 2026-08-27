import { useState, type FormEvent } from 'react';
import { Send, CheckCircle2, Mail } from 'lucide-react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface NewsletterCaptureProps {
  source: string;
}

/** Lightweight lead-magnet capture, separate from the full LeadForm (which requires phone) —
 * newsletter signup is intentionally a lower-friction, email-only ask. Writes directly to the
 * same Firebase Realtime Database the tracker/dashboard already use, dynamically imported so the
 * Firebase SDK never loads until someone actually submits the form. */
export default function NewsletterCapture({ source }: NewsletterCaptureProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) {
      setStatus('error');
      return;
    }
    setStatus('sending');
    try {
      const [{ getDb }, { ref, push }] = await Promise.all([import('../../lib/firebaseClient'), import('firebase/database')]);
      const db = getDb();
      if (!db) throw new Error('Firebase not configured');
      await push(ref(db, 'newsletter_signups'), { email, source, ts: Date.now() });
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'sent') {
    return (
      <div className="flex items-center gap-3 justify-center text-center py-2">
        <CheckCircle2 className="w-5 h-5 text-brand-400 shrink-0" />
        <p className="text-zinc-200 text-sm font-medium">נרשמת בהצלחה! עדכוני AI יגיעו ישירות למייל שלך.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex flex-col sm:flex-row items-stretch gap-3">
        <div className="relative flex-1">
          <Mail className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (status === 'error') setStatus('idle');
            }}
            placeholder="you@company.com"
            dir="ltr"
            className="input-glow !pr-10 text-left"
          />
        </div>
        <button
          type="submit"
          disabled={status === 'sending'}
          className="flex items-center justify-center gap-2 bg-brand-500 text-black font-bold text-sm rounded-xl px-6 py-3 hover:bg-brand-400 transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
        >
          <Send className="w-4 h-4" />
          {status === 'sending' ? 'נרשם...' : 'הרשמה לעדכונים'}
        </button>
      </div>
      {status === 'error' && <p className="text-red-400 text-xs mt-2">כתובת מייל לא תקינה, או שגיאת חיבור — נסו שוב.</p>}
    </form>
  );
}
