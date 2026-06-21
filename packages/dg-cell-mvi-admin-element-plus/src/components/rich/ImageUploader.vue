<template>
  <div :class="$style.wrap">
    <el-upload
      :show-file-list="false"
      :before-upload="onBefore"
      accept="image/*"
      :class="$style.uploader"
    >
      <img v-if="modelValue" :src="modelValue" :class="$style.img" alt="" />
      <div v-else :class="$style.placeholder">＋ 上传图片</div>
    </el-upload>
    <el-button v-if="modelValue" link type="danger" :class="$style.clear" @click="clear">移除</el-button>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ modelValue?: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

/** mock upload: read the file as a data URL and emit it; return false to skip a real request. */
function onBefore(file: File): boolean {
  const reader = new FileReader();
  reader.onload = () => emit('update:modelValue', String(reader.result));
  reader.readAsDataURL(file);
  return false;
}
function clear() {
  emit('update:modelValue', '');
}
</script>

<style module>
.wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}
.uploader :global(.el-upload) {
  border: 1px dashed var(--el-border-color, #dcdfe6);
  border-radius: 6px;
  cursor: pointer;
  overflow: hidden;
  width: 96px;
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s;
}
.uploader :global(.el-upload:hover) {
  border-color: var(--el-color-primary, #409eff);
}
.img {
  width: 96px;
  height: 96px;
  object-fit: cover;
  display: block;
}
.placeholder {
  color: var(--el-text-color-secondary, #909399);
  font-size: 13px;
}
</style>
