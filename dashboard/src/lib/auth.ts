import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { auth } from '../firebase';

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { user, loading };
}

/** Returns an error message on failure, or null on success. */
export async function login(email: string, password: string): Promise<string | null> {
  if (!auth) return 'Firebase אינו מוגדר — בדוק את קובץ ה-.env (ראו README).';
  try {
    await signInWithEmailAndPassword(auth, email, password);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'שגיאת התחברות לא ידועה.';
  }
}

export async function logout() {
  if (auth) await signOut(auth);
}

/**
 * Who may open the dashboard — NOT merely "anyone signed in".
 *
 * Since 2026-09-24 the public site lets visitors create accounts in this same Firebase project (the
 * free-guide sign-in, src/lib/siteAuth.ts), and Email/Password sign-up is open to anyone holding the
 * public web API key anyway. So a session proves nothing about being the owner.
 *
 *   · `VITE_DASHBOARD_ADMINS` (comma-separated emails and/or uids) is the real allowlist — set it.
 *   · Until it is set: only an email/password account created BEFORE visitor sign-up launched.
 *     Every owner account predates that; no visitor account can. This is a bridge, not the design.
 *
 * This is the UI gate. The data itself is protected by RTDB rules + the API secret, and those must
 * never be `auth != null` alone for the same reason (PROJECT_STATE.md §6).
 */
const VISITOR_SIGNUP_LAUNCH = Date.parse('2026-09-24T00:00:00Z');

export function isDashboardAdmin(user: User): boolean {
  const list = String(import.meta.env.VITE_DASHBOARD_ADMINS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length) return list.includes(user.uid.toLowerCase()) || list.includes((user.email || '').toLowerCase());
  const created = Date.parse(user.metadata.creationTime || '');
  const passwordOnly = user.providerData.length > 0 && user.providerData.every((p) => p.providerId === 'password');
  return Number.isFinite(created) && created < VISITOR_SIGNUP_LAUNCH && passwordOnly;
}
