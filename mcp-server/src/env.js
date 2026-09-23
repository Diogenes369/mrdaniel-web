import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/**
 * One config for both entry points (the MCP server and start-agent.js).
 *
 * Secrets are never copied into this package. They are read at start-up from the files the repo
 * already keeps them in, most specific first — dotenv never overwrites a key that is already set,
 * so `mcp-server/.env` wins over `dashboard/.env`, which wins over the root `.env`:
 *   - mcp-server/.env   → local overrides (FIREBASE_SERVICE_ACCOUNT, schedule, notify webhook)
 *   - dashboard/.env    → VITE_ADMIN_API_SECRET, the same value as the site's ADMIN_API_SECRET
 *   - root .env         → VITE_FIREBASE_* (the RTDB address and web config)
 * The root `.env.production.local` is deliberately NOT read: `vercel env pull` writes `[SENSITIVE]`
 * placeholders there, which look like values and fail every call.
 */

export const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(PKG_ROOT, '..');

for (const file of [path.join(PKG_ROOT, '.env'), path.join(REPO_ROOT, 'dashboard', '.env'), path.join(REPO_ROOT, '.env')]) {
  dotenv.config({ path: file, quiet: true });
}

const clean = (v) => (typeof v === 'string' ? v.trim().replace(/^["']|["']$/g, '') : '');
const looksReal = (v) => v.length >= 12 && !/^\[?sensitive\]?$/i.test(v) && !/^(?:your|placeholder|changeme|xxx)/i.test(v);

const adminSecret = clean(process.env.ADMIN_API_SECRET) || clean(process.env.VITE_ADMIN_API_SECRET);

export const config = {
  siteOrigin: clean(process.env.SITE_ORIGIN) || 'https://mrdaniel.co.il',
  dashboardUrl: clean(process.env.DASHBOARD_URL) || 'https://dashboard-snowy-psi-94.vercel.app',
  adminSecret: looksReal(adminSecret) ? adminSecret : '',
  firebase: {
    apiKey: clean(process.env.VITE_FIREBASE_API_KEY),
    authDomain: clean(process.env.VITE_FIREBASE_AUTH_DOMAIN),
    databaseURL: clean(process.env.VITE_FIREBASE_DATABASE_URL),
    projectId: clean(process.env.VITE_FIREBASE_PROJECT_ID),
    appId: clean(process.env.VITE_FIREBASE_APP_ID),
  },
  serviceAccount: clean(process.env.FIREBASE_SERVICE_ACCOUNT),
  serviceAccountPath: clean(process.env.FIREBASE_SERVICE_ACCOUNT_PATH),
  /** Everything the file tools can touch. Defaults to the monorepo. */
  workspaceRoot: path.resolve(clean(process.env.MCP_WORKSPACE_ROOT) || REPO_ROOT),
  /** Where the worker writes its rolling log and lock file. */
  stateDir: path.resolve(clean(process.env.AGENT_STATE_DIR) || path.join(PKG_ROOT, '.agent-state')),
  /** Optional: a Telegram/WhatsApp/Slack-style webhook the worker POSTs `{ text }` to on alerts. */
  notifyWebhook: clean(process.env.AGENT_NOTIFY_WEBHOOK),
  /** Local Ollama. No key: it is an unauthenticated loopback server. Empty model = first installed. */
  ollama: {
    url: clean(process.env.OLLAMA_URL) || 'http://127.0.0.1:11434',
    model: clean(process.env.OLLAMA_MODEL),
  },
  /**
   * Figma. `token` is a personal access token (X-Figma-Token) and only ever reads: the REST API has
   * no endpoint that mutates a node, so text injection and fill swaps go through the plugin bridge.
   */
  figma: {
    token: clean(process.env.FIGMA_TOKEN),
    fileKey: clean(process.env.FIGMA_FILE_KEY),
    /** Port the plugin's WebSocket bridge listens on (loopback only). */
    bridgePort: Number(process.env.FIGMA_BRIDGE_PORT) || 3055,
  },
  schedule: {
    healthEveryMin: Number(process.env.AGENT_HEALTH_EVERY_MIN) || 15,
    metricsEveryMin: Number(process.env.AGENT_METRICS_EVERY_MIN) || 360,
    /** Local hour (Asia/Jerusalem) for the daily draft. -1 disables auto-generation. */
    draftHour: process.env.AGENT_DRAFT_HOUR === undefined ? 9 : Number(process.env.AGENT_DRAFT_HOUR),
    draftPlatform: clean(process.env.AGENT_DRAFT_PLATFORM) || 'linkedin',
    /** How often to force the site's two sync agents (creator feed + model catalog). 0 disables. */
    siteSyncEveryMin: process.env.AGENT_SITE_SYNC_EVERY_MIN === undefined ? 60 : Number(process.env.AGENT_SITE_SYNC_EVERY_MIN),
    /** How often to run one batch of the site's article precompute agent. 0 disables. */
    precomputeEveryMin: process.env.AGENT_PRECOMPUTE_EVERY_MIN === undefined ? 10 : Number(process.env.AGENT_PRECOMPUTE_EVERY_MIN),
  },
};
