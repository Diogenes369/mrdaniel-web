import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';
import { getAuth, type Auth } from 'firebase/auth';

const config: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** True only once a real apiKey + databaseURL are present — lets every consumer degrade to an
 * empty/idle state instead of crashing when `.env` hasn't been filled in yet. */
export const firebaseConfigured = Boolean(config.apiKey && config.databaseURL);

const app = firebaseConfigured ? initializeApp(config) : null;

export const db: Database | null = app ? getDatabase(app) : null;
export const auth: Auth | null = app ? getAuth(app) : null;
