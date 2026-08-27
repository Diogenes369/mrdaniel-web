import { FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { exportLeadsToExcel, exportLeadsToCsv, exportMetricsToExcel } from '../lib/exportReports';
import { triggerPrint } from './PrintableReport';
import type { LeadRecord, TrackedEvent, HealthRecord } from '../lib/types';

export default function ExportControls({
  leads,
  events,
  health,
}: {
  leads: (LeadRecord & { id: string })[];
  events: (TrackedEvent & { id: string })[];
  health: HealthRecord | null;
}) {
  const buttonClass =
    'flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10 border border-white/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => exportLeadsToExcel(leads)} disabled={leads.length === 0} className={buttonClass}>
        <FileSpreadsheet className="w-3.5 h-3.5 text-brand-400" />
        ייצוא לידים ל-Excel
      </button>
      <button type="button" onClick={() => exportLeadsToCsv(leads)} disabled={leads.length === 0} className={buttonClass}>
        <FileText className="w-3.5 h-3.5 text-brand-400" />
        ייצוא לידים ל-CSV
      </button>
      <button type="button" onClick={() => exportMetricsToExcel(events, health)} className={buttonClass}>
        <FileSpreadsheet className="w-3.5 h-3.5 text-brand-400" />
        ייצוא דוח מערכת ל-Excel
      </button>
      <button type="button" onClick={triggerPrint} disabled={leads.length === 0} className={buttonClass}>
        <Printer className="w-3.5 h-3.5 text-brand-400" />
        ייצוא לידים ל-PDF (הדפסה)
      </button>
    </div>
  );
}
