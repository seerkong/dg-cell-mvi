<template>
  <div :class="$style.subTable">
    <el-table :data="rows" border size="small" :class="$style.table">
      <el-table-column
        v-for="(col, key) in columns"
        :key="key"
        :label="col.title || key"
        :width="col.width"
      >
        <template #default="{ row, $index }">
          <DgComponentRender
            :name="(col.component && col.component.name) || 'text'"
            :options="col.component && col.component.options"
            :model-value="row[key]"
            :props="{ size: 'small', placeholder: col.title, ...(col.component || {}) }"
            @update:model-value="(v: any) => updateCell($index, String(key), v)"
          />
        </template>
      </el-table-column>
      <el-table-column :label="operationsLabel" width="70" align="center">
        <template #default="{ $index }">
          <el-button link type="danger" size="small" @click="removeRow($index)">{{ removeLabel }}</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-button size="small" plain :class="$style.addBtn" @click="addRow">{{ addRowLabel }}</el-button>
  </div>
</template>

<script setup lang="ts">
/**
 * DgSubTable — a virtual-model array editor used AS a form component.
 *
 * v-models an array of child rows (the parent form field). Each child column renders an inline
 * DgComponentRender; rows can be added/removed/edited locally. On any change it emits the whole
 * updated array, so the parent form holds it as a normal field and submits parent + children in ONE
 * request (the reference crud's "virtual model / one-shot nested submit"). Reference it by the registered
 * string name `DgSubTable` in crudOptions so the config stays plain-data (no component deep-clone).
 */
import { computed, inject } from 'vue';
import { CRUD_I18N_KEY, fallbackTranslator, I18N_KEY, type CrudTranslator } from 'dg-cell-mvi-vue';
import DgComponentRender from './DgComponentRender';

const props = defineProps<{ modelValue?: any[]; columns?: Record<string, any> }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: any[]): void }>();

const rows = computed<any[]>(() => (Array.isArray(props.modelValue) ? props.modelValue : []));
const columns = computed<Record<string, any>>(() => props.columns || {});

// the crud translator (provided by useCrud) — DgSubTable is rendered by name deep in the form tree and
// never sees the projected binding, so it localizes its OWN built-in chrome (操作/删除/添加一行) through
// the injected translator directly. Default = fallbackTranslator → the Chinese fallback (byte-equivalent
// when there is no useCrud ancestor / no translator). t(key, fallback) returns the fallback on a miss.
const t = inject<CrudTranslator>(CRUD_I18N_KEY, fallbackTranslator);
const operationsLabel = computed(() => t(I18N_KEY.subTableOperations, '操作'));
const removeLabel = computed(() => t(I18N_KEY.subTableRemove, '删除'));
const addRowLabel = computed(() => t(I18N_KEY.subTableAddRow, '+ 添加一行'));

function emitRows(next: any[]) {
  emit('update:modelValue', next);
}
function updateCell(index: number, key: string, value: any) {
  emitRows(rows.value.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
}
function removeRow(index: number) {
  emitRows(rows.value.filter((_, i) => i !== index));
}
function addRow() {
  const blank: Record<string, any> = {};
  for (const k of Object.keys(columns.value)) blank[k] = undefined;
  emitRows([...rows.value, blank]);
}
</script>

<style module>
.subTable {
  width: 100%;
}
.table {
  margin-bottom: 8px;
}
.addBtn {
  width: 100%;
}
</style>
