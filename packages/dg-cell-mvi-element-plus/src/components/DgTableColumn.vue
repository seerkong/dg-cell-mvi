<template>
  <!-- header GROUP (multi-level header): an el-table-column wrapping its child columns. el-table
       renders grouped headers by NESTING el-table-column, so a group column owns no cell #default —
       only a label + nested children (which may themselves be groups, recursing arbitrarily deep). -->
  <el-table-column
    v-if="col.children && col.children.length"
    :label="col.title"
    :align="col.align || 'center'"
    :fixed="col.fixed"
  >
    <DgTableColumn
      v-for="child in col.children"
      :key="child.key"
      :col="child"
      :vm="vm"
      :commands="commands"
      :is-editable="isEditable"
    >
      <!-- forward the cell_<key> slots down so a leaf under a group can still be slot-overridden -->
      <template v-for="(_, name) in $slots" #[name]="scope" :key="name">
        <slot :name="name" v-bind="scope" />
      </template>
    </DgTableColumn>
  </el-table-column>

  <!-- LEAF data column: identical rendering to the flat table (prop / cell_<key> slot / DgCell),
       so editable + dict + cellRender all keep working for leaves nested under a group. -->
  <el-table-column
    v-else
    :prop="col.key"
    :label="col.title"
    :width="col.width"
    :align="col.align || 'left'"
    :sortable="col.sortable ? 'custom' : false"
    :fixed="col.fixed"
    :show-overflow-tooltip="!isEditable"
  >
    <template #default="{ row, $index }">
      <slot
        v-if="$slots['cell_' + col.key]"
        :name="'cell_' + col.key"
        :row="row"
        :index="$index"
        :col="col"
        :value="row[col.key]"
      />
      <DgCell
        v-else
        :col="col"
        :row="row"
        :index="$index"
        :dict="vm.dict"
        :editable="vm.table.editable"
        :row-key="vm.table.rowKey"
        :commands="commands"
      />
    </template>
  </el-table-column>
</template>

<script setup lang="ts">
/**
 * dg-cell-mvi-element-plus · DgTableColumn — recursive el-table-column renderer (T7.3 multi-level headers).
 *
 * Renders ONE resolved table column: a header GROUP (column.children present) becomes an
 * el-table-column wrapping recursively-rendered DgTableColumn children (el-table's native nesting is
 * how grouped headers are built); a LEAF renders the same cell content as the flat DgTable path
 * (cell_<key> slot or DgCell), so editing/dict/cellRender are unaffected under a group. The
 * cell_<key> slots are forwarded down through every level so a deeply nested leaf stays overridable.
 */
import type { CrudBinding } from 'dg-cell-mvi-crud';
import type { CrudCommands } from 'dg-cell-mvi-vue';
import DgCell from './DgCell';

type ResolvedColumn = CrudBinding['table']['columns'][number];

defineProps<{
  col: ResolvedColumn;
  vm: CrudBinding;
  commands: CrudCommands;
  /** mirrors DgTable's `isEditable` so leaf cells use the same overflow-tooltip behavior. */
  isEditable: boolean;
}>();
</script>
