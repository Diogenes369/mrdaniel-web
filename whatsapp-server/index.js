import 'dotenv/config';
import readline from 'readline/promises';
import express from 'express';
import pino from 'pino';
import QRCode from 'qrcode';
import { Boom } from '@hapi/boom';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, downloadMediaMessage, Browsers } from '@whiskeysockets/baileys';

/**
 * Self-hosted WhatsApp bridge for the Social Agent's Human-in-the-Loop approval workflow.
 *
 * IMPORTANT — read before running this 24/7 against a real number:
 * Baileys connects by impersonating the official WhatsApp Web client over WhatsApp's own
 * (undocumented, reverse-engineered) protocol. This is NOT the official WhatsApp Business
 * Cloud API. WhatsApp's Terms of Service prohibit unofficial/automated clients, and Meta does
 * detect and ban numbers that look automated — this is a real, non-hypothetical risk, not
 * boilerplate legal text. Recommended mitigations, strongly encouraged:
 *   - Use a DEDICATED secondary number for this bridge, never your primary personal/business
 *     WhatsApp — if it gets flagged, you lose a spare number, not your main line.
 *   - Keep message volume low and personal (this bridge is designed for exactly that: one admin
 *     approving their own queue, not bulk/outbound messaging to strangers).
 *   - If you later need to message people who are NOT you (e.g. real lead outreach at volume),
 *     use the official WhatsApp Business Platform (Meta-approved, ToS-compliant) instead — this
 *     bridge is intentionally scoped to the admin-notification/approval use case only.
 *
 * What this service does:
 *   1. Connects to WhatsApp via Baileys (multi-device auth, session persisted to disk). Links a
 *      device via a PAIRING CODE (typed into WhatsApp → Linked Devices → Link with phone number
 *      instead) — see promptForPhoneNumber()/requestPairing() below — with a QR code ALSO served
 *      at GET /qr as a browser-friendly fallback (whichever Baileys happens to offer that cycle).
 *   2. Forwards every incoming message FROM the configured admin number to the main site's
 *      /api/agent-whatsapp-webhook (auth'd with a shared secret).
 *   3. Exposes POST /send so the main site can push messages back out through this same
 *      WhatsApp connection (auth'd with the same shared secret).
 */

const PORT = process.env.PORT || 4000;
const WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET || '';
const MAIN_SITE_WEBHOOK_URL = process.env.MAIN_SITE_WEBHOOK_URL || '';
const ADMIN_NUMBER = (process.env.ADMIN_WHATSAPP_NUMBER || '972506473039').replace(/\D/g, '');

if (!WEBHOOK_SECRET) {
  console.warn('⚠️  WHATSAPP_WEBHOOK_SECRET is not set — both directions of this bridge will run unauthenticated. Set it in .env before exposing this service publicly.');
}
if (!MAIN_SITE_WEBHOOK_URL) {
  console.warn('⚠️  MAIN_SITE_WEBHOOK_URL is not set — incoming WhatsApp messages will be received but never forwarded anywhere.');
}

let sock = null;
// Guards against re-prompting on every reconnect attempt within one process lifetime — a dropped
// connection before pairing completes will retry the socket, but shouldn't ask for the phone
// number again until this process is restarted (if a code expires unscanned, restart to get a
// fresh one — same practical limitation the QR-code flow it replaced had).
let pairingRequested = false;
// Latest raw QR string Baileys has handed us this run, if any — read by GET /qr. Cleared once the
// connection actually opens, so the page correctly reports "already connected" afterward.
let latestQr = null;
// `sock.user` is populated speculatively as soon as a phone number is submitted to
// requestPairingCode() (Baileys needs a target JID to build the pairing request) — it is NOT a
// reliable "actually connected" signal on its own, so `/health` and `/qr` track this explicit flag
// instead, set only by the real 'open'/'close' connection.update events below.
let isConnected = false;

async function promptForPhoneNumber() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let phoneNumber = '';
  while (!phoneNumber) {
    const answer = await rl.question('\n📱 Enter your WhatsApp phone number with country code, digits only (e.g. 972501234567): ');
    phoneNumber = answer.replace(/\D/g, '');
    if (!phoneNumber) console.log('That didn\'t look like a phone number — try again.');
  }
  rl.close();
  return phoneNumber;
}

function formatPairingCode(code) {
  // WhatsApp's own pairing-code entry screen displays it in two groups of 4 — purely cosmetic,
  // the dash isn't typed. Falls back to the raw code if it isn't the expected 8-char shape.
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** Baileys can't send the pairing-code request node until its underlying WebSocket has actually
 * finished connecting — calling requestPairingCode() immediately after makeWASocket() races that
 * handshake and fails with a 428 "Connection Closed". Wait for `sock.ws.isOpen`, falling back to
 * a timeout so a genuinely broken connection doesn't hang the prompt forever. */
function waitForSocketOpen(socket, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (socket.ws.isOpen) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      socket.ws.off('open', onOpen);
      reject(new Error('Timed out waiting for WhatsApp connection to open'));
    }, timeoutMs);
    const onOpen = () => {
      clearTimeout(timer);
      resolve();
    };
    socket.ws.once('open', onOpen);
  });
}

async function requestPairing() {
  if (pairingRequested) return;
  pairingRequested = true;

  const phoneNumber = await promptForPhoneNumber();
  console.log('\n⏳ Waiting for connection to WhatsApp...');
  try {
    await waitForSocketOpen(sock);
    console.log('⏳ Requesting pairing code...');
    const code = await sock.requestPairingCode(phoneNumber);
    console.log('\n🔗 Your WhatsApp pairing code:');
    console.log(`\n    ${formatPairingCode(code)}\n`);
    console.log('On your iPhone: WhatsApp → Settings → Linked Devices → Link a Device → "Link with phone number instead" → enter the code above.');
    console.log(`Or scan a QR code instead at http://localhost:${PORT}/qr (opens cleanly in a browser).`);
    console.log('This code expires after a short time — if it does, restart this process to get a new one.\n');
  } catch (err) {
    console.error('Failed to request pairing code:', err);
    pairingRequested = false; // let a retry (e.g. after reconnect) try again
  }
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_session');

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    // Identifies this connection as a real desktop Chrome-on-macOS client rather than Baileys'
    // own default identifier — some WhatsApp-side connection instability/rejection issues are
    // specifically tied to the default browser fingerprint, and presenting as a common, expected
    // client string is the standard community-recommended fix.
    browser: Browsers.macOS('Desktop'),
  });

  sock.ev.on('creds.update', saveCreds);

  if (!sock.authState.creds.registered) {
    requestPairing();
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQr = qr;
      console.log(`📷 A QR code is also available at http://localhost:${PORT}/qr`);
    }

    if (connection === 'close') {
      isConnected = false;
      const statusCode = lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output?.statusCode : undefined;
      const reasonName = Object.entries(DisconnectReason).find(([key, val]) => val === statusCode && Number.isNaN(Number(key)))?.[0] ?? 'unknown';

      // WhatsApp closes the socket as an expected, normal part of the pairing-code protocol
      // (after issuing a code, and again while it's waiting for you to enter it on your phone) —
      // those closes can carry the SAME numeric status code (401) as a genuine post-registration
      // logout. Only treat 401 as fatal once a device was actually registered.
      const wasRegistered = state.creds.registered;
      const isRealLogout = wasRegistered && statusCode === DisconnectReason.loggedOut;
      // Another device/session (e.g. WhatsApp Web open elsewhere with this account) took over —
      // reconnecting immediately would just fight it in a loop, so stop and say why instead.
      const isReplaced = statusCode === DisconnectReason.connectionReplaced;

      if (isRealLogout) {
        console.log(`Connection closed (${reasonName}/${statusCode}). Logged out — delete the auth_session/ folder and restart to link a new device.`);
        return;
      }
      if (isReplaced) {
        console.log(`Connection closed (${reasonName}/${statusCode}). Another session took this connection over (e.g. WhatsApp Web opened elsewhere) — not auto-reconnecting to avoid fighting it. Restart this process when that other session is closed.`);
        return;
      }

      // Everything else — connectionClosed, restartRequired, timedOut, badSession, an
      // unregistered mid-pairing close, network blips, etc. — is treated as transient. Auth state
      // on disk is never touched here; only a real logout above ever tells you to delete it
      // yourself, and even then this code never deletes it automatically.
      console.log(`Connection closed (${reasonName}/${statusCode ?? 'unknown'}). Reconnecting in 3s...`);
      setTimeout(connectToWhatsApp, 3000);
    } else if (connection === 'open') {
      isConnected = true;
      latestQr = null;
      console.log('✅ WhatsApp connected and ready.');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const from = msg.key.remoteJid || '';
      // Only ever forward messages FROM the configured admin number — this keeps the bridge a
      // personal control channel, not a public-facing inbound bot that processes messages from
      // anyone who happens to message this number.
      if (ADMIN_NUMBER && !from.includes(ADMIN_NUMBER)) continue;

      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
      const audioMessage = msg.message.audioMessage;

      let audioBase64 = null;
      let audioMimeType = null;
      if (audioMessage) {
        try {
          const buffer = await downloadMediaMessage(msg, 'buffer', {});
          audioBase64 = buffer.toString('base64');
          audioMimeType = audioMessage.mimetype || 'audio/ogg';
        } catch (err) {
          console.error('Failed to download voice note:', err);
        }
      }

      if (!text && !audioBase64) continue;

      await forwardToMainSite({ from, text, audioBase64, audioMimeType, timestamp: Date.now() });
    }
  });
}

async function forwardToMainSite(payload) {
  if (!MAIN_SITE_WEBHOOK_URL) return;
  try {
    const res = await fetch(MAIN_SITE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error('Main site rejected forwarded message:', res.status, await res.text());
  } catch (err) {
    console.error('Failed to forward message to main site:', err);
  }
}

// --- Outbound HTTP API — the main site calls this to send messages back out --------------------
const app = express();
app.use(express.json());

app.post('/send', async (req, res) => {
  const secret = req.headers['x-bridge-secret'];
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  const { to, message } = req.body || {};
  if (!to || !message) {
    res.status(400).json({ ok: false, error: 'missing to/message' });
    return;
  }
  if (!isConnected) {
    res.status(503).json({ ok: false, error: 'whatsapp not connected' });
    return;
  }

  try {
    const digits = String(to).replace(/\D/g, '');
    const jid = String(to).includes('@') ? to : `${digits}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: message });
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to send WhatsApp message:', err);
    res.status(500).json({ ok: false, error: 'send failed' });
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, connected: isConnected });
});

// Browser-friendly QR viewer — a scanned terminal QR (block characters) is fragile to relay
// through anything that re-renders text (chat UIs, non-monospace terminals); a real <img> avoids
// that entirely. Also writes the same PNG to disk (latest-qr.png) on every request for anyone who
// wants a file instead of the page. Auto-refreshes every 5s since Baileys rotates the QR
// periodically until it's scanned.
app.get('/qr', async (_req, res) => {
  if (isConnected) {
    res.send('<html><body style="font-family:sans-serif;text-align:center;padding:4rem;"><h2>✅ Already connected</h2><p>No QR code needed.</p></body></html>');
    return;
  }
  if (!latestQr) {
    res.send(
      '<html><head><meta http-equiv="refresh" content="3"></head><body style="font-family:sans-serif;text-align:center;padding:4rem;"><h2>⏳ No QR code yet</h2><p>Waiting on the WhatsApp connection — this page refreshes automatically. Check the terminal for a pairing code too.</p></body></html>'
    );
    return;
  }

  try {
    const dataUrl = await QRCode.toDataURL(latestQr, { width: 320, margin: 2 });
    await QRCode.toFile('latest-qr.png', latestQr, { width: 320, margin: 2 }).catch((err) => console.error('Failed to write latest-qr.png:', err));
    res.send(`<!doctype html>
<html>
  <head>
    <meta http-equiv="refresh" content="15">
    <title>WhatsApp QR</title>
  </head>
  <body style="font-family:sans-serif;text-align:center;padding:2rem;background:#111;color:#fff;">
    <h2>📱 Scan with WhatsApp → Linked Devices → Link a Device</h2>
    <img src="${dataUrl}" alt="WhatsApp QR code" style="background:#fff;padding:16px;border-radius:12px;" />
    <p style="color:#aaa;">This page refreshes every 15s to stay in sync with the latest code.</p>
  </body>
</html>`);
  } catch (err) {
    console.error('Failed to render QR page:', err);
    res.status(500).send('Failed to render QR code.');
  }
});

app.listen(PORT, () => {
  console.log(`WhatsApp bridge HTTP API listening on http://localhost:${PORT}`);
  console.log('Starting WhatsApp connection...');
});

connectToWhatsApp().catch((err) => {
  console.error('Fatal error starting WhatsApp connection:', err);
  process.exit(1);
});
