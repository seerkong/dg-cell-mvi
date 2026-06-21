<template>
  <div>
    <div :class="$style.bar">
      Card 列表布局（table.mode='card'）· 已选 <b>{{ crudBinding.table.selectedRowKeys.length }}</b> 项 ·
      首列作标题、其余字段 label-value、操作区在卡片底部
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
