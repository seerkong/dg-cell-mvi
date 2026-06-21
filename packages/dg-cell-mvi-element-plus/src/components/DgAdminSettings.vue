<!--
  dg-cell-mvi-element-plus · DgAdminSettings — the admin settings drawer (PURE UI).

  The reusable Element-Plus settings panel of the admin chassis (add-admin-chassis P6·T6.2 / behavior
  admin.i18n-theme requirement `theme-dark`). An `el-drawer` with three preference controls:
    • 暗黑模式  — an `el-switch` (off = light, on = dark);
    • 主题色    — a row of preset color swatches + an `el-color-picker` for a custom hex;
    • 语言      — an `el-select` of the offered locales (a settings-drawer twin of the header LocaleSwitch).

  It is PURE UI — it owns NO store, NO contract, NO router (decisions §8 — the element-plus render layer
  must not depend on admin-logic / admin-contract). All data flows through props/events (the host binds
  them to the settings actor):
    in  : `visible`      — drawer open state (`v-model:visible`);
          `theme`        — 'light' | 'dark' (drives the switch);
          `primaryColor` — the active custom primary hex (highlights the matching swatch / seeds the picker);
          `locale`       — the active locale tag (drives the select);
          `locales`      — the offered locales `[{ value, label }]` (the select options);
          `title`/`*Label` — optional localized strings (the host passes `t(...)` so this stays i18n-free).
    out : `update:visible`      — drawer open/close (for `v-model:visible`);
          `update:theme`        — a new theme was chosen (host dispatches settings.setTheme);
          `update:primaryColor` — a new primary color was chosen (host dispatches settings.setPrimaryColor);
          `update:locale`       — a new locale was chosen (host dispatches settings.setLocale).
  The preset swatch list mirrors the reference admin's palette (薄暮/拂晓蓝/极光绿 …).
-->
<template>
  <el-drawer
    :model-value="visible"
    :title="title || '设置'"
    :size="320"
    direction="rtl"
    data-test="admin-settings-drawer"
    @update:model-value="onVisible"
  >
    <div :class="$style.panel">
      <!-- 暗黑模式 -->
      <section :class="$style.section">
        <div :class="$style.row">
          <span :class="$style.label">{{ darkLabel || '暗黑模式' }}</span>
          <el-switch
            :model-value="isDark"
            data-test="settings-dark-switch"
            @update:model-value="onToggleDark"
          />
        </div>
      </section>

      <!-- 主题色 -->
      <section :class="$style.section">
        <div :class="$style.sectionTitle">{{ primaryColorLabel || '主题色' }}</div>
        <div :class="$style.swatches">
          <span
            v-for="c in PRESET_COLORS"
            :key="c.color"
            :class="[$style.swatch, c.color === primaryColor && $style.swatchActive]"
            :style="{ background: c.color }"
            :title="c.label"
            :data-test="`settings-color-${c.color}`"
            @click="onPickColor(c.color)"
          >
            <Icon v-if="c.color === primaryColor" icon="ant-design:check-outlined" :class="$style.check" />
          </span>
          <el-color-picker
            :model-value="primaryColor || ''"
            :class="$style.picker"
            data-test="settings-color-picker"
            @update:model-value="onPickColor"
          />
        </div>
      </section>

      <!-- 语言 -->
      <section :class="$style.section">
        <div :class="$style.row">
          <span :class="$style.label">{{ languageLabel || '语言' }}</span>
          <el-select
            :model-value="locale"
            :class="$style.select"
            data-test="settings-locale-select"
            @update:model-value="onPickLocale"
          >
            <el-option
              v-for="loc in locales"
              :key="loc.value"
              :value="loc.value"
              :label="loc.label"
            />
          </el-select>
        </div>
      </section>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';

import type { AdminSettingsLocale } from './DgAdminSettings.types';

const props = withDefaults(
  defineProps<{
    /** drawer open state (`v-model:visible`). */
    visible: boolean;
    /** the active theme — 'light' | 'dark' (drives the dark switch). */
    theme: string;
    /** the active custom primary color hex (highlights the matching swatch + seeds the picker). */
    primaryColor?: string;
    /** the active locale tag (drives the language select). */
    locale: string;
    /** the offered locales (the language select options). */
    locales?: AdminSettingsLocale[];
    /** optional localized strings — the host passes `t(...)` so this component stays i18n-free (props in). */
    title?: string;
    darkLabel?: string;
    primaryColorLabel?: string;
    languageLabel?: string;
  }>(),
  { primaryColor: '', locales: () => [] },
);

const emit = defineEmits<{
  /** drawer open/close (`v-model:visible`). */
  (e: 'update:visible', value: boolean): void;
  /** a new theme was chosen — host dispatches settings.setTheme. */
  (e: 'update:theme', value: string): void;
  /** a new primary color was chosen — host dispatches settings.setPrimaryColor. */
  (e: 'update:primaryColor', value: string): void;
  /** a new locale was chosen — host dispatches settings.setLocale. */
  (e: 'update:locale', value: string): void;
}>();

/** one preset swatch (a curated color + its human name). */
interface PresetColor {
  color: string;
  label: string;
}
/** the curated preset palette (mirrors the reference admin's color list). */
const PRESET_COLORS: PresetColor[] = [
  { color: '#409eff', label: '拂晓蓝（默认）' },
  { color: '#f5222d', label: '薄暮' },
  { color: '#fa541c', label: '火山' },
  { color: '#faad14', label: '日暮' },
  { color: '#13c2c2', label: '明青' },
  { color: '#52c41a', label: '极光绿' },
  { color: '#2f54eb', label: '极客蓝' },
  { color: '#722ed1', label: '酱紫' },
];

/** the switch is on when the active theme is 'dark'. */
const isDark = computed(() => props.theme === 'dark');

function onVisible(value: boolean): void {
  emit('update:visible', value);
}
function onToggleDark(value: boolean | string | number): void {
  emit('update:theme', value ? 'dark' : 'light');
}
function onPickColor(color: string | null): void {
  // el-color-picker clears to null; normalize to '' (the host treats '' as "use EP default").
  emit('update:primaryColor', color ?? '');
}
function onPickLocale(value: string): void {
  emit('update:locale', value);
}
</script>

<style module>
.panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sectionTitle {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary, #303133);
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.label {
  font-size: 14px;
  color: var(--el-text-color-regular, #606266);
}
.swatches {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.swatch {
  position: relative;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 0 1px var(--el-border-color, #dcdfe6) inset;
  transition: transform 0.15s ease;
}
.swatch:hover {
  transform: scale(1.1);
}
.swatchActive {
  box-shadow: 0 0 0 2px var(--el-color-white, #fff) inset, 0 0 0 3px currentColor;
}
.check {
  width: 14px;
  height: 14px;
  font-size: 14px;
  color: #fff;
}
.picker {
  margin-left: 2px;
}
.select {
  width: 150px;
}
</style>
