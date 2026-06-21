<template>
  <el-form
    v-if="vm.search.show && vm.search.columns.length > 0"
    :class="$style.search"
    @submit.prevent
  >
    <el-row :gutter="16" :class="$style.row">
      <el-col v-for="col in vm.search.columns" :key="col.key" :span="spanOf(col)">
        <el-form-item :label="col.title" :class="$style.item">
          <!-- search_<key> slot: custom-render this search field (mirrors form_<key>). Receives the
               live form, the resolved col, the current value, and commands — like the form slot. -->
          <slot
            v-if="$slots['search_' + col.key]"
            :name="'search_' + col.key"
            :form="vm.search.form"
            :col="col"
            :value="vm.search.form[col.key]"
            :commands="commands"
          />
          <!-- a configured search component (search.component) renders via DgComponentRender (e.g. an
               el-date-picker daterange / el-select) — same control mechanism as a form item. -->
          <DgComponentRender
            v-else-if="col.component && col.component.name"
            :name="col.component.name"
            :options="col.component.options"
            :props="componentProps(col)"
            :model-value="vm.search.form[col.key]"
            @update:model-value="(v: any) => onFieldChange(col, v)"
          />
          <!-- default: a plain text input -->
          <el-input
            v-else
            :model-value="vm.search.form[col.key]"
            :placeholder="placeholderFor(col)"
            clearable
            @update:model-value="(v: string) => onFieldChange(col, v)"
            @keyup.enter="doSearchNow()"
          />
        </el-form-item>
      </el-col>
      <el-col :span="actionSpan" :class="$style.actionCol">
        <el-form-item :class="$style.item">
          <!-- query/reset labels are LOCALIZED via the projected search binding (vm.search.*Text), resolved
               through the injected i18n port at projection time — so they follow the app language. -->
          <el-button type="primary" @click="doSearchNow()">{{ vm.search.searchText }}</el-button>
          <el-button @click="commands.resetSearch()">{{ vm.search.resetText }}</el-button>
        </el-form-item>
      </el-col>
    </el-row>
  </el-form>
</template>

<script setup lang="ts">
/**
 * dg-cell-mvi-element-plus · DgSearch — the query bar (T7.3: col span grid + search_<key> slots +
 * autoSearchTrigger).
 *
 * Layout: items flow in an el-row; each item's el-col honors its `search.col.span` (default 6 — a
 * 4-per-row grid), so a field can opt into a wider/narrower cell.
 * Custom rendering: a `search_<key>` slot replaces a field's default input (mirrors form_<key>).
 * Auto-search: when a field's effective trigger is
 * `'change'`, a field change debounced-dispatches the search-submit command (debounce default 300ms).
 * The debounce lives HERE (the view) — never in a reducer. Default (unset/false) → search only on
 * the 查询 button, exactly as before.
 */
import { onBeforeUnmount } from 'vue';
import type { CrudBinding } from 'dg-cell-mvi-crud';
import type { CrudCommands } from 'dg-cell-mvi-vue';
import DgComponentRender from './DgComponentRender';

type SearchColumn = CrudBinding['search']['columns'][number];
type AutoTrigger = false | 'change' | { event?: 'change'; wait?: number };

const props = defineProps<{ vm: CrudBinding; commands: CrudCommands }>();

/** the search item's grid span (search.col.span). Default 6 → a comfortable 4-per-row grid. */
function spanOf(col: SearchColumn): number {
  return (col.col && (col.col.span as number)) || 6;
}

/** the default input placeholder: the localized prefix (vm.search.placeholderPrefix) + the field title
 *  ("请输入用户名" / "Enter Username"). The prefix is resolved through the i18n port at projection time. */
function placeholderFor(col: SearchColumn): string {
  return `${props.vm.search.placeholderPrefix}${col.title}`;
}

/** extra props for the configured search component (strip name/options handled explicitly). */
function componentProps(col: SearchColumn): Record<string, any> {
  const { name, options, ...rest } = (col.component || {}) as Record<string, any>;
  void name;
  void options;
  return rest;
}
/** the action (查询/重置) cell span: fill the rest of the trailing row (defaults to 6). */
const actionSpan = 6;

/** dispatch a search submit (page 1) — the 查询 button path AND the auto-trigger path land here. */
function doSearchNow(): void {
  props.commands.doSearch({ goFirstPage: true });
}

// ---- autoSearchTrigger (debounced, view-only) ----
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** the effective auto-trigger for a field: its own search.autoSearchTrigger, else the crud-wide one. */
function effectiveTrigger(col: SearchColumn): AutoTrigger {
  const own = col.autoSearchTrigger;
  return own !== undefined ? own : props.vm.search.autoSearchTrigger;
}
/** is auto-search on for this field? (truthy trigger — 'change' or an object form). */
function autoEnabled(t: AutoTrigger): boolean {
  return t === 'change' || (typeof t === 'object' && t != null);
}
/** debounce wait (ms): object form's `wait`, else the default 300. */
function waitOf(t: AutoTrigger): number {
  return typeof t === 'object' && t != null && typeof t.wait === 'number' ? t.wait : 300;
}

/** a search field changed: always write the field; if auto-search is on, debounce a submit. */
function onFieldChange(col: SearchColumn, value: any): void {
  props.commands.setSearchField(col.key, value);
  const trigger = effectiveTrigger(col);
  if (!autoEnabled(trigger)) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    doSearchNow();
  }, waitOf(trigger));
}

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
});
</script>

<style module>
.search {
  margin-bottom: 4px;
}
.row {
  width: 100%;
}
.item {
  margin-bottom: 8px;
}
.actionCol {
  display: flex;
  align-items: flex-start;
}
</style>
