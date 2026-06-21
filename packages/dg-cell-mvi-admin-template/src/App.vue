<!--
  dg-cell-mvi-admin-template · App — the root shell + the locale/theme APPLY seam.

  Wraps the router view in `<el-config-provider :locale>` so Element-Plus's OWN component chrome
  (pagination, date pickers, empty text, …) follows the app language. The `locale`/`theme`/`primaryColor`
  facts are owned by the shared `settings` actor; here at the 装配根 we WATCH the projection and fan it out
  to every consumer (the APPLY seam — keeping IO out of the pure reducers):
    • locale → Element-Plus  ← `<el-config-provider :locale="elementLocale">` (reactive, this file);
    • locale → vue-i18n      ← `i18nPort.setLocale(locale)` (drives menu/header/login + the crud chrome);
    • theme  → EP-native dark← `themePort.applyTheme(theme)` (toggles `html.dark`);
    • primaryColor → EP vars ← `themePort.applyPrimaryColor(color)` (the `--el-color-primary` family).
  So a single `settings.set*` command (from the header switch / settings drawer) re-themes/re-renders the
  whole surface together.

  WHY here and not in the settings reducer: applying a fact to vue-i18n/EP/the DOM is an EFFECT (IO into
  the render engines); keeping it at the assembly root preserves a PURE admin-logic. Because the store
  hydrates the persisted values on init BEFORE these `immediate` watches first run, a reloaded app applies
  the restored theme/locale/color on boot ("刷新保持").
-->
<template>
  <el-config-provider :locale="elementLocale">
    <router-view />
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { ElConfigProvider } from 'element-plus';

import { useAdminStore } from 'dg-cell-mvi-vue';

import { useChassis } from './chassis/stores';
import { i18nPort, elementLocaleFor } from './i18n';
import { themePort } from './theme';

// the shared settings actor — its locale/theme/primaryColor are the single source the applies below fan out.
const { settings: settingsStore } = useChassis();
const { binding: settingsBinding } = useAdminStore(settingsStore);

/** the active locale fact (settings actor's projection). */
const locale = computed(() => settingsBinding.value.locale);
/** the active theme fact ('light' | 'dark'). */
const theme = computed(() => settingsBinding.value.theme);
/** the active custom primary color fact (hex, or '' for EP default). */
const primaryColor = computed(() => settingsBinding.value.primaryColor ?? '');

/** EP locale pack for the current app locale — reactive, drives <el-config-provider>. */
const elementLocale = computed(() => elementLocaleFor(locale.value));

// THE i18n apply seam: whenever the settings actor's locale changes, push it into vue-i18n (which the
// menu/header/login + the crud port read). flush:'sync' so vue-i18n is on the new locale BEFORE the
// component-update flush remounts the keyed data pages (so the crud projector reads the new chrome labels).
watch(
  locale,
  (next) => {
    if (next && i18nPort.getLocale() !== next) i18nPort.setLocale(next);
  },
  { immediate: true, flush: 'sync' },
);

// THE theme apply seam: whenever the settings actor's theme changes, toggle `html.dark` via the EP
// ThemePort. `immediate` applies the boot-hydrated value too (reload stays dark = "刷新保持").
watch(
  theme,
  (next) => {
    themePort.applyTheme(next || 'light');
  },
  { immediate: true },
);

// THE primary-color apply seam: set/clear the `--el-color-primary` CSS-var family via the EP ThemePort.
watch(
  primaryColor,
  (next) => {
    themePort.applyPrimaryColor?.(next);
  },
  { immediate: true },
);
</script>
