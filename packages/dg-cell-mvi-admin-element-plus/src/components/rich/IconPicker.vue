<template>
  <el-select
    :model-value="modelValue"
    :placeholder="placeholder || '选择图标'"
    filterable
    clearable
    :disabled="disabled"
    :class="$style.select"
    @update:model-value="(v: string) => emit('update:modelValue', v)"
  >
    <!-- selected-value prefix: show the chosen icon next to the select text -->
    <template v-if="modelValue && iconMap[modelValue]" #prefix>
      <el-icon><component :is="iconMap[modelValue]" /></el-icon>
    </template>
    <el-option v-for="name in iconNames" :key="name" :label="name" :value="name">
      <span :class="$style.opt">
        <el-icon :class="$style.icon"><component :is="iconMap[name]" /></el-icon>
        <span :class="$style.name">{{ name }}</span>
      </span>
    </el-option>
  </el-select>
</template>

<script setup lang="ts">
/**
 * IconPicker — a v-model form control whose value is an Element Plus icon NAME (string).
 *
 * A searchable el-select listing the icons from @element-plus/icons-vue (each option shows the icon
 * glyph + its name; selecting writes the name into v-model). Pairs with a column `cellRender` that
 * resolves the stored name back to a component via the same icon map and renders `<el-icon>`. Kept to
 * a curated subset by default (the full set is ~290 icons — heavy for one dropdown); pass `:all="true"`
 * to list every exported icon. `disabled` (set by DgFormItem in view mode) makes it read-only.
 */
import { computed } from 'vue';
import * as ElementPlusIcons from '@element-plus/icons-vue';

const props = defineProps<{
  modelValue?: string;
  placeholder?: string;
  disabled?: boolean;
  /** list every exported icon instead of the curated subset. */
  all?: boolean;
  /** explicit curated list override (icon names). */
  icons?: string[];
}>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

/** name -> icon component, over ALL named exports of @element-plus/icons-vue. */
const iconMap = ElementPlusIcons as unknown as Record<string, any>;

/** a reasonable default subset so the dropdown is not 290 rows; searchable covers the rest via `all`. */
const CURATED = [
  'Edit', 'Delete', 'Search', 'Plus', 'Minus', 'Check', 'Close', 'Star', 'StarFilled',
  'User', 'UserFilled', 'Setting', 'Tools', 'Bell', 'Message', 'ChatDotRound', 'Phone',
  'Calendar', 'Clock', 'Location', 'House', 'Folder', 'FolderOpened', 'Document', 'Files',
  'Picture', 'Camera', 'VideoCamera', 'Upload', 'Download', 'Link', 'Share', 'Lock', 'Unlock',
  'View', 'Hide', 'Refresh', 'Loading', 'Warning', 'WarningFilled', 'InfoFilled', 'SuccessFilled',
  'CircleCheck', 'CircleClose', 'Promotion', 'Money', 'ShoppingCart', 'Goods', 'Box', 'Grid',
  'Menu', 'Operation', 'DataLine', 'TrendCharts', 'PieChart', 'Histogram', 'Flag', 'Trophy',
];

const iconNames = computed<string[]>(() => {
  if (props.icons && props.icons.length) {
    return props.icons.filter((n) => n in iconMap);
  }
  const all = Object.keys(iconMap).sort();
  if (props.all) return all;
  // keep curated names that actually exist, in curated order.
  return CURATED.filter((n) => n in iconMap);
});
</script>

<style module>
.select {
  width: 100%;
}
.opt {
  display: flex;
  align-items: center;
  gap: 8px;
}
.icon {
  font-size: 16px;
}
.name {
  font-size: 13px;
}
</style>
