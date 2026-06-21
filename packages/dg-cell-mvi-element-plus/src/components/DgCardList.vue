<template>
  <!-- card-grid list renderer (table.mode === 'card'): each row → one el-card in a responsive
       el-row/el-col grid. Title = the first data column's value; body = a label–value list of the
       remaining columns (rendered via DgCell, so cellRender/formatter/dict all apply); footer = the
       row actions (DgRowHandle). Driven by the SHARED vm.table.columns + vm.rowHandle. -->
  <div v-loading="vm.table.loading" :class="$style.cardList">
    <el-empty v-if="!vm.table.rows.length" description="暂无数据" />
    <el-row v-else :gutter="16">
      <el-col
        v-for="(row, index) in vm.table.rows"
        :key="row?.[vm.table.rowKey] ?? index"
        :xs="24"
        :sm="12"
        :md="8"
        :lg="6"
      >
        <el-card :class="$style.card" shadow="hover">
          <template #header>
            <div :class="$style.cardHeader">
              <el-checkbox
                v-if="vm.table.selection && vm.table.selection.show"
                :model-value="isSelected(row)"
                @update:model-value="(v: boolean) => toggleRow(row, v)"
              />
              <span :class="$style.cardTitle">{{ titleOf(row, index) }}</span>
            </div>
          </template>

          <div :class="$style.cardBody">
            <div v-for="col in bodyColumns" :key="col.key" :class="$style.field">
              <span :class="$style.label">{{ col.title }}</span>
              <span :class="$style.value">
                <slot
                  v-if="$slots['cell_' + col.key]"
                  :name="'cell_' + col.key"
                  :row="row"
                  :index="index"
                  :col="col"
                  :value="row[col.key]"
                />
                <DgCell
                  v-else
                  :col="col"
                  :row="row"
                  :index="index"
                  :dict="vm.dict"
                  :row-key="vm.table.rowKey"
                />
              </span>
            </div>
          </div>

          <template
            v-if="vm.rowHandle && vm.rowHandle.show !== false && vm.rowHandle.buttons.length"
            #footer
          >
            <div :class="$style.cardFooter">
              <DgRowHandle :vm="vm" :commands="commands" :row="row" :index="index" />
            </div>
          </template>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
/**
 * dg-cell-mvi-element-plus · DgCardList — card-grid list renderer (T2.2).
 *
 * Activated by `table.mode === 'card'`. Renders each row as an el-card in a responsive el-row/el-col
 * grid. The card maps the SHARED resolved column list:
 *  - title  = the first data column's resolved value (formatter/dict via support/cellResolve);
 *  - body   = a label–value list of the remaining columns, each rendered through DgCell (so
 *             cellRender hooks / dict labels / formatters all apply exactly as in the table) — or a
 *             `cell_<key>` slot override when provided;
 *  - footer = the row actions (DgRowHandle with this row/index — view/edit/remove + dropdown/group).
 *
 * Header groups are flattened to their leaf columns. Pagination + row actions are preserved (the
 * footer reuses DgRowHandle; DgCrud still renders DgPagination below). A leading checkbox keeps
 * selection working (same commands.select path as the table).
 */
import { computed } from 'vue';
import type { CrudBinding, ResolvedTableColumn } from 'dg-cell-mvi-crud';
import type { CrudCommands } from 'dg-cell-mvi-vue';
import { resolveCellText } from 'dg-cell-mvi-vue';
import DgCell from './DgCell';
import DgRowHandle from './DgRowHandle.vue';

const props = defineProps<{
  vm: CrudBinding;
  commands: CrudCommands;
}>();

/** flatten header groups to their leaf columns (cards show a flat field list). */
function flattenLeaves(cols: ResolvedTableColumn[]): ResolvedTableColumn[] {
  const out: ResolvedTableColumn[] = [];
  for (const c of cols) {
    if (c.children && c.children.length) out.push(...flattenLeaves(c.children));
    else out.push(c);
  }
  return out;
}

const leafColumns = computed<ResolvedTableColumn[]>(() => flattenLeaves(props.vm.table.columns));
/** the first data column is the card title; the rest are the label–value body. */
const titleColumn = computed<ResolvedTableColumn | undefined>(() => leafColumns.value[0]);
const bodyColumns = computed<ResolvedTableColumn[]>(() => leafColumns.value.slice(1));

/** the card title: the first column's resolved display value (same resolution as a table cell). */
function titleOf(row: any, index: number): string {
  const col = titleColumn.value;
  if (!col) return '';
  return resolveCellText(col, row, index, props.vm.dict) || '—';
}

// ---- selection (parity with the table's checkbox column) ----
const selectedSet = computed(() => new Set(props.vm.table.selectedRowKeys));
function isSelected(row: any): boolean {
  return selectedSet.value.has(row?.[props.vm.table.rowKey]);
}
function toggleRow(row: any, checked: boolean) {
  const id = row?.[props.vm.table.rowKey];
  const next = new Set(props.vm.table.selectedRowKeys);
  if (checked) next.add(id);
  else next.delete(id);
  props.commands.select(Array.from(next));
}
</script>

<style module>
.cardList {
  width: 100%;
  min-height: 80px;
}
.card {
  margin-bottom: 16px;
}
.cardHeader {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cardTitle {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cardBody {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field {
  display: flex;
  gap: 8px;
  font-size: 13px;
  line-height: 1.5;
}
.label {
  color: var(--el-text-color-secondary, #909399);
  flex: 0 0 auto;
  min-width: 64px;
}
.value {
  color: var(--el-text-color-primary, #303133);
  word-break: break-all;
}
.cardFooter {
  display: flex;
  justify-content: flex-end;
}
</style>
