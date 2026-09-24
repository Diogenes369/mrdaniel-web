import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';
import { getFirebaseApp } from './firebaseClient';

/**
 * Visitor sign-in for the free guides (2026-09-24). Google first, Email/Password second.
 *
 * This module is only ever reached through a dynamic `import()` — the guide page and the auth modal
 * pull it in on demand — so `firebase/auth` (~60 KB gz) stays out of the main bundle that every
 * homepage visitor downloads.
 *
 * Same Firebase project as the dashboard, which is why the dashboard's gate checks an admin allowlist
 * and not merely "is signed in" (dashboard/src/lib/auth.ts). A visitor account must never be enough
 * to open the dashboard.
 */

export type { User };

let authInstance: Auth | null = null;

export function siteAuth(): Auth | null {
  const app = getFirebaseApp();
  if (!app) return null;
  if (!authInstance) {
    authInstance = getAuth(app);
    authInstance.languageCode = 'he';
    // Local persistence: someone who signed in once for guide 1 should not meet the modal again on
    // guide 2 next week. Best-effort — a storage-blocked browser falls back to in-memory.
    setPersistence(authInstance, browserLocalPersistence).catch(() => {});
  }
  return authInstance;
}

export function watchUser(cb: (u: User | null) => void): () => void {
  const auth = siteAuth();
  if (!auth) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, cb);
}

/**
 * Instagram / Facebook / TikTok in-app browsers. Google refuses OAuth inside embedded webviews
 * (`disallowed_useragent`) and the popup has nowhere to open, so the modal leads with email there.
 * The guide links are mostly tapped from an Instagram DM, so this is the common case, not an edge.
 */
export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Instagram|FBAN|FBAV|FB_IAB|Threads|TikTok|musical_ly|Line\//i.test(navigator.userAgent);
}

/** sessionStorage key: the guide a redirect sign-in was started for, so the download resumes on return. */
const PENDING_KEY = 'guide-auth-pending';

export async function signInWithGoogle(pendingGuide: string): Promise<User | null> {
  const auth = siteAuth();
  if (!auth) throw new Error('auth/not-configured');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const cred = await signInWithPopup(auth, provider);
    return cred.user;
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    // A blocked popup (Safari with strict settings, some Android browsers) can still do a full-page
    // redirect. The page reads the pending guide back on return and starts the download itself.
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      try {
        sessionStorage.setItem(PENDING_KEY, pendingGuide);
      } catch {
        /* storage blocked: the visitor just taps download again after returning */
      }
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw err;
  }
}

/** After a redirect sign-in: the guide whose download should now resume, or null. Consumes the flag. */
export async function takeRedirectResume(): Promise<string | null> {
  const auth = siteAuth();
  if (!auth) return null;
  let pending: string | null = null;
  try {
    pending = sessionStorage.getItem(PENDING_KEY);
    if (pending) sessionStorage.removeItem(PENDING_KEY);
  } catch {
    return null;
  }
  if (!pending) return null;
  try {
    const res = await getRedirectResult(auth);
    return res?.user ? pending : null;
  } catch {
    return null;
  }
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const auth = siteAuth();
  if (!auth) throw new Error('auth/not-configured');
  return (await signInWithEmailAndPassword(auth, email.trim(), password)).user;
}

export async function signUpWithEmail(name: string, email: string, password: string): Promise<User> {
  const auth = siteAuth();
  if (!auth) throw new Error('auth/not-configured');
  const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
  // The display name is what the dashboard's Leads tab shows, and the server reads it from the
  // account record — so it has to land before the lead is recorded, not after.
  if (name.trim()) await updateProfile(user, { displayName: name.trim().slice(0, 120) }).catch(() => {});
  return user;
}

export async function resetPassword(email: string): Promise<void> {
  const auth = siteAuth();
  if (!auth) throw new Error('auth/not-configured');
  await sendPasswordResetEmail(auth, email.trim());
}

export async function signOutVisitor(): Promise<void> {
  const auth = siteAuth();
  if (auth) await signOut(auth);
}

/**
 * Records "this signed-in visitor took this guide" as a lead. Sends the Firebase ID token, NOT the
 * email/name: the server resolves the identity from the token (api/leads.ts `guide-signup`), so a
 * script cannot plant arbitrary addresses in `leads` by posting to the endpoint.
 *
 * Never throws and never blocks the download — a lead that failed to save must not cost the visitor
 * the file they signed in for. `keepalive` lets the request outlive the navigation to the PDF.
 */
export async function recordGuideLead(user: User, guide: string): Promise<void> {
  const onceKey = `guide-lead:${user.uid}:${guide}`;
  try {
    if (sessionStorage.getItem(onceKey)) return;
  } catch {
    /* no storage: the server dedupes anyway */
  }
  try {
    const idToken = await user.getIdToken();
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'guide-signup', idToken, guide }),
      keepalive: true,
    });
    if (res.ok) {
      try {
        sessionStorage.setItem(onceKey, '1');
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* swallowed by design — see above */
  }
}

/** Firebase error code → natural Hebrew. Unknown codes get a generic line, never the raw English. */
export function authErrorHe(err: unknown): string {
  const code = (err as { code?: string; message?: string })?.code || (err as Error)?.message || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'כתובת האימייל לא תקינה.';
    case 'auth/missing-password':
      return 'צריך להזין סיסמה.';
    case 'auth/weak-password':
      return 'הסיסמה קצרה מדי — לפחות 6 תווים.';
    case 'auth/email-already-in-use':
      return 'האימייל הזה כבר רשום. עברו ל״התחברות״.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'האימייל או הסיסמה לא נכונים.';
    case 'auth/too-many-requests':
      return 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.';
    case 'auth/network-request-failed':
      return 'אין חיבור לרשת. בדקו את החיבור ונסו שוב.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return '';
    case 'auth/unauthorized-domain':
    case 'auth/operation-not-allowed':
    case 'auth/not-configured':
      return 'ההתחברות לא זמינה כרגע. נסו שוב מאוחר יותר.';
    default:
      return 'משהו השתבש בהתחברות. נסו שוב.';
  }
}
