import type { QueueItem } from './types.js';

// Outbound half of the self-hosted WhatsApp bridge — POSTs to the whatsapp-server microservice's
// /send endpoint (see whatsapp-server/index.js), which holds the actual Baileys socket connection.
// This module never talks to WhatsApp directly; it only knows how to reach the bridge.
const BRIDGE_URL = process.env.WHATSAPP_BRIDGE_URL; // e.g. https://your-vps:PORT/send or an ngrok URL
const BRIDGE_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET; // same shared secret used on the inbound side
const ADMIN_WHATSAPP_NUMBER = process.env.ADMIN_WHATSAPP_NUMBER || '972506473039';

export function isWhatsAppBridgeConfigured(): boolean {
  return Boolean(BRIDGE_URL);
}

async function sendRaw(to: string, message: string): Promise<boolean> {
  if (!BRIDGE_URL) return false;
  try {
    const res = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(BRIDGE_SECRET ? { 'x-bridge-secret': BRIDGE_SECRET } : {}),
      },
      body: JSON.stringify({ to, message }),
    });
    return res.ok;
  } catch (err) {
    console.error('[agent] WhatsApp bridge dispatch failed:', err);
    return false;
  }
}

/** Sends a plain message to the admin's WhatsApp (defaults to the site's sanctioned number, same
 * one used everywhere else in this codebase for the wa.me handoff links). */
export function sendAdminMessage(message: string): Promise<boolean> {
  return sendRaw(ADMIN_WHATSAPP_NUMBER, message);
}

const ACTION_HINT = 'השיבו "1" או "אשר" לאישור · "2" או "ערוך" לעריכה · "3" או "דחה" לדחייה';

function summarizeContentItem(item: Extract<QueueItem, { kind: 'content' }>): string {
  const excerpt = item.body.length > 220 ? `${item.body.slice(0, 217)}...` : item.body;
  return `🎬 *תוכן חדש ממתין לאישור*\nפלטפורמה: ${item.platform} · פורמט: ${item.format}\nנושא: ${item.topic}\n\n${excerpt}\n\n${item.security.badge}\n\n${ACTION_HINT}`;
}

function summarizeEngagementItem(item: Extract<QueueItem, { kind: 'engagement' }>): string {
  return `🤝 *טיוטת פנייה ממתינה לאישור*\nכוונת ליד: ${item.intent} (ניקוד ${item.intentScore})\nשאילתה: "${item.query}"\n\n${item.draftMessage}\n\n${item.security.badge}\n\n${ACTION_HINT}`;
}

/** Formats one queue item into a clean Hebrew WhatsApp approval prompt with the numeric/word
 * action shortcuts api/agent-whatsapp-webhook.ts's reply parser expects. */
export function formatApprovalPrompt(item: QueueItem): string {
  return item.kind === 'content' ? summarizeContentItem(item) : summarizeEngagementItem(item);
}

/** Called after an Auto-Pilot cycle generates new items — sends one approval-ready message per
 * item (capped) plus a short summary line, rather than a single generic "check the dashboard"
 * ping, so the admin can act directly from WhatsApp without opening the dashboard at all. */
export async function notifyNewContent(items: QueueItem[]): Promise<void> {
  if (!isWhatsAppBridgeConfigured() || items.length === 0) return;

  await sendAdminMessage(`🤖 הסוכן החברתי יצר ${items.length} פריטים חדשים לבדיקה:`);
  for (const item of items.slice(0, 5)) {
    // Sequential, not Promise.all — keeps messages arriving in the same order they were generated
    // instead of racing on the bridge's single WhatsApp socket.
    await sendRaw(ADMIN_WHATSAPP_NUMBER, formatApprovalPrompt(item));
  }
}

export async function sendActionConfirmation(actionLabel: string): Promise<void> {
  await sendAdminMessage(`✅ ${actionLabel}`);
}
