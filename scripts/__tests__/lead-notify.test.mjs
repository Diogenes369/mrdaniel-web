// Instant lead notifications (2026-10-03): src/server/leadNotify.ts against a mocked `fetch`, so no
// request leaves the machine. Checks each channel's request shape, that an unconfigured env sends
// nothing, and that a failing or hanging channel can neither throw nor hold the caller past budget.
// Run: npx tsx scripts/__tests__/lead-notify.test.mjs
import fs from 'node:fs';
import { notifyLead, configuredChannels, leadNoticeText } from '../../src/server/leadNotify.ts';

let pass = 0;
let fail = 0;
const t = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  ok ? pass++ : fail++;
};

const KEYS = [
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TWILIO_ACCOUNT_SID', 'TWILIO_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM',
  'TWILIO_TO', 'GREENAPI_INSTANCE_ID', 'GREENAPI_TOKEN', 'GREENAPI_CHAT_ID', 'GREENAPI_API_URL',
  'NOTIFICATION_WEBHOOK_URL', 'NOTIFICATION_WEBHOOK_SECRET',
];
const setEnv = (vars) => {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, vars);
};

let calls = [];
let respond = () => new Response('{"ok":true}', { status: 200 });
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  return respond(String(url), init);
};

const lead = {
  name: 'דנה כהן',
  phone: '0501234567',
  email: '',
  message: 'מענה ללקוחות בוואטסאפ <b>bold</b>',
  project: 'יצירת קשר',
  sourceSection: 'Contact Inline Form',
  ts: Date.parse('2026-10-03T18:14:00Z'),
};

// ── Message text ────────────────────────────────────────────────────────────────────────────
const text = leadNoticeText(lead);
t('text · name, phone, Israel-time timestamp, source and message', text.includes('שם: דנה כהן') && text.includes('טלפון: 0501234567') && text.includes('21:14') && text.includes('03.10.2026') && text.includes('מקור: Contact Inline Form') && text.includes('מענה ללקוחות'), text);
t('text · an absent email gets no line', !text.includes('אימייל'));
t('text · capped with an ellipsis', leadNoticeText({ ...lead, message: 'א'.repeat(1000) }, 120).length === 120);

// ── Unconfigured: nothing goes out ──────────────────────────────────────────────────────────
setEnv({});
calls = [];
t('env · no channel configured', configuredChannels().length === 0);
t('env · notifyLead sends nothing and returns []', (await notifyLead(lead)).length === 0 && calls.length === 0);
setEnv({ TELEGRAM_BOT_TOKEN: 'x' });
t('env · a half-configured channel stays off', configuredChannels().length === 0);
setEnv({ NOTIFICATION_WEBHOOK_URL: 'http://plain-http.example' });
t('env · a non-https webhook stays off', configuredChannels().length === 0);

// ── All four channels ───────────────────────────────────────────────────────────────────────
setEnv({
  TELEGRAM_BOT_TOKEN: '123:abc',
  TELEGRAM_CHAT_ID: '42',
  TWILIO_SID: 'AC1',
  TWILIO_AUTH_TOKEN: 'tok',
  TWILIO_FROM: '+15550001111',
  TWILIO_TO: '+972501112222',
  GREENAPI_INSTANCE_ID: '7103',
  GREENAPI_TOKEN: 'gtok',
  GREENAPI_CHAT_ID: '972501112222@c.us',
  NOTIFICATION_WEBHOOK_URL: 'https://hook.example/lead',
  NOTIFICATION_WEBHOOK_SECRET: 's3cret',
});
calls = [];
const all = await notifyLead(lead);
t('all · four channels, all ok', all.length === 4 && all.every((r) => r.ok), JSON.stringify(all));
const by = (frag) => calls.find((c) => c.url.includes(frag));

const tg = by('api.telegram.org');
const tgBody = JSON.parse(tg?.init.body ?? '{}');
t('telegram · bot URL + chat id, plain text (no parse_mode)', tg?.url === 'https://api.telegram.org/bot123:abc/sendMessage' && tgBody.chat_id === '42' && !('parse_mode' in tgBody) && tgBody.text.includes('<b>bold</b>'));

const tw = by('api.twilio.com');
const twBody = new URLSearchParams(tw?.init.body ?? '');
t('twilio · TWILIO_SID alias, basic auth, form-encoded To/From/Body', tw?.url.includes('/Accounts/AC1/Messages.json') && tw.init.headers.Authorization === `Basic ${Buffer.from('AC1:tok').toString('base64')}` && twBody.get('To') === '+972501112222' && twBody.get('From') === '+15550001111');
t('twilio · SMS body capped for segments', (twBody.get('Body') ?? '').length <= 320);

const ga = by('green-api.com');
t('greenapi · default host, instance + token in path, chatId + message', ga?.url === 'https://api.green-api.com/waInstance7103/sendMessage/gtok' && JSON.parse(ga.init.body).chatId === '972501112222@c.us');

const wh = by('hook.example');
const whBody = JSON.parse(wh?.init.body ?? '{}');
t('webhook · secret header + lead payload + ready text', wh?.init.headers['x-webhook-secret'] === 's3cret' && whBody.event === 'lead.created' && whBody.lead.name === 'דנה כהן' && whBody.lead.phone === '0501234567' && whBody.lead.time === '2026-10-03T18:14:00.000Z' && typeof whBody.text === 'string');

// ── Twilio WhatsApp ─────────────────────────────────────────────────────────────────────────
setEnv({ TWILIO_ACCOUNT_SID: 'AC2', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM: 'whatsapp:+14155238886', TWILIO_TO: 'whatsapp:+972501112222' });
calls = [];
await notifyLead({ ...lead, message: 'א'.repeat(600) });
t('twilio whatsapp · whatsapp: numbers pass through, no SMS cap', new URLSearchParams(calls[0]?.init.body).get('To') === 'whatsapp:+972501112222' && new URLSearchParams(calls[0]?.init.body).get('Body').length > 320);

// ── Failure isolation ───────────────────────────────────────────────────────────────────────
setEnv({ TELEGRAM_BOT_TOKEN: '1:a', TELEGRAM_CHAT_ID: '1', NOTIFICATION_WEBHOOK_URL: 'https://hook.example/x' });
respond = (url) => (url.includes('telegram') ? new Response('chat not found', { status: 400 }) : new Response('ok'));
const warn = console.warn;
console.warn = () => {};
const mixed = await notifyLead(lead);
t('failure · one channel failing does not stop the other', mixed.find((r) => r.channel === 'webhook')?.ok === true && mixed.find((r) => r.channel === 'telegram')?.ok === false);
t('failure · the provider error is reported (status + body)', /HTTP 400: chat not found/.test(mixed.find((r) => r.channel === 'telegram')?.error ?? ''));

respond = () => {
  throw new TypeError('fetch failed');
};
const thrown = await notifyLead(lead).then((r) => r, () => 'rejected');
t('failure · a network error never rejects', Array.isArray(thrown) && thrown.every((r) => !r.ok));

respond = () => new Promise(() => {}); // never answers
const t0 = Date.now();
const hung = await notifyLead(lead, 300);
const took = Date.now() - t0;
t('failure · a hanging channel is cut off at the caller budget', took < 1500 && hung.every((r) => r.error === 'timed out'), `${took}ms`);
console.warn = warn;

// ── Wiring in the endpoint ──────────────────────────────────────────────────────────────────
const api = fs.readFileSync('api/leads.ts', 'utf8');
const site = api.slice(api.indexOf('// ---- Site lead'), api.indexOf('// ---- ManyChat ---'));
t('api · started before the store (runs in parallel with it)', site.indexOf('notifyLead(') > -1 && site.indexOf('notifyLead(') < site.indexOf('pushSiteLead('));
t('api · only after validation (a rejected lead pings no one)', site.indexOf("'missing name/contact'") < site.indexOf('notifyLead('));
t('api · awaited before every success response (Vercel freezes after res)', (site.match(/await notifying|await delivered\(\)/g) ?? []).length >= 3);
t('api · still 12 serverless functions', fs.readdirSync('api').filter((f) => /\.(ts|js)$/.test(f)).length === 12);
t('env · every variable documented in .env.example', KEYS.filter((k) => k !== 'TWILIO_SID').every((k) => fs.readFileSync('.env.example', 'utf8').includes(k)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
