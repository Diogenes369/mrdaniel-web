# Exposing carousel-bridge through Cloudflare Tunnel + Access

The bridge spawns `hermes -z` with caller-supplied text. That is a prompt handed to an agent with
tool-calling and code execution **on this machine**. Never expose it without both layers below.

- **Layer 1 — Cloudflare Access:** identity gate. Only your Google account reaches the origin.
- **Layer 2 — `BRIDGE_TOKEN`:** `x-bridge-token` on every `/carousel` route, in case Access is ever
  misconfigured or bypassed.

The bridge refuses all non-loopback requests when `BRIDGE_TOKEN` is unset, so a tunnel cannot
accidentally expose an open instance.

---

## Status

| Item | State |
|---|---|
| `cloudflared` | installed — `C:\Users\kj\AppData\Local\cloudflared\cloudflared.exe` (2026.8.3) |
| `BRIDGE_TOKEN` | generated, in `carousel-bridge/.env` |
| Token auth + CORS allow-list | shipped |
| `VITE_CAROUSEL_BRIDGE_URL` support | shipped (build-time) |
| Cloudflare login | **you must do this — interactive** |
| DNS | **blocked — see below** |

## Blocker: the domain is not on Cloudflare

`mrdaniel.co.il` currently uses `ns1/ns2.sitesdepot.com`. A named tunnel with a
`bridge.mrdaniel.co.il` hostname requires the zone to be on Cloudflare. Options:

1. **Move the zone to Cloudflare** (free). Changes nameservers for the whole domain — the live
   Vercel site's DNS moves too. Import the existing records first and verify before switching.
2. **Use another domain you already have on Cloudflare** — cheapest path if one exists.
3. **Quick tunnel, no domain**: `cloudflared tunnel --url http://localhost:8787` gives a random
   `*.trycloudflare.com` URL. No Access gate, token only, and the URL changes on every restart.

## Setup once the zone is on Cloudflare

```powershell
$cf = "$env:LOCALAPPDATA\cloudflared\cloudflared.exe"

# 1. Interactive browser login — pick the mrdaniel.co.il zone
& $cf tunnel login

# 2. Create the tunnel and route DNS at it
& $cf tunnel create carousel-bridge
& $cf tunnel route dns carousel-bridge bridge.mrdaniel.co.il

# 3. Config — replace <TUNNEL-UUID> with the id printed by `tunnel create`
@"
tunnel: <TUNNEL-UUID>
credentials-file: $env:USERPROFILE\.cloudflared\<TUNNEL-UUID>.json
ingress:
  - hostname: bridge.mrdaniel.co.il
    service: http://127.0.0.1:8787
  - service: http_status:404
"@ | Set-Content -Encoding utf8 "$env:USERPROFILE\.cloudflared\config.yml"

# 4. Run it as a Windows service so it survives reboots, like PM2 does for the bridge
& $cf service install
```

### Cloudflare Access policy (dashboard, not CLI)

Zero Trust → Access → Applications → **Add a self-hosted application**

- Domain: `bridge.mrdaniel.co.il`
- Policy: **Allow**, include → *Emails* → your address
- Session duration: 24h

Without this, the tunnel is public and only the token protects it.

## Point the dashboard at it

`VITE_CAROUSEL_BRIDGE_URL` is inlined at **build** time, so it lives on the **dashboard** Vercel
project and needs a redeploy — setting the env var alone does nothing.

```bash
cd dashboard
npx vercel env add VITE_CAROUSEL_BRIDGE_URL production   # https://bridge.mrdaniel.co.il
npx vercel --prod
```

Then, once in the dashboard browser console, store the token (never baked into the bundle):

```js
localStorage.setItem('carousel-bridge-token', '<BRIDGE_TOKEN from carousel-bridge/.env>')
```

Per-browser override of the URL, if you ever need it:

```js
localStorage.setItem('carousel-bridge-base', 'https://bridge.mrdaniel.co.il')
```

## Verify

```bash
curl https://bridge.mrdaniel.co.il/health
# expect: ok:true, tokenRequired:true, adminSecret:true, hermesTimeoutMs:600000

# must be 401 — proves the gate is live
curl -X POST https://bridge.mrdaniel.co.il/carousel/generate -H "Content-Type: application/json" -d '{}'
```

## PM2 note

PM2 runs the bridge; `cloudflared service install` runs the tunnel as a separate Windows service.
They are independent — restarting one does not affect the other. Restart the bridge after any
`.env` change (`pm2 restart carousel-bridge`), since env is read at startup.
