<template>
  <div :class="$style.wrap">
    <el-select :model-value="code" :class="$style.code" @update:model-value="onCode">
      <el-option v-for="c in codes" :key="c" :value="c" :label="c" />
    </el-select>
    <el-input
      :model-value="number"
      placeholder="手机号"
      :class="$style.num"
      @update:model-value="onNumber"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ modelValue?: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const codes = ['+86', '+1', '+44', '+81', '+852'];

const parsed = computed(() => {
  const v = props.modelValue || '';
  const m = v.match(/^(\+\d+)\s*(.*)$/);
  return m ? { code: m[1], number: m[2] } : { code: '+86', number: v };
});
const code = computed(() => parsed.value.code);
const number = computed(() => parsed.value.number);

function emitVal(c: string, n: string) {
  emit('update:modelValue', n ? `${c} ${n}` : '');
}
function onCode(c: string) {
  emitVal(c, number.value);
}
function onNumber(n: string) {
  emitVal(code.value, n);
}
</script>

<style module>
.wrap {
  display: flex;
  gap: 8px;
  width: 100%;
}
.code {
  width: 110px;
  flex: none;
}
.num {
  flex: 1;
}
</style>
