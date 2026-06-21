<template>
  <el-popover
    :visible="open"
    :width="560"
    placement="bottom-start"
    :teleported="true"
  >
    <template #reference>
      <div :class="$style.trigger" @click="open = !open">
        <template v-if="selectedLabels.length">
          <el-tag v-for="(l, i) in selectedLabels" :key="i" size="small" :class="$style.tag">{{ l }}</el-tag>
        </template>
        <span v-else :class="$style.ph">{{ placeholder || '点击从表格选择' }}</span>
        <el-icon :class="$style.arrow">
          <svg viewBox="0 0 1024 1024" width="12" height="12"><path fill="currentColor" d="M831.872 340.864 512 652.672 192.128 340.864a30.592 30.592 0 0 0-42.752 0 29.12 29.12 0 0 0 0 41.6L489.6 714.24a32 32 0 0 0 44.8 0l340.224-331.776a29.12 29.12 0 0 0 0-41.6 30.592 30.592 0 0 0-42.752 0z"/></svg>
        </el-icon>
      </div>
    </template>

    <div :class="$style.title">{{ title || '选择数据' }}</div>
    <el-table
      :data="rows"
      height="300"
      size="small"
      :highlight-current-row="!multiple"
      @row-click="onRowClick"
      @selection-change="onSelection"
    >
      <el-table-column v-if="multiple" type="selection" width="40" />
      <el-table-column
        v-for="c in columns"
        :key="c.prop"
        :prop="c.prop"
        :label="c.label"
        :width="c.width"
        show-overflow-tooltip
      />
    </el-table>
    <div v-if="multiple" :class="$style.footer">
      <el-button size="small" @click="close">取消</el-button>
      <el-button size="small" type="primary" @click="confirm">确定</el-button>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

interface Col {
  prop: string;
  label: string;
  width?: number;
}

const props = defineProps<{
  modelValue?: any;
  data?: any[];
  columns?: Col[];
  valueKey?: string;
  labelKey?: string;
  multiple?: boolean;
  placeholder?: string;
  title?: string;
}>();
const emit = defineEmits<{ (e: 'update:modelValue', v: any): void }>();

const open = ref(false);
const pending = ref<any[]>([]);

const valueKey = computed(() => props.valueKey || 'id');
const labelKey = computed(() => props.labelKey || 'name');
const columns = computed(() => props.columns || []);
const rows = computed(() => props.data || []);

const selectedValues = computed<any[]>(() => {
  if (props.multiple) return Array.isArray(props.modelValue) ? props.modelValue : [];
  return props.modelValue == null || props.modelValue === '' ? [] : [props.modelValue];
});
const selectedLabels = computed(() =>
  selectedValues.value.map((v) => {
    const row = rows.value.find((r) => r[valueKey.value] === v);
    return row ? row[labelKey.value] : v;
  }),
);

function close() {
  open.value = false;
}
// Fully controlled visibility (one-way :visible) — open is our ref, so setting it false reliably
// closes the popover and survives the host form's re-render on value change.
function commit(v: any) {
  open.value = false;
  emit('update:modelValue', v);
}
function onRowClick(row: any) {
  if (props.multiple) return;
  commit(row[valueKey.value]);
}
function onSelection(sel: any[]) {
  pending.value = sel.map((r) => r[valueKey.value]);
}
function confirm() {
  commit(pending.value);
}
</script>

<style module>
.trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding: 0 8px;
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 4px;
  cursor: pointer;
  background: var(--el-fill-color-blank, #fff);
}
.trigger:hover {
  border-color: var(--el-color-primary, #409eff);
}
.tag {
  margin: 3px 2px;
}
.ph {
  color: var(--el-text-color-placeholder, #a8abb2);
  font-size: 14px;
  flex: 1;
}
.arrow {
  margin-left: auto;
  color: var(--el-text-color-placeholder, #a8abb2);
}
.title {
  font-weight: 600;
  font-size: 13px;
  margin: 0 0 8px;
}
.footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
</style>
