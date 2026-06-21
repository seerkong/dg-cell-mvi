<template>
  <div>
    <div :class="$style.tip">
      操作列：查看/编辑 内联，其余按钮收进「更多 ▾」下拉；审核/驳回 同组(el-button-group)。
      状态列用 <b>labelBuilder</b> 显示「在职(1)」；字典就绪时 <b>onReady</b> 弹出提示。
    </div>
    <DgCrud :crud-binding="crudBinding" :commands="commands" />
  </div>
</template>

<script setup lang="ts">
import { DgCrud, useCrud } from 'dg-cell-mvi-element-plus';
import createCrudOptions from './crud';
import commonOptions from '../../common/commonCrudOptions';

const { crudBinding, commands } = useCrud({ createCrudOptions, commonOptions });
</script>

<style module>
.tip {
  margin-bottom: 10px;
  color: var(--el-text-color-secondary, #909399);
  font-size: 13px;
  line-height: 1.6;
}
</style>
