import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';

const config: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = typeof window !== 'undefined' && Boolean(config.apiKey && config.databaseURL);

let appInstance: FirebaseApp | null = null;
let dbInstance: Database | null = null;

/** The one Firebase app on the public site. `getDb()` and the guide-download sign-in
 * (`siteAuth.ts`, lazy-loaded) both hang off it — two `initializeApp` calls would throw. */
export function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseConfigured) return null;
  if (!appInstance) appInstance = initializeApp(config);
  return appInstance;
}

/** Lazily initializes (once) and returns the shared Realtime Database instance — every caller on
 * the public site (tracker.ts, the newsletter form, anything added later) must go through this
 * single module rather than calling `initializeApp` itself, since Firebase throws if the same
 * named app is initialized twice. Returns null when unconfigured so callers can no-op instead of
 * crashing. */
export function getDb(): Database | null {
  const app = getFirebaseApp();
  if (!app) return null;
  if (!dbInstance) dbInstance = getDatabase(app);
  return dbInstance;
}
