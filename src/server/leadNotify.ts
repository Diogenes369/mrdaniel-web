/**
 * Instant lead notifications (2026-10-03) — a phone ping the moment a site lead lands, next to the
 * owner email that `api/leads.ts` already sends. Four channels, each switched on by its own env vars
 * and all optional; with none set this module sends nothing and costs nothing:
 *
 *   Telegram bot     TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
 *   Twilio SMS / WA  TWILIO_ACCOUNT_SID (or TWILIO_SID) + TWILIO_AUTH_TOKEN + TWILIO_FROM + TWILIO_TO
 *                    — WhatsApp when both numbers carry Twilio's `whatsapp:` prefix
 *   Green API (WA)   GREENAPI_INSTANCE_ID + GREENAPI_TOKEN + GREENAPI_CHAT_ID (`9725XXXXXXXX@c.us`),
 *                    GREENAPI_API_URL for an instance on its own host
 *   Any webhook      NOTIFICATION_WEBHOOK_URL (+ optional NOTIFICATION_WEBHOOK_SECRET, sent as the
 *                    `x-webhook-secret` header) — JSON, for Make.com / n8n / Zapier / a WhatsApp
 *                    Cloud API relay. The Cloud API itself is not called directly: a business-
 *                    initiated message to the owner needs a pre-approved template, which is a Meta
 *                    console setup, not something an env var can carry.
 *
 * Never throws and never decides the visitor's outcome: every channel runs in parallel with its own
 * timeout, failures are logged with the channel's name, and the caller bounds the whole fan-out
 * (see `notifyLead`'s `budgetMs`). The lead is already stored before this runs.
 *
 * Endpoints and credentials come only from env — nothing in the lead can choose where a request
 * goes. The visitor's text is sent as plain text (no Telegram parse_mode), so it cannot inject markup.
 */

export interface LeadNotice {
  name: string;
  email?: string;
  phone?: string;
  message?: string;
  project?: string;
  sourceSection?: string;
  /** Epoch ms the lead was received. */
  ts: number;
}

export interface ChannelResult {
  channel: 'telegram' | 'twilio' | 'greenapi' | 'webhook';
  ok: boolean;
  error?: string;
}

const CHANNEL_TIMEOUT_MS = 5000;
/** SMS bills per segment and Hebrew is UCS-2 (70 chars a segment): keep a text ping short. */
const SMS_MAX = 320;
const CHAT_MAX = 3500;

const env = (k: string) => (process.env[k] ?? '').trim();

export function formatLeadTime(ts: number): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

/** The human message every chat channel sends. Pure — exported for the test. */
export function leadNoticeText(lead: LeadNotice, max = CHAT_MAX): string {
  const lines = [
    'ליד חדש מהאתר',
    `שם: ${lead.name}`,
    lead.phone ? `טלפון: ${lead.phone}` : '',
    lead.email ? `אימייל: ${lead.email}` : '',
    `זמן: ${formatLeadTime(lead.ts)}`,
    lead.sourceSection ? `מקור: ${lead.sourceSection}` : '',
    lead.message?.trim() ? `\nהודעה:\n${lead.message.trim()}` : '',
  ].filter(Boolean);
  const text = lines.join('\n');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Which channels the current env switches on. Exported for the test and for diagnostics. */
export function configuredChannels(): ChannelResult['channel'][] {
  const out: ChannelResult['channel'][] = [];
  if (env('TELEGRAM_BOT_TOKEN') && env('TELEGRAM_CHAT_ID')) out.push('telegram');
  if ((env('TWILIO_ACCOUNT_SID') || env('TWILIO_SID')) && env('TWILIO_AUTH_TOKEN') && env('TWILIO_FROM') && env('TWILIO_TO')) {
    out.push('twilio');
  }
  if (env('GREENAPI_INSTANCE_ID') && env('GREENAPI_TOKEN') && env('GREENAPI_CHAT_ID')) out.push('greenapi');
  if (/^https:\/\//i.test(env('NOTIFICATION_WEBHOOK_URL'))) out.push('webhook');
  return out;
}

async function post(url: string, init: RequestInit): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHANNEL_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, method: 'POST', signal: ctrl.signal });
    if (!res.ok) {
      // The body names the problem (bad chat id, unverified Twilio number…) — worth one log line,
      // capped so a provider's HTML error page does not flood the function log.
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

function sendTelegram(lead: LeadNotice): Promise<void> {
  return post(`https://api.telegram.org/bot${env('TELEGRAM_BOT_TOKEN')}/sendMessage`, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env('TELEGRAM_CHAT_ID'), text: leadNoticeText(lead), disable_web_page_preview: true }),
  });
}

function sendTwilio(lead: LeadNotice): Promise<void> {
  const sid = env('TWILIO_ACCOUNT_SID') || env('TWILIO_SID');
  const whatsapp = env('TWILIO_TO').startsWith('whatsapp:');
  const body = new URLSearchParams({
    To: env('TWILIO_TO'),
    From: env('TWILIO_FROM'),
    Body: leadNoticeText(lead, whatsapp ? CHAT_MAX : SMS_MAX),
  });
  return post(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${sid}:${env('TWILIO_AUTH_TOKEN')}`).toString('base64')}`,
    },
    body: body.toString(),
  });
}

function sendGreenApi(lead: LeadNotice): Promise<void> {
  const base = (env('GREENAPI_API_URL') || 'https://api.green-api.com').replace(/\/+$/, '');
  const url = `${base}/waInstance${encodeURIComponent(env('GREENAPI_INSTANCE_ID'))}/sendMessage/${encodeURIComponent(env('GREENAPI_TOKEN'))}`;
  return post(url, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: env('GREENAPI_CHAT_ID'), message: leadNoticeText(lead) }),
  });
}

function sendWebhook(lead: LeadNotice): Promise<void> {
  const secret = env('NOTIFICATION_WEBHOOK_SECRET');
  return post(env('NOTIFICATION_WEBHOOK_URL'), {
    headers: { 'Content-Type': 'application/json', ...(secret ? { 'x-webhook-secret': secret } : {}) },
    body: JSON.stringify({
      event: 'lead.created',
      lead: {
        name: lead.name,
        email: lead.email || '',
        phone: lead.phone || '',
        message: lead.message || '',
        project: lead.project || '',
        sourceSection: lead.sourceSection || '',
        ts: lead.ts,
        time: new Date(lead.ts).toISOString(),
        timeLocal: formatLeadTime(lead.ts),
      },
      // Ready to forward as-is by a scenario that only relays a message.
      text: leadNoticeText(lead),
    }),
  });
}

const SENDERS: Record<ChannelResult['channel'], (lead: LeadNotice) => Promise<void>> = {
  telegram: sendTelegram,
  twilio: sendTwilio,
  greenapi: sendGreenApi,
  webhook: sendWebhook,
};

/**
 * Fan the lead out to every configured channel. Resolves within `budgetMs` no matter what: a
 * channel still running then is reported as timed out (its request keeps going if the runtime lets
 * it). Never rejects.
 */
export async function notifyLead(lead: LeadNotice, budgetMs = CHANNEL_TIMEOUT_MS + 500): Promise<ChannelResult[]> {
  const channels = configuredChannels();
  if (!channels.length) return [];
  const results: ChannelResult[] = channels.map((channel) => ({ channel, ok: false, error: 'timed out' }));
  const runs = channels.map((channel, i) =>
    SENDERS[channel](lead).then(
      () => {
        results[i] = { channel, ok: true };
      },
      (err: unknown) => {
        const error = err instanceof Error ? (err.name === 'AbortError' ? 'timed out' : err.message) : String(err);
        results[i] = { channel, ok: false, error };
        console.warn(`[lead-notify] ${channel} failed: ${error}`);
      },
    ),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled(runs),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, budgetMs);
    }),
  ]);
  clearTimeout(timer);
  // A copy: a channel that finishes after the budget must not rewrite what the caller already read.
  return results.map((r) => ({ ...r }));
}
