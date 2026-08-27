const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyad2gOc98iiJB5VfGUcjEhYE9McMbBfezYL-6fnM-lW71z1Cz-VsBkoO5HYhqSIkg/exec';

interface LeadWebhookInput {
  name: string;
  email: string;
  phone: string;
  message: string;
  sourceSection?: string;
  inquiryTopic?: string;
}

/**
 * Fires the lead payload at the Google Apps Script webhook as a second, independent delivery
 * path alongside `/api/leads` — a lead still has a chance to land if our own server/SMTP is
 * briefly down. Deliberately fire-and-forget: callers should never await this on the critical
 * path or let it gate the success/error UI, which stays driven by `/api/leads` (the one response
 * we can actually read).
 *
 * Sent as `application/x-www-form-urlencoded` (a `URLSearchParams` body, not JSON) — this is a
 * CORS "simple request" Content-Type, and it's what Apps Script's `doPost(e)` naturally expects
 * on `e.parameter`. Combined with `mode: 'no-cors'`, the response is always opaque by design (Apps
 * Script doesn't return CORS headers a cross-origin `fetch` could read), so only a genuine network
 * failure (caught below) is observable here.
 */
export function sendLeadWebhook(data: LeadWebhookInput): void {
  const params = new URLSearchParams();
  params.append('name', data.name || '');
  params.append('email', data.email || '');
  params.append('phone', data.phone || '');
  params.append('message', data.message || '');
  params.append('sourceSection', data.sourceSection || '');
  params.append('inquiryTopic', data.inquiryTopic || '');
  params.append('timestamp', new Date().toISOString());

  fetch(WEBHOOK_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  }).catch((err) => {
    console.error('Lead webhook error (non-blocking):', err);
  });
}
