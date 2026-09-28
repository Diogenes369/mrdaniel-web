import { CheckCircle2, AlertTriangle, XCircle, ShieldCheck } from 'lucide-react';
import type { DeckVerification } from '../lib/carouselStudioTypes';

/**
 * The server verifier's report (src/server/carouselVerifier.ts), shown above the carousel preview:
 * list coverage, anti-slop, readability, numbers-vs-source and layout variance, plus what it fixed.
 * Informational — the deck is already the verified one; this says what was checked and what still
 * needs a human look (an unverified number, a missing item the repair could not recover).
 */
export default function DeckVerificationPanel({ verification }: { verification: DeckVerification }) {
  const tone = verification.passed ? (verification.score >= 90 ? 'text-brand-400' : 'text-amber-300') : 'text-red-400';
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-4" dir="rtl">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <span className="flex items-center gap-2 text-sm font-bold text-zinc-200">
          <ShieldCheck className={`w-4 h-4 ${tone}`} /> סוכן אימות תוכן ועיצוב
        </span>
        <span className={`text-xs font-mono ${tone}`}>
          {verification.passed ? 'עבר' : 'דורש בדיקה'} · {verification.score}/100
          {verification.coverage ? ` · כיסוי ${verification.coverage.covered}/${verification.coverage.expected}` : ''}
        </span>
      </div>
      <ul className="space-y-1.5">
        {verification.checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-xs">
            {c.status === 'pass' ? (
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-brand-400" />
            ) : c.status === 'warn' ? (
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-300" />
            ) : (
              <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-400" />
            )}
            <span className="text-zinc-300">
              <span className="font-bold text-zinc-200">{c.label}</span> — {c.detail}
            </span>
          </li>
        ))}
      </ul>
      {verification.fixes.length > 0 && (
        <p className="mt-3 text-[11px] text-zinc-500">תוקן אוטומטית: {verification.fixes.join(' · ')}</p>
      )}
    </div>
  );
}
