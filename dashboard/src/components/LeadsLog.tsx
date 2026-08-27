import { UserPlus, Mail } from 'lucide-react';
import type { LeadRecord, NewsletterSignupRecord } from '../lib/types';

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function LeadsLog({ leads }: { leads: (LeadRecord & { id: string })[] }) {
  return (
    <div className="dash-card p-6">
      <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
        <UserPlus className="w-3.5 h-3.5" />
        לידים שנקלטו ({leads.length})
      </div>

      {leads.length === 0 ? (
        <p className="text-zinc-500 text-sm text-center py-10">
          אין עדיין לידים רשומים — ודאו שכלל ה-`leads` נוסף לחוקי ה-Realtime Database (ראו README).
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 text-[11px] uppercase tracking-wide border-b border-white/10">
                <th className="text-right font-medium pb-2 pr-2">שם</th>
                <th className="text-right font-medium pb-2">אימייל</th>
                <th className="text-right font-medium pb-2">טלפון</th>
                <th className="text-right font-medium pb-2">פרויקט</th>
                <th className="text-right font-medium pb-2">מקור</th>
                <th className="text-right font-medium pb-2">זמן</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-white/5 text-zinc-300">
                  <td className="py-2 pr-2 font-medium text-white">{lead.name}</td>
                  <td className="py-2 text-zinc-400" dir="ltr">
                    {lead.email}
                  </td>
                  <td className="py-2 text-zinc-400" dir="ltr">
                    {lead.phone || '—'}
                  </td>
                  <td className="py-2 text-zinc-400">{lead.project || '—'}</td>
                  <td className="py-2 text-zinc-400">{lead.sourceSection || '—'}</td>
                  <td className="py-2 text-zinc-500 font-mono" dir="ltr">
                    {timeLabel(lead.ts)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function NewsletterLog({ signups }: { signups: (NewsletterSignupRecord & { id: string })[] }) {
  return (
    <div className="dash-card p-6">
      <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
        <Mail className="w-3.5 h-3.5" />
        נרשמים לניוזלטר ({signups.length})
      </div>

      {signups.length === 0 ? (
        <p className="text-zinc-500 text-sm text-center py-10">אין עדיין נרשמים.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 text-[11px] uppercase tracking-wide border-b border-white/10">
                <th className="text-right font-medium pb-2 pr-2">אימייל</th>
                <th className="text-right font-medium pb-2">מקור</th>
                <th className="text-right font-medium pb-2">זמן</th>
              </tr>
            </thead>
            <tbody>
              {signups.map((s) => (
                <tr key={s.id} className="border-b border-white/5 text-zinc-300">
                  <td className="py-2 pr-2 font-medium text-white" dir="ltr">
                    {s.email}
                  </td>
                  <td className="py-2 text-zinc-400">{s.source}</td>
                  <td className="py-2 text-zinc-500 font-mono" dir="ltr">
                    {timeLabel(s.ts)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
