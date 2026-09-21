import type { SecurityCheckResult } from './types.js';

// --- Prompt-injection detection (run on INPUT before it ever reaches the model, and again on
// OUTPUT in case the model was steered into echoing/obeying an injected instruction) ---------
const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all )?(the )?(previous|prior|above) instructions?/i,
  /disregard (the )?(above|previous|system)/i,
  /you are now/i,
  /new system prompt/i,
  /reveal (your|the) (system )?(prompt|instructions)/i,
  /print (your|the) (system )?(prompt|instructions)/i,
  /act as (if )?(you are )?(a|an) (?!ai assistant)/i,
  /התעלם מ(ה)?הוראות/,
  /שכח את ההוראות/,
  /הצג את הפרומפט/,
  /אתה כעת/,
];

// --- Sensitive-data-leak detection (run on OUTPUT only) --------------------------------------
const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9]{20,}/, // OpenAI-style secret key
  /AIza[A-Za-z0-9_-]{30,}/, // Google API key shape
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/, // PEM private key block
];
const CREDIT_CARD_PATTERN = /\b(?:\d[ -]*?){13,19}\b/;
const OFF_BRAND_CONTACT_PATTERN = /\b0(?:5\d|[23489])[-\s]?\d{7}\b/; // any Israeli phone NOT the sanctioned WhatsApp number
const SANCTIONED_PHONE = '0506473039';

// --- Unverified-claim detection (run on OUTPUT only) ------------------------------------------
// Numeric stat claims already sanctioned elsewhere on the site (aiAgents.ts / PremiumAdvantage /
// ArchitecturePage) — anything OUTSIDE this allowlist gets flagged, not blocked, so a human always
// reviews a fresh number before it goes out.
const ALLOWLISTED_STAT_SUBSTRINGS = ['99.99', '35%', '70%', '68%', '30-70%', '30–70%', '81%', '40%'];
const STAT_CLAIM_PATTERN = /\b\d{1,3}(\.\d+)?%/g;
const SUPERLATIVE_PATTERN = /\b(הכי טוב בעולם|מובטח ב-?100%|הטוב ביותר בשוק|guaranteed results|#1 in the world)\b/i;

export function containsPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(text));
}

/**
 * Runs the full guardrail suite on a piece of generated output. Never throws — a sanitizer that
 * can crash the request it's supposed to be protecting is worse than no sanitizer. `passed: false`
 * means the item must NOT be shown in the queue at all (hard block); a `passed: true` item can
 * still carry `flags` for a human reviewer to weigh before approving.
 */
export function sanitizeOutput(text: string): SecurityCheckResult {
  const flags: string[] = [];

  if (containsPromptInjection(text)) {
    return { passed: false, flags: ['prompt-injection-detected'], badge: '⛔ נחסם — זוהה ניסיון Prompt Injection' };
  }

  if (SECRET_PATTERNS.some((p) => p.test(text))) {
    return { passed: false, flags: ['secret-key-leak'], badge: '⛔ נחסם — זוהה חשד לדליפת מפתח סודי' };
  }

  const digitsOnly = text.replace(/[^0-9]/g, '');
  if (CREDIT_CARD_PATTERN.test(text) && digitsOnly.length >= 13) {
    flags.push('possible-payment-data');
  }

  const phoneMatches = text.match(OFF_BRAND_CONTACT_PATTERN) ?? [];
  if (phoneMatches.some((m) => m.replace(/[-\s]/g, '') !== SANCTIONED_PHONE)) {
    flags.push('unverified-contact-number');
  }

  const statMatches = text.match(STAT_CLAIM_PATTERN) ?? [];
  const unverifiedStats = statMatches.filter((stat) => !ALLOWLISTED_STAT_SUBSTRINGS.some((allowed) => stat.includes(allowed) || allowed.includes(stat)));
  if (unverifiedStats.length > 0) {
    flags.push('unverified-claim');
  }

  if (SUPERLATIVE_PATTERN.test(text)) {
    flags.push('marketing-overreach');
  }

  const badge = flags.length === 0 ? 'AI Guard Verified 🛡️' : `⚠️ אומת עם הערות (${flags.length})`;
  return { passed: true, flags, badge };
}

/** Strips the input side of the same injection patterns before it's ever interpolated into a
 * model prompt — belt-and-suspenders alongside the system-instruction boundary the engine already
 * sets up. Returns the cleaned text plus whether anything was actually stripped. */
export function sanitizeInput(text: string): { clean: string; wasFlagged: boolean } {
  if (!containsPromptInjection(text)) return { clean: text, wasFlagged: false };
  let clean = text;
  for (const pattern of INJECTION_PATTERNS) {
    clean = clean.replace(pattern, '[הוסר: ניסיון הזרקת הוראות]');
  }
  return { clean, wasFlagged: true };
}
