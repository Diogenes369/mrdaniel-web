/**
 * Real-time Notification Dispatcher — generic webhook POST, deliberately not tied to one specific
 * provider's SDK. "WhatsApp/Telegram Webhook URL" fields in the dashboard accept whatever URL the
 * admin has actually set up (a Telegram Bot API `sendMessage` URL is itself just a plain webhook
 * endpoint — see .env.example for the two-minute @BotFather setup; a WhatsApp equivalent typically
 * comes from a relay service like Make.com/Zapier or the WhatsApp Business Cloud API, again just a
 * URL this function POSTs to). This module has no knowledge of either platform's specific request
 * shape beyond "POST JSON with a text field" — building a bespoke integration for a platform
 * requires that platform's real app/token, which isn't something this codebase can set up on your
 * behalf (see the "no live posting" scope note in SocialAgentEngine.ts for the same reasoning).
 */

interface NotifyPayload {
  text: string;
  queueUrl: string;
}

async function postWebhook(url: string, payload: NotifyPayload): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Sent in three shapes at once (plain `text`, Telegram-style `chat_id`-less `text`, and a
      // generic `message`) so the most common relay/bot webhook shapes all pick up something
      // sensible without the admin needing to configure a payload template.
      body: JSON.stringify({ text: `${payload.text}\n\n${payload.queueUrl}`, message: `${payload.text}\n\n${payload.queueUrl}` }),
    });
    return res.ok;
  } catch (err) {
    console.error('[agent] webhook dispatch failed:', url, err);
    return false;
  }
}

export async function dispatchAgentNotifications(webhooks: { whatsapp?: string; telegram?: string } | null, itemCount: number, queueUrl: string): Promise<void> {
  if (!webhooks) return;
  const text = `🤖 סוכן ה-AI החברתי יצר ${itemCount} פריטי תוכן חדשים לבדיקה ואישור.`;

  const targets = [webhooks.whatsapp, webhooks.telegram].filter((u): u is string => Boolean(u && u.trim()));
  await Promise.all(targets.map((url) => postWebhook(url, { text, queueUrl })));
}
