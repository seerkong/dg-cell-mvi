<template>
  <DgCrud :crud-binding="crudBinding" :commands="commands">
    <template #cell_avatar="{ value }">
      <img v-if="value" :src="value" style="width:40px;height:40px;border-radius:50%;object-fit:cover" alt="" />
      <span v-else style="color:var(--el-text-color-placeholder,#aaa)">无</span>
    </template>
  </DgCrud>
</template>

<script setup lang="ts">
import { DgCrud, useCrud } from 'dg-cell-mvi-element-plus';
import createCrudOptions from './crud';
import commonOptions from '../../common/commonCrudOptions';

const { crudBinding, commands } = useCrud({ createCrudOptions, commonOptions });
</script>
