<template>
  <div :class="$style.wrap">
    <div :class="$style.bar">
      <el-button size="small" @click="format">格式化</el-button>
      <span :class="[$style.status, valid ? $style.ok : $style.err]">
        {{ valid ? '✓ JSON 合法' : '✗ JSON 非法' }}
      </span>
    </div>
    <el-input
      type="textarea"
      :rows="rows"
      :model-value="text"
      :class="$style.area"
      @update:model-value="onInput"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{ modelValue?: any; rows?: number }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

function toText(v: any): string {
  if (v == null) return '';
  return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
}

const rows = props.rows ?? 6;
const text = ref(toText(props.modelValue));
const valid = ref(true);

watch(
  () => props.modelValue,
  (v) => {
    const t = toText(v);
    if (t !== text.value) text.value = t;
  },
);

function check(v: string): boolean {
  if (v.trim() === '') return true;
  try {
    JSON.parse(v);
    return true;
  } catch {
    return false;
  }
}

function onInput(v: string) {
  text.value = v;
  valid.value = check(v);
  emit('update:modelValue', v);
}

function format() {
  try {
    text.value = JSON.stringify(JSON.parse(text.value), null, 2);
    valid.value = true;
    emit('update:modelValue', text.value);
  } catch {
    valid.value = false;
  }
}
</script>

<style module>
.wrap {
  width: 100%;
}
.bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.status {
  font-size: 12px;
}
.ok {
  color: var(--el-color-success, #67c23a);
}
.err {
  color: var(--el-color-danger, #f56c6c);
}
.area :global(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
}
</style>
