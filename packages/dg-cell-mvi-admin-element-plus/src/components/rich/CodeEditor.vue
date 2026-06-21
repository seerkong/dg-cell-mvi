<template>
  <el-input
    type="textarea"
    :rows="rows || 8"
    :model-value="modelValue"
    :placeholder="placeholder"
    :class="$style.code"
    @update:model-value="(v: string) => emit('update:modelValue', v)"
  />
</template>

<script setup lang="ts">
/**
 * A lightweight monospace code field (no syntax highlighting). A real code editor would wrap
 * CodeMirror / Monaco — out of scope without that dependency; this keeps the form control shape
 * (modelValue string) so a heavier editor can be dropped in later.
 */
defineProps<{ modelValue?: string; rows?: number; placeholder?: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();
</script>

<style module>
.code :global(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  tab-size: 2;
}
</style>
