import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getDatabase, type Database } from 'firebase-admin/database';

/**
 * Privileged Realtime Database access for server code. It authenticates as the project's Admin SDK
 * service account, so the security rules do not apply to it.
 *
 * `leads`, `newsletter_signups`, `email_templates` and `email_config` are to be closed to everyone
 * except signed-in dashboard admins (the rules lock in PROJECT_STATE.md §6). The client SDK in
 * firebaseServer.ts connects as an anonymous visitor and will be refused there, so
 * firebaseServer.ts's privilegedDb() uses this connection for those paths once it is configured.
 *
 * FIREBASE_SERVICE_ACCOUNT holds the service-account JSON, raw or base64-encoded. When it is missing
 * or malformed this returns null.
 */

const APP_NAME = 'server-admin';

let cached: Database | null | undefined;

function readServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  try {
    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(json) as { project_id?: string; client_email?: string; private_key?: string };
    if (!parsed.client_email || !parsed.private_key) return null;
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      // A key pasted through a dashboard UI can arrive with literal "\n" sequences instead of
      // newlines, and the PEM parser rejects those.
      privateKey: parsed.private_key.replace(/\\n/g, '\n'),
    };
  } catch {
    return null;
  }
}

/** The service-account database connection, or null when it is not configured. */
export function getAdminDb(): Database | null {
  if (cached !== undefined) return cached;
  const account = readServiceAccount();
  const databaseURL = process.env.VITE_FIREBASE_DATABASE_URL;
  if (!account || !databaseURL) {
    console.warn(
      '[firebase-admin] FIREBASE_SERVICE_ACCOUNT is missing or malformed. Leads and email settings are using the anonymous client, which the deployed rules refuse.'
    );
    cached = null;
    return null;
  }
  // getApps() guard: a warm Vercel instance reuses module scope, and initializing the same named app
  // twice throws.
  const app = getApps().find((a) => a.name === APP_NAME) ?? initializeApp({ credential: cert(account), databaseURL }, APP_NAME);
  cached = getDatabase(app);
  return cached;
}
