<template>
  <DgCrud :crud-binding="crudBinding" :commands="commands">
    <template #header>
      <el-alert title="这是通过 #header 插槽注入的页眉说明" type="info" :closable="false" show-icon />
    </template>
    <template #form_score="{ value, commands: it }">
      <el-slider :model-value="Number(value) || 0" :max="100" @update:model-value="(v) => it.setFormField('score', v)" />
    </template>
    <template #footer>
      <div :class="$style.footer">这是通过 #footer 插槽注入的页脚</div>
    </template>
  </DgCrud>
</template>

<script setup lang="ts">
import { DgCrud, useCrud } from 'dg-cell-mvi-element-plus';
import createCrudOptions from './crud';
import commonOptions from '../../common/commonCrudOptions';

const { crudBinding, commands } = useCrud({ createCrudOptions, commonOptions });
</script>

<style module>
.footer { margin-top: 10px; padding: 8px 12px; color: var(--el-text-color-secondary, #909399); font-size: 12px; background: var(--el-fill-color-lighter, #fafafa); border-radius: 6px; }
</style>
