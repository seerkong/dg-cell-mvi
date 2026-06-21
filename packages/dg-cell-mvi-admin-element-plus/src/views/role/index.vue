<template>
  <!--
    :key on the permission codes (T5.2): same as the user page — useCrud captures the button-permission
    predicate at BUILD time and the crud viewModel only re-projects on crud-STATE changes, so re-keying
    on the codes signature remounts useCrud once codes load after login. Then the button projector re-runs
    against the now-loaded codes and the gated buttons settle to their permitted set. As of T5.3 the dev
    mock GRANTS role:add/edit/delete, so all three role buttons SHOW here (this page is the functional RBAC
    role-management + permission-assignment view); the withheld-button demo lives on the USER page
    (user:remove → its delete button hidden, delta admin.rbac case `crud-button`).
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
// locale fact folded into the remount key so the crud chrome re-projects in the new language (see user page).
const { binding: settings } = useAdminStore(chassis.settings);
const codesKey = computed(() => `${permission.value.codes.join(',')}|${settings.value.locale}`);

const { crudBinding, commands } = useCrud({
  createCrudOptions,
  commonOptions,
  // localize the crud built-in chrome through the GLOBAL chassis I18nPort (CrudTranslator-compatible `t`).
  i18n: i18nPort,
  // button-permission predicate backed by the GLOBAL permission actor's LIVE codes (read on each
  // projection call): a button whose `permission` code is absent is dropped from the binding (T5.2).
  permission: (code: string) => hasPermission(chassis.permission.state().codes, code),
});
</script>
