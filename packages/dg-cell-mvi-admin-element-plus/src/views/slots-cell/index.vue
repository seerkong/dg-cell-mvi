<template>
  <DgCrud :crud-binding="crudBinding" :commands="commands">
    <template #cell_status="{ value }">
      <el-tag :type="value === 'active' ? 'success' : value === 'banned' ? 'danger' : 'info'">
        {{ value === 'active' ? '正常' : value === 'banned' ? '封禁' : '待定' }}
      </el-tag>
    </template>
    <template #cell_score="{ value }">
      <el-progress :percentage="Number(value) || 0" :stroke-width="14" />
    </template>
  </DgCrud>
</template>

<script setup lang="ts">
import { DgCrud, useCrud } from 'dg-cell-mvi-element-plus';
import createCrudOptions from './crud';
import commonOptions from '../../common/commonCrudOptions';

const { crudBinding, commands } = useCrud({ createCrudOptions, commonOptions });
</script>
