<template>
  <DgCrud :crud-binding="crudBinding" :commands="commands" />
</template>

<script setup lang="ts">
import { DgCrud, useCrud } from 'dg-cell-mvi-element-plus';
import createCrudOptions from './crud';
import commonOptions from '../../common/commonCrudOptions';
import { i18nPort } from '../../i18n';

// localize the crud built-in chrome through the GLOBAL chassis I18nPort. useCrud also PROVIDES this
// translator to descendants (CRUD_I18N_KEY), so the nested DgSubTable — rendered by name off the projected
// binding — localizes its own 操作/删除/添加一行 chrome too. LayoutFramework re-keys the view on locale.
const { crudBinding, commands } = useCrud({ createCrudOptions, commonOptions, i18n: i18nPort });
</script>
