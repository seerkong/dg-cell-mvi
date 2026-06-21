<template>
  <div>
    <div :class="$style.tip">
      settings.plugins 在构建时变换 crudOptions：插件注入了「创建时间」列（authored columns 未声明），并设默认分页；
      enabled:false 的插件被跳过（未注入 BOGUS 列）。
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
.tip { margin-bottom: 10px; color: var(--el-text-color-secondary, #909399); font-size: 13px; }
</style>
