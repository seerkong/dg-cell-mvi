<template>
  <div v-if="vm.actionbar?.show !== false" :class="$style.actionbar">
    <DgButton
      v-for="btn in buttons"
      :key="btn.key"
      :button="btn"
      @click="onClick(btn)"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * dg-cell-mvi-element-plus · DgActionbar — the top-level action buttons (e.g. "Add").
 *
 * Renders `vm.actionbar.buttons` (filtered to `show`) as DgButton and maps each button's `action`
 * onto a crud command on click: add → openAdd. The projector resolves show/disabled to plain booleans.
 */
import { computed } from 'vue';
import type { CrudBinding } from 'dg-cell-mvi-crud';
import type { CrudCommands } from 'dg-cell-mvi-vue';
import DgButton, { type ResolvedButton } from './DgButton';

const props = defineProps<{ vm: CrudBinding; commands: CrudCommands }>();

const buttons = computed<ResolvedButton[]>(() =>
  ((props.vm.actionbar?.buttons ?? []) as ResolvedButton[]).filter((b) => b.show !== false),
);

function onClick(btn: ResolvedButton) {
  switch (btn.action) {
    case 'add':
      props.commands.openAdd();
      break;
    default:
      break;
  }
}
</script>

<style module>
.actionbar {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
</style>
