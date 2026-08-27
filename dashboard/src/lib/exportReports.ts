import * as XLSX from 'xlsx';
import type { LeadRecord, TrackedEvent, HealthRecord, EventType } from './types';
import { LEAD_STATUS_LABEL } from './types';

const TYPE_LABEL_HE: Record<EventType, string> = {
  pageview: 'צפייה בדף',
  session_start: 'התחלת סשן',
  conversion: 'המרה',
  click: 'קליק',
  outbound_link: 'קישור חיצוני',
  scroll_depth: 'עומק גלילה',
  hover: 'עניין',
  form_interaction: 'אינטראקציה בטופס',
  chat_open: 'פתיחת צ׳אט AI',
  chat_query: 'שאילתת AI',
  route_change: 'מעבר עמוד',
};

function timestampSuffix(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** Every exported sheet gets a right-to-left grid view (so Excel opens it reading right-to-left,
 * matching the Hebrew headers/content) and explicit column widths — the two things that most
 * commonly make a Hebrew spreadsheet look "broken" (mirrored grid, truncated columns) even when
 * the underlying text encoding itself is fine. SheetJS writes real UTF-8 cell strings natively, so
 * unlike CSV there is no BOM/codepage step needed here for the .xlsx path. */
function rtlSheet(ws: XLSX.WorkSheet, colWidths: number[]) {
  ws['!views'] = [{ rightToLeft: true }];
  ws['!cols'] = colWidths.map((wch) => ({ wch }));
  return ws;
}

function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename, { bookType: 'xlsx' });
}

export function exportLeadsToExcel(leads: (LeadRecord & { id: string })[]) {
  const rows = leads.map((l) => ({
    שם: l.name,
    אימייל: l.email,
    טלפון: l.phone || '',
    פרויקט: l.project || '',
    מקור: l.sourceSection || '',
    סטטוס: LEAD_STATUS_LABEL[l.status ?? 'new'],
    תאריך: new Date(l.ts).toLocaleString('he-IL'),
  }));
  const ws = rtlSheet(XLSX.utils.json_to_sheet(rows), [20, 28, 16, 26, 22, 16, 20]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'לידים');
  downloadWorkbook(wb, `leads-${timestampSuffix()}.xlsx`);
}

/** Plain-CSV alternative to the .xlsx export above — prefixed with a UTF-8 BOM (`﻿`), which is
 * the specific fix for the classic "Hebrew CSV opens as mojibake/reversed gibberish in Excel" bug:
 * without it, Excel guesses the file's system ANSI codepage instead of UTF-8 on open. */
export function exportLeadsToCsv(leads: (LeadRecord & { id: string })[]) {
  const rows = leads.map((l) => ({
    שם: l.name,
    אימייל: l.email,
    טלפון: l.phone || '',
    פרויקט: l.project || '',
    מקור: l.sourceSection || '',
    סטטוס: LEAD_STATUS_LABEL[l.status ?? 'new'],
    תאריך: new Date(l.ts).toLocaleString('he-IL'),
  }));
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows));
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leads-${timestampSuffix()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportMetricsToExcel(events: (TrackedEvent & { id: string })[], health: HealthRecord | null) {
  const wb = XLSX.utils.book_new();

  const countsByType = new Map<string, number>();
  const countsByDevice = new Map<string, number>();
  for (const e of events) {
    countsByType.set(e.type, (countsByType.get(e.type) ?? 0) + 1);
    countsByDevice.set(e.device, (countsByDevice.get(e.device) ?? 0) + 1);
  }

  const summaryRows = Array.from(countsByType.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ 'סוג אירוע': TYPE_LABEL_HE[type as EventType] ?? type, כמות: count }));
  XLSX.utils.book_append_sheet(wb, rtlSheet(XLSX.utils.json_to_sheet(summaryRows), [22, 12]), 'סיכום אירועים');

  const deviceRows = Array.from(countsByDevice.entries()).map(([device, count]) => ({ מכשיר: device, כמות: count }));
  XLSX.utils.book_append_sheet(wb, rtlSheet(XLSX.utils.json_to_sheet(deviceRows), [16, 12]), 'פילוח מכשירים');

  const healthRows = health
    ? [{ 'זמן תגובה (ms)': health.latencyMs, נמדד: new Date(health.ts).toLocaleString('he-IL') }]
    : [{ 'זמן תגובה (ms)': 'אין נתון', נמדד: '—' }];
  XLSX.utils.book_append_sheet(wb, rtlSheet(XLSX.utils.json_to_sheet(healthRows), [18, 22]), 'בריאות מערכת');

  downloadWorkbook(wb, `system-metrics-${timestampSuffix()}.xlsx`);
}
