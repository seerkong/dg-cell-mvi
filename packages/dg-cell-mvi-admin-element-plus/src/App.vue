<!--
  dg-cell-mvi-admin-element-plus · App — the root shell + the locale APPLY seam (P6·T6.1).

  Wraps the router view in `<el-config-provider :locale>` so Element-Plus's OWN component chrome
  (pagination, date pickers, empty text, …) follows the app language. The `locale`/`theme`/`primaryColor`
  facts are owned by the shared `settings` actor (decisions §9); here at the 装配根 we WATCH the projection
  and fan it out to every consumer (the APPLY seam — keeping IO out of the pure reducers, decisions §6/§8):
    • locale → Element-Plus  ← `<el-config-provider :locale="elementLocale">` (reactive, this file);
    • locale → vue-i18n      ← `i18nPort.setLocale(locale)` (drives menu/header/login + the crud chrome
                                handed to useCrud({ i18n: i18nPort }));
    • theme  → EP-native dark← `themePort.applyTheme(theme)` (toggles `html.dark`, decisions §6);
    • primaryColor → EP vars ← `themePort.applyPrimaryColor(color)` (the `--el-color-primary` family).
  So a single `settings.set*` command (from the header switch / settings drawer) re-themes/re-renders the
  whole surface together (behavior admin.i18n-theme cases `switch` + `dark`).

  WHY here and not in the settings reducer: applying a fact to vue-i18n/EP/the DOM is an EFFECT (IO into
  the render engines); keeping it at the assembly root preserves a PURE admin-logic (decisions §6/§8). The
  persist/hydrate of these facts IS a settings-actor StoragePort effect (chassis/stores.ts); because the
  store hydrates the persisted values on init BEFORE these `immediate` watches first run, a reloaded app
  applies the restored theme/locale/color on boot ("刷新保持").
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
// menu/header/login + the crud port read). `immediate` aligns vue-i18n with the actor's seed (and, since
// T6.2 hydrates a persisted locale into the actor at boot, with that restored value too).
//
// flush:'sync' — race fix (P6 crud-chrome bug B): the SAME locale fact also re-keys the data pages'
// `<DgCrud :key="codes|locale">`, which REMOUNTS useCrud and re-runs the crud projector. The projector
// reads the crud chrome labels through this i18nPort against vue-i18n's CURRENT locale at remount time.
// With a default ('pre') watch, the remount and this apply are two effects in the same flush, ordered
// only by component-creation id — so DgCrud could rebuild with the OLD vue-i18n locale (stale chrome
// until a reload). 'sync' fires this callback the instant the locale ref mutates (during the actor
// dispatch's synchronous signal propagation), BEFORE the component-update flush that remounts DgCrud —
// so vue-i18n is already on the new locale when the projector runs. The settings actor stays the sole
// locale source (the switch still dispatches setLocale); this only guarantees apply-before-remount.
watch(
  locale,
  (next) => {
    if (next && i18nPort.getLocale() !== next) i18nPort.setLocale(next);
  },
  { immediate: true, flush: 'sync' },
);

// THE theme apply seam (T6.2, decisions §6 EP-native dark): whenever the settings actor's theme changes,
// toggle `html.dark` via the EP ThemePort. `immediate` applies the actor's seed AND the boot-hydrated
// value (the store hydrates the persisted theme before this first run → reload stays dark = "刷新保持").
watch(
  theme,
  (next) => {
    themePort.applyTheme(next || 'light');
  },
  { immediate: true },
);

// THE primary-color apply seam (T6.2): set/clear the `--el-color-primary` CSS-var family via the EP
// ThemePort. `immediate` covers the boot-hydrated color too (same "刷新保持" path as theme above).
watch(
  primaryColor,
  (next) => {
    themePort.applyPrimaryColor?.(next);
  },
  { immediate: true },
);
</script>
