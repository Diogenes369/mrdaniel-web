# WhatsApp Bridge

A standalone microservice that connects a real WhatsApp number to the Social Agent's approval
workflow on [mrdaniel.co.il](https://mrdaniel.co.il). It is **not** part of the main site's or
dashboard's npm projects — run it separately, on any machine you keep online 24/7.

## ⚠️ Read this before running it against a real number

This uses [Baileys](https://github.com/WhiskeySockets/Baileys), which connects by impersonating
the official WhatsApp Web client over WhatsApp's own reverse-engineered protocol — it is **not**
the official WhatsApp Business Cloud API. WhatsApp's Terms of Service prohibit unofficial/automated
clients, and Meta does detect and ban numbers that look automated. This is a real risk, not
boilerplate disclaimer text.

**Strongly recommended:** use a dedicated secondary number for this bridge, never your primary
personal or business WhatsApp — if it ever gets flagged, you lose a spare SIM, not your main line.
Keep this to its intended scope (one admin approving their own content queue), not bulk/outbound
messaging to other people. If you later need to message people who are *not* you at any volume, use
the official WhatsApp Business Platform instead.

## How it fits together

```
WhatsApp (your phone) ⇄ this bridge (Baileys) ⇄ /api/agent-whatsapp-webhook (main site)
                                               ⇄ /api/agent-generate (main site, outbound sends)
```

- Incoming: every message you send to the bridge's linked WhatsApp number is forwarded to the main
  site's webhook, which parses it for action shortcuts (`1`/`אשר` approve, `2`/`ערוך` edit, `3`/`דחה`
  reject) or, if it's not a shortcut, stores it as a strategic note that steers future generations.
- Outgoing: when the Social Agent generates new content (Auto-Pilot cron, or a manual trigger from
  the dashboard), the main site calls this bridge's `POST /send` to push an approval-ready message
  to your WhatsApp.

## Setup

```bash
cd whatsapp-server
npm install
cp .env.example .env
# edit .env — set WHATSAPP_WEBHOOK_SECRET to the SAME value as the main site's Vercel env var,
# and MAIN_SITE_WEBHOOK_URL to https://mrdaniel.co.il/api/agent-whatsapp-webhook
npm start
```

On first run, a QR code prints directly in your terminal. Open WhatsApp on your phone → **Linked
Devices** → **Link a Device**, and scan it. The session is saved to `auth_session/` — you won't
need to scan again unless that folder is deleted or WhatsApp logs the session out remotely.

## Making it reachable from Vercel

The main site's serverless functions run in Vercel's cloud, not on your machine — they need a
**public HTTPS URL** to reach this bridge's `/send` endpoint, and this bridge needs a public URL of
the main site to forward messages to (already true: `https://mrdaniel.co.il`).

- **Running on a VPS** with a public IP: put this behind a reverse proxy (Caddy/Nginx) for TLS, and
  set `WHATSAPP_BRIDGE_URL` on the main site's Vercel project to `https://your-domain/send`.
- **Running on your own machine** (no public IP): use a tunnel like
  [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
  or `ngrok http 4000`, then set `WHATSAPP_BRIDGE_URL` to the tunnel's HTTPS URL + `/send`.

## Running 24/7

**Docker:**

```bash
docker build -t whatsapp-bridge .
docker run -d --name whatsapp-bridge \
  --env-file .env \
  -p 4000:4000 \
  -v whatsapp-bridge-auth:/app/auth_session \
  --restart unless-stopped \
  whatsapp-bridge
```

**PM2** (bare metal / VPS without Docker):

```bash
npm install -g pm2
npm run pm2:start        # pm2 start ecosystem.config.cjs
pm2 save                 # persist the process list
pm2 startup              # follow the printed command to auto-start PM2 on machine reboot
npm run pm2:logs         # tail logs, including the QR code on first run
```

## Auto-reconnect

`connection.update` events drive reconnection automatically: any disconnect that isn't an explicit
logout retries after 3 seconds, indefinitely. A real logout (e.g. you removed the linked device
from your phone) requires deleting `auth_session/` and re-scanning a fresh QR code.
