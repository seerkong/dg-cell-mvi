<template>
  <div>
    <div :class="$style.bar">
      虚拟滚动表格（el-table-v2，1000 行）· 已选 <b>{{ crudBinding.table.selectedRowKeys.length }}</b> 项 ·
      点击「年龄/评分」表头排序
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
.bar {
  margin-bottom: 10px;
  color: var(--el-text-color-secondary, #909399);
  font-size: 13px;
}
</style>
