<template>
  <div>
    <div :class="$style.bar">
      <el-button type="primary" @click="commands.editableSaveAll()">全部保存</el-button>
      <el-button @click="commands.editableAddRow()">+ 新增行</el-button>
      <span :class="$style.hint">所有可编辑单元格默认就地编辑（free 模式，无互斥）；改完点「全部保存」批量提交所有改动行</span>
    </div>
    <DgCrud :crud-binding="crudBinding" :commands="commands" />
  </div>
</template>

<script setup lang="ts">
import { DgCrud, useCrud } from 'dg-cell-mvi-element-plus';
import createCrudOptions from './crud';
import commonOptions from '../../common/commonCrudOptions';
import { i18nPort } from '../../i18n';

// localize the crud built-in chrome (incl. the editable inline-row action column) through the GLOBAL
// chassis I18nPort. LayoutFramework re-keys the view on locale so useCrud re-projects in the new language.
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
