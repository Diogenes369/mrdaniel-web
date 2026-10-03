const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * One "phone or email" form field → which one it is (the homepage contact form, 2026-10-03). An `@`
 * makes it an email; anything else must read as a phone once spaces, dashes, dots and brackets are
 * dropped: an Israeli number with its leading 0 (mobile or landline) or an international one. The
 * digit range matches /api/leads' `isPhone` (9–15 digits), so nothing the form accepts is rejected
 * by the server.
 */
export function parseContact(raw: string): { email: string; phone: string } | null {
  const v = raw.trim();
  if (v.includes('@')) return EMAIL_RE.test(v) ? { email: v.toLowerCase(), phone: '' } : null;
  const compact = v.replace(/[\s\-().]/g, '');
  return /^(?:\+\d{9,15}|0\d{8,9})$/.test(compact) ? { email: '', phone: compact } : null;
}
