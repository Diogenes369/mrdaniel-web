import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ADMIN_AUTH_FAILED_EVENT,
  clearAdminSecret,
  getAdminSecret,
  inspectSecret,
  setAdminSecret,
  usingBuildSecret,
} from '../lib/adminSecret';
import { SITE_ORIGIN } from '../lib/useDashboardRefresh';

/**
 * The dashboard's re-authentication prompt.
 *
 * Replaces the raw "401" warning toasts. It appears only when the site API has actually rejected
 * our credentials, explains the usual cause in plain Hebrew (the build-time secret went stale after
 * a rotation), and lets the operator paste the current secret straight into localStorage — which
 * `getAdminSecret()` prefers over the baked value, so the fix takes effect immediately with no
 * rebuild and no redeploy. The pasted value is verified against the live endpoint before it is
 * accepted, so a typo surfaces here rather than as another wave of failures downstream.
 */
export default function AdminAuthGate() {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState('api');
  const [value, setValue] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | 'bad' | 'unsendable' | 'ok'>('idle');
  const [offenders, setOffenders] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onFail = (e: Event) => {
      setSource(((e as CustomEvent).detail?.source as string) || 'api');
      setState('idle');
      setOpen(true);
    };
    window.addEventListener(ADMIN_AUTH_FAILED_EVENT, onFail);
    return () => window.removeEventListener(ADMIN_AUTH_FAILED_EVENT, onFail);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const save = useCallback(async () => {
    // Repair paste artifacts and check the value can actually ride in a header BEFORE it reaches
    // fetch(). Skipping this check is what let a mis-paste through: the probe below threw a
    // ByteString TypeError, the catch treated it as a network blip, and the poisoned value was
    // stored anyway — after which every API call in the dashboard crashed instead of 401ing.
    const check = inspectSecret(value);
    if (!check.value) {
      if (check.unsendable) {
        setOffenders(check.offenders);
        setState('unsendable');
      }
      return;
    }
    const secret = check.value;
    setState('checking');

    // Probe with a deliberately invalid action: auth is checked before the action is dispatched,
    // so a good secret answers 400 and a bad one answers 401 — without triggering real work.
    try {
      const res = await fetch(`${SITE_ORIGIN.replace(/\/$/, '')}/api/agent-generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify({ action: '__auth_probe__' }),
      });
      if (res.status === 401) {
        setState('bad');
        return;
      }
    } catch {
      // Network failure tells us nothing about the secret; accept it and let the real call decide.
      // A header-encoding failure cannot land here any more — inspectSecret() ruled it out above.
    }

    if (!setAdminSecret(secret)) {
      setState('unsendable');
      return;
    }
    setState('ok');
    setValue('');
    setTimeout(() => setOpen(false), 900);
  }, [value]);

  if (!open) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg rounded-2xl border border-amber-400/30 bg-slate-900 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-amber-300">נדרשת הזדהות מחדש</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          השרת דחה את מפתח הגישה (401) בקריאה אל{' '}
          <code dir="ltr" className="rounded bg-slate-800 px-1 font-mono text-xs">
            /api/{source === 'agent-generate' ? 'agent-generate' : '*'}
          </code>
          .{' '}
          {usingBuildSecret()
            ? 'המפתח שבשימוש הוטמע בבנייה של הדשבורד — אם ADMIN_API_SECRET באתר הוחלף מאז, הערך הזה כבר לא תקף.'
            : 'המפתח השמור בדפדפן אינו תואם לערך הנוכחי באתר.'}{' '}
          הדביקו כאן את הערך העדכני של <code dir="ltr" className="font-mono text-xs">ADMIN_API_SECRET</code> — הוא
          יישמר בדפדפן ויגבר על ערך הבנייה, ללא צורך בפריסה מחדש.
        </p>

        <input
          ref={inputRef}
          dir="ltr"
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (state === 'bad' || state === 'unsendable') setState('idle');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
          }}
          placeholder="ADMIN_API_SECRET"
          className="mt-4 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-amber-400/60"
        />

        {state === 'bad' && (
          <p className="mt-2 text-sm text-rose-400">המפתח הזה נדחה גם הוא (401). בדקו את הערך ב-Vercel.</p>
        )}

        {state === 'unsendable' && (
          <p className="mt-2 text-sm text-rose-400">
            המפתח מכיל תווים שאי אפשר לשלוח ב-header של HTTP ({offenders}) — לרוב עברית שנדבקה בטעות או
            סימני כיווניות בלתי נראים שהועתקו יחד עם הערך. העתיקו שוב את הערך מ-Vercel, ישירות משדה הטקסט.
          </p>
        )}
        {state === 'ok' && <p className="mt-2 text-sm text-emerald-400">המפתח אומת ונשמר. ממשיכים…</p>}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!value.trim() || state === 'checking'}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
          >
            {state === 'checking' ? 'מאמת…' : 'שמור והמשך'}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300"
          >
            בטל
          </button>
          {getAdminSecret() && (
            <button
              type="button"
              onClick={() => {
                clearAdminSecret();
                setState('idle');
              }}
              className="mr-auto text-xs text-slate-500 underline"
            >
              נקה מפתח שמור
            </button>
          )}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          תיקון קבוע: עדכנו את <code dir="ltr" className="font-mono">VITE_ADMIN_API_SECRET</code> בפרויקט
          ה-dashboard ב-Vercel לערך הנוכחי ופרסו מחדש.
        </p>
      </div>
    </div>
  );
}
