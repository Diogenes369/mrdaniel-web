import { useEffect, useState, type FormEvent } from 'react';
import { Lock, LogIn } from 'lucide-react';
import { login, logout } from '../lib/auth';
import { firebaseConfigured } from '../firebase';

/** `denied`: signed in, but not an admin (see isDashboardAdmin) — sign that session straight out. */
export default function LoginGate({ denied = false }: { denied?: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!denied) return;
    setError('לחשבון הזה אין הרשאת גישה ללוח הבקרה.');
    logout();
  }, [denied]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const err = await login(email, password);
    setPending(false);
    if (err) setError(err);
  };

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-carbon-950 px-6">
      <div className="w-full max-w-sm dash-card p-8">
        <div className="flex items-center gap-2.5 mb-6">
          <Lock className="w-5 h-5 text-brand-500" />
          <h1 className="font-display font-bold text-white text-lg">גישה ללוח הבקרה</h1>
        </div>

        {!firebaseConfigured && (
          <p className="text-amber-400 text-xs mb-4 leading-relaxed">
            Firebase אינו מוגדר. הוסף את פרטי ה-config לקובץ .env (ראו README) לפני ניסיון התחברות.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            required
            placeholder="אימייל"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            dir="ltr"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-400/60 transition-colors"
          />
          <input
            type="password"
            required
            placeholder="סיסמה"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            dir="ltr"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-400/60 transition-colors"
          />
          {error && <p className="text-red-400 text-xs leading-relaxed">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full flex items-center justify-center gap-2 bg-brand-500 text-black font-bold text-sm rounded-lg py-2.5 hover:bg-brand-400 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            {pending ? 'מתחבר...' : 'כניסה'}
          </button>
        </form>
      </div>
    </div>
  );
}
