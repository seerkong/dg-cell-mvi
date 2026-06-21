<template>
  <div>
    <div :class="$style.tip">点击上方标签按状态快速筛选；「全部」显示所有记录。</div>
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
.tip { margin-bottom: 10px; color: var(--el-text-color-secondary, #909399); font-size: 13px; }
</style>
