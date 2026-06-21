<template>
  <!-- el-table-v2 is virtualized: it needs an explicit width + height. el-auto-resizer supplies the
       width from the parent box; the height comes from container.height (or the `height` prop, default
       400). The resolved column list (vm.table.columns) is SHARED with the standard table — we map it
       into el-table-v2's array-column descriptors (degrading header groups to their leaf columns). -->
  <div :class="$style.virtual" :style="{ height: resolvedHeight }">
    <el-auto-resizer>
      <template #default="{ height, width }">
        <el-table-v2
          :columns="v2Columns"
          :data="vm.table.rows"
          :row-key="vm.table.rowKey"
          :width="width"
          :height="height"
          :sort-by="sortBy"
          @column-sort="onColumnSort"
        />
      </template>
    </el-auto-resizer>
  </div>
</template>

<script setup lang="ts">
/**
 * dg-cell-mvi-element-plus · DgVirtualTable — el-table-v2 (virtual scroll) list renderer (T2.2).
 *
 * Activated by `table.mode === 'virtual'`. el-table-v2's API differs from el-table: it takes a
 * `columns` ARRAY (each `{ key, dataKey, title, width, align, sortable, fixed, cellRenderer }`) +
 * `data` + explicit `width`/`height` (it only renders the visible rows). We map the SHARED resolved
 * column list into those descriptors, honoring the same read-mode cell resolution DgCell uses
 * (cellRender hook → formatter → dict label → plain value) via support/cellResolve.
 *
 * SCOPE / DEGRADATION (per design + findings): virtual mode prioritizes large-data READ + SORT +
 * SELECTION. Capabilities that el-table-v2 cannot express the same way DEGRADE GRACEFULLY and are
 * documented in findings (they do not silently break):
 *  - Multi-level (grouped) headers → FLATTENED to their leaf columns (el-table-v2 has no nested
 *    el-table-column header grouping in this cut).
 *  - Inline editing / expand / per-row action column → not rendered in virtual mode (it is a
 *    large-data read surface; use mode 'table' for editing). cellRender custom cells DO render.
 *  - Selection → a leading checkbox column rendered here (el-table-v2 has no native type="selection"),
 *    wired to the same `commands.select(selectedRowKeys)` the standard table uses.
 */
import { computed, h } from 'vue';
import { ElCheckbox } from 'element-plus';
import type { CrudBinding, ResolvedTableColumn } from 'dg-cell-mvi-crud';
import type { CrudCommands } from 'dg-cell-mvi-vue';
import { resolveCellText } from 'dg-cell-mvi-vue';

const props = defineProps<{
  vm: CrudBinding;
  commands: CrudCommands;
  /** explicit list height (overridden by container.height when set). Default 400px. */
  height?: string | number;
}>();

/** resolve a CSS length: a number → `Npx`, a string passes through. */
function lenOf(v: string | number | undefined, fallback: string): string {
  if (v == null) return fallback;
  return typeof v === 'number' ? `${v}px` : v;
}

/** outer box height: container.height wins, else the `height` prop, else 400px. */
const resolvedHeight = computed(() =>
  lenOf(props.vm.container?.height ?? props.height, '400px'),
);

const rowKey = computed(() => props.vm.table.rowKey);

/** flatten header groups to their leaf columns (virtual mode renders a flat column set). */
function flattenLeaves(cols: ResolvedTableColumn[]): ResolvedTableColumn[] {
  const out: ResolvedTableColumn[] = [];
  for (const c of cols) {
    if (c.children && c.children.length) out.push(...flattenLeaves(c.children));
    else out.push(c);
  }
  return out;
}

const leafColumns = computed<ResolvedTableColumn[]>(() => flattenLeaves(props.vm.table.columns));

/** the set of selected row-key values (for the checkbox column's checked state). */
const selectedSet = computed(() => new Set(props.vm.table.selectedRowKeys));

/** toggle ONE row's selection → re-derive the selected key list and dispatch `select`. */
function toggleRow(row: any, checked: boolean) {
  const id = row?.[rowKey.value];
  const next = new Set(props.vm.table.selectedRowKeys);
  if (checked) next.add(id);
  else next.delete(id);
  props.commands.select(Array.from(next));
}

/** header checkbox: select / clear ALL currently-loaded rows. */
function toggleAll(checked: boolean) {
  props.commands.select(checked ? props.vm.table.rows.map((r: any) => r?.[rowKey.value]) : []);
}

const allChecked = computed(
  () =>
    props.vm.table.rows.length > 0 &&
    props.vm.table.rows.every((r: any) => selectedSet.value.has(r?.[rowKey.value])),
);
const someChecked = computed(
  () => props.vm.table.selectedRowKeys.length > 0 && !allChecked.value,
);

/**
 * Map the shared resolved columns into el-table-v2 Column descriptors. A leading checkbox column is
 * prepended when selection is on. Each data column carries a cellRenderer that honors the SAME read
 * resolution as DgCell: the column.cellRender hook wins; else the resolved text (formatter/dict/plain).
 */
const v2Columns = computed(() => {
  const cols: any[] = [];

  if (props.vm.table.selection && props.vm.table.selection.show) {
    cols.push({
      key: '__selection__',
      width: props.vm.table.selection.width || 48,
      align: 'center',
      cellRenderer: ({ rowData }: any) =>
        h(ElCheckbox, {
          modelValue: selectedSet.value.has(rowData?.[rowKey.value]),
          'onUpdate:modelValue': (v: boolean) => toggleRow(rowData, v),
        }),
      headerCellRenderer: () =>
        h(ElCheckbox, {
          modelValue: allChecked.value,
          indeterminate: someChecked.value,
          'onUpdate:modelValue': (v: boolean) => toggleAll(v),
        }),
    });
  }

  for (const c of leafColumns.value) {
    cols.push({
      key: c.key,
      dataKey: c.key,
      title: c.title,
      // el-table-v2 requires a width per column; fall back to a sensible default when unset.
      width: c.width || 150,
      align: c.align || 'left',
      // el-table-v2 sorting is a per-column boolean; the actual sort dispatch is in @column-sort.
      sortable: !!c.sortable,
      fixed: c.fixed === true || c.fixed === 'left' ? 'left' : c.fixed === 'right' ? 'right' : undefined,
      cellRenderer: ({ rowData, rowIndex }: any) => {
        const render = (c as any).cellRender as ((scope: any) => any) | undefined;
        if (typeof render === 'function') {
          return render({ row: rowData, index: rowIndex, value: rowData?.[c.key], key: c.key });
        }
        return h('span', resolveCellText(c, rowData, rowIndex, props.vm.dict));
      },
    });
  }
  return cols;
});

/** el-table-v2 sort state is a single `{ key, order }` ('asc'|'desc') — derive it from vm.table.sort. */
const sortBy = computed(() => {
  const s = props.vm.table.sort;
  if (!s?.prop || !s?.order) return undefined;
  return { key: s.prop, order: s.order === 'desc' ? 'desc' : 'asc' };
});

/** el-table-v2 @column-sort → map onto the same setSort command the standard table uses. */
function onColumnSort({ key, order }: { key: any; order: 'asc' | 'desc' }) {
  const o = order === 'desc' ? 'desc' : 'asc';
  props.commands.setSort({ prop: String(key), order: o, asc: o === 'asc', isServerSort: true });
}
</script>

<style module>
.virtual {
  width: 100%;
}
</style>
