<template>
  <!--
    :key on the permission codes + locale: useCrud captures the button-permission predicate AND the i18n
    chrome at BUILD time, and the crud viewModel only re-projects on crud-STATE changes. Re-keying on the
    codes signature remounts useCrud once codes arrive (after login) so the gated buttons settle to their
    permitted set; folding the locale in re-runs the projector so the crud chrome (新增/编辑/删除 …) follows
    a language switch. Same proven pattern as the reference app's data pages.
  -->
  <DgCrud :key="codesKey" :crud-binding="crudBinding" :commands="commands" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { DgCrud, useCrud, useAdminStore } from 'dg-cell-mvi-element-plus';
import { hasPermission } from 'dg-cell-mvi-admin-logic';
import createCrudOptions from './crud';
import commonOptions from '../../common/commonCrudOptions';
import { useChassis } from '../../chassis/stores';
import { i18nPort } from '../../i18n';

const chassis = useChassis();
// reactive view of the permission actor's codes (depa viewModel signal → Vue Ref) — drives the remount key.
const { binding: permission } = useAdminStore(chassis.permission);
// reactive view of the settings actor's locale — folded into the remount key so the crud chrome re-projects
// in the new language on a locale switch.
const { binding: settings } = useAdminStore(chassis.settings);
const codesKey = computed(() => `${permission.value.codes.join(',')}|${settings.value.locale}`);

const { crudBinding, commands } = useCrud({
  createCrudOptions,
  commonOptions,
  // localize the crud built-in chrome through the GLOBAL chassis I18nPort (its `t` is CrudTranslator-
  // compatible). One translation source for chrome + menu/header; switching language re-renders both.
  i18n: i18nPort,
  // button-permission predicate backed by the GLOBAL permission actor's LIVE codes (read on each
  // projection call): a button whose `permission` code is absent is dropped from the binding. The :key
  // remount above makes it re-evaluate once codes load after login.
  permission: (code: string) => hasPermission(chassis.permission.state().codes, code),
});
</script>
