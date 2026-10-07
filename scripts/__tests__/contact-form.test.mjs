// The site's contact paths and the agents' answer by email (2026-10-07).
//
// The homepage's inline form takes an email (it used to take "phone or email"), every site lead gets
// an automatic reply in its inbox, and the agent quiz sends its recommendation by email in place of
// the old WhatsApp handoff. Only the endpoint's REJECTION paths are exercised — they return before
// anything is stored or mailed; a valid lead would write to the live Firebase `leads` list and send
// a real email, so the accept paths are checked in source instead.
//
// The last section is the owner's privacy rule: no phone number and no WhatsApp contact link in
// anything the site or the dashboard ships. It scans for the SHAPE of a number, so this file never
// has to contain the real one.
// Run: npx tsx scripts/__tests__/contact-form.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import handler from '../../api/leads.ts';
import { greetingName, leadReplyEmail, agentRecommendationEmail } from '../../src/server/emailEngine.ts';

let pass = 0;
let fail = 0;
const t = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  ok ? pass++ : fail++;
};

// ── /api/leads rejection paths ──────────────────────────────────────────────────────────────
async function post(body) {
  let code = 0;
  let json = null;
  const res = {
    setHeader() {},
    status(c) { code = c; return this; },
    json(j) { json = j; return this; },
    end() { return this; },
  };
  await handler({ method: 'POST', headers: {}, body }, res);
  return { code, json };
}
const noContact = await post({ name: 'דנה', email: 'not-an-email', phone: '12' });
t('api · no usable email and no usable phone → 400', noContact.code === 400 && noContact.json?.error === 'missing name/contact', JSON.stringify(noContact));
const noName = await post({ name: '', email: 'dana@mail.co.il' });
t('api · an email without a name → 400', noName.code === 400, JSON.stringify(noName));
const quizNoEmail = await post({ action: 'qualification-email', email: 'dana@mail', agentId: 'agent-sales-autopilot' });
t('api · quiz email: an invalid address → 400', quizNoEmail.code === 400 && quizNoEmail.json?.error === 'invalid email', JSON.stringify(quizNoEmail));
const quizBadAgent = await post({ action: 'qualification-email', email: 'dana@mail.co.il', agentId: 'agent-<script>' });
t('api · quiz email: an unknown agent id → 400', quizBadAgent.code === 400 && quizBadAgent.json?.error === 'unknown agent', JSON.stringify(quizBadAgent));

// ── Accept paths, in source ─────────────────────────────────────────────────────────────────
const api = fs.readFileSync('api/leads.ts', 'utf8');
t('api · an unusable email is stored as empty, never as typed', /if \(!isEmail\(lead\.email\)\) lead\.email = ''/.test(api));
t('api · no replyTo on the owner email when there is no address', /replyTo: email \|\| undefined/.test(api));
t('api · every lead with an address gets the reply email', /const reply = leadReplyEmail\(name\);/.test(api) && /if \(isEmail\(email\) && isEmailConfigured\(\)\)/.test(api));
t('api · every reply to a visitor sets the public address as Reply-To (lead, quiz, chat)', (api.match(/replyTo: CONTACT_ADDRESS/g) ?? []).length === 3);
t('api · the quiz agent is resolved from AI_AGENTS by id, never from the body', /AI_AGENTS\.find\(\(a\) => a\.id === formText\(body\.agentId, 80\)\)/.test(api) && !/body\.agentName|body\.tagline/.test(api));
t('api · the owner fallback inbox is the public address', /LEAD_EMAIL_TO = process\.env\.LEAD_EMAIL_TO \|\| CONTACT_ADDRESS/.test(api));

// ── The reply emails ────────────────────────────────────────────────────────────────────────
t('greeting · a first name is kept', greetingName('דנה כהן') === 'דנה');
t('greeting · a link is dropped', greetingName('www.spam.example') === '' && greetingName('http://x.y') === '' && greetingName('buy.cheap.com') === '');
t('greeting · an address or a number is dropped', greetingName('a@b.co') === '' && greetingName('0501234567') === '');
t('greeting · an overlong word is dropped', greetingName('א'.repeat(30)) === '');
const reply = leadReplyEmail('<b>דנה');
t('reply · greets safely and says the answer comes by email', !reply.html.includes('<b>') && reply.html.includes('שלום,') && reply.html.includes('במייל הזה'));
t('reply · Hebrew, RTL shell', reply.html.includes('dir="rtl"') && reply.subject === 'קיבלתי את הפנייה שלכם');
t('reply · a reply footer, not the newsletter one', reply.html.includes('בתשובה לפנייה שלכם') && !reply.html.includes('נרשמת לעדכונים') && !reply.html.includes('unsubscribe'));
const rec = agentRecommendationEmail('דנה', { name: 'סוכן בדיקה', tagline: 'תיאור', coreCapability: 'יכולת', benefit: 'תועלת', price: 4800 });
t('recommendation · names the agent, its price, and says to reply', rec.subject === 'ההמלצה שלכם: סוכן בדיקה' && rec.html.includes('₪4,800') && rec.html.includes('משיבים למייל הזה') && rec.html.includes('שלום דנה,'));

// ── Wiring ──────────────────────────────────────────────────────────────────────────────────
const portal = fs.readFileSync('src/components/ContactPortal.tsx', 'utf8');
const form = fs.readFileSync('src/components/ContactInlineForm.tsx', 'utf8');
const quiz = fs.readFileSync('src/components/AgentQualificationModal.tsx', 'utf8');
const leadForm = fs.readFileSync('src/components/LeadForm.tsx', 'utf8');
t('section · renders the inline form, not the modal button', /<ContactInlineForm \/>/.test(portal) && !/open-lead-modal|GlyphButton/.test(portal));
t('form · posts to /api/leads', /fetch\('\/api\/leads'/.test(form));
t('form · every field has a label bound to it', (form.match(/htmlFor=/g) ?? []).length === 3);
t('form · the contact field is an email field', /type="email"/.test(form) && !/type="tel"/.test(form));
t('quiz · sends its recommendation by email', /action: 'qualification-email'/.test(quiz) && /agentId: result\.id/.test(quiz));
t('lead form · the phone is optional', /f\.phone\.trim\(\) === '' \|\| isValidPhone\(f\.phone\)/.test(leadForm));

// ── Privacy: no phone number, no WhatsApp contact link ──────────────────────────────────────
// Everything the site and the dashboard ship, plus the bridge and the env examples. A WhatsApp link
// WITHOUT a number (share a news item, hand a draft off and pick the chat) names nobody and is fine.
const ROOTS = ['src', 'api', 'dashboard/src', 'public', 'whatsapp-server', 'index.html', 'server.ts', '.env.example', 'dashboard/index.html'];
const SKIP_DIRS = new Set(['node_modules', 'auth_session', 'archive', 'dist']);
const TEXT = /\.(tsx?|mjs|cjs|js|json|html|css|md|txt|xml|example|env)$/i;
const files = [];
const walk = (p) => {
  if (!fs.existsSync(p)) return;
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(p)) if (!SKIP_DIRS.has(name) && name !== '.env') walk(path.join(p, name));
  } else if (TEXT.test(p) || p.endsWith('.env.example')) files.push(p);
};
ROOTS.forEach(walk);
// An international mobile written as digits (9725…), a wa.me link that carries a number, and an
// Israeli mobile written locally. The example values every form placeholder uses end in 1234567.
const NUMBER_SHAPES = [/9725\d{8}/, /wa\.me\/\+?\d/, /\b05\d[-\s]?\d{3}[-\s]?\d{4}\b/];
const offenders = [];
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const hit = NUMBER_SHAPES.some((re) => {
      const m = line.match(re);
      return m && !/1234567$/.test(m[0].replace(/[-\s]/g, ''));
    });
    if (hit) offenders.push(`${f}:${i + 1}`);
  });
}
t(`privacy · no phone number or numbered WhatsApp link in ${files.length} shipped files`, offenders.length === 0, offenders.join(', '));
const social = fs.readFileSync('src/components/SocialLinks.tsx', 'utf8');
t('privacy · the social bar has no WhatsApp channel', !/'whatsapp'/.test(social) && !/buildWhatsAppUrl/.test(social));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
