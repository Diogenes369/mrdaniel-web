# Live Analytics Dashboard

A standalone, password-gated real-time dashboard showing live visitor activity and behavioral
analytics on the main site — concurrent users with full session detail (device/browser/current
page/duration), a live traffic chart, a device-breakdown donut, a filterable event feed, a
content-interest heatmap (top-clicked elements, most-viewed pages, conversion rate), captured
leads, newsletter signups, and a server-latency gauge.

It's a separate Vite/React app (own `package.json`, own dev server on port `5174`) so it can be
deployed independently from the main site, with its own auth gate. Its design tokens (fonts,
brand-green ramp, carbon surface colors) are kept in sync with the main site's `src/index.css` —
see `src/index.css` in this app.

## How the pipeline works

```
Main site (src/lib/tracker.ts)  →  Firebase Realtime Database  →  This dashboard (live listeners)
```

- The main site's `src/lib/tracker.ts` writes directly to Firebase Realtime Database from the
  visitor's browser — no backend proxy, so it only needs the *public* client config, not a
  service-account key.
- **Presence** (`/presence/{sessionId}`) uses Firebase's `onDisconnect()` — a session is removed
  the instant that tab closes or loses connection, so "active users" is always accurate with zero
  polling. Each record also carries `browser`, `screen`, `lang`, `timezone`, and `referrer`,
  captured once at session start.
- **Events** (`/events/{pushId}`) are pushed for `session_start`, `pageview`, `conversion`,
  `click`, `outbound_link`, `scroll_depth`, `hover`, `form_interaction`, `chat_open`, and
  `chat_query`. Clicks, outbound links, and scroll depth are tracked passively site-wide (event
  delegation in `initTracker()`) — no per-component instrumentation needed, labels are derived
  from whatever's already on the element (`aria-label`, visible text, `title`). "Hover"/interest
  tracking is opt-in per element via a `data-track-interest="label"` attribute (see `NewsCard.tsx`
  for an example) so it stays a meaningful signal rather than firing on every pointer sweep.
  Form-field and AI-chat events are tracked at their specific call sites (`LeadForm.tsx`,
  `AIAssistantWidget.tsx`). Every event carries the same shared context: `ts`, `sessionId`, `path`,
  `device`, `browser`, `screen`, `referrer`, `lang`, `timezone`.
- **Leads** (`/leads/{pushId}`) — `/api/leads` stores every submitted lead here before it emails
  the owner, so a lead stays visible when SMTP fails. The browser no longer writes this path.
- **Health** (`/health/latest`) is a client-measured round-trip time to the main site's
  `GET /api/health` endpoint, pinged every 30s.
- This dashboard subscribes to all of the above with `onValue()` listeners — updates arrive
  push-based over Firebase's WebSocket connection, typically well under a second, comfortably
  inside the <3s requirement.

**Honesty note on scope**: "Traffic" here is derived from tracked *events*, not raw server access
logs — it's a real, live signal, just not the same thing as e.g. an nginx request-rate metric.
There's no "bandwidth" metric — nothing in this pipeline can honestly measure that from the
client, so it isn't shown rather than being faked.

## Setup

### 1. Firebase project

You said you already have one. Make sure it has:

- **Realtime Database** enabled (Build → Realtime Database → Create Database). Note the
  `databaseURL` it gives you (e.g. `https://your-project-default-rtdb.firegroup.firebasedatabase.app`).
- **Authentication → Sign-in method → Email/Password** enabled.
- **Authentication → Users → Add user**: create the one login you'll use for this dashboard
  (your email + a password). This is the only account allowed in — there's no self-signup.

### 2. Realtime Database security rules

Public **write** access for `/presence` and `/events` is inherent to this pattern — anonymous
site visitors write directly, they're never logged in. **Read** access is restricted to signed-in
users only, so only you (logged into the dashboard) can see the live data. Paste this into
**Realtime Database → Rules**:

```json
{
  "rules": {
    "presence": {
      ".read": "auth != null",
      ".write": true
    },
    "events": {
      ".read": "auth != null",
      ".write": true,
      ".indexOn": "ts"
    },
    "health": {
      ".read": "auth != null",
      ".write": true
    },
    "newsletter_signups": {
      ".read": "auth != null",
      ".write": true,
      ".indexOn": "ts"
    },
    "leads": {
      ".read": "auth != null",
      ".write": true,
      ".indexOn": "ts"
    }
  }
}
```

`newsletter_signups` was added when the AI page's newsletter capture form shipped (`src/components/content/NewsletterCapture.tsx`) — it writes `{ email, source, ts }` the same way the tracker writes `events`. Same tradeoff as everywhere else in this doc: public write (visitors aren't logged in), read restricted to the authenticated dashboard.

`leads` was added alongside the dashboard's "לידים וניוזלטר" tab. Since 2026-09-11 only `/api/leads` writes it (the site forms, the agent quiz and ManyChat), never the browser, so its `.write` no longer needs to be public. A rules lock that makes `leads`, `newsletter_signups`, `email_config` and `email_templates` admin-only is pending; see PROJECT_STATE.md §6.

**Tradeoff to know about**: because writes are public, anyone who extracts the client config from
the main site's bundle could technically write junk events into your database. That's inherent to
any client-only analytics pipeline (no backend to gate writes). If this becomes a problem, the
next step up is Firebase App Check (blocks non-browser traffic) or moving writes through a small
server endpoint — not implemented here to keep this within a lightweight client-only design.

### 3. Get your web app config

Firebase Console → Project settings → General → Your apps → Web app (create one if you don't have
one) → copy the `firebaseConfig` object.

### 4. Configure both apps

**This dashboard** (`dashboard/.env`, copy from `.env.example`):

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_DATABASE_URL=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

**The main site** needs the exact same values in *its own* `.env` at the project root (create one
if it doesn't exist yet) — it's what `src/lib/tracker.ts` reads to know where to send events. Same
variable names as above. Without them, the tracker silently no-ops (it never throws or blocks
rendering) — the main site works identically whether or not this is configured.

### 5. Run it

```bash
cd dashboard
npm install    # already done if you're reading this after setup
npm run dev    # http://localhost:5174
```

Log in with the email/password you created in step 1.

## Integration snippet (already wired into the main site)

This is already done in `src/App.tsx` — included here so you know what to look for if you ever
move or refactor it:

```tsx
// Firebase (~200KB gzipped) is dynamically imported, not statically — keeps it out of the main
// bundle entirely until this effect actually runs, and out of the critical path.
type TrackerModule = typeof import('./lib/tracker');
let trackerPromise: Promise<TrackerModule> | null = null;
function loadTracker() {
  if (!trackerPromise) trackerPromise = import('./lib/tracker');
  return trackerPromise;
}

// once, near app root:
useEffect(() => {
  loadTracker().then((t) => t.initTracker());
}, []);

// on every route change:
loadTracker().then((t) => t.trackPageview(pathname));

// for a conversion event anywhere else in the app:
loadTracker().then((t) => t.trackConversion('some-label'));
```

## Build & deploy

```bash
npm run build     # outputs to dashboard/dist
npm run preview   # serve the production build locally
```

Deploy `dashboard/dist` anywhere that serves static files (this is a plain SPA, no server
required) — just make sure the `VITE_FIREBASE_*` env vars are set at build time on whatever CI/host
you use.
