// The homepage's inline contact form (2026-10-03): one "phone or email" field, parsed in the browser
// (src/lib/contactField.ts) and accepted by /api/leads with either a phone or an email. Only the
// endpoint's REJECTION paths are exercised — they return before anything is stored; a valid lead
// would write to the live Firebase `leads` list, so the accept path is checked in source instead.
// Run: npx tsx scripts/__tests__/contact-form.test.mjs
import fs from 'node:fs';
import { parseContact } from '../../src/lib/contactField.ts';
import handler from '../../api/leads.ts';

let pass = 0;
let fail = 0;
const t = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  ok ? pass++ : fail++;
};
const show = (v) => JSON.stringify(parseContact(v));

// ── parseContact ────────────────────────────────────────────────────────────────────────────
t('email · lower-cased, no phone', show(' Dana@Mail.CO.IL ') === '{"email":"dana@mail.co.il","phone":""}', show(' Dana@Mail.CO.IL '));
t('email · an @ without a domain is not an email', parseContact('dana@mail') === null);
t('phone · Israeli mobile with dashes', show('050-123-4567') === '{"email":"","phone":"0501234567"}', show('050-123-4567'));
t('phone · landline (9 digits) accepted', parseContact('03-1234567')?.phone === '031234567');
t('phone · international with spaces and brackets', parseContact('+972 (50) 123 4567')?.phone === '+972501234567');
t('phone · too short', parseContact('050-12345') === null);
t('phone · no leading 0 or + is not a phone', parseContact('501234567') === null);
t('garbage · words', parseContact('call me maybe') === null);
t('empty', parseContact('   ') === null);

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
const noName = await post({ name: '', phone: '0501234567' });
t('api · a phone without a name → 400', noName.code === 400, JSON.stringify(noName));

// ── Accept path, in source ──────────────────────────────────────────────────────────────────
const api = fs.readFileSync('api/leads.ts', 'utf8');
t('api · a phone alone satisfies the contact check', /if \(!name \|\| \(!email && !isPhone\(phone\)\)\)/.test(api));
t('api · an unusable email is stored as empty, never as typed', /if \(!isEmail\(lead\.email\)\) lead\.email = ''/.test(api));
t('api · no replyTo when there is no email', /replyTo: email \|\| undefined/.test(api));

// ── Wiring ──────────────────────────────────────────────────────────────────────────────────
const portal = fs.readFileSync('src/components/ContactPortal.tsx', 'utf8');
const form = fs.readFileSync('src/components/ContactInlineForm.tsx', 'utf8');
t('section · renders the inline form, not the modal button', /<ContactInlineForm \/>/.test(portal) && !/open-lead-modal|GlyphButton/.test(portal));
t('form · posts to /api/leads', /fetch\('\/api\/leads'/.test(form));
t('form · every field has a label bound to it', (form.match(/htmlFor=/g) ?? []).length === 3);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
