<template>
  <el-table
    :data="vm.table.rows"
    v-loading="vm.table.loading"
    :row-key="vm.table.rowKey"
    :class="$style.table"
    :highlight-current-row="!!onRowClick"
    :tree-props="vm.table.treeProps || undefined"
    :default-expand-all="vm.table.defaultExpandAll"
    v-bind="vm.table.nativeProps"
    @sort-change="onSortChange"
    @row-click="handleRowClick"
    @selection-change="onSelectionChange"
  >
    <el-table-column
      v-if="vm.table.selection && vm.table.selection.show"
      type="selection"
      :width="vm.table.selection.width"
      reserve-selection
    />
    <el-table-column
      v-if="vm.table.index && vm.table.index.show"
      type="index"
      :label="vm.table.index.label"
      :width="vm.table.index.width"
      :index="indexMethod"
    />
    <el-table-column v-if="$slots.expand" type="expand">
      <template #default="scope">
        <div :class="$style.expand">
          <slot name="expand" v-bind="scope" />
        </div>
      </template>
    </el-table-column>
    <!-- data columns: a recursive renderer so header GROUPS (column.children) nest el-table-column
         while leaf columns render their cell exactly as a flat table. cell_<key> slots forward down. -->
    <DgTableColumn
      v-for="col in vm.table.columns"
      :key="col.key"
      :col="col"
      :vm="vm"
      :commands="commands"
      :is-editable="isEditable"
    >
      <template v-for="(_, name) in $slots" #[name]="scope" :key="name">
        <slot :name="name" v-bind="scope" />
      </template>
    </DgTableColumn>

    <!-- inline-edit action column (contextual save/cancel/edit/remove). This IS the operation column
         in editable mode, so `rowHandle.show: false` suppresses it too (no header, no cells) — the
         editable action column and the rowHandle column are the same 操作 column conceptually. -->
    <el-table-column
      v-if="isEditable && vm.table.editable.showAction && vm.rowHandle.show !== false"
      :label="vm.table.editable.actionLabels.operations"
      :width="170"
      fixed="right"
      align="center"
    >
      <template #default="{ row, $index }">
        <template v-if="isRowEditing(row) && (vm.table.editable.mode === 'row' || isAddRow(row))">
          <el-button
            size="small"
            type="primary"
            :loading="isRowLoading(row)"
            @click="commands.editableSaveRow({ rowId: rowIdOf(row), index: $index })"
          >
            {{ vm.table.editable.actionLabels.save }}
          </el-button>
          <el-button size="small" @click="commands.editableCancelRow({ rowId: rowIdOf(row), index: $index })">
            {{ vm.table.editable.actionLabels.cancel }}
          </el-button>
        </template>
        <template v-else>
          <el-button
            v-if="vm.table.editable.mode === 'row'"
            size="small"
            @click="commands.editableStartRowEdit({ rowId: rowIdOf(row), index: $index })"
          >
            {{ vm.table.editable.actionLabels.edit }}
          </el-button>
          <el-button size="small" type="danger" @click="commands.doRemove({ row, index: $index })">
            {{ vm.table.editable.actionLabels.remove }}
          </el-button>
        </template>
      </template>
    </el-table-column>

    <el-table-column
      v-if="!isEditable && vm.rowHandle && vm.rowHandle.show !== false && vm.rowHandle.buttons.length"
      :label="vm.rowHandle.title"
      :width="vm.rowHandle.width"
      :fixed="vm.rowHandle.fixed"
      align="center"
    >
      <template #default="{ row, $index }">
        <DgRowHandle :vm="vm" :commands="commands" :row="row" :index="$index" />
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CrudBinding } from 'dg-cell-mvi-crud';
import type { CrudCommands } from 'dg-cell-mvi-vue';
import DgTableColumn from './DgTableColumn.vue';
import DgRowHandle from './DgRowHandle.vue';

const props = defineProps<{
  vm: CrudBinding;
  commands: CrudCommands;
  /** Optional master-detail hook: called with the clicked row (enables current-row highlight). */
  onRowClick?: (row: any, index: number) => void;
}>();

const isEditable = computed(() => !!props.vm.table.editable?.enabled);

function rowIdOf(row: any): any {
  return row?.[props.vm.table.rowKey];
}
function rowStateOf(row: any) {
  return props.vm.table.editable?.rowStates?.[String(rowIdOf(row))];
}
function isRowEditing(row: any): boolean {
  const rs = rowStateOf(row);
  return !!rs && Object.values(rs.editing).some(Boolean);
}
function isAddRow(row: any): boolean {
  return !!rowStateOf(row)?.isAdd;
}
function isRowLoading(row: any): boolean {
  return !!rowStateOf(row)?.loading;
}

function onSortChange({ prop, order }: { prop: string; order: string | null }) {
  const o = order === 'ascending' ? 'asc' : order === 'descending' ? 'desc' : null;
  props.commands.setSort({ prop, order: o, asc: o === 'asc', isServerSort: !!o });
}

/** offset-aware row number for the index column (accounts for the current page). */
function indexMethod(i: number): number {
  const { currentPage, pageSize } = props.vm.pagination;
  return (currentPage - 1) * pageSize + i + 1;
}

function onSelectionChange(rows: any[]) {
  props.commands.select(rows.map((r) => r?.[props.vm.table.rowKey]));
}

function handleRowClick(row: any) {
  props.onRowClick?.(row, props.vm.table.rows.indexOf(row));
}
</script>

<style module>
.table {
  width: 100%;
}
.expand {
  padding: 8px 16px 12px 48px;
  background: var(--el-fill-color-lighter, #fafafa);
}
</style>
