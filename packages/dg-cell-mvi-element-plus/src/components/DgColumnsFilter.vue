<template>
  <el-dialog
    v-if="open"
    :model-value="open"
    :title="vm.columnsFilter?.title ?? '列设置'"
    width="360px"
    append-to-body
    :class="$style.dialog"
    @close="close"
  >
    <div :class="$style.list">
      <el-checkbox
        v-for="item in items"
        :key="item.key"
        :model-value="draft[item.key]"
        :label="item.title"
        @change="(v: boolean) => (draft[item.key] = v)"
      />
    </div>
    <template #footer>
      <span :class="$style.footer">
        <el-button @click="onReset">{{ vm.columnsFilter?.resetText ?? '重置' }}</el-button>
        <el-button @click="close">{{ vm.columnsFilter?.cancelText ?? '取消' }}</el-button>
        <el-button type="primary" @click="onConfirm">{{ vm.columnsFilter?.confirmText ?? '确定' }}</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * dg-cell-mvi-element-plus · DgColumnsFilter — the column-settings dialog.
 *
 * A checkbox list of every column (read from `vm.columnsFilter.items`, which carries the full roster +
 * effective show, so a hidden column can be re-enabled). The toolbar opens it via the exposed `open()`
 * method. Confirm dispatches `setColumnsFilter` with the per-column `show`; reset dispatches
 * `resetColumnsFilter`. State lives in the store (immutable slice) — this component holds only the
 * transient open flag + the in-dialog draft (committed on confirm, like a normal form dialog).
 */
import { computed, reactive, ref, watch } from 'vue';
import type { CrudBinding, ColumnsFilterItem } from 'dg-cell-mvi-crud';
import type { CrudCommands } from 'dg-cell-mvi-vue';

const props = defineProps<{ vm: CrudBinding; commands: CrudCommands }>();

const open = ref(false);
const items = computed<ColumnsFilterItem[]>(() => props.vm.columnsFilter?.items ?? []);
const draft = reactive<Record<string, boolean>>({});

/** seed the draft from the current effective show whenever the dialog opens. */
function seedDraft() {
  for (const item of items.value) draft[item.key] = item.show;
}

watch(open, (isOpen) => {
  if (isOpen) seedDraft();
});

function openDialog() {
  open.value = true;
}
function close() {
  open.value = false;
}

function onConfirm() {
  const overrides: Record<string, { show: boolean }> = {};
  for (const item of items.value) overrides[item.key] = { show: draft[item.key] };
  props.commands.setColumnsFilter(overrides);
  close();
}

function onReset() {
  props.commands.resetColumnsFilter();
  close();
}

defineExpose({ open: openDialog, close });
</script>

<style module>
.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.footer {
  display: inline-flex;
  gap: 8px;
}
</style>
