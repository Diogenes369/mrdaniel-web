/**
 * Accepts either E.164 international format (`+<country><number>`, 8-15 digits after the `+`)
 * or a local Israeli mobile number (`05XXXXXXXX`, 10 digits). Spaces/dashes are stripped before
 * testing so `050-123-4567` and `+972 50 123 4567` both validate.
 */
export function isValidPhone(raw: string): boolean {
  const v = raw.trim().replace(/[\s-]/g, '');
  return /^\+\d{8,15}$/.test(v) || /^05\d{8}$/.test(v);
}
