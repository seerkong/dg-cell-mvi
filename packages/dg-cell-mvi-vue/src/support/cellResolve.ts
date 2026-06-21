/**
 * dg-cell-mvi-vue · support/cellResolve — shared read-mode cell resolution.
 *
 * The single source of truth for turning a resolved table column + a row into its DISPLAY value:
 *   per-row sync compute → custom formatter → dict value→label(s) → plain String(value).
 *
 * Extracted from DgCell (which still owns the inline-edit / cellRender / click-to-edit paths) so the
 * alternative list renderers (DgVirtualTable's el-table-v2 cellRenderer, DgCardList's label–value
 * body) resolve cells IDENTICALLY to the standard el-table cell. DgCell delegates its read-mode text
 * here, so there is no drift between modes.
 */
import { getNodesFromDataMap, resolveCompute, type DictSlice, type ResolvedTableColumn } from 'dg-cell-mvi-crud';

/**
 * Per-row sync-compute resolution of a column's props (scope = { row, index, value }). The projector
 * passes compute markers through untouched (they can only be evaluated with a row in hand); this
 * substitutes each ComputeValue with its result so callers read resolved `show`/`formatter`/`dict`.
 */
export function resolveCellProps(
  col: ResolvedTableColumn,
  row: Record<string, any>,
  index: number,
): Record<string, any> {
  return resolveCompute(col.props as Record<string, any>, {
    row,
    index,
    value: row?.[col.key],
  });
}

/**
 * The read-mode DISPLAY text for a cell (formatter → dict label(s) → plain value). `cprops` is the
 * already-compute-resolved column props (pass the output of resolveCellProps to avoid resolving
 * twice). Mirrors DgCell's `text` computed exactly — array dict cells join their labels, a
 * `labelBuilder` overrides node[label], a custom `formatter` wins over everything.
 */
export function resolveCellText(
  col: ResolvedTableColumn,
  row: Record<string, any>,
  index: number,
  dict: DictSlice,
  cprops?: Record<string, any>,
): string {
  const props = cprops ?? resolveCellProps(col, row, index);
  const value = row?.[col.key];

  // Custom formatter wins (e.g. an array column showing "N 条").
  const formatter = (props as any)?.formatter;
  if (typeof formatter === 'function') {
    const out = formatter({ row, value, index, key: col.key });
    return out == null ? '' : String(out);
  }

  // Dict-backed column → resolve value(s) to label(s). The dict state key may be a shared id.
  const hasDict = props?.dict != null;
  const dictId = (props as any)?.dictId ?? col.key;
  const entry = dict?.[dictId];
  if (hasDict && entry?.dataMap && typeof getNodesFromDataMap === 'function') {
    const labelKey: string = props?.dict?.label ?? 'label';
    const valueKey: string = props?.dict?.value ?? 'value';
    const labelBuilder = props?.dict?.labelBuilder as ((item: any) => string) | undefined;
    const nodes = getNodesFromDataMap(entry.dataMap, value) ?? [];
    const labels = nodes.map((n: any) =>
      typeof labelBuilder === 'function'
        ? labelBuilder(n) ?? n?.[valueKey] ?? ''
        : n?.[labelKey] ?? n?.[valueKey] ?? '',
    );
    return labels.join(', ');
  }

  if (value == null) return '';
  return String(value);
}
