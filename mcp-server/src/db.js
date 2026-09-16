import fs from 'node:fs';
import { config } from './env.js';

/**
 * RTDB access for the local agent — the same two-tier model as src/agent/firebaseServer.ts.
 *
 * With a service account (FIREBASE_SERVICE_ACCOUNT raw/base64 JSON, or FIREBASE_SERVICE_ACCOUNT_PATH)
 * it connects through firebase-admin and the security rules do not apply, so `leads` and the email
 * paths are readable. Without one it falls back to the anonymous web client, which can reach the
 * open paths (`agent_queue`, `published_posts`, `events`, `weekly_plan`, …) and is refused on the
 * locked ones — `db.privileged` tells a tool which case it is in, so a refusal is reported as
 * "needs a service account", not as an empty list.
 */

function readServiceAccount() {
  let raw = config.serviceAccount;
  if (!raw && config.serviceAccountPath && fs.existsSync(config.serviceAccountPath)) {
    raw = fs.readFileSync(config.serviceAccountPath, 'utf8');
  }
  if (!raw) return null;
  try {
    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const p = JSON.parse(json);
    if (!p.client_email || !p.private_key) return null;
    return { projectId: p.project_id, clientEmail: p.client_email, privateKey: p.private_key.replace(/\\n/g, '\n') };
  } catch {
    return null;
  }
}

let handle = null;

export async function getDb() {
  if (handle) return handle;
  if (!config.firebase.databaseURL) {
    throw new Error('VITE_FIREBASE_DATABASE_URL is not set — expected in the repo root .env');
  }
  const account = readServiceAccount();
  if (account) {
    const { cert, getApps, initializeApp } = await import('firebase-admin/app');
    const { getDatabase } = await import('firebase-admin/database');
    const app =
      getApps().find((a) => a.name === 'mcp-admin') ??
      initializeApp({ credential: cert(account), databaseURL: config.firebase.databaseURL }, 'mcp-admin');
    const db = getDatabase(app);
    handle = {
      privileged: true,
      read: async (p) => (await db.ref(p).once('value')).val(),
      readLast: async (p, n) => (await db.ref(p).orderByKey().limitToLast(n).once('value')).val(),
      push: async (p, v) => (await db.ref(p).push(v)).key,
      update: (p, v) => db.ref(p).update(v),
      set: (p, v) => db.ref(p).set(v),
      close: () => app.delete(),
    };
    return handle;
  }
  const { initializeApp, getApps } = await import('firebase/app');
  const fb = await import('firebase/database');
  const app = getApps().find((a) => a.name === 'mcp-client') ?? initializeApp(config.firebase, 'mcp-client');
  const db = fb.getDatabase(app);
  handle = {
    privileged: false,
    read: async (p) => (await fb.get(fb.ref(db, p))).val(),
    readLast: async (p, n) => (await fb.get(fb.query(fb.ref(db, p), fb.orderByKey(), fb.limitToLast(n)))).val(),
    push: async (p, v) => (await fb.push(fb.ref(db, p), v)).key,
    update: (p, v) => fb.update(fb.ref(db, p), v),
    set: (p, v) => fb.set(fb.ref(db, p), v),
    // The web SDK holds a websocket open; without this a one-shot run never exits.
    close: async () => fb.goOffline(db),
  };
  return handle;
}

/** `{ key: row }` → `[{ id, ...row }]`, newest first by `ts`/`createdAt`. */
export function toList(val) {
  return Object.entries(val ?? {})
    .map(([id, row]) => ({ id, ...(row && typeof row === 'object' ? row : { value: row }) }))
    .sort((a, b) => (b.ts ?? b.createdAt ?? 0) - (a.ts ?? a.createdAt ?? 0));
}

/** RTDB rejects these in keys; a path segment built from user input must not carry them. */
export function safeKey(s) {
  return String(s).replace(/[.#$/[\]]/g, '_').slice(0, 200);
}

export function isPermissionError(err) {
  return /permission[_ ]denied/i.test(String(err?.message ?? err));
}
