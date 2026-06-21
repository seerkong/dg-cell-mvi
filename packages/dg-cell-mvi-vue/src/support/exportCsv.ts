/**
 * dg-cell-mvi-vue · support/exportCsv — client-side CSV export of the current table view.
 *
 * Builds a CSV from the resolved table columns (title row) + the current rows (raw cell values) and
 * triggers a browser download. A UTF-8 BOM is prepended so Excel renders Chinese correctly. Lives in
 * the view layer (DOM download is a view concern); the toolbar's `export` button calls it.
 *
 * Column selection is delegated to the agnostic `exportColumns` helper (crud): it flattens header
 * GROUPS (columns with `children`) to their leaf data columns and excludes any column with
 * `exportable === false`. Additive — no `exportable` →
 * included; a flat table behaves exactly as before.
 */
import { exportColumns, type ResolvedTableColumn } from 'dg-cell-mvi-crud';

function escapeCsv(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCsv(
  columns: ResolvedTableColumn[],
  rows: Array<Record<string, any>>,
  filename = 'export.csv',
): void {
  const cols = exportColumns(columns);
  const header = cols.map((c) => escapeCsv(c.title ?? c.key)).join(',');
  const body = rows.map((r) => cols.map((c) => escapeCsv(r?.[c.key])).join(','));
  const csv = [header, ...body].join('\n');

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
