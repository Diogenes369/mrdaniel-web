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
