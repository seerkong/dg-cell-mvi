<template>
  <!-- tabs quick-filter bar. Renders nothing unless vm.tabs.show === true. -->
  <div v-if="vm.tabs.show" :class="$style.tabs">
    <!-- radio / radio-button segmented control -->
    <el-radio-group
      v-if="isRadio"
      :model-value="activeName"
      @update:model-value="onChange"
    >
      <el-radio-button
        v-for="opt in options"
        :key="opt.name"
        :value="opt.name"
        :label="opt.name"
      >
        {{ opt.label }}
      </el-radio-button>
    </el-radio-group>

    <!-- default: el-tabs header bar -->
    <el-tabs
      v-else
      :model-value="activeName"
      @update:model-value="onChange"
    >
      <el-tab-pane
        v-for="opt in options"
        :key="opt.name"
        :name="opt.name"
        :label="opt.label"
      />
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
/**
 * dg-cell-mvi-element-plus · DgTabs — the tabs quick-filter bar (above the table, below the search).
 *
 * Reads `vm.tabs` ({ show, name, type, active, options }) and renders el-tabs (default) or an
 * el-radio-group of el-radio-button (type radio / radio-button). Element's tab/radio model is a
 * string `name`, so each option's (possibly non-string) value is mapped to a stable string name
 * (its index); selecting a tab resolves the name back to the option's value and dispatches
 * `commands.setActiveTab(value)` (→ filter list by config.tabs.name, reset to page 1, refetch).
 * Renders nothing when `vm.tabs.show !== true`.
 */
import { computed } from 'vue';
import type { CrudBinding } from 'dg-cell-mvi-crud';
import type { CrudCommands } from 'dg-cell-mvi-vue';

const props = defineProps<{ vm: CrudBinding; commands: CrudCommands }>();

const isRadio = computed(
  () => props.vm.tabs.type === 'radio' || props.vm.tabs.type === 'radio-button',
);

// map each tab option to a stable string `name` (its index) so el-tabs/el-radio-group (string model)
// can round-trip arbitrary option values.
const options = computed(() =>
  (props.vm.tabs.options ?? []).map((o, i) => ({ name: String(i), label: o.label, value: o.value })),
);

// the active option's string name (matched by value), or the first option's name as a fallback.
const activeName = computed(() => {
  const list = options.value;
  const idx = list.findIndex((o) => o.value === props.vm.tabs.active);
  return idx >= 0 ? list[idx].name : list.length > 0 ? list[0].name : '';
});

function onChange(name: string | number) {
  const opt = options.value.find((o) => o.name === String(name));
  if (opt) props.commands.setActiveTab(opt.value);
}
</script>

<style module>
.tabs {
  margin-bottom: 8px;
}
/* trim el-tabs' default bottom gap so it sits snug above the table */
.tabs :global(.el-tabs__header) {
  margin-bottom: 0;
}
</style>
