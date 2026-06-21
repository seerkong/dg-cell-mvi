<!--
  dg-cell-mvi-admin-element-plus · layout/LocaleSwitch — the header language switcher (P6·T6.1).

  Lives in the DgAdminHeader `controls` slot (the P6-reserved region). It reads the active locale from the
  shared `settings` actor and, on change, dispatches `settings.setLocale` — the SINGLE write path for the
  locale fact (decisions §9). App.vue's watcher then applies it (vue-i18n + EP + crud chrome), so picking a
  language here re-renders menu / crud chrome / EP components / login text together.

  T6.1 ↔ T6.2: this already goes through the settings ACTOR (not straight to vue-i18n), so T6.2 only adds
  the persist/hydrate effect to that actor — the switch UI is final.
-->
<template>
  <el-dropdown trigger="click" @command="onPick">
    <span :class="$style.trigger" :title="$t('header.language')">
      <Icon icon="ant-design:global-outlined" :class="$style.icon" />
      <span :class="$style.label">{{ currentLabel }}</span>
    </span>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          v-for="loc in SUPPORTED_LOCALES"
          :key="loc.value"
          :command="loc.value"
          :class="{ [$style.active]: loc.value === locale }"
          :data-test="`locale-${loc.value}`"
        >
          {{ loc.label }}
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';

import { setLocale } from 'dg-cell-mvi-admin-contract';
import { useAdminStore, bindCommands } from 'dg-cell-mvi-vue';

import { useChassis } from '../chassis/stores';
import { SUPPORTED_LOCALES } from '../i18n/messages';

// the shared settings actor — single writer of the locale fact.
const { settings: settingsStore } = useChassis();
const { binding: settingsBinding } = useAdminStore(settingsStore);
const settingsCommands = bindCommands(settingsStore, { setLocale });

/** the active locale fact. */
const locale = computed(() => settingsBinding.value.locale);

/** the human label of the active locale (for the trigger). */
const currentLabel = computed(
  () => SUPPORTED_LOCALES.find((l) => l.value === locale.value)?.label ?? locale.value,
);

/** picking a language = dispatch the setLocale command (App.vue's watcher applies it everywhere). */
function onPick(value: string): void {
  if (value !== locale.value) settingsCommands.setLocale(value);
}
</script>

<style module>
.trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--el-text-color-regular, #606266);
  outline: none;
}
.trigger:hover {
  background: var(--el-fill-color-light, #f5f7fa);
  color: var(--el-color-primary, #409eff);
}
.icon {
  width: 18px;
  height: 18px;
  font-size: 18px;
}
.label {
  font-size: 13px;
}
.active {
  color: var(--el-color-primary, #409eff);
  font-weight: 600;
}
</style>
