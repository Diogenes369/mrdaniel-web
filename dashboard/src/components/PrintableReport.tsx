import type { LeadRecord } from '../lib/types';
import { LEAD_STATUS_LABEL } from '../lib/types';

/**
 * Rendered off-screen at all times; made visible ONLY inside `@media print` (see index.css'
 * `.print-only` / `.dash-root` rules) when `triggerPrint()` opens the browser's native print
 * dialog. This sidesteps PDF-generation libraries (jsPDF etc.) entirely, which is a deliberate
 * choice: those libraries write Latin-shaped glyph runs and have no real bidi/RTL text-shaping
 * engine, so Hebrew routinely comes out reversed or mis-ordered. A real browser's print renderer
 * lays out this actual RTL DOM exactly like it lays out the page itself — the same engine that
 * gets the site's own Hebrew right gets the printed report right, with no separate text pipeline
 * that could disagree with it. The visitor picks "Save as PDF" in that dialog for a PDF file.
 */
export function PrintableLeadsReport({ leads }: { leads: (LeadRecord & { id: string })[] }) {
  return (
    <div className="print-only" dir="rtl">
      <h1>דוח לידים — MR. DANIEL</h1>
      <p className="print-meta">
        הופק בתאריך {new Date().toLocaleString('he-IL')} · סה״כ {leads.length} לידים
      </p>
      <table>
        <thead>
          <tr>
            <th>שם</th>
            <th>אימייל</th>
            <th>טלפון</th>
            <th>פרויקט</th>
            <th>מקור</th>
            <th>סטטוס</th>
            <th>תאריך</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id}>
              <td>{l.name}</td>
              <td>{l.email}</td>
              <td>{l.phone || '—'}</td>
              <td>{l.project || '—'}</td>
              <td>{l.sourceSection || '—'}</td>
              <td>{LEAD_STATUS_LABEL[l.status ?? 'new']}</td>
              <td>{new Date(l.ts).toLocaleString('he-IL')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function triggerPrint() {
  window.print();
}
