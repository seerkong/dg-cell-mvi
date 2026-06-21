<template>
  <div>
    <div :class="$style.bar">
      <el-button type="primary" @click="commands.editableAddRow()">+ 新增行</el-button>
      <span :class="$style.hint">点击「编辑」整行进入编辑，「保存」后整行一次提交（exclusive：同时只一行可编辑）</span>
    </div>
    <DgCrud :crud-binding="crudBinding" :commands="commands" />
  </div>
</template>

<script setup lang="ts">
import { DgCrud, useCrud } from 'dg-cell-mvi-element-plus';
import createCrudOptions from './crud';
import commonOptions from '../../common/commonCrudOptions';
import { i18nPort } from '../../i18n';

// localize the crud built-in chrome (incl. the editable inline-row 操作/保存/取消/编辑/删除 action column)
// through the GLOBAL chassis I18nPort. LayoutFramework re-keys the view on locale so useCrud re-projects.
const { crudBinding, commands } = useCrud({ createCrudOptions, commonOptions, i18n: i18nPort });
</script>

<style module>
.bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.hint {
  color: var(--el-text-color-secondary, #909399);
  font-size: 12px;
}
</style>
