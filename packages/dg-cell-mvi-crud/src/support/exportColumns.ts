/**
 * dg-cell-mvi-crud · support/exportColumns — the export column-selection helper (agnostic).
 *
 * Picks which columns participate in a CSV/data export from the projected table columns (port of
 * the reference crud's `column.exportable` gate). Pure + framework-agnostic — the actual DOM download lives in
 * the Vue layer (support/exportCsv); this only decides the column SET so the rule has one home and is
 * unit-testable in the crud package.
 *
 * Rules:
 *   - flatten header GROUPS (columns with `children`) to their LEAF data columns — a group header is
 *     not a data column, so only its leaves carry values to export;
 *   - a leaf is included only when it has a `key` (a real data column) AND `exportable !== false`
 *     (default true → included; explicit `exportable: false` → excluded);
 *   - leaf order follows the table's left-to-right order (depth-first over groups).
 */
import type { ResolvedTableColumn } from '../logic/projectors';

export function exportColumns(columns: ResolvedTableColumn[]): ResolvedTableColumn[] {
  const out: ResolvedTableColumn[] = [];
  const walk = (cols: ResolvedTableColumn[]): void => {
    for (const c of cols) {
      if (c.children && c.children.length) {
        // a header group is not a data column — descend to its leaves.
        walk(c.children);
        continue;
      }
      // a leaf data column: include when it has a key and is not explicitly non-exportable.
      if (c.key && c.exportable !== false) out.push(c);
    }
  };
  walk(columns);
  return out;
}
