import { initializeApp, type FirebaseOptions } from 'firebase/app';
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

let dbInstance: Database | null = null;

/** Lazily initializes (once) and returns the shared Realtime Database instance — every caller on
 * the public site (tracker.ts, the newsletter form, anything added later) must go through this
 * single module rather than calling `initializeApp` itself, since Firebase throws if the same
 * named app is initialized twice. Returns null when unconfigured so callers can no-op instead of
 * crashing. */
export function getDb(): Database | null {
  if (!firebaseConfigured) return null;
  if (!dbInstance) {
    const app = initializeApp(config);
    dbInstance = getDatabase(app);
  }
  return dbInstance;
}
