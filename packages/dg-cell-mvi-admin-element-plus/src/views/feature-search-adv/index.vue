<template>
  <DgCrud :crud-binding="crudBinding" :commands="commands">
    <!-- search_<key> slot: custom-render the 级别 search field as an el-select (mirrors form_<key>).
         The slot scope carries the live search form, the resolved col, the current value, and commands. -->
    <template #search_level="{ value, commands: it }">
      <el-select
        :model-value="value"
        placeholder="选择级别"
        clearable
        style="width: 100%"
        @update:model-value="(v) => it.setSearchField('level', v)"
      >
        <el-option v-for="lv in levels" :key="lv" :label="lv.toUpperCase()" :value="lv" />
      </el-select>
    </template>
  </DgCrud>
</template>

<script setup lang="ts">
import { DgCrud, useCrud } from 'dg-cell-mvi-element-plus';
import createCrudOptions from './crud';
import commonOptions from '../../common/commonCrudOptions';

const levels = ['p5', 'p6', 'p7', 'p8'];

const { crudBinding, commands } = useCrud({ createCrudOptions, commonOptions });
</script>
