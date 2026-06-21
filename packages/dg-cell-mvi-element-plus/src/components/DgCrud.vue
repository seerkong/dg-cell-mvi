<template>
  <!-- outer container: container.class / container.style (+ height) + any extra passthrough attrs are
       applied here. Unset → just the default .crud styling (no diff). -->
  <div :class="[$style.crud, containerClass]" :style="containerStyle" v-bind="containerAttrs">
    <slot name="header" :vm="crudBinding" :commands="commands" />
    <DgSearch :vm="crudBinding" :commands="commands">
      <!-- forward search_<key> slots to the search bar (mirrors the form_<key> forwarding below) -->
      <template v-for="(_, name) in $slots" #[name]="scope" :key="name">
        <slot :name="name" v-bind="scope" />
      </template>
    </DgSearch>
    <div :class="$style.panel">
      <div v-if="crudBinding.error" :class="$style.error">⚠️ {{ crudBinding.error }}</div>
      <div :class="$style.header">
        <DgActionbar :vm="crudBinding" :commands="commands" />
        <DgToolbar :vm="crudBinding" :commands="commands" />
      </div>
      <DgTabs :vm="crudBinding" :commands="commands" />
      <!-- list-area dispatch by table.mode: 'table' (or unset) keeps the EXISTING DgTable path
           untouched (zero behavior diff); 'virtual' → el-table-v2; 'card' → card grid. All three
           keep the cell_<key> / expand slots forwarded; search/toolbar/pagination/form are shared. -->
      <DgVirtualTable
        v-if="crudBinding.table.mode === 'virtual'"
        :vm="crudBinding"
        :commands="commands"
      />
      <DgCardList v-else-if="crudBinding.table.mode === 'card'" :vm="crudBinding" :commands="commands">
        <template v-for="(_, name) in $slots" #[name]="scope" :key="name">
          <slot :name="name" v-bind="scope" />
        </template>
      </DgCardList>
      <DgTable v-else :vm="crudBinding" :commands="commands" :on-row-click="onRowClick">
        <!-- forward cell_<key> / expand slots to the table -->
        <template v-for="(_, name) in $slots" #[name]="scope" :key="name">
          <slot :name="name" v-bind="scope" />
        </template>
      </DgTable>
      <DgPagination :vm="crudBinding" :commands="commands" />
    </div>
    <DgFormWrapper :vm="crudBinding" :commands="commands">
      <!-- forward form_<key> slots to the form -->
      <template v-for="(_, name) in $slots" #[name]="scope" :key="name">
        <slot :name="name" v-bind="scope" />
      </template>
    </DgFormWrapper>
    <slot name="footer" :vm="crudBinding" :commands="commands" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CrudBinding } from 'dg-cell-mvi-crud';
import type { CrudCommands } from 'dg-cell-mvi-vue';
import DgSearch from './DgSearch.vue';
import DgActionbar from './DgActionbar.vue';
import DgToolbar from './DgToolbar.vue';
import DgTabs from './DgTabs.vue';
import DgTable from './DgTable.vue';
import DgVirtualTable from './DgVirtualTable.vue';
import DgCardList from './DgCardList.vue';
import DgPagination from './DgPagination.vue';
import DgFormWrapper from './DgFormWrapper.vue';

const props = defineProps<{
  crudBinding: CrudBinding;
  commands: CrudCommands;
  /** Master-detail hook forwarded to DgTable (clicking a row → load its detail). */
  onRowClick?: (row: any, index: number) => void;
}>();

// ---- outer-container passthrough (vm.container) ----
// height/class/style are applied to the wrapper; every OTHER key passes through as an attr. Unset →
// all three are empty/undefined, so the wrapper renders exactly as before (byte-equivalent).
const containerClass = computed(() => props.crudBinding.container?.class);
const containerStyle = computed(() => {
  const c = props.crudBinding.container;
  if (!c) return undefined;
  const style: Record<string, any> = { ...(c.style || {}) };
  if (c.height != null) style.height = typeof c.height === 'number' ? `${c.height}px` : c.height;
  return style;
});
const containerAttrs = computed(() => {
  const c = props.crudBinding.container;
  if (!c) return {};
  // everything except the framework-handled height/class/style passes straight onto the wrapper.
  const { height, class: _class, style, ...rest } = c;
  return rest;
});
</script>

<style module>
.crud {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.panel {
  background: var(--el-bg-color, #fff);
  border-radius: 8px;
  padding: 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.error {
  color: var(--el-color-danger, #f56c6c);
  font-size: 13px;
  margin-bottom: 8px;
}
</style>
