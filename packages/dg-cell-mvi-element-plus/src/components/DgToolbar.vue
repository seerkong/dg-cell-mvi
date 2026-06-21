<template>
  <div v-if="vm.toolbar?.show !== false" :class="$style.toolbar">
    <DgButton
      v-for="btn in buttons"
      :key="btn.key"
      :button="btn"
      @click="onClick(btn)"
    />
    <DgColumnsFilter ref="columnsFilterRef" :vm="vm" :commands="commands" />
  </div>
</template>

<script setup lang="ts">
/**
 * dg-cell-mvi-element-plus · DgToolbar — the right-aligned table toolbar (refresh / compact density).
 *
 * Renders `vm.toolbar.buttons` (filtered to `show`) as DgButton and maps each button's `action` onto
 * a crud command on click: refresh → doRefresh; compact → toggle density (setCompact(!compact), read
 * from `vm.toolbar.compact`). `setCompact` is optional on CrudCommands in this cut — it is called
 * defensively so the toolbar works whether or not the composable exposes it yet.
 */
import { computed, ref } from 'vue';
import type { CrudBinding } from 'dg-cell-mvi-crud';
import type { CrudCommands } from 'dg-cell-mvi-vue';
import DgButton, { type ResolvedButton } from './DgButton';
import DgColumnsFilter from './DgColumnsFilter.vue';
import { exportCsv } from 'dg-cell-mvi-vue';

const props = defineProps<{ vm: CrudBinding; commands: CrudCommands }>();

const columnsFilterRef = ref<InstanceType<typeof DgColumnsFilter> | null>(null);

const buttons = computed<ResolvedButton[]>(() =>
  ((props.vm.toolbar?.buttons ?? []) as ResolvedButton[]).filter((b) => b.show !== false),
);

function onClick(btn: ResolvedButton) {
  switch (btn.action) {
    case 'refresh':
      props.commands.doRefresh();
      break;
    case 'compact': {
      const setCompact = (props.commands as { setCompact?: (v: boolean) => void }).setCompact;
      if (setCompact) {
        setCompact(!props.vm.toolbar?.compact);
      }
      break;
    }
    case 'export':
      exportCsv(props.vm.table.columns, props.vm.table.rows, 'export.csv');
      break;
    case 'columnsFilter':
      columnsFilterRef.value?.open();
      break;
    default:
      break;
  }
}
</script>

<style module>
.toolbar {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
</style>
