import { useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Printer, ChevronDown } from 'lucide-react';
import { exportLeadsToExcel, exportLeadsToCsv, exportMetricsToExcel } from '../lib/exportReports';
import { triggerPrint } from './PrintableReport';
import type { LeadRecord, TrackedEvent, HealthRecord } from '../lib/types';

/**
 * Export actions, collapsed into one menu.
 *
 * These were four always-visible buttons ("ייצוא לידים ל-Excel", "…ל-CSV", "ייצוא דוח מערכת",
 * "…ל-PDF") sitting in the header next to the live-status pill, which pushed the header into a
 * second row and crowded the title. They are infrequent actions, so a single trigger with a menu
 * is the right weight — every action is preserved and calls exactly the same function as before.
 */
export default function ExportControls({
  leads,
  events,
  health,
}: {
  leads: (LeadRecord & { id: string })[];
  events: (TrackedEvent & { id: string })[];
  health: HealthRecord | null;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape — a menu that traps focus in a dashboard is worse than
  // the buttons it replaced.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const noLeads = leads.length === 0;

  const items = [
    { label: 'לידים ל-Excel', Icon: FileSpreadsheet, run: () => exportLeadsToExcel(leads), disabled: noLeads },
    { label: 'לידים ל-CSV', Icon: FileText, run: () => exportLeadsToCsv(leads), disabled: noLeads },
    { label: 'דוח מערכת ל-Excel', Icon: FileSpreadsheet, run: () => exportMetricsToExcel(events, health), disabled: false },
    { label: 'לידים ל-PDF (הדפסה)', Icon: Printer, run: triggerPrint, disabled: noLeads },
  ];

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
      >
        <Download className="w-3.5 h-3.5 text-brand-400" />
        ייצוא
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-lg border border-white/10 bg-carbon-900 p-1 shadow-2xl"
        >
          {items.map(({ label, Icon, run, disabled }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={() => {
                run();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-right text-xs font-medium text-zinc-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon className="w-3.5 h-3.5 shrink-0 text-brand-400" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
