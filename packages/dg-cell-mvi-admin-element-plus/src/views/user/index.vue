<template>
  <!--
    :key on the permission codes (T5.2): useCrud captures the button-permission predicate at BUILD time,
    and the crud viewModel only re-projects on crud-STATE changes — so a predicate whose codes load LATER
    (after login) would not re-evaluate on its own. Re-keying on the codes signature remounts useCrud once
    codes arrive, so the button projector re-runs with the now-loaded codes and the gated buttons (e.g.
    the user:remove delete button) settle to their permitted set. Same proven pattern as the
    feature-permission demo (`:key` remount when the predicate changes).
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
// reactive view of the settings actor's locale — folded into the remount key so the crud chrome (新增/编辑/
// 删除 …) re-projects in the new language on a locale switch (P6·T6.1, behavior admin.i18n-theme `switch`).
const { binding: settings } = useAdminStore(chassis.settings);
// remount key = codes + locale: codes settle the gated buttons (T5.2); locale re-runs the projector so the
// chrome labels follow the language (useCrud captures `i18n` at build time + re-projects only on crud-state,
// so a locale flip needs a remount — same proven `:key` pattern as the feature-i18n demo).
const codesKey = computed(() => `${permission.value.codes.join(',')}|${settings.value.locale}`);

const { crudBinding, commands } = useCrud({
  createCrudOptions,
  commonOptions,
  // localize the crud built-in chrome through the GLOBAL chassis I18nPort (its `t` is CrudTranslator-
  // compatible). One translation source for chrome + menu/header; switching language re-renders both.
  i18n: i18nPort,
  // button-permission predicate backed by the GLOBAL permission actor's LIVE codes (read on each
  // projection call): a button whose `permission` code is absent is dropped from the binding (T5.2). It
  // reads `chassis.permission.state().codes` fresh — never a stale snapshot — and the :key remount above
  // makes it re-evaluate once codes load after login.
  permission: (code: string) => hasPermission(chassis.permission.state().codes, code),
});
</script>
