<template>
  <DgCrud :crud-binding="crudBinding" :commands="commands" />
</template>

<script setup lang="ts">
import { DgCrud, useCrud } from 'dg-cell-mvi-element-plus';
import createCrudOptions from './crud';
import commonOptions from '../../common/commonCrudOptions';

const props = defineProps<{ role: 'viewer' | 'admin' }>();

// the injected permission predicate. 'admin' allows everything; 'viewer' is denied the three
// permissioned codes. The role is captured at mount; the parent remounts (via :key) on toggle.
const granted: Record<string, Set<string>> = {
  admin: new Set(['role:delete', 'role:export', 'role:add']),
  viewer: new Set<string>(),
};
const permission = (code: string) => granted[props.role].has(code);

const { crudBinding, commands } = useCrud({ createCrudOptions, commonOptions, permission });
</script>
